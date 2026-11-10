import * as parse5 from 'parse5';
import postcss, { type Rule, type AtRule } from 'postcss';
import { zipSync, strToU8 } from 'fflate';
import { projectDoc } from '../doc/projectDoc';
import { analyzeProjectDiagnostics } from '../codeSync/diagnosticsAndFormat';
import type { StudioAssetItem } from '../assets/assetManager';
import { convertProjectToTailwind } from './tailwindMapper';
import { parseHtmlToVNodes } from '../ast/htmlAst';
import { resolveElementCascade } from '../css/cascadeEngine';

/**
 * Export Build Pipeline — EXP-01_PROJECT_EXPORT.md (F048, F049, F051, F052, F053)
 * Operates on an immutable text snapshot of the Y.Doc so editing can continue during build.
 *
 * Stages: validate → html clean → css build → (tailwind) → assets → rewrite → package
 */

export type ExportPreset = 'production' | 'readable' | 'tailwind';

export interface ExportConfig {
  preset: ExportPreset;
  pages: string[];
  html: { stripDesignArtifacts: true; minify: boolean; keepComments: boolean };
  css: {
    mode: 'plain' | 'tailwind';
    minify: boolean;
    mergeDuplicates: boolean;
    unused: 'keep' | 'report' | 'remove';
    exportTokensJson: boolean;
    contentHash: boolean;
  };
  assets: { includeUsedOnly: boolean };
}

export type ExportStage =
  | 'idle'
  | 'validate'
  | 'html'
  | 'css'
  | 'tailwind'
  | 'assets'
  | 'rewrite'
  | 'package'
  | 'done'
  | 'failed';

export interface ExportIssue {
  severity: 'error' | 'warning';
  rule: string;
  file: string;
  nodeKey?: string;
  message: string;
}

export interface ExportResult {
  files: Array<{ path: string; bytes: number }>;
  totalBytes: number;
  blob: Blob;
  fileName: string;
  issues: ExportIssue[];
  unusedSelectors: string[];
  mergedRuleCount: number;
}

export function createPresetConfig(preset: ExportPreset, pages: string[]): ExportConfig {
  return {
    preset,
    pages,
    html: {
      stripDesignArtifacts: true,
      minify: preset === 'production',
      keepComments: preset === 'readable',
    },
    css: {
      mode: preset === 'tailwind' ? 'tailwind' : 'plain',
      minify: preset === 'production',
      mergeDuplicates: true,
      unused: 'report',
      exportTokensJson: false,
      contentHash: preset === 'production',
    },
    assets: { includeUsedOnly: true },
  };
}

// ---------------------------------------------------------------------------
// STAGE 1 — VALIDATION (F053)
// ---------------------------------------------------------------------------

export function runPreExportValidation(snapshot: Record<string, string>): ExportIssue[] {
  const issues: ExportIssue[] = [];
  const audit = analyzeProjectDiagnostics();
  for (const d of audit.diagnostics) {
    issues.push({
      severity: d.severity === 'error' ? 'error' : 'warning',
      rule: d.code,
      file: d.file,
      nodeKey: d.nodeKey,
      message: d.message,
    });
  }

  // Duplicate id & broken internal anchor links
  for (const [file, html] of Object.entries(snapshot)) {
    if (!file.endsWith('.html')) continue;
    const ids = new Map<string, number>();
    const idRegex = /\sid\s*=\s*"([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = idRegex.exec(html)) !== null) {
      ids.set(m[1], (ids.get(m[1]) ?? 0) + 1);
    }
    ids.forEach((count, id) => {
      if (count > 1) {
        issues.push({
          severity: 'error',
          rule: 'duplicate-id',
          file,
          message: `id="${id}" is used ${count} times; ids must be unique.`,
        });
      }
    });

    const hrefRegex = /\shref\s*=\s*"#([^"]+)"/g;
    while ((m = hrefRegex.exec(html)) !== null) {
      if (!ids.has(m[1])) {
        issues.push({
          severity: 'warning',
          rule: 'broken-anchor',
          file,
          message: `Link href="#${m[1]}" points to a missing id.`,
        });
      }
    }

    // Local stylesheet / asset references that do not exist in the project
    const srcRegex = /\s(?:src|href)\s*=\s*"([^"#:]+\.(?:css|png|jpe?g|webp|avif|svg|gif|js))"/gi;
    while ((m = srcRegex.exec(html)) !== null) {
      const ref = m[1].replace(/^\.\//, '');
      if (!(ref in snapshot)) {
        issues.push({
          severity: 'warning',
          rule: 'missing-asset',
          file,
          message: `Referenced file "${ref}" does not exist in the project.`,
        });
      }
    }

    if (/javascript:/i.test(html)) {
      issues.push({
        severity: 'warning',
        rule: 'javascript-url',
        file,
        message: 'A javascript: URL was found; it is flagged for security review.',
      });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// STAGE 2 — HTML CLEAN (F048)
// ---------------------------------------------------------------------------

export function cleanHtmlForExport(
  html: string,
  opts: { minify: boolean; keepComments: boolean }
): string {
  let out = html
    // Strip every design-time data-vds-* attribute (defense in depth)
    .replace(/\s+data-vds-[a-z-]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\s+data-vds-[a-z-]+\s*=\s*'[^']*'/gi, '')
    .replace(/\s+data-vds-[a-z-]+(?=[\s>/])/gi, '')
    // Studio marker comments
    .replace(/<!--\s*vds:[\s\S]*?-->\s*/g, '');

  if (!opts.keepComments) {
    out = out.replace(/<!--(?!\[if)[\s\S]*?-->/g, '');
  }

  if (opts.minify) {
    // Preserve whitespace-sensitive blocks
    const preserved: string[] = [];
    out = out.replace(/<(pre|textarea|script|style)[\s\S]*?<\/\1>/gi, (block) => {
      preserved.push(block);
      return `\u0000${preserved.length - 1}\u0000`;
    });
    out = out
      .replace(/\n\s*/g, '\n')
      .replace(/>\s+</g, (match) => (match.includes('\n') ? '><' : '> <'))
      .replace(/\s{2,}/g, ' ')
      .trim();
    out = out.replace(/\u0000(\d+)\u0000/g, (_m, idx: string) => preserved[Number(idx)]);
  } else {
    out = out.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n');
  }

  return out.endsWith('\n') ? out : `${out}\n`;
}

// ---------------------------------------------------------------------------
// STAGE 3 — CSS BUILD (F049)
// ---------------------------------------------------------------------------

function ruleContext(rule: Rule): string {
  const parts: string[] = [];
  let p = rule.parent;
  while (p && p.type === 'atrule') {
    const at = p as AtRule;
    parts.unshift(`@${at.name} ${at.params}`);
    p = at.parent;
  }
  return parts.join(' > ');
}

/**
 * Merges rules with identical selector + media context only when no rule between them
 * declares an overlapping property (cascade-safe merge, EXP-01 §4).
 */
export function mergeDuplicateRules(cssText: string): { css: string; merged: number } {
  const root = postcss.parse(cssText);
  let merged = 0;
  const containers: Array<postcss.Root | AtRule> = [root];
  root.walkAtRules((at) => {
    containers.push(at);
  });

  for (const container of containers) {
    const rules = (container.nodes ?? []).filter((n): n is Rule => n.type === 'rule');
    for (let i = 0; i < rules.length; i++) {
      const base = rules[i];
      if (!base.parent) continue;
      for (let j = i + 1; j < rules.length; j++) {
        const cand = rules[j];
        if (!cand.parent || cand.selector.trim() !== base.selector.trim()) continue;
        if (ruleContext(cand) !== ruleContext(base)) continue;

        const candProps = new Set<string>();
        cand.walkDecls((d) => {
          candProps.add(d.prop);
        });
        // Any rule in between that touches the same properties blocks the merge
        let blocked = false;
        for (let k = i + 1; k < j; k++) {
          const mid = rules[k];
          if (!mid.parent) continue;
          mid.walkDecls((d) => {
            if (candProps.has(d.prop)) blocked = true;
          });
          if (blocked) break;
        }
        if (blocked) continue;

        cand.each((node) => {
          base.append(node.clone());
        });
        cand.remove();
        merged += 1;
      }
    }
  }

  return { css: root.toString(), merged };
}

export function minifyCss(cssText: string): string {
  const root = postcss.parse(cssText);
  root.walkComments((c) => {
    if (!c.text.startsWith('!')) c.remove();
  });
  root.walk((node) => {
    if (node.type === 'decl') {
      node.raws.before = '';
      node.raws.between = ':';
      node.value = node.value.replace(/\s*,\s*/g, ',').replace(/\s{2,}/g, ' ').trim();
    } else if (node.type === 'rule') {
      node.raws.before = '';
      node.raws.between = '';
      node.raws.after = '';
      node.raws.semicolon = false;
      node.selector = node.selector.replace(/\s*([>+~,])\s*/g, '$1').replace(/\s{2,}/g, ' ');
    } else if (node.type === 'atrule') {
      node.raws.before = '';
      node.raws.between = '';
      node.raws.afterName = ' ';
      node.raws.after = '';
      node.raws.semicolon = false;
    }
  });
  root.raws.after = '';
  return root.toString().replace(/\n/g, '');
}

/**
 * Reports class/id/type selectors that match zero elements in the exported pages.
 * Report-only by default because classes may be toggled at runtime by JS (EXP-01 §4).
 */
export function findUnusedSelectors(cssText: string, htmlPages: string[]): string[] {
  const docs = htmlPages.map((html) => new DOMParser().parseFromString(html, 'text/html'));
  const unused: string[] = [];
  const root = postcss.parse(cssText);

  root.walkRules((rule) => {
    if (rule.parent && rule.parent.type === 'atrule') {
      const name = (rule.parent as AtRule).name;
      if (name === 'keyframes' || name === 'font-face') return;
    }
    for (const rawSel of rule.selectors) {
      const sel = rawSel
        .replace(/::?(hover|focus|focus-visible|focus-within|active|visited|before|after|placeholder|disabled|checked)\b/g, '')
        .trim();
      if (!sel || sel === ':root' || sel === '*' || sel.startsWith('@')) continue;
      let matched = false;
      for (const doc of docs) {
        try {
          if (doc.querySelector(sel)) {
            matched = true;
            break;
          }
        } catch {
          matched = true; // unparseable selector — never flag as unused
          break;
        }
      }
      if (!matched) unused.push(rawSel.trim());
    }
  });

  return Array.from(new Set(unused));
}

export function removeUnusedSelectors(cssText: string, unused: string[]): string {
  const set = new Set(unused);
  const root = postcss.parse(cssText);
  root.walkRules((rule) => {
    const keep = rule.selectors.filter((s) => !set.has(s.trim()));
    if (keep.length === 0) rule.remove();
    else if (keep.length !== rule.selectors.length) rule.selectors = keep;
  });
  root.walkAtRules('media', (at) => {
    if (!at.nodes || at.nodes.length === 0) at.remove();
  });
  return root.toString();
}

export function extractDesignTokensJson(cssText: string): string {
  const tokens: Record<string, { $value: string; $type: string }> = {};
  const root = postcss.parse(cssText);
  root.walkRules((rule) => {
    if (rule.selector.trim() !== ':root') return;
    rule.walkDecls((d) => {
      if (!d.prop.startsWith('--')) return;
      const value = d.value.trim();
      const type = /^#|rgb|hsl|oklch/i.test(value)
        ? 'color'
        : /(px|rem|em)$/.test(value)
        ? 'dimension'
        : 'string';
      tokens[d.prop.slice(2)] = { $value: value, $type: type };
    });
  });
  return `${JSON.stringify(tokens, null, 2)}\n`;
}

export function shortContentHash(text: string): string {
  // FNV-1a 32-bit — deterministic, synchronous, adequate for cache-busting filenames
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 6);
}

// ---------------------------------------------------------------------------
// STAGE 5 — ASSETS (F051)
// ---------------------------------------------------------------------------

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const commaIdx = dataUrl.indexOf(',');
  const meta = dataUrl.slice(0, commaIdx);
  const payload = dataUrl.slice(commaIdx + 1);
  if (meta.includes(';base64')) {
    const bin = atob(payload);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return strToU8(decodeURIComponent(payload));
}

/** Converts a project-root asset path into a path relative to the referencing file. */
export function relativeAssetPath(fromFile: string, assetPath: string): string {
  const depth = fromFile.split('/').length - 1;
  return `${'../'.repeat(depth)}${assetPath}`;
}

function replaceAll(haystack: string, needle: string, replacement: string): string {
  return haystack.split(needle).join(replacement);
}

// ---------------------------------------------------------------------------
// PIPELINE ORCHESTRATOR (F052)
// ---------------------------------------------------------------------------

export async function runExportPipeline(
  config: ExportConfig,
  assets: StudioAssetItem[],
  onStage: (stage: ExportStage, progress: number) => void
): Promise<ExportResult> {
  const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

  // Immutable snapshot
  const snapshot: Record<string, string> = {};
  projectDoc.files.forEach((ytext, file) => {
    snapshot[file] = ytext.toString();
  });
  for (const a of assets) snapshot[a.path] = '';

  onStage('validate', 0.08);
  await tick();
  const issues = runPreExportValidation(snapshot);

  onStage('html', 0.22);
  await tick();
  const out: Record<string, string> = {};
  const binaries: Record<string, Uint8Array> = {};
  for (const page of config.pages) {
    if (!snapshot[page]) continue;
    // parse5 roundtrip sanity check (throws nothing; collects into issues if fatal)
    parse5.parse(snapshot[page]);
    out[page] = cleanHtmlForExport(snapshot[page], {
      minify: false,
      keepComments: config.html.keepComments,
    });
  }

  onStage('css', 0.4);
  await tick();
  let mergedRuleCount = 0;
  let unusedSelectors: string[] = [];
  const cssFiles = Object.keys(snapshot).filter((f) => f.endsWith('.css'));
  const htmlForAnalysis = Object.values(out);

  for (const cssFile of cssFiles) {
    let css = snapshot[cssFile];
    if (config.css.mergeDuplicates) {
      const res = mergeDuplicateRules(css);
      css = res.css;
      mergedRuleCount += res.merged;
    }
    const unused = findUnusedSelectors(css, htmlForAnalysis);
    unusedSelectors = unusedSelectors.concat(unused);
    if (config.css.unused === 'remove') {
      css = removeUnusedSelectors(css, unused);
    }
    if (config.css.exportTokensJson) {
      out['tokens.json'] = extractDesignTokensJson(css);
    }
    out[cssFile] = css;
  }

  if (config.css.mode === 'tailwind') {
    onStage('tailwind', 0.55);
    await tick();
    const tw = convertProjectToTailwind(out, cssFiles);
    for (const cssFile of cssFiles) delete out[cssFile];
    Object.assign(out, tw.files);
  }

  onStage('assets', 0.68);
  await tick();
  for (const asset of assets) {
    const referenced = Object.values(out).some(
      (t) => t.includes(asset.dataUrl) || t.includes(asset.path)
    );
    if (config.assets.includeUsedOnly && !referenced) continue;
    binaries[asset.path] = dataUrlToBytes(asset.dataUrl);
    for (const file of Object.keys(out)) {
      if (!out[file].includes(asset.dataUrl)) continue;
      const rel = file.endsWith('.css') ? relativeAssetPath(file, asset.path) : asset.path;
      out[file] = replaceAll(out[file], asset.dataUrl, rel);
    }
  }

  onStage('rewrite', 0.8);
  await tick();
  for (const file of Object.keys(out)) {
    if (file.endsWith('.css') && config.css.minify) {
      out[file] = minifyCss(out[file]);
    }
  }
  if (config.css.contentHash) {
    for (const file of Object.keys(out)) {
      if (!file.endsWith('.css')) continue;
      const hashed = file.replace(/\.css$/, `.${shortContentHash(out[file])}.css`);
      out[hashed] = out[file];
      delete out[file];
      for (const page of Object.keys(out)) {
        if (page.endsWith('.html')) out[page] = replaceAll(out[page], `"${file}"`, `"${hashed}"`);
      }
    }
  }
  if (config.html.minify) {
    for (const page of Object.keys(out)) {
      if (page.endsWith('.html')) {
        out[page] = cleanHtmlForExport(out[page], { minify: true, keepComments: false });
      }
    }
  }

  out['export-report.json'] = `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      preset: config.preset,
      issues,
      unusedSelectors,
      mergedRuleCount,
    },
    null,
    2
  )}\n`;

  onStage('package', 0.92);
  await tick();
  const zipInput: Record<string, Uint8Array> = {};
  for (const [path, text] of Object.entries(out)) zipInput[path] = strToU8(text);
  for (const [path, bytes] of Object.entries(binaries)) zipInput[path] = bytes;
  const zipped = zipSync(zipInput, { level: 6 });
  const blob = new Blob([zipped], { type: 'application/zip' });

  const files = Object.entries(zipInput)
    .map(([path, bytes]) => ({ path, bytes: bytes.byteLength }))
    .sort((a, b) => a.path.localeCompare(b.path));

  onStage('done', 1);
  return {
    files,
    totalBytes: zipped.byteLength,
    blob,
    fileName: `figrow-${config.preset}-${new Date().toISOString().slice(0, 10)}.zip`,
    issues,
    unusedSelectors,
    mergedRuleCount,
  };
}

export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function exportSelectedNodeSnippet(
  file: string,
  nodeKey: string,
  format: 'html' | 'tailwind' | 'css' = 'html'
): { code: string; fileName: string } {
  const htmlContent = projectDoc.getFileText(file);
  const ast = parseHtmlToVNodes(file, htmlContent);
  const target = ast.nodes[nodeKey];
  const tag = target?.tag || 'div';
  const classAttr = target?.attrs?.find((a) => a.name === 'class')?.value || '';

  if (format === 'html') {
    let raw = '';
    if (target?.range) {
      raw = htmlContent.slice(target.range[0], target.range[1]).trim();
    }
    if (!raw) {
      raw = `<${tag} class="${classAttr}">\n  <!-- Content -->\n</${tag}>`;
    }
    return {
      code: raw,
      fileName: `${tag}-${nodeKey}.html`,
    };
  }

  if (format === 'css') {
    const cascade = resolveElementCascade(nodeKey, 1440, null);
    const rules = cascade
      ? Object.entries(cascade.declaredProps)
          .map(([k, v]) => `  ${k}: ${v.raw};`)
          .join('\n')
      : '';
    const selector = classAttr ? `.${classAttr.split(' ')[0]}` : `#${nodeKey}`;
    return {
      code: `${selector} {\n${rules}\n}`,
      fileName: `${tag}-${nodeKey}.css`,
    };
  }

  // format === 'tailwind'
  const tw = classAttr || 'p-4 bg-white rounded shadow';
  return {
    code: `<${tag} className="${tw}">\n  {/* Tailwind Component */}\n</${tag}>`,
    fileName: `${tag}-${nodeKey}.tsx`,
  };
}
