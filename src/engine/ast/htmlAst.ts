import * as parse5 from 'parse5';
import postcss from 'postcss';
import type { CssRuleRef, CssDeclRef, NodeId, Range, VNode, VNodeAttr } from '../types';
import { projectDoc, LOCAL_USER_ORIGIN } from '../doc/projectDoc';
import { sandboxRegistry } from '../sandbox/iframeBridge';
import { canContain, getAncestorTags, isDescendantOrSelf } from './contentModel';

/**
 * Source-First HTML5 & CSS3 AST Engine (01_SYSTEM_ARCHITECTURE.md §5, §6, §8)
 * - Parses HTML via parse5 (`sourceCodeLocationInfo: true`) into VNode trees
 * - Parses CSS via PostCSS into RuleIndex with exact source offsets
 * - Executes Range-Splice mutations on Y.Text (preserving user whitespace/indentation)
 * - Supports Move/Reorder, Wrap, Unwrap, Change Tag, Duplicate, Delete, Inline Text, and Style mutations
 */

export type CssUnit = 'px' | 'rem' | 'em' | '%' | 'vw' | 'vh' | 'auto';

export interface ParsedHtmlTree {
  file: string;
  nodes: Record<NodeId, VNode>;
  rootIds: NodeId[];
  order: NodeId[];
}

export function roundNum(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export function pxToUnit(
  px: number,
  unit: CssUnit,
  ctx: {
    parentWidth: number;
    rootFontSize: number;
    fontSize: number;
    vw: number;
    vh: number;
  }
): string {
  const safePx = Math.max(0, px);
  switch (unit) {
    case 'px':
      return `${roundNum(safePx, 0)}px`;
    case 'rem':
      return `${roundNum(safePx / Math.max(1, ctx.rootFontSize), 3)}rem`;
    case 'em':
      return `${roundNum(safePx / Math.max(1, ctx.fontSize), 3)}em`;
    case '%':
      return `${roundNum((safePx / Math.max(1, ctx.parentWidth)) * 100, 2)}%`;
    case 'vw':
      return `${roundNum((safePx / Math.max(1, ctx.vw)) * 100, 2)}vw`;
    case 'vh':
      return `${roundNum((safePx / Math.max(1, ctx.vh)) * 100, 2)}vh`;
    default:
      return `${roundNum(safePx, 0)}px`;
  }
}

export function detectCssUnit(rawValue: string | undefined): CssUnit {
  if (!rawValue) return 'px';
  const v = rawValue.trim().toLowerCase();
  if (v.endsWith('rem')) return 'rem';
  if (v.endsWith('em')) return 'em';
  if (v.endsWith('%')) return '%';
  if (v.endsWith('vw')) return 'vw';
  if (v.endsWith('vh')) return 'vh';
  if (v === 'auto') return 'auto';
  return 'px';
}

export function parseHtmlToVNodes(file: string, html: string): ParsedHtmlTree {
  const doc = parse5.parse(html, { sourceCodeLocationInfo: true });
  const nodes: Record<NodeId, VNode> = {};
  const rootIds: NodeId[] = [];
  const order: NodeId[] = [];
  const existingIds = new Set<string>();

  // Pre-collect explicit data-vds-id attributes so auto-numbering never collides
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function collectIds(node: any): void {
    if (!node) return;
    if (Array.isArray(node.attrs)) {
      const found = node.attrs.find((a: { name: string; value: string }) => a.name === 'data-vds-id');
      if (found?.value) existingIds.add(found.value);
    }
    if (Array.isArray(node.childNodes)) {
      for (const ch of node.childNodes) collectIds(ch);
    }
  }
  collectIds(doc);

  let bodyAutoCounter = 1;
  let headCounter = 0;
  let metaCounter = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function walk(node: any, parentId: NodeId | null, inBody: boolean): void {
    if (!node) return;

    if (typeof node.tagName === 'string') {
      const tag = node.tagName.toLowerCase();
      const nowInBody = inBody || tag === 'body';
      const loc = node.sourceCodeLocation;
      const rawAttrs: Array<{ name: string; value: string }> = Array.isArray(node.attrs)
        ? node.attrs
        : [];

      const idAttr = rawAttrs.find((a) => a.name === 'data-vds-id');
      let id: NodeId;
      if (idAttr?.value) {
        id = idAttr.value;
      } else if (tag === 'body') {
        id = 'n_body';
      } else if (tag === 'head') {
        id = 'n_head';
      } else if (tag === 'html') {
        id = 'n_html';
      } else if (!nowInBody) {
        headCounter += 1;
        id = `n_head_${headCounter}`;
      } else if (tag === 'script' || tag === 'style' || tag === 'noscript') {
        metaCounter += 1;
        id = `n_meta_${metaCounter}`;
      } else {
        while (existingIds.has(`n_auto_${bodyAutoCounter}`) || nodes[`n_auto_${bodyAutoCounter}`]) {
          bodyAutoCounter += 1;
        }
        id = `n_auto_${bodyAutoCounter}`;
        bodyAutoCounter += 1;
      }

      const attrs: VNodeAttr[] = rawAttrs.map((a) => {
        const attrLoc = loc?.attrs?.[a.name];
        const attrRange: Range = attrLoc
          ? [attrLoc.startOffset, attrLoc.endOffset]
          : [0, 0];
        return {
          name: a.name,
          value: a.value,
          range: attrRange,
        };
      });

      const range: Range = loc ? [loc.startOffset, loc.endOffset] : [0, 0];
      const startTagRange: Range | undefined = loc?.startTag
        ? [loc.startTag.startOffset, loc.startTag.endOffset]
        : undefined;
      const endTagRange: Range | null = loc?.endTag
        ? [loc.endTag.startOffset, loc.endTag.endOffset]
        : null;

      let textContent = '';
      if (Array.isArray(node.childNodes)) {
        for (const ch of node.childNodes) {
          if (ch.nodeName === '#text' && typeof ch.value === 'string') {
            textContent += ch.value;
          }
        }
      }

      const vnode: VNode = {
        id,
        key: id,
        type: 'element',
        tag,
        textContent: textContent.trim(),
        attrs,
        children: [],
        parent: parentId,
        range,
        startTagRange,
        endTagRange,
        file,
      };

      nodes[id] = vnode;
      order.push(id);

      if (parentId && nodes[parentId]) {
        nodes[parentId].children.push(id);
      }
      if (tag === 'body' || tag === 'head') {
        rootIds.push(id);
      }

      if (Array.isArray(node.childNodes)) {
        for (const child of node.childNodes) {
          walk(child, id, nowInBody);
        }
      }
      return;
    }

    if (Array.isArray(node.childNodes)) {
      for (const child of node.childNodes) {
        walk(child, parentId, inBody);
      }
    }
  }

  walk(doc, null, false);
  return { file, nodes, rootIds, order };
}

export function parseCssRules(file: string, cssText: string): CssRuleRef[] {
  const rules: CssRuleRef[] = [];
  let orderCounter = 0;

  try {
    const root = postcss.parse(cssText);
    root.walkRules((rule) => {
      orderCounter += 1;
      const startOffset = rule.source?.start?.offset ?? 0;
      const endOffset = rule.source?.end?.offset ?? cssText.length;

      let media: string | null = null;
      let parent = rule.parent;
      while (parent && parent.type !== 'root') {
        if (parent.type === 'atrule' && parent.name === 'media') {
          media = parent.params;
        }
        parent = parent.parent;
      }

      const decls: CssDeclRef[] = [];
      rule.walkDecls((decl) => {
        const dStart = decl.source?.start?.offset ?? 0;
        const dEnd = decl.source?.end?.offset ?? 0;
        const rawSlice = cssText.slice(dStart, dEnd);
        const colonIdx = rawSlice.indexOf(':');
        const valStart = colonIdx >= 0 ? dStart + colonIdx + 1 : dStart;
        const semiTrim = rawSlice.endsWith(';') ? 1 : 0;
        const valEnd = dEnd - semiTrim;

        decls.push({
          prop: decl.prop,
          value: decl.value,
          important: Boolean(decl.important),
          range: [dStart, dEnd],
          valueRange: [valStart, valEnd],
        });
      });

      rules.push({
        ruleId: `${file}:${orderCounter}:${rule.selector}`,
        file,
        selector: rule.selector,
        selectorRange: [startOffset, endOffset],
        media,
        layer: null,
        specificity: [0, 1, 0],
        order: orderCounter,
        decls,
      });
    });
  } catch {
    // Keep last good rules on syntax error
  }

  return rules;
}

export function commitElementStyleMutations(
  node: VNode,
  props: Record<string, string>,
  mediaQuery: string | null = null,
  cssFile = 'css/styles.css'
): { selector: string; updatedCss: string } {
  const ycss = projectDoc.files.get(cssFile);
  if (!ycss) {
    return { selector: '', updatedCss: '' };
  }

  const classAttr = node.attrs.find((a) => a.name === 'class')?.value ?? '';
  const classList = classAttr
    .split(/\s+/)
    .map((c) => c.trim())
    .filter(Boolean);

  const primaryClass = classList[classList.length - 1];
  const targetSelector = primaryClass
    ? `.${primaryClass}`
    : `[data-vds-id="${node.id}"]`;

  let currentCss = ycss.toString();
  const rules = parseCssRules(cssFile, currentCss);

  const matchingRule = rules.find(
    (r) =>
      r.selector.trim() === targetSelector &&
      (r.media ?? null) === (mediaQuery ?? null)
  );

  projectDoc.undoManager.stopCapturing();

  projectDoc.ydoc.transact(() => {
    if (matchingRule) {
      const propEntries = Object.entries(props);
      for (const [prop, val] of propEntries) {
        const freshCss = ycss.toString();
        const freshRules = parseCssRules(cssFile, freshCss);
        const freshRule = freshRules.find(
          (r) =>
            r.selector.trim() === targetSelector &&
            (r.media ?? null) === (mediaQuery ?? null)
        );
        if (!freshRule) continue;

        const existingDecl = freshRule.decls.find((d) => d.prop === prop);
        if (existingDecl) {
          const [vStart, vEnd] = existingDecl.valueRange;
          ycss.delete(vStart, vEnd - vStart);
          ycss.insert(vStart, ` ${val}`);
        } else {
          const ruleEnd = freshRule.selectorRange[1];
          const ruleText = freshCss.slice(freshRule.selectorRange[0], ruleEnd);
          const closeBraceRel = ruleText.lastIndexOf('}');
          if (closeBraceRel >= 0) {
            const insertPos = freshRule.selectorRange[0] + closeBraceRel;
            const declLine = `  ${prop}: ${val};\n`;
            ycss.insert(insertPos, declLine);
          }
        }
      }
    } else {
      const declLines = Object.entries(props)
        .map(([k, v]) => `  ${k}: ${v};`)
        .join('\n');

      const newRuleBlock = mediaQuery
        ? `\n@media ${mediaQuery} {\n  ${targetSelector} {\n${declLines
            .split('\n')
            .map((l) => `  ${l}`)
            .join('\n')}\n  }\n}\n`
        : `\n${targetSelector} {\n${declLines}\n}\n`;

      ycss.insert(ycss.length, newRuleBlock);
    }
  }, LOCAL_USER_ORIGIN);

  projectDoc.undoManager.stopCapturing();

  currentCss = ycss.toString();
  sandboxRegistry.broadcastPatch([
    {
      op: 'replaceSheet',
      file: cssFile,
      cssText: currentCss,
    },
  ]);

  return { selector: targetSelector, updatedCss: currentCss };
}

export function commitElementTextMutation(
  file: string,
  nodeId: NodeId,
  newText: string
): boolean {
  const yhtml = projectDoc.files.get(file);
  if (!yhtml) return false;

  const html = yhtml.toString();
  const tree = parseHtmlToVNodes(file, html);
  const vnode = tree.nodes[nodeId];
  if (!vnode || !vnode.startTagRange || !vnode.endTagRange) return false;

  const innerStart = vnode.startTagRange[1];
  const innerEnd = vnode.endTagRange[0];
  if (innerEnd < innerStart) return false;

  const escaped = newText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  projectDoc.undoManager.stopCapturing();
  projectDoc.ydoc.transact(() => {
    yhtml.delete(innerStart, innerEnd - innerStart);
    yhtml.insert(innerStart, escaped);
  }, LOCAL_USER_ORIGIN);
  projectDoc.undoManager.stopCapturing();

  sandboxRegistry.broadcastPatch([
    {
      op: 'setText',
      id: nodeId,
      text: newText,
    },
  ]);

  return true;
}

/**
 * Commit rich inline HTML mutation (e.g. <strong>, <em>, <u>, <code>, <a> from Floating Rich-Text Toolbar)
 */
export function commitElementInnerHtmlMutation(
  file: string,
  nodeId: NodeId,
  newInnerHtml: string
): boolean {
  const yhtml = projectDoc.files.get(file);
  if (!yhtml) return false;

  const html = yhtml.toString();
  const tree = parseHtmlToVNodes(file, html);
  const vnode = tree.nodes[nodeId];
  if (!vnode || !vnode.startTagRange || !vnode.endTagRange) return false;

  const innerStart = vnode.startTagRange[1];
  const innerEnd = vnode.endTagRange[0];
  if (innerEnd < innerStart) return false;

  const cleaned = newInnerHtml.replace(
    /\b(src|href)=["']\/__vds_local\/([^"']+)["']/gi,
    '$1="$2"'
  );

  projectDoc.undoManager.stopCapturing();
  projectDoc.ydoc.transact(() => {
    yhtml.delete(innerStart, innerEnd - innerStart);
    yhtml.insert(innerStart, cleaned);
  }, LOCAL_USER_ORIGIN);
  projectDoc.undoManager.stopCapturing();

  sandboxRegistry.broadcastPatch([
    {
      op: 'setInnerHtml',
      id: nodeId,
      html: cleaned,
    },
  ]);

  return true;
}

/**
 * AST-backed HTML Attribute / Trait Mutation (GrapesJS TraitManager equivalent)
 * Preserves source formatting via parse5 startTagRange & attribute byte offsets.
 */
export function commitElementAttributeMutation(
  file: string,
  nodeId: NodeId,
  attrName: string,
  attrValue: string | null
): boolean {
  const cleanName = attrName.trim().toLowerCase();
  if (!cleanName || cleanName === 'data-vds-id') return false;

  const yhtml = projectDoc.files.get(file);
  if (!yhtml) return false;

  const html = yhtml.toString();
  const tree = parseHtmlToVNodes(file, html);
  const vnode = tree.nodes[nodeId];
  if (!vnode || !vnode.startTagRange) return false;

  const existingAttr = vnode.attrs.find((a) => a.name.toLowerCase() === cleanName);
  const escapedVal =
    attrValue !== null
      ? attrValue.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      : null;

  projectDoc.undoManager.stopCapturing();
  projectDoc.ydoc.transact(() => {
    if (existingAttr && existingAttr.range[1] > existingAttr.range[0]) {
      const [aStart, aEnd] = existingAttr.range;
      if (escapedVal === null) {
        const leadSpace = html[aStart - 1] === ' ' ? 1 : 0;
        yhtml.delete(aStart - leadSpace, aEnd - aStart + leadSpace);
      } else {
        yhtml.delete(aStart, aEnd - aStart);
        yhtml.insert(aStart, `${cleanName}="${escapedVal}"`);
      }
    } else if (escapedVal !== null && vnode.startTagRange) {
      const [sStart, sEnd] = vnode.startTagRange;
      const openSlice = html.slice(sStart, sEnd);
      const isSelfClosing = openSlice.endsWith('/>');
      const insertPos = isSelfClosing ? sEnd - 2 : sEnd - 1;
      const prefixSpace = html[insertPos - 1] === ' ' ? '' : ' ';
      yhtml.insert(insertPos, `${prefixSpace}${cleanName}="${escapedVal}"`);
    }
  }, LOCAL_USER_ORIGIN);
  projectDoc.undoManager.stopCapturing();

  sandboxRegistry.broadcastPatch([
    {
      op: 'setAttr',
      id: nodeId,
      name: cleanName,
      value: attrValue,
    },
  ]);

  return true;
}

export function deleteElementNode(file: string, nodeId: NodeId): boolean {
  const yhtml = projectDoc.files.get(file);
  if (!yhtml) return false;

  const html = yhtml.toString();
  const tree = parseHtmlToVNodes(file, html);
  const vnode = tree.nodes[nodeId];
  if (!vnode || vnode.tag === 'body' || vnode.tag === 'html' || vnode.tag === 'head') {
    return false;
  }

  const [start, end] = vnode.range;
  if (end <= start) return false;

  projectDoc.undoManager.stopCapturing();
  projectDoc.ydoc.transact(() => {
    yhtml.delete(start, end - start);
  }, LOCAL_USER_ORIGIN);
  projectDoc.undoManager.stopCapturing();

  sandboxRegistry.broadcastPatch([{ op: 'remove', id: nodeId }]);
  return true;
}

export function duplicateElementNode(file: string, nodeId: NodeId): NodeId | null {
  const yhtml = projectDoc.files.get(file);
  if (!yhtml) return null;

  const html = yhtml.toString();
  const tree = parseHtmlToVNodes(file, html);
  const vnode = tree.nodes[nodeId];
  if (!vnode || !vnode.parent || vnode.tag === 'body') return null;

  const [start, end] = vnode.range;
  const rawSlice = html.slice(start, end);
  const suffix = `_${Date.now().toString(36).slice(-4)}`;

  let newRootId: NodeId | null = null;
  const clonedHtml = rawSlice.replace(
    /data-vds-id="([^"]+)"/g,
    (_match, oldId: string) => {
      const nextId = `${oldId}${suffix}`;
      if (!newRootId) newRootId = nextId;
      return `data-vds-id="${nextId}"`;
    }
  );

  if (!newRootId) return null;

  projectDoc.undoManager.stopCapturing();
  projectDoc.ydoc.transact(() => {
    yhtml.insert(end, `\n${clonedHtml}`);
  }, LOCAL_USER_ORIGIN);
  projectDoc.undoManager.stopCapturing();

  const parentNode = tree.nodes[vnode.parent];
  const idx = parentNode ? parentNode.children.indexOf(nodeId) : -1;
  const beforeId =
    parentNode && idx >= 0 && idx + 1 < parentNode.children.length
      ? parentNode.children[idx + 1]
      : null;

  sandboxRegistry.broadcastPatch([
    {
      op: 'insert',
      parentId: vnode.parent,
      beforeId,
      html: clonedHtml,
    },
  ]);

  return newRootId;
}

/**
 * Helper to detect leading line indentation at an offset
 */
function getLineIndentation(text: string, offset: number): string {
  const lineStart = text.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
  let i = lineStart;
  while (i < offset && (text[i] === ' ' || text[i] === '\t')) {
    i++;
  }
  return text.slice(lineStart, i);
}

/**
 * Move / Reparent Node in HTML AST with Content-Model Validation & Re-indentation
 * Shared by LAYER-01_TREE_REORDER.md and CANVAS-03_DRAG_DROP_REORDER.md
 */
export function moveElementNode(
  file: string,
  nodeId: NodeId,
  targetParentId: NodeId,
  beforeId: NodeId | null,
  options: { copy?: boolean; forceValidation?: boolean } = {}
): { ok: true; newId?: NodeId } | { ok: false; reason: string } {
  const yhtml = projectDoc.files.get(file);
  if (!yhtml) return { ok: false, reason: 'File not found' };

  const html = yhtml.toString();
  const tree = parseHtmlToVNodes(file, html);
  const sourceNode = tree.nodes[nodeId];
  const targetParent = tree.nodes[targetParentId];

  if (!sourceNode || !targetParent) {
    return { ok: false, reason: 'Source or target parent not found' };
  }
  if (sourceNode.tag === 'body' || sourceNode.tag === 'html' || sourceNode.tag === 'head') {
    return { ok: false, reason: `Cannot move root <${sourceNode.tag}> element.` };
  }
  if (!options.copy && isDescendantOrSelf(tree.nodes, nodeId, targetParentId)) {
    return { ok: false, reason: 'Cannot move an element into itself or its descendant.' };
  }
  if (!options.copy && beforeId === nodeId) {
    return { ok: true };
  }

  // Validate HTML5 content model
  const validation = canContain(
    targetParent.tag ?? 'div',
    sourceNode.tag ?? 'div',
    {
      parentAncestors: getAncestorTags(tree.nodes, targetParentId),
      force: options.forceValidation,
    }
  );
  if (!validation.ok) {
    return validation;
  }

  const [srcStart, srcEnd] = sourceNode.range;
  let snippet = html.slice(srcStart, srcEnd);

  // If Alt+Drop copy is requested, mint new IDs
  let createdCopyId: NodeId | undefined;
  if (options.copy) {
    const suffix = `_${Date.now().toString(36).slice(-4)}`;
    snippet = snippet.replace(/data-vds-id="([^"]+)"/g, (_m, oldId: string) => {
      const nextId = `${oldId}${suffix}`;
      if (!createdCopyId) createdCopyId = nextId;
      return `data-vds-id="${nextId}"`;
    });
  }

  // Determine insertion offset and indentation
  let insertOffset: number;
  let targetIndent = '    ';
  if (beforeId && tree.nodes[beforeId]) {
    insertOffset = tree.nodes[beforeId].range[0];
    targetIndent = getLineIndentation(html, insertOffset);
  } else if (targetParent.endTagRange) {
    insertOffset = targetParent.endTagRange[0];
    const parentIndent = getLineIndentation(html, targetParent.range[0]);
    targetIndent = `${parentIndent}  `;
  } else {
    return { ok: false, reason: 'Target container has no closing tag.' };
  }

  // Expand source removal range to include leading indentation & trailing newline if on its own line
  let removeStart = srcStart;
  while (removeStart > 0 && (html[removeStart - 1] === ' ' || html[removeStart - 1] === '\t')) {
    removeStart--;
  }
  let removeEnd = srcEnd;
  if (html[removeEnd] === '\r') removeEnd++;
  if (html[removeEnd] === '\n') removeEnd++;

  // Avoid no-op moves
  if (!options.copy && insertOffset >= removeStart && insertOffset <= removeEnd) {
    return { ok: true };
  }

  const formattedInsert = `${targetIndent}${snippet.trim()}\n`;

  projectDoc.undoManager.stopCapturing();
  projectDoc.ydoc.transact(() => {
    if (options.copy) {
      yhtml.insert(insertOffset, formattedInsert);
    } else if (insertOffset < removeStart) {
      // Delete source first (at higher offset) then insert at lower offset
      yhtml.delete(removeStart, removeEnd - removeStart);
      yhtml.insert(insertOffset, formattedInsert);
    } else {
      // Insert at higher offset first, then delete source at lower offset
      yhtml.insert(insertOffset, formattedInsert);
      yhtml.delete(removeStart, removeEnd - removeStart);
    }
  }, LOCAL_USER_ORIGIN);
  projectDoc.undoManager.stopCapturing();

  if (options.copy) {
    sandboxRegistry.broadcastPatch([
      {
        op: 'insert',
        parentId: targetParentId,
        beforeId,
        html: snippet,
      },
    ]);
  } else {
    sandboxRegistry.broadcastPatch([
      {
        op: 'move',
        id: nodeId,
        parentId: targetParentId,
        beforeId,
      },
    ]);
  }

  return { ok: true, newId: createdCopyId };
}

/**
 * Wrap Element(s) in a <div> (Ctrl+G — LAYER-01_TREE_REORDER.md §2)
 */
export function wrapElementNode(
  file: string,
  nodeId: NodeId,
  wrapperTag = 'div'
): NodeId | null {
  const yhtml = projectDoc.files.get(file);
  if (!yhtml) return null;

  const html = yhtml.toString();
  const tree = parseHtmlToVNodes(file, html);
  const vnode = tree.nodes[nodeId];
  if (!vnode || !vnode.parent || vnode.tag === 'body' || vnode.tag === 'html') {
    return null;
  }

  const [start, end] = vnode.range;
  const indent = getLineIndentation(html, start);
  const wrapperId = `n_wrap_${Date.now().toString(36).slice(-4)}`;
  const innerSlice = html
    .slice(start, end)
    .split('\n')
    .map((line, idx) => (idx === 0 ? `${indent}  ${line.trimStart()}` : `  ${line}`))
    .join('\n');

  const wrappedHtml = `<${wrapperTag} class="vds-group" data-vds-id="${wrapperId}">\n${innerSlice}\n${indent}</${wrapperTag}>`;

  projectDoc.undoManager.stopCapturing();
  projectDoc.ydoc.transact(() => {
    yhtml.delete(start, end - start);
    yhtml.insert(start, wrappedHtml);
  }, LOCAL_USER_ORIGIN);
  projectDoc.undoManager.stopCapturing();

  // Reload HTML in live artboards cleanly
  reloadArtboardsForFile(file);
  return wrapperId;
}

/**
 * Unwrap Element (Ctrl+Shift+G — LAYER-01_TREE_REORDER.md §2)
 */
export function unwrapElementNode(file: string, nodeId: NodeId): NodeId | null {
  const yhtml = projectDoc.files.get(file);
  if (!yhtml) return null;

  const html = yhtml.toString();
  const tree = parseHtmlToVNodes(file, html);
  const vnode = tree.nodes[nodeId];
  if (
    !vnode ||
    !vnode.parent ||
    !vnode.startTagRange ||
    !vnode.endTagRange ||
    vnode.children.length === 0 ||
    vnode.tag === 'body' ||
    vnode.tag === 'main'
  ) {
    return null;
  }

  const firstChildId = vnode.children[0];
  const innerContent = html.slice(vnode.startTagRange[1], vnode.endTagRange[0]).trim();
  const [start, end] = vnode.range;

  projectDoc.undoManager.stopCapturing();
  projectDoc.ydoc.transact(() => {
    yhtml.delete(start, end - start);
    yhtml.insert(start, innerContent);
  }, LOCAL_USER_ORIGIN);
  projectDoc.undoManager.stopCapturing();

  reloadArtboardsForFile(file);
  return firstChildId;
}

/**
 * Change Semantic Tag (`div` -> `section` / `article` / `header` — LAYER-01 §2)
 */
export function changeElementTag(
  file: string,
  nodeId: NodeId,
  newTag: string
): boolean {
  const yhtml = projectDoc.files.get(file);
  if (!yhtml) return false;

  const cleanTag = newTag.trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]*$/.test(cleanTag)) return false;

  const html = yhtml.toString();
  const tree = parseHtmlToVNodes(file, html);
  const vnode = tree.nodes[nodeId];
  if (!vnode || !vnode.tag || !vnode.startTagRange || vnode.tag === 'body' || vnode.tag === 'html') {
    return false;
  }

  const oldTagLen = vnode.tag.length;
  const openTagNameStart = vnode.startTagRange[0] + 1; // right after '<'

  projectDoc.undoManager.stopCapturing();
  projectDoc.ydoc.transact(() => {
    if (vnode.endTagRange) {
      const closeTagNameStart = vnode.endTagRange[0] + 2; // right after '</'
      yhtml.delete(closeTagNameStart, oldTagLen);
      yhtml.insert(closeTagNameStart, cleanTag);
    }
    yhtml.delete(openTagNameStart, oldTagLen);
    yhtml.insert(openTagNameStart, cleanTag);
  }, LOCAL_USER_ORIGIN);
  projectDoc.undoManager.stopCapturing();

  reloadArtboardsForFile(file);
  return true;
}

export function reloadArtboardsForFile(file: string): void {
  const html = projectDoc.getFileText(file);
  const sheets = projectDoc.getStyleSheets();
  sandboxRegistry.broadcastLoad(file, html, sheets);
}

/**
 * Synchronize dynamically hydrated DOM nodes (`n_auto_*` created by page scripts like
 * navbar.js / kasir.js) from the sandboxed artboard back into projectDoc's HTML source
 * so they appear in the Layers Tree and are 100% editable in the Visual Inspector.
 */
export function syncHydratedBodyHtml(
  file: string,
  rawBodyInnerHtml: string
): boolean {
  const yhtml = projectDoc.files.get(file);
  if (!yhtml) return false;

  const html = yhtml.toString();
  const tree = parseHtmlToVNodes(file, html);
  const bodyNode = tree.nodes['n_body'];
  if (!bodyNode || !bodyNode.startTagRange || !bodyNode.endTagRange) {
    return false;
  }

  const innerStart = bodyNode.startTagRange[1];
  const innerEnd = bodyNode.endTagRange[0];
  if (innerEnd < innerStart) return false;

  const cleanedInner = rawBodyInnerHtml
    .replace(/<script\b[^>]*data-vds-agent=["']true["'][^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/\b(src|href)=["']\/__vds_local\/([^"']+)["']/gi, '$1="$2"')
    .trim();

  const currentInner = html.slice(innerStart, innerEnd).trim();
  if (cleanedInner === currentInner || !cleanedInner) {
    return false;
  }

  projectDoc.ydoc.transact(() => {
    yhtml.delete(innerStart, innerEnd - innerStart);
    yhtml.insert(innerStart, `\n${cleanedInner}\n`);
  });

  return true;
}
