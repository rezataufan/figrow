import postcss, { type AtRule, type Rule } from 'postcss';
import { parseHtmlToVNodes } from '../ast/htmlAst';
import { parseCssRules } from '../ast/htmlAst';
import type { CodeQuickFix } from '../codeSync/diagnosticsAndFormat';

/**
 * Tailwind CSS v4 Bilingual Mapper & Pre-Export Auditor
 * Aligned with EXP-02_TAILWIND_VALIDATION.md (F050, F053)
 *
 * - Deterministic (property, value, state, breakpoint) → utility mapping
 * - Unmappable declarations fall back to arbitrary values / arbitrary properties
 * - Conflict-group resolution (later class wins only for identical property coverage)
 * - Complex selectors are preserved in `@layer components`, globals in `@layer base`
 */

// ---------------------------------------------------------------------------
// 1. VALUE HELPERS
// ---------------------------------------------------------------------------

function arb(value: string): string {
  return value.trim().replace(/\s*,\s*/g, ',').replace(/\s+/g, '_');
}

function toPx(value: string): number | null {
  const v = value.trim();
  if (v === '0') return 0;
  const m = /^(-?\d*\.?\d+)(px|rem)$/.exec(v);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return m[2] === 'rem' ? n * 16 : n;
}

/** Tailwind v4 spacing scale: any multiple of 0.25 × 4px (calc(var(--spacing) * n)). */
function spacingToken(value: string): string | null {
  const v = value.trim();
  if (v === 'auto') return 'auto';
  if (v === '100%') return 'full';
  const px = toPx(v);
  if (px === null) return null;
  const units = px / 4;
  if (Math.abs(units * 4 - Math.round(units * 4)) > 1e-6) return null;
  const abs = Math.abs(units);
  return `${units < 0 ? '-' : ''}${Number.isInteger(abs) ? abs : abs.toString()}`;
}

function spacingUtil(prefix: string, value: string): string {
  const tok = spacingToken(value);
  if (tok === null) {
    const v = value.trim();
    if (v.startsWith('var(')) return `${prefix}-(${v.slice(4, -1).trim()})`;
    return `${prefix}-[${arb(v)}]`;
  }
  if (tok.startsWith('-')) return `-${prefix}-${tok.slice(1)}`;
  return `${prefix}-${tok}`;
}

function colorUtil(prefix: string, value: string): string {
  const v = value.trim();
  if (v === 'transparent' || v === 'currentColor' || v === 'inherit' || v === 'white' || v === 'black') {
    return `${prefix}-${v === 'currentColor' ? 'current' : v}`;
  }
  if (v.startsWith('var(') && v.endsWith(')') && !v.includes(',')) {
    return `${prefix}-(${v.slice(4, -1).trim()})`;
  }
  return `${prefix}-[${arb(v)}]`;
}

function sizeUtil(prefix: string, value: string): string {
  const v = value.trim();
  if (v === '100%') return `${prefix}-full`;
  if (v === 'auto') return `${prefix}-auto`;
  if (v === '100vw' && prefix === 'w') return 'w-screen';
  if (v === '100vh' && prefix === 'h') return 'h-screen';
  if (v === 'fit-content') return `${prefix}-fit`;
  if (v === 'min-content') return `${prefix}-min`;
  if (v === 'max-content') return `${prefix}-max`;
  if (v === 'none' && prefix.startsWith('max')) return `${prefix}-none`;
  const tok = spacingToken(v);
  if (tok !== null && !tok.startsWith('-') && prefix !== 'max-w') return `${prefix}-${tok}`;
  if (v.startsWith('var(')) return `${prefix}-(${v.slice(4, -1).trim()})`;
  return `${prefix}-[${arb(v)}]`;
}

const FONT_SIZE_SCALE: Record<string, string> = {
  '0.75rem': 'xs', '12px': 'xs',
  '0.875rem': 'sm', '14px': 'sm',
  '1rem': 'base', '16px': 'base',
  '1.125rem': 'lg', '18px': 'lg',
  '1.25rem': 'xl', '20px': 'xl',
  '1.5rem': '2xl', '24px': '2xl',
  '1.875rem': '3xl', '30px': '3xl',
  '2.25rem': '4xl', '36px': '4xl',
  '3rem': '5xl', '48px': '5xl',
  '3.75rem': '6xl', '60px': '6xl',
};

const FONT_WEIGHT: Record<string, string> = {
  '100': 'thin', '200': 'extralight', '300': 'light', '400': 'normal', normal: 'normal',
  '500': 'medium', '600': 'semibold', '700': 'bold', bold: 'bold', '800': 'extrabold', '900': 'black',
};

const LEADING: Record<string, string> = {
  '1': 'none', '1.25': 'tight', '1.375': 'snug', '1.5': 'normal', '1.625': 'relaxed', '2': 'loose',
};

const RADIUS_PX: Record<number, string> = {
  0: 'none', 2: 'xs', 4: 'sm', 6: 'md', 8: 'lg', 12: 'xl', 16: '2xl', 24: '3xl', 9999: 'full',
};

const DISPLAY: Record<string, string> = {
  block: 'block', flex: 'flex', grid: 'grid', 'inline-flex': 'inline-flex', 'inline-block': 'inline-block',
  inline: 'inline', 'inline-grid': 'inline-grid', none: 'hidden', contents: 'contents',
};

const JUSTIFY: Record<string, string> = {
  'flex-start': 'start', start: 'start', center: 'center', 'flex-end': 'end', end: 'end',
  'space-between': 'between', 'space-around': 'around', 'space-evenly': 'evenly', stretch: 'stretch',
};

const ALIGN: Record<string, string> = {
  'flex-start': 'start', start: 'start', center: 'center', 'flex-end': 'end', end: 'end',
  stretch: 'stretch', baseline: 'baseline', auto: 'auto',
};

function expandBox(value: string): [string, string, string, string] | null {
  const parts = value.trim().split(/\s+/);
  if (parts.length === 1) return [parts[0], parts[0], parts[0], parts[0]];
  if (parts.length === 2) return [parts[0], parts[1], parts[0], parts[1]];
  if (parts.length === 3) return [parts[0], parts[1], parts[2], parts[1]];
  if (parts.length === 4) return [parts[0], parts[1], parts[2], parts[3]];
  return null;
}

export interface UtilityEntry {
  util: string;
  /** CSS longhand properties this utility covers — used for conflict-group resolution */
  covers: string[];
}

function boxShorthand(prefix: 'p' | 'm', propBase: 'padding' | 'margin', value: string): UtilityEntry[] {
  const sides = expandBox(value);
  const all = [`${propBase}-top`, `${propBase}-right`, `${propBase}-bottom`, `${propBase}-left`];
  if (!sides) return [{ util: `[${propBase}:${arb(value)}]`, covers: all }];
  const [t, r, b, l] = sides;
  if (t === r && r === b && b === l) return [{ util: spacingUtil(prefix, t), covers: all }];
  if (t === b && r === l) {
    return [
      { util: spacingUtil(`${prefix}y`, t), covers: [`${propBase}-top`, `${propBase}-bottom`] },
      { util: spacingUtil(`${prefix}x`, r), covers: [`${propBase}-left`, `${propBase}-right`] },
    ];
  }
  return [
    { util: spacingUtil(`${prefix}t`, t), covers: [`${propBase}-top`] },
    { util: spacingUtil(`${prefix}r`, r), covers: [`${propBase}-right`] },
    { util: spacingUtil(`${prefix}b`, b), covers: [`${propBase}-bottom`] },
    { util: spacingUtil(`${prefix}l`, l), covers: [`${propBase}-left`] },
  ];
}

// ---------------------------------------------------------------------------
// 2. DECLARATION → UTILITY MAPPER
// ---------------------------------------------------------------------------

export function mapDeclarationToUtilities(prop: string, rawValue: string): UtilityEntry[] {
  const value = rawValue.replace(/\s*!important\s*$/i, '').trim();
  const one = (util: string, covers: string[] = [prop]): UtilityEntry[] => [{ util, covers }];

  switch (prop) {
    case 'padding':
      return boxShorthand('p', 'padding', value);
    case 'margin':
      return boxShorthand('m', 'margin', value);
    case 'padding-top': return one(spacingUtil('pt', value));
    case 'padding-right': return one(spacingUtil('pr', value));
    case 'padding-bottom': return one(spacingUtil('pb', value));
    case 'padding-left': return one(spacingUtil('pl', value));
    case 'padding-inline': return one(spacingUtil('px', value), ['padding-left', 'padding-right']);
    case 'padding-block': return one(spacingUtil('py', value), ['padding-top', 'padding-bottom']);
    case 'margin-top': return one(spacingUtil('mt', value));
    case 'margin-right': return one(spacingUtil('mr', value));
    case 'margin-bottom': return one(spacingUtil('mb', value));
    case 'margin-left': return one(spacingUtil('ml', value));
    case 'margin-inline': return one(spacingUtil('mx', value), ['margin-left', 'margin-right']);
    case 'margin-block': return one(spacingUtil('my', value), ['margin-top', 'margin-bottom']);
    case 'gap': {
      const parts = value.split(/\s+/);
      if (parts.length === 2) {
        return [
          { util: spacingUtil('gap-y', parts[0]), covers: ['row-gap'] },
          { util: spacingUtil('gap-x', parts[1]), covers: ['column-gap'] },
        ];
      }
      return one(spacingUtil('gap', value), ['row-gap', 'column-gap']);
    }
    case 'row-gap': return one(spacingUtil('gap-y', value));
    case 'column-gap': return one(spacingUtil('gap-x', value));
    case 'width': return one(sizeUtil('w', value));
    case 'height': return one(sizeUtil('h', value));
    case 'min-width': return one(sizeUtil('min-w', value));
    case 'max-width': return one(sizeUtil('max-w', value));
    case 'min-height': return one(sizeUtil('min-h', value));
    case 'max-height': return one(sizeUtil('max-h', value));
    case 'display':
      return one(DISPLAY[value] ?? `[display:${arb(value)}]`);
    case 'flex-direction':
      return one(
        value === 'column' ? 'flex-col'
          : value === 'column-reverse' ? 'flex-col-reverse'
          : value === 'row-reverse' ? 'flex-row-reverse'
          : 'flex-row'
      );
    case 'flex-wrap':
      return one(value === 'wrap' ? 'flex-wrap' : value === 'wrap-reverse' ? 'flex-wrap-reverse' : 'flex-nowrap');
    case 'flex':
      if (value === '1' || value === '1 1 0%') return one('flex-1', ['flex-grow', 'flex-shrink', 'flex-basis']);
      if (value === 'none') return one('flex-none', ['flex-grow', 'flex-shrink', 'flex-basis']);
      if (value === 'auto') return one('flex-auto', ['flex-grow', 'flex-shrink', 'flex-basis']);
      return one(`flex-[${arb(value)}]`, ['flex-grow', 'flex-shrink', 'flex-basis']);
    case 'flex-grow': return one(value === '1' ? 'grow' : value === '0' ? 'grow-0' : `grow-[${arb(value)}]`);
    case 'flex-shrink': return one(value === '1' ? 'shrink' : value === '0' ? 'shrink-0' : `shrink-[${arb(value)}]`);
    case 'flex-basis': return one(sizeUtil('basis', value));
    case 'justify-content': return one(JUSTIFY[value] ? `justify-${JUSTIFY[value]}` : `[justify-content:${arb(value)}]`);
    case 'align-items': return one(ALIGN[value] ? `items-${ALIGN[value]}` : `[align-items:${arb(value)}]`);
    case 'align-self': return one(ALIGN[value] ? `self-${ALIGN[value]}` : `[align-self:${arb(value)}]`);
    case 'justify-self': return one(ALIGN[value] ? `justify-self-${ALIGN[value]}` : `[justify-self:${arb(value)}]`);
    case 'grid-template-columns': {
      const rep = /^repeat\(\s*(\d+)\s*,\s*minmax\(\s*0\s*,\s*1fr\s*\)\s*\)$/.exec(value);
      if (rep) return one(`grid-cols-${rep[1]}`);
      if (value === '1fr') return one('grid-cols-1');
      if (value === 'none') return one('grid-cols-none');
      return one(`grid-cols-[${arb(value)}]`);
    }
    case 'grid-template-rows':
      return one(value === 'none' ? 'grid-rows-none' : `grid-rows-[${arb(value)}]`);
    case 'grid-column':
      if (value === '1 / -1') return one('col-span-full');
      if (/^span \d+$/.test(value)) return one(`col-span-${value.split(' ')[1]}`);
      return one(`col-[${arb(value)}]`);
    case 'grid-row':
      if (/^span \d+$/.test(value)) return one(`row-span-${value.split(' ')[1]}`);
      return one(`row-[${arb(value)}]`);
    case 'text-align': return one(`text-${value}`);
    case 'font-weight': return one(FONT_WEIGHT[value] ? `font-${FONT_WEIGHT[value]}` : `font-[${arb(value)}]`);
    case 'font-size':
      if (FONT_SIZE_SCALE[value]) return one(`text-${FONT_SIZE_SCALE[value]}`);
      if (value.startsWith('var(')) return one(`text-(length:${value.slice(4, -1).trim()})`);
      return one(`text-[${arb(value)}]`);
    case 'line-height':
      return one(LEADING[value] ? `leading-${LEADING[value]}` : `leading-[${arb(value)}]`);
    case 'letter-spacing': return one(`tracking-[${arb(value)}]`);
    case 'font-family':
      if (/ui-monospace|monospace/.test(value)) return one('font-mono');
      if (/serif/.test(value) && !/sans-serif/.test(value)) return one('font-serif');
      return one(`font-[${arb(value)}]`);
    case 'font-style': return one(value === 'italic' ? 'italic' : 'not-italic');
    case 'text-transform':
      return one(value === 'none' ? 'normal-case' : value);
    case 'text-decoration':
    case 'text-decoration-line':
      return one(value === 'none' ? 'no-underline' : value === 'line-through' ? 'line-through' : value === 'underline' ? 'underline' : `[${prop}:${arb(value)}]`, ['text-decoration-line']);
    case 'text-wrap':
      return one(value === 'balance' ? 'text-balance' : value === 'pretty' ? 'text-pretty' : value === 'nowrap' ? 'text-nowrap' : 'text-wrap');
    case 'color': return one(colorUtil('text', value));
    case 'background-color': return one(colorUtil('bg', value));
    case 'background':
      if (/^(#|rgb|hsl|oklch|var\(|transparent)/i.test(value) && !/gradient|url\(/i.test(value)) {
        return one(colorUtil('bg', value), ['background-color']);
      }
      return one(`[background:${arb(value)}]`, ['background-color', 'background-image']);
    case 'background-image': return one(`bg-[${arb(value)}]`);
    case 'border-color': return one(colorUtil('border', value));
    case 'border-width': {
      const px = toPx(value);
      if (px === 1) return one('border');
      if (px !== null && [0, 2, 4, 8].includes(px)) return one(`border-${px}`);
      return one(`border-[${arb(value)}]`);
    }
    case 'border-style': return one(`border-${value}`);
    case 'border-radius': {
      if (value.startsWith('var(')) return one(`rounded-(${value.slice(4, -1).trim()})`);
      const px = toPx(value);
      if (px !== null && RADIUS_PX[px]) return one(`rounded-${RADIUS_PX[px]}`);
      if (value === '50%' || value === '9999px') return one('rounded-full');
      return one(`rounded-[${arb(value)}]`);
    }
    case 'overflow': return one(`overflow-${value}`);
    case 'position': return one(value);
    case 'cursor': return one(`cursor-${value}`);
    case 'box-sizing': return one(value === 'border-box' ? 'box-border' : 'box-content');
    case 'opacity': {
      const n = parseFloat(value);
      const pct = Math.round(n * 100);
      return one(Number.isFinite(n) && pct % 5 === 0 ? `opacity-${pct}` : `opacity-[${arb(value)}]`);
    }
    case 'aspect-ratio':
      if (value.replace(/\s/g, '') === '16/9') return one('aspect-video');
      if (value.replace(/\s/g, '') === '1/1') return one('aspect-square');
      return one(`aspect-[${arb(value.replace(/\s/g, ''))}]`);
    case 'object-fit': return one(`object-${value}`);
    default:
      return one(`[${prop}:${arb(value)}]`);
  }
}

// ---------------------------------------------------------------------------
// 3. SELECTOR / VARIANT RESOLUTION
// ---------------------------------------------------------------------------

const STATE_VARIANTS: Record<string, string> = {
  ':hover': 'hover:',
  ':focus': 'focus:',
  ':focus-visible': 'focus-visible:',
  ':focus-within': 'focus-within:',
  ':active': 'active:',
  ':disabled': 'disabled:',
  ':visited': 'visited:',
};

export function mediaToVariant(params: string): string | null {
  const p = params.replace(/\s+/g, ' ').trim();
  const max = /^\(max-width: ?(\d+(?:\.\d+)?)px\)$/.exec(p);
  if (max) {
    const n = parseFloat(max[1]);
    if (n >= 1279 && n < 1280) return 'max-xl:';
    if (n >= 1023 && n < 1024) return 'max-lg:';
    if (n >= 767 && n < 768) return 'max-md:';
    if (n >= 639 && n < 640) return 'max-sm:';
    return `max-[${Math.ceil(n)}px]:`;
  }
  const min = /^\(min-width: ?(\d+(?:\.\d+)?)px\)$/.exec(p);
  if (min) {
    const n = parseFloat(min[1]);
    if (n === 640) return 'sm:';
    if (n === 768) return 'md:';
    if (n === 1024) return 'lg:';
    if (n === 1280) return 'xl:';
    return `min-[${n}px]:`;
  }
  return null;
}

interface ParsedSimpleSelector {
  className: string;
  stateVariant: string;
}

function parseSimpleClassSelector(sel: string): ParsedSimpleSelector | null {
  const m = /^\.([A-Za-z_][\w-]*)(:[a-z-]+)?$/.exec(sel.trim());
  if (!m) return null;
  const state = m[2] ?? '';
  if (state && !STATE_VARIANTS[state]) return null;
  return { className: m[1], stateVariant: state ? STATE_VARIANTS[state] : '' };
}

interface ClassUtilityRecord {
  order: number;
  variant: string;
  entry: UtilityEntry;
}

// ---------------------------------------------------------------------------
// 4. PROJECT CONVERSION
// ---------------------------------------------------------------------------

export interface TailwindConversionResult {
  files: Record<string, string>;
  convertedClasses: string[];
  preservedRules: number;
  utilityCount: number;
}

export function convertProjectToTailwind(
  files: Record<string, string>,
  cssFiles: string[]
): TailwindConversionResult {
  const classUtils = new Map<string, ClassUtilityRecord[]>();
  const classesInComplexRules = new Set<string>();
  const baseRules: string[] = [];
  const componentRules: string[] = [];
  const themeVars: string[] = [];
  let order = 0;

  for (const cssFile of cssFiles) {
    const css = files[cssFile];
    if (!css) continue;
    const root = postcss.parse(css);

    root.walkRules((rule: Rule) => {
      const parent = rule.parent;
      let variantPrefix = '';
      let insideUnknownAtRule = false;
      if (parent && parent.type === 'atrule') {
        const at = parent as AtRule;
        if (at.name === 'media') {
          const v = mediaToVariant(at.params);
          if (v) variantPrefix = v;
          else insideUnknownAtRule = true;
        } else {
          insideUnknownAtRule = true;
        }
      }

      const selectors = rule.selectors.map((s) => s.trim());
      const parsed = selectors.map(parseSimpleClassSelector);
      const allSimple = !insideUnknownAtRule && parsed.every((p) => p !== null);

      if (rule.selector.trim() === ':root' && !insideUnknownAtRule) {
        rule.walkDecls((d) => {
          if (d.prop.startsWith('--')) {
            const isColor = /^#|rgb|hsl|oklch/i.test(d.value.trim());
            if (isColor) themeVars.push(`  --color-${d.prop.slice(2)}: ${d.value};`);
          }
        });
        baseRules.push(rule.toString());
        return;
      }

      if (!allSimple) {
        // Keep the full rule (with its at-rule wrapper) and protect referenced class tokens
        const classTokens = rule.selector.match(/\.([A-Za-z_][\w-]*)/g) ?? [];
        classTokens.forEach((t) => classesInComplexRules.add(t.slice(1)));
        let text = rule.toString();
        if (parent && parent.type === 'atrule') {
          const at = parent as AtRule;
          text = `@${at.name} ${at.params} {\n  ${text.replace(/\n/g, '\n  ')}\n}`;
        }
        if (classTokens.length > 0) componentRules.push(text);
        else baseRules.push(text);
        return;
      }

      for (const p of parsed) {
        if (!p) continue;
        const variant = `${variantPrefix}${p.stateVariant}`;
        const list = classUtils.get(p.className) ?? [];
        rule.walkDecls((d) => {
          for (const entry of mapDeclarationToUtilities(d.prop, d.value)) {
            order += 1;
            list.push({ order, variant, entry });
          }
        });
        classUtils.set(p.className, list);
      }
    });
  }

  // Rewrite class attributes in HTML pages
  let utilityCount = 0;
  const out: Record<string, string> = {};
  for (const [file, text] of Object.entries(files)) {
    if (!file.endsWith('.html')) {
      if (!cssFiles.includes(file)) out[file] = text;
      continue;
    }
    let html = text.replace(/\sclass\s*=\s*"([^"]*)"/g, (_m, classAttr: string) => {
      const tokens = classAttr.split(/\s+/).filter(Boolean);
      const keptTokens: string[] = [];
      const records: ClassUtilityRecord[] = [];
      for (const tok of tokens) {
        const recs = classUtils.get(tok);
        if (recs) records.push(...recs);
        if (!recs || classesInComplexRules.has(tok)) keptTokens.push(tok);
      }
      // Conflict-group resolution: later declaration wins for identical (variant + coverage)
      records.sort((a, b) => a.order - b.order);
      const winners = new Map<string, string>();
      for (const r of records) {
        const key = `${r.variant}|${[...r.entry.covers].sort().join(',')}`;
        winners.delete(key);
        winners.set(key, `${r.variant}${r.entry.util}`);
      }
      const utilities = Array.from(new Set(winners.values()));
      utilityCount += utilities.length;
      const finalTokens = [...keptTokens, ...utilities];
      return finalTokens.length > 0 ? ` class="${finalTokens.join(' ')}"` : '';
    });

    // Replace local stylesheet links with Tailwind v4 browser runtime + compiled-source link
    for (const cssFile of cssFiles) {
      html = html.replace(
        new RegExp(`\\s*<link[^>]+href="${cssFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`, 'g'),
        ''
      );
    }
    const headInject =
      `  <!-- Development preview: Tailwind v4 browser runtime. For production run:\n` +
      `       npx @tailwindcss/cli -i css/app.css -o css/app.build.css --minify\n` +
      `       and replace this script + style with <link rel="stylesheet" href="css/app.build.css"> -->\n` +
      `  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>\n` +
      `  <style type="text/tailwindcss">\n${buildAppCssBody(themeVars, baseRules, componentRules)
        .split('\n')
        .map((l) => (l ? `    ${l}` : l))
        .join('\n')}\n  </style>\n`;
    html = html.replace(/<\/head>/i, `${headInject}</head>`);
    out[file] = html;
  }

  out['css/app.css'] = `@import "tailwindcss";\n\n${buildAppCssBody(themeVars, baseRules, componentRules)}\n`;
  out['README.md'] =
    `# Tailwind v4 Export (Figrow Studio)\n\n` +
    `- Source stylesheet: \`css/app.css\` (\`@theme\` tokens, \`@layer base\`, \`@layer components\`).\n` +
    `- Utilities were generated from plain CSS class rules; complex selectors are preserved in \`@layer components\`.\n\n` +
    `## Production build\n\n\`\`\`bash\nnpx @tailwindcss/cli -i css/app.css -o css/app.build.css --minify\n\`\`\`\n\n` +
    `Then replace the \`@tailwindcss/browser\` script and \`<style type="text/tailwindcss">\` block in each page with:\n\n` +
    `\`\`\`html\n<link rel="stylesheet" href="css/app.build.css">\n\`\`\`\n`;

  return {
    files: out,
    convertedClasses: Array.from(classUtils.keys()),
    preservedRules: baseRules.length + componentRules.length,
    utilityCount,
  };
}

function buildAppCssBody(themeVars: string[], baseRules: string[], componentRules: string[]): string {
  const chunks: string[] = [];
  if (themeVars.length > 0) chunks.push(`@theme {\n${themeVars.join('\n')}\n}`);
  if (baseRules.length > 0) {
    chunks.push(`@layer base {\n  ${baseRules.join('\n\n').replace(/\n/g, '\n  ')}\n}`);
  }
  if (componentRules.length > 0) {
    chunks.push(`@layer components {\n  ${componentRules.join('\n\n').replace(/\n/g, '\n  ')}\n}`);
  }
  return chunks.join('\n\n');
}

// ---------------------------------------------------------------------------
// 5. PRE-EXPORT AUDITOR (F053)
// ---------------------------------------------------------------------------

export type AuditCategory = 'semantics' | 'a11y' | 'performance' | 'seo';

export interface AuditFinding {
  id: string;
  category: AuditCategory;
  severity: 'error' | 'warning';
  nodeKey?: string;
  file: string;
  message: string;
  fix?: CodeQuickFix;
}

export interface AuditReport {
  scores: Record<AuditCategory, number>;
  overall: number;
  findings: AuditFinding[];
}

function parseHex(hex: string): [number, number, number] | null {
  const h = hex.trim().replace('#', '');
  if (h.length === 3) {
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  }
  if (h.length === 6) {
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  return null;
}

function relLuminance([r, g, b]: [number, number, number]): number {
  const ch = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function contrastRatio(fg: string, bg: string): number | null {
  const a = parseHex(fg);
  const b = parseHex(bg);
  if (!a || !b) return null;
  const la = relLuminance(a);
  const lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function runPreExportAudit(htmlFile: string, html: string, cssFile: string, css: string): AuditReport {
  const findings: AuditFinding[] = [];
  const tree = parseHtmlToVNodes(htmlFile, html);
  const nodes = tree.order.map((id) => tree.nodes[id]).filter(Boolean);
  const attr = (n: (typeof nodes)[number], name: string): string | undefined =>
    n.attrs.find((a) => a.name === name)?.value;
  const insertBeforeTagEnd = (n: (typeof nodes)[number]): number | null => {
    if (!n.startTagRange) return null;
    const end = n.startTagRange[1];
    return html[end - 2] === '/' ? end - 2 : end - 1;
  };

  // --- SEO / document-level
  const htmlNode = nodes.find((n) => n.tag === 'html');
  if (htmlNode && !attr(htmlNode, 'lang')) {
    const pos = htmlNode.startTagRange ? htmlNode.startTagRange[0] + 5 : null;
    findings.push({
      id: 'doc-lang', category: 'a11y', severity: 'error', file: htmlFile, nodeKey: htmlNode.key,
      message: '<html> is missing a lang attribute.',
      fix: pos !== null ? { label: 'Add lang="en"', file: htmlFile, range: [pos, pos], insert: ' lang="en"' } : undefined,
    });
  }
  if (!nodes.some((n) => n.tag === 'title' && (n.textContent ?? '').trim())) {
    findings.push({ id: 'doc-title', category: 'seo', severity: 'error', file: htmlFile, message: 'Document has no non-empty <title>.' });
  }
  const headClose = html.toLowerCase().indexOf('</head>');
  if (!nodes.some((n) => n.tag === 'meta' && attr(n, 'name') === 'description')) {
    findings.push({
      id: 'doc-meta-desc', category: 'seo', severity: 'warning', file: htmlFile,
      message: 'Missing <meta name="description"> for search snippets.',
      fix: headClose >= 0
        ? { label: 'Add meta description', file: htmlFile, range: [headClose, headClose], insert: '  <meta name="description" content="Describe this page in 150 characters.">\n' }
        : undefined,
    });
  }
  if (!nodes.some((n) => n.tag === 'meta' && attr(n, 'name') === 'viewport')) {
    findings.push({ id: 'doc-viewport', category: 'performance', severity: 'error', file: htmlFile, message: 'Missing responsive <meta name="viewport">.' });
  }

  // --- Semantics
  if (!nodes.some((n) => n.tag === 'main')) {
    findings.push({ id: 'sem-main', category: 'semantics', severity: 'warning', file: htmlFile, message: 'Page has no <main> landmark.' });
  }
  const headings = nodes.filter((n) => n.tag && /^h[1-6]$/.test(n.tag));
  const h1s = headings.filter((n) => n.tag === 'h1');
  if (h1s.length === 0) {
    findings.push({ id: 'sem-h1-missing', category: 'semantics', severity: 'warning', file: htmlFile, message: 'Page has no <h1> heading.' });
  } else if (h1s.length > 1) {
    findings.push({ id: 'sem-h1-multi', category: 'semantics', severity: 'warning', file: htmlFile, nodeKey: h1s[1].key, message: `Page has ${h1s.length} <h1> headings; prefer one.` });
  }
  let prevLevel = 0;
  for (const h of headings) {
    const level = Number(h.tag!.slice(1));
    if (prevLevel > 0 && level > prevLevel + 1) {
      findings.push({
        id: `sem-heading-skip-${h.key}`, category: 'semantics', severity: 'warning', file: htmlFile, nodeKey: h.key,
        message: `Heading level jumps from <h${prevLevel}> to <h${level}>.`,
      });
    }
    prevLevel = level;
  }

  // --- Images: alt, intrinsic size (CLS), LCP hint
  const imgs = nodes.filter((n) => n.tag === 'img');
  imgs.forEach((img, idx) => {
    const ins = insertBeforeTagEnd(img);
    if (attr(img, 'alt') === undefined) {
      findings.push({
        id: `img-alt-${img.key}`, category: 'a11y', severity: 'error', file: htmlFile, nodeKey: img.key,
        message: '<img> is missing alt text.',
        fix: ins !== null ? { label: 'Add alt', file: htmlFile, range: [ins, ins], insert: ' alt="Descriptive image"' } : undefined,
      });
    }
    if (!attr(img, 'width') || !attr(img, 'height')) {
      findings.push({
        id: `img-dims-${img.key}`, category: 'performance', severity: 'warning', file: htmlFile, nodeKey: img.key,
        message: '<img> lacks width/height attributes (causes layout shift).',
      });
    }
    if (idx === 0 && attr(img, 'loading') === 'lazy') {
      findings.push({
        id: `img-lcp-lazy-${img.key}`, category: 'performance', severity: 'warning', file: htmlFile, nodeKey: img.key,
        message: 'First image is lazy-loaded; if it is the LCP element, use fetchpriority="high" instead.',
        fix: ins !== null ? { label: 'Add fetchpriority="high"', file: htmlFile, range: [ins, ins], insert: ' fetchpriority="high"' } : undefined,
      });
    }
  });

  // --- Interactive elements need accessible names
  for (const n of nodes) {
    if (n.tag === 'button' || n.tag === 'a') {
      const hasText = (n.textContent ?? '').trim().length > 0 || n.children.length > 0;
      if (!hasText && !attr(n, 'aria-label') && !attr(n, 'title')) {
        const ins = insertBeforeTagEnd(n);
        findings.push({
          id: `name-${n.key}`, category: 'a11y', severity: 'error', file: htmlFile, nodeKey: n.key,
          message: `<${n.tag}> has no accessible text.`,
          fix: ins !== null ? { label: 'Add aria-label', file: htmlFile, range: [ins, ins], insert: ' aria-label="Describe action"' } : undefined,
        });
      }
    }
    if (n.tag === 'input' && attr(n, 'type') !== 'hidden' && !attr(n, 'aria-label') && !attr(n, 'id')) {
      findings.push({
        id: `input-label-${n.key}`, category: 'a11y', severity: 'warning', file: htmlFile, nodeKey: n.key,
        message: '<input> has no associated <label> or aria-label.',
      });
    }
  }

  // --- Contrast on rules that declare both color and background-color as hex
  for (const rule of parseCssRules(cssFile, css)) {
    const fg = rule.decls.find((d) => d.prop === 'color')?.value;
    const bg = rule.decls.find((d) => d.prop === 'background-color' || d.prop === 'background')?.value;
    if (!fg || !bg) continue;
    const ratio = contrastRatio(fg, bg);
    if (ratio !== null && ratio < 4.5) {
      findings.push({
        id: `contrast-${rule.ruleId}`, category: 'a11y', severity: 'warning', file: cssFile,
        message: `${rule.selector}: contrast ratio ${ratio.toFixed(2)}:1 is below WCAG AA 4.5:1.`,
      });
    }
  }

  const categories: AuditCategory[] = ['semantics', 'a11y', 'performance', 'seo'];
  const scores = {} as Record<AuditCategory, number>;
  for (const c of categories) {
    const inCat = findings.filter((f) => f.category === c);
    const penalty = inCat.reduce((acc, f) => acc + (f.severity === 'error' ? 12 : 5), 0);
    scores[c] = Math.max(0, 100 - penalty);
  }
  const overall = Math.round(categories.reduce((a, c) => a + scores[c], 0) / categories.length);

  return { scores, overall, findings };
}
