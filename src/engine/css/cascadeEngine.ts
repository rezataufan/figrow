import type { CssRuleRef, NodeId, PseudoState, VNode } from '../types';
import { parseCssRules, parseHtmlToVNodes } from '../ast/htmlAst';
import { projectDoc, LOCAL_USER_ORIGIN } from '../doc/projectDoc';
import { sandboxRegistry } from '../sandbox/iframeBridge';
import { useCanvasStore } from '../../store/canvasStore';

/**
 * CSS Cascade, Specificity, Shorthand Intelligence, Class Manager & Design Tokens Engine
 * Aligned with:
 * - CSS-01_BOX_MODEL.md (Shorthand expansion/collapse, declared vs computed vs overridden)
 * - CSS-04_CLASSES_STATES.md (Selector Bar, Matched Rules, Pseudo-states, Media Queries, Design Tokens)
 */

export type StyleTargetKind = 'rule' | 'inline' | 'newRule';

export interface StyleWriteTarget {
  kind: StyleTargetKind;
  selector: string;
  file: string;
  media: string | null;
  state: PseudoState | null;
}

export interface MatchedRuleEntry {
  ruleId: string;
  selector: string;
  baseSelector: string;
  state: PseudoState | null;
  file: string;
  media: string | null;
  mediaActive: boolean;
  specificity: [number, number, number];
  order: number;
  affects: number;
  decls: Record<string, string>;
}

export interface DeclaredPropInfo {
  prop: string;
  raw: string;
  winnerSelector: string;
  winnerMedia: string | null;
  winnerRuleId: string | 'inline';
  status: 'active' | 'inherited';
  overriddenList: Array<{
    value: string;
    selector: string;
    media: string | null;
    reason: 'specificity' | 'order' | 'inline-override';
  }>;
  fromShorthand?: 'margin' | 'padding';
}

export interface DesignTokenEntry {
  name: `--${string}`;
  value: string;
  group: 'color' | 'space' | 'radius' | 'other';
  scope: string;
}

/**
 * Calculate simple W3C selector specificity [id, class/attr/pseudo-class, type/pseudo-element]
 */
export function computeSpecificity(selector: string): [number, number, number] {
  const clean = selector.trim();
  const idMatches = clean.match(/#[a-zA-Z0-9_-]+/g);
  const classMatches = clean.match(/\.[a-zA-Z0-9_-]+/g);
  const attrMatches = clean.match(/\[[^\]]+\]/g);
  const pseudoClassMatches = clean.match(/:(?!:)[a-zA-Z-]+/g);
  const typeMatches = clean
    .replace(/#[a-zA-Z0-9_-]+/g, ' ')
    .replace(/\.[a-zA-Z0-9_-]+/g, ' ')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/::?[a-zA-Z-]+/g, ' ')
    .trim()
    .split(/[\s>+~]+/)
    .filter((tok) => tok && tok !== '*');

  return [
    idMatches ? idMatches.length : 0,
    (classMatches?.length ?? 0) +
      (attrMatches?.length ?? 0) +
      (pseudoClassMatches?.length ?? 0),
    typeMatches.length,
  ];
}

export function compareSpecificity(
  a: [number, number, number],
  b: [number, number, number],
  orderA: number,
  orderB: number
): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  if (a[2] !== b[2]) return a[2] - b[2];
  return orderA - orderB;
}

const KNOWN_PSEUDO_STATES: PseudoState[] = [
  ':focus-visible',
  ':focus-within',
  ':hover',
  ':focus',
  ':active',
  ':visited',
  ':disabled',
  '::before',
  '::after',
];

export function splitSelectorPseudo(selector: string): {
  baseSelector: string;
  state: PseudoState | null;
} {
  const trimmed = selector.trim();
  for (const st of KNOWN_PSEUDO_STATES) {
    if (trimmed.endsWith(st)) {
      return {
        baseSelector: trimmed.slice(0, trimmed.length - st.length).trim(),
        state: st,
      };
    }
  }
  return { baseSelector: trimmed, state: null };
}

export function isMediaQueryActive(media: string | null, artboardWidth: number): boolean {
  if (!media) return true;
  const maxMatch = media.match(/max-width:\s*([\d.]+)px/i);
  if (maxMatch) {
    const maxPx = parseFloat(maxMatch[1]);
    if (Number.isFinite(maxPx) && artboardWidth > maxPx) return false;
  }
  const minMatch = media.match(/min-width:\s*([\d.]+)px/i);
  if (minMatch) {
    const minPx = parseFloat(minMatch[1]);
    if (Number.isFinite(minPx) && artboardWidth < minPx) return false;
  }
  return true;
}

/**
 * Checks if a simple selector (`.card`, `section.hero`, `#features`, `body`, `[data-vds-id="..."]`)
 * matches a VNode in the AST.
 */
export function doesBaseSelectorMatchNode(
  baseSelector: string,
  node: VNode,
  allNodes: Record<NodeId, VNode>
): boolean {
  const parts = baseSelector
    .split(/\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return false;

  const matchSingle = (selPart: string, target: VNode): boolean => {
    if (selPart === '*') return true;
    const tag = target.tag?.toLowerCase() ?? '';
    const idAttr = target.attrs.find((a) => a.name === 'id')?.value ?? '';
    const classList = (target.attrs.find((a) => a.name === 'class')?.value ?? '')
      .split(/\s+/)
      .filter(Boolean);

    // Check data-vds-id attribute selector
    const dataIdMatch = selPart.match(/\[data-vds-id="([^"]+)"\]/);
    if (dataIdMatch) {
      return target.id === dataIdMatch[1];
    }

    // Check ID
    const idMatch = selPart.match(/#([a-zA-Z0-9_-]+)/);
    if (idMatch && idMatch[1] !== idAttr) {
      return false;
    }

    // Check classes
    const classMatches = Array.from(selPart.matchAll(/\.([a-zA-Z0-9_-]+)/g)).map(
      (m) => m[1]
    );
    for (const reqCls of classMatches) {
      if (!classList.includes(reqCls)) return false;
    }

    // Check tag prefix
    const tagPrefix = selPart.replace(/[#.[\]:].*$/, '').trim().toLowerCase();
    if (tagPrefix && tagPrefix !== tag) {
      return false;
    }

    return Boolean(tagPrefix || idMatch || classMatches.length > 0);
  };

  const lastPart = parts[parts.length - 1];
  if (!matchSingle(lastPart, node)) return false;

  if (parts.length === 1) return true;

  // Verify ancestor chain for descendant selectors (e.g. `.hero .btn--primary`)
  let currParentId = node.parent;
  for (let i = parts.length - 2; i >= 0; i--) {
    const needed = parts[i];
    if (needed === '>') continue;
    let found = false;
    while (currParentId && allNodes[currParentId]) {
      const anc = allNodes[currParentId];
      currParentId = anc.parent;
      if (matchSingle(needed, anc)) {
        found = true;
        break;
      }
    }
    if (!found) return false;
  }

  return true;
}

/**
 * Expand CSS 1..4 value box shorthand (`margin` / `padding`) into 4 sides
 */
export function expandBoxShorthand(raw: string): {
  top: string;
  right: string;
  bottom: string;
  left: string;
} {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
  }
  if (parts.length === 2) {
    return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
  }
  if (parts.length === 3) {
    return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
  }
  return {
    top: parts[0] ?? '0px',
    right: parts[1] ?? '0px',
    bottom: parts[2] ?? '0px',
    left: parts[3] ?? '0px',
  };
}

/**
 * Collapse 4 box sides into canonical CSS shorthand (CSS-01 §2 Shorthand Intelligence)
 */
export function collapseBoxShorthand(sides: {
  top: string;
  right: string;
  bottom: string;
  left: string;
}): string {
  const { top, right, bottom, left } = sides;
  if (top === right && right === bottom && bottom === left) {
    return top;
  }
  if (top === bottom && right === left) {
    return `${top} ${right}`;
  }
  if (right === left) {
    return `${top} ${right} ${bottom}`;
  }
  return `${top} ${right} ${bottom} ${left}`;
}

/**
 * Resolve all matched rules and per-property cascade winners for a VNode
 */
export function resolveElementCascade(
  nodeId: NodeId,
  artboardWidth: number,
  activeState: PseudoState | null,
  htmlFile = 'index.html',
  cssFile = 'css/styles.css'
): {
  vnode: VNode | null;
  classes: string[];
  matchedRules: MatchedRuleEntry[];
  declaredProps: Record<string, DeclaredPropInfo>;
} {
  const effectiveHtmlFile = projectDoc.files.has(htmlFile) ? htmlFile : 'index.html';
  const html = projectDoc.getFileText(effectiveHtmlFile);
  const tree = parseHtmlToVNodes(effectiveHtmlFile, html);
  let vnode: VNode | null = tree.nodes[nodeId] ?? null;

  if (!vnode) {
    const canvasState = useCanvasStore.getState();
    const activeRects = canvasState.measuredRects[canvasState.activeArtboardId] ?? {};
    const measured = activeRects[nodeId];
    if (measured) {
      vnode = {
        id: nodeId,
        key: nodeId,
        type: 'element',
        tag: measured.tag || 'div',
        attrs: [
          { name: 'data-vds-id', value: nodeId, range: [0, 0] },
          ...(measured.classes.length > 0
            ? [{ name: 'class', value: measured.classes.join(' '), range: [0, 0] as [number, number] }]
            : []),
        ],
        children: [],
        parent: measured.parentId,
        range: [0, 0],
        file: htmlFile,
      };
      tree.nodes[nodeId] = vnode;
    }
  }

  if (!vnode) {
    return { vnode: null, classes: [], matchedRules: [], declaredProps: {} };
  }

  const classAttr = vnode.attrs.find((a) => a.name === 'class')?.value ?? '';
  const classes = classAttr.split(/\s+/).filter(Boolean);

  // Extract any inline <style> blocks from the active HTML file so uploaded self-contained HTML pages
  // have all their CSS rules visible in the Visual Inspector alongside project stylesheets
  const inlineStyleChunks: string[] = [];
  html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_m, content: string) => {
    if (content && content.trim()) {
      inlineStyleChunks.push(content.trim());
    }
    return '';
  });
  const inlineRules =
    inlineStyleChunks.length > 0
      ? parseCssRules(htmlFile, inlineStyleChunks.join('\n\n'))
      : [];

  const allRules: CssRuleRef[] = [...inlineRules];
  let runningOrder = inlineRules.length;

  const projectSheets = projectDoc.getStyleSheets();
  // Ensure primary cssFile ('css/styles.css') is processed last so inspector overrides win
  const sortedSheets = [...projectSheets].sort((a, b) => {
    if (a.file === cssFile) return 1;
    if (b.file === cssFile) return -1;
    return 0;
  });

  for (const sheet of sortedSheets) {
    const parsedRules = parseCssRules(sheet.file, sheet.css).map((r) => ({
      ...r,
      order: r.order + runningOrder,
    }));
    runningOrder += parsedRules.length;
    allRules.push(...parsedRules);
  }

  const allVNodes = Object.values(tree.nodes);

  const matchedRules: MatchedRuleEntry[] = [];

  for (const r of allRules) {
    const { baseSelector, state } = splitSelectorPseudo(r.selector);
    if (!doesBaseSelectorMatchNode(baseSelector, vnode, tree.nodes)) {
      continue;
    }

    const spec = computeSpecificity(r.selector);
    const mediaActive = isMediaQueryActive(r.media, artboardWidth);

    // Count how many elements in the document match baseSelector
    let affects = 0;
    for (const candidate of allVNodes) {
      if (doesBaseSelectorMatchNode(baseSelector, candidate, tree.nodes)) {
        affects += 1;
      }
    }

    const declMap: Record<string, string> = {};
    for (const d of r.decls) {
      declMap[d.prop] = d.value.trim();
      if (d.prop === 'padding' || d.prop === 'margin') {
        const exp = expandBoxShorthand(d.value);
        declMap[`${d.prop}-top`] = exp.top;
        declMap[`${d.prop}-right`] = exp.right;
        declMap[`${d.prop}-bottom`] = exp.bottom;
        declMap[`${d.prop}-left`] = exp.left;
      }
    }

    matchedRules.push({
      ruleId: r.ruleId,
      selector: r.selector,
      baseSelector,
      state,
      file: r.file,
      media: r.media,
      mediaActive,
      specificity: spec,
      order: r.order,
      affects,
      decls: declMap,
    });
  }

  // Sort matched rules from highest cascade priority to lowest
  matchedRules.sort((a, b) =>
    compareSpecificity(b.specificity, a.specificity, b.order, a.order)
  );

  // Compute winning declaration per property for the active state + active media
  const activeRules = matchedRules.filter(
    (mr) => mr.mediaActive && (mr.state === null || mr.state === activeState)
  );

  // Also parse inline style attribute if present
  const inlineStyleAttr = vnode.attrs.find((a) => a.name === 'style')?.value ?? '';
  const inlineDecls: Record<string, string> = {};
  if (inlineStyleAttr.trim()) {
    inlineStyleAttr.split(';').forEach((pair) => {
      const idx = pair.indexOf(':');
      if (idx > 0) {
        const p = pair.slice(0, idx).trim();
        const v = pair.slice(idx + 1).trim();
        if (p && v) inlineDecls[p] = v;
      }
    });
  }

  const declaredProps: Record<string, DeclaredPropInfo> = {};

  // Collect all property candidates in cascade order (Inline first, then activeRules)
  const allProps = new Set<string>(Object.keys(inlineDecls));
  for (const r of activeRules) {
    Object.keys(r.decls).forEach((p) => allProps.add(p));
  }

  for (const prop of allProps) {
    const candidates: Array<{
      value: string;
      selector: string;
      media: string | null;
      ruleId: string | 'inline';
      isInline: boolean;
    }> = [];

    if (inlineDecls[prop] !== undefined) {
      candidates.push({
        value: inlineDecls[prop],
        selector: 'style="" (inline)',
        media: null,
        ruleId: 'inline',
        isInline: true,
      });
    }

    for (const r of activeRules) {
      if (r.decls[prop] !== undefined) {
        candidates.push({
          value: r.decls[prop],
          selector: r.selector,
          media: r.media,
          ruleId: r.ruleId,
          isInline: false,
        });
      }
    }

    if (candidates.length > 0) {
      const winner = candidates[0];
      const overriddenList = candidates.slice(1).map((c) => ({
        value: c.value,
        selector: c.selector,
        media: c.media,
        reason: (winner.isInline ? 'inline-override' : 'specificity') as
          | 'specificity'
          | 'order'
          | 'inline-override',
      }));

      declaredProps[prop] = {
        prop,
        raw: winner.value,
        winnerSelector: winner.selector,
        winnerMedia: winner.media,
        winnerRuleId: winner.ruleId,
        status: 'active',
        overriddenList,
      };
    }
  }

  return { vnode, classes, matchedRules, declaredProps };
}

/**
 * Write CSS declaration(s) to an explicit StyleWriteTarget (CSS-01 & CSS-04 contract)
 * Includes Shorthand Intelligence for margin/padding and Inline Style support.
 */
export function writeDeclarationsToTarget(
  node: VNode,
  target: StyleWriteTarget,
  props: Record<string, string | null>
): void {
  if (target.kind === 'inline') {
    writeInlineStyleAttr(node, props);
    return;
  }

  const cssFile = target.file || 'css/styles.css';
  const ycss = projectDoc.files.get(cssFile);
  if (!ycss) return;

  const fullSelector = target.state
    ? `${target.selector.trim()}${target.state}`
    : target.selector.trim();
  const mediaQuery = target.media;

  projectDoc.undoManager.stopCapturing();
  projectDoc.ydoc.transact(() => {
    const freshCss = ycss.toString();
    const rules = parseCssRules(cssFile, freshCss);
    const existingRule = rules.find(
      (r) =>
        r.selector.trim() === fullSelector &&
        (r.media ?? null) === (mediaQuery ?? null)
    );

    // If pseudo-element ::before or ::after is created for the first time, ensure content: "" exists (CSS-04 §4)
    const effectiveProps: Record<string, string | null> = { ...props };
    if (
      !existingRule &&
      (target.state === '::before' || target.state === '::after') &&
      effectiveProps.content === undefined
    ) {
      effectiveProps.content = '""';
    }

    if (existingRule) {
      for (const [prop, val] of Object.entries(effectiveProps)) {
        applySingleDeclToRule(ycss, cssFile, fullSelector, mediaQuery, prop, val);
      }
    } else {
      const validLines = Object.entries(effectiveProps)
        .filter(([, v]) => v !== null && v !== '')
        .map(([k, v]) => `  ${k}: ${v};`);

      if (validLines.length === 0) return;

      const blockBody = validLines.join('\n');
      const newRuleText = mediaQuery
        ? `\n@media ${mediaQuery} {\n  ${fullSelector} {\n${validLines
            .map((l) => `  ${l}`)
            .join('\n')}\n  }\n}\n`
        : `\n${fullSelector} {\n${blockBody}\n}\n`;

      ycss.insert(ycss.length, newRuleText);
    }
  }, LOCAL_USER_ORIGIN);
  projectDoc.undoManager.stopCapturing();

  sandboxRegistry.broadcastPatch([
    {
      op: 'replaceSheet',
      file: cssFile,
      cssText: ycss.toString(),
    },
  ]);
}

function applySingleDeclToRule(
  ycss: import('yjs').Text,
  cssFile: string,
  fullSelector: string,
  mediaQuery: string | null,
  prop: string,
  val: string | null
): void {
  const currentCss = ycss.toString();
  const rules = parseCssRules(cssFile, currentCss);
  const rule = rules.find(
    (r) =>
      r.selector.trim() === fullSelector &&
      (r.media ?? null) === (mediaQuery ?? null)
  );
  if (!rule) return;

  // Shorthand Intelligence (CSS-01 §2): If rule has `padding` or `margin` shorthand and user edits a side
  const boxMatch = prop.match(/^(padding|margin)-(top|right|bottom|left)$/);
  if (boxMatch && val !== null) {
    const shorthandName = boxMatch[1] as 'padding' | 'margin';
    const side = boxMatch[2] as 'top' | 'right' | 'bottom' | 'left';
    const shorthandDecl = rule.decls.find((d) => d.prop === shorthandName);
    const longhandDecl = rule.decls.find((d) => d.prop === prop);

    if (shorthandDecl && !longhandDecl && !shorthandDecl.value.includes('var(')) {
      const expanded = expandBoxShorthand(shorthandDecl.value);
      expanded[side] = val;
      const collapsed = collapseBoxShorthand(expanded);
      const [vStart, vEnd] = shorthandDecl.valueRange;
      ycss.delete(vStart, vEnd - vStart);
      ycss.insert(vStart, ` ${collapsed}`);
      return;
    }
  }

  // Shorthand Intelligence for background vs background-color
  if (prop === 'background-color' && val !== null && val !== '') {
    const bgShorthand = rule.decls.find((d) => d.prop === 'background');
    if (bgShorthand && !rule.decls.some((d) => d.prop === 'background-color')) {
      const [vStart, vEnd] = bgShorthand.valueRange;
      ycss.delete(vStart, vEnd - vStart);
      ycss.insert(vStart, ` ${val}`);
      return;
    }
  }

  // Ensure position: relative when setting left or top if not already positioned
  if ((prop === 'left' || prop === 'top') && val !== null && val !== '') {
    const posDecl = rule.decls.find((d) => d.prop === 'position');
    if (!posDecl) {
      const ruleEnd = rule.selectorRange[1];
      const ruleText = currentCss.slice(rule.selectorRange[0], ruleEnd);
      const closeBraceRel = ruleText.lastIndexOf('}');
      if (closeBraceRel >= 0) {
        const insertPos = rule.selectorRange[0] + closeBraceRel;
        ycss.insert(insertPos, `  position: relative;\n`);
      }
    }
  }

  const existingDecl = rule.decls.find((d) => d.prop === prop);
  if (existingDecl) {
    if (val === null || val === '') {
      // Remove declaration
      let [dStart, dEnd] = existingDecl.range;
      while (dStart > 0 && (currentCss[dStart - 1] === ' ' || currentCss[dStart - 1] === '\t')) {
        dStart--;
      }
      if (currentCss[dEnd] === '\r') dEnd++;
      if (currentCss[dEnd] === '\n') dEnd++;
      ycss.delete(dStart, dEnd - dStart);
    } else {
      const [vStart, vEnd] = existingDecl.valueRange;
      ycss.delete(vStart, vEnd - vStart);
      ycss.insert(vStart, ` ${val}`);
    }
  } else if (val !== null && val !== '') {
    const ruleEnd = rule.selectorRange[1];
    const ruleText = currentCss.slice(rule.selectorRange[0], ruleEnd);
    const closeBraceRel = ruleText.lastIndexOf('}');
    if (closeBraceRel >= 0) {
      const insertPos = rule.selectorRange[0] + closeBraceRel;
      ycss.insert(insertPos, `  ${prop}: ${val};\n`);
    }
  }
}

export function writeInlineStyleAttr(
  node: VNode,
  props: Record<string, string | null>
): void {
  const yhtml = projectDoc.files.get(node.file);
  if (!yhtml) return;

  const html = yhtml.toString();
  const tree = parseHtmlToVNodes(node.file, html);
  const freshNode = tree.nodes[node.id];

  const styleAttr = (freshNode ?? node).attrs.find((a) => a.name === 'style');
  const map: Record<string, string> = {};
  if (styleAttr?.value) {
    styleAttr.value.split(';').forEach((part) => {
      const idx = part.indexOf(':');
      if (idx > 0) {
        const k = part.slice(0, idx).trim();
        const v = part.slice(idx + 1).trim();
        if (k && v) map[k] = v;
      }
    });
  }

  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === '') {
      delete map[k];
    } else {
      map[k] = v;
    }
  }

  const serialized = Object.entries(map)
    .map(([k, v]) => `${k}: ${v};`)
    .join(' ');

  if (freshNode && freshNode.startTagRange) {
    projectDoc.undoManager.stopCapturing();
    projectDoc.ydoc.transact(() => {
      if (styleAttr && styleAttr.range[1] > styleAttr.range[0]) {
        const [aStart, aEnd] = styleAttr.range;
        if (serialized.length === 0) {
          const leadSpace = html[aStart - 1] === ' ' ? 1 : 0;
          yhtml.delete(aStart - leadSpace, aEnd - aStart + leadSpace);
        } else {
          yhtml.delete(aStart, aEnd - aStart);
          yhtml.insert(aStart, `style="${serialized}"`);
        }
      } else if (serialized.length > 0 && freshNode.startTagRange) {
        const insertPos = freshNode.startTagRange[1] - 1; // before '>'
        yhtml.insert(insertPos, ` style="${serialized}"`);
      }
    }, LOCAL_USER_ORIGIN);
    projectDoc.undoManager.stopCapturing();
  }

  sandboxRegistry.broadcastPatch([
    {
      op: 'setAttr',
      id: node.id,
      name: 'style',
      value: serialized.length > 0 ? serialized : null,
    },
  ]);
}

/**
 * Class Manager Operations (F031 — CSS-04_CLASSES_STATES.md)
 */
export function updateElementClassList(
  file: string,
  nodeId: NodeId,
  nextClasses: string[]
): void {
  const yhtml = projectDoc.files.get(file);
  if (!yhtml) return;

  const html = yhtml.toString();
  const tree = parseHtmlToVNodes(file, html);
  const vnode = tree.nodes[nodeId];

  const cleanList = Array.from(
    new Set(nextClasses.map((c) => c.trim().replace(/^\.+/, '')).filter(Boolean))
  );
  const joined = cleanList.join(' ');

  if (vnode && vnode.startTagRange) {
    const classAttr = vnode.attrs.find((a) => a.name === 'class');

    projectDoc.undoManager.stopCapturing();
    projectDoc.ydoc.transact(() => {
      if (classAttr && classAttr.range[1] > classAttr.range[0]) {
        const [aStart, aEnd] = classAttr.range;
        if (joined.length === 0) {
          const leadSpace = html[aStart - 1] === ' ' ? 1 : 0;
          yhtml.delete(aStart - leadSpace, aEnd - aStart + leadSpace);
        } else {
          yhtml.delete(aStart, aEnd - aStart);
          yhtml.insert(aStart, `class="${joined}"`);
        }
      } else if (joined.length > 0 && vnode.startTagRange) {
        const insertPos = vnode.startTagRange[1] - 1;
        yhtml.insert(insertPos, ` class="${joined}"`);
      }
    }, LOCAL_USER_ORIGIN);
    projectDoc.undoManager.stopCapturing();
  }

  sandboxRegistry.broadcastPatch([
    {
      op: 'setAttr',
      id: nodeId,
      name: 'class',
      value: joined.length > 0 ? joined : null,
    },
  ]);
}

/**
 * Global Class Rename across HTML & CSS (F031 — CSS-04 §1 & §2)
 */
export function renameProjectClassGlobal(oldClass: string, newClass: string): void {
  const cleanOld = oldClass.trim().replace(/^\.+/, '');
  const cleanNew = newClass.trim().replace(/^\.+/, '');
  if (!cleanOld || !cleanNew || cleanOld === cleanNew) return;

  const yhtml = projectDoc.files.get('index.html');
  const ycss = projectDoc.files.get('css/styles.css');
  if (!yhtml || !ycss) return;

  projectDoc.undoManager.stopCapturing();
  projectDoc.ydoc.transact(() => {
    // Update CSS selectors
    const cssText = ycss.toString();
    const escapedOld = cleanOld.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const updatedCss = cssText.replace(
      new RegExp(`\\.${escapedOld}(?![a-zA-Z0-9_-])`, 'g'),
      `.${cleanNew}`
    );
    if (updatedCss !== cssText) {
      ycss.delete(0, ycss.length);
      ycss.insert(0, updatedCss);
    }

    // Update HTML class attributes
    const htmlText = yhtml.toString();
    const updatedHtml = htmlText.replace(
      /class="([^"]*)"/g,
      (_m, val: string) => {
        const next = val
          .split(/\s+/)
          .map((tok) => (tok === cleanOld ? cleanNew : tok))
          .join(' ');
        return `class="${next}"`;
      }
    );
    if (updatedHtml !== htmlText) {
      yhtml.delete(0, yhtml.length);
      yhtml.insert(0, updatedHtml);
    }
  }, LOCAL_USER_ORIGIN);
  projectDoc.undoManager.stopCapturing();

  sandboxRegistry.broadcastLoad(
    'index.html',
    yhtml.toString(),
    projectDoc.getStyleSheets()
  );
}

/**
 * Design Tokens (CSS Custom Properties `--*`) Reader & Writer (F035 — CSS-04 §3)
 */
export function parseDesignTokens(cssFile = 'css/styles.css'): DesignTokenEntry[] {
  const html = projectDoc.getFileText('index.html');
  const inlineStyleChunks: string[] = [];
  html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_m, content: string) => {
    if (content && content.trim()) {
      inlineStyleChunks.push(content.trim());
    }
    return '';
  });

  const allSheetChunks = projectDoc
    .getStyleSheets()
    .sort((a, b) => (a.file === cssFile ? 1 : b.file === cssFile ? -1 : 0))
    .map((s) => s.css);

  const combinedCss = [...inlineStyleChunks, ...allSheetChunks]
    .filter(Boolean)
    .join('\n\n');
  const rules = parseCssRules(cssFile, combinedCss);
  const tokenMap = new Map<string, DesignTokenEntry>();

  for (const r of rules) {
    for (const d of r.decls) {
      if (d.prop.startsWith('--')) {
        const val = d.value.trim();
        let group: DesignTokenEntry['group'] = 'other';
        if (
          val.startsWith('#') ||
          val.startsWith('rgb') ||
          val.startsWith('hsl') ||
          d.prop.includes('bg') ||
          d.prop.includes('text') ||
          d.prop.includes('brand') ||
          d.prop.includes('surface')
        ) {
          group = 'color';
        } else if (d.prop.includes('radius')) {
          group = 'radius';
        } else if (
          val.endsWith('px') ||
          val.endsWith('rem') ||
          d.prop.includes('space')
        ) {
          group = 'space';
        }

        tokenMap.set(`${r.selector}::${d.prop}`, {
          name: d.prop as `--${string}`,
          value: val,
          group,
          scope: r.selector,
        });
      }
    }
  }

  return Array.from(tokenMap.values());
}

export function setDesignTokenValue(
  name: `--${string}`,
  value: string,
  scope = ':root',
  cssFile = 'css/styles.css'
): void {
  const ycss = projectDoc.files.get(cssFile);
  if (!ycss) return;

  projectDoc.undoManager.stopCapturing();
  projectDoc.ydoc.transact(() => {
    const cssText = ycss.toString();
    const rules = parseCssRules(cssFile, cssText);
    const rootRule = rules.find((r) => r.selector.trim() === scope);
    if (rootRule) {
      applySingleDeclToRule(ycss, cssFile, scope, null, name, value);
    } else {
      ycss.insert(0, `${scope} {\n  ${name}: ${value};\n}\n\n`);
    }
  }, LOCAL_USER_ORIGIN);
  projectDoc.undoManager.stopCapturing();

  sandboxRegistry.broadcastPatch([
    {
      op: 'replaceSheet',
      file: cssFile,
      cssText: ycss.toString(),
    },
  ]);
}
