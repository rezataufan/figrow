import { create } from 'zustand';
import type { MeasuredRectItem, NodeId, VNode } from '../engine/types';
import {
  parseHtmlToVNodes,
  parseCssRules,
  detectCssUnit,
  type CssUnit,
} from '../engine/ast/htmlAst';
import { projectDoc } from '../engine/doc/projectDoc';
import { useCanvasStore } from './canvasStore';

/**
 * Selection, Bounds, Marquee & Resize Store — Specification: CANVAS-02_SELECTION_BOUNDS.md
 * Implements:
 * - F007: Hover highlight state (`hoverKey`)
 * - F008: Progressive click selection, Deep select (Ctrl), Multi-select (Shift), Marquee
 * - F009: Box-model overlay toggle & active primary selection
 * - F010: 8-point Resize gesture state with unit preservation (`px`, `rem`, `em`, `%`, `vw`, `vh`)
 * - F011: Alt-distance measurement & smart alignment guides
 */

export type ResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export interface MarqueeRect {
  artboardId: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface SmartAlignmentGuide {
  axis: 'x' | 'y';
  pos: number;
  from: number;
  to: number;
  label?: string;
}

export interface SelectionStoreState {
  selectedKeys: NodeId[];
  primaryKey: NodeId | null;
  hoverKey: NodeId | null;
  hoverPath: NodeId[];
  artboardId: string;
  mode: 'idle' | 'marquee' | 'resizing' | 'textEditing';
  editingKey: NodeId | null;
  altPressed: boolean;
  marquee: MarqueeRect | null;
  transientRectOverride: {
    id: NodeId;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  smartGuides: SmartAlignmentGuide[];
  lastMutationInfo: { selector: string; propSummary: string } | null;

  // Actions
  setHoverKey: (key: NodeId | null) => void;
  setHoverHit: (key: NodeId | null, path?: NodeId[]) => void;
  setAltPressed: (pressed: boolean) => void;
  selectSingle: (key: NodeId | null, artboardId?: string) => void;
  selectProgressive: (
    hitPath: NodeId[],
    artboardId: string,
    modifiers: { ctrlOrMeta: boolean; shift: boolean; alt?: boolean }
  ) => void;
  toggleMultiSelect: (key: NodeId, artboardId: string) => void;
  clearSelection: () => void;
  selectParent: () => void;
  selectFirstChild: () => void;
  selectSibling: (delta: 1 | -1) => void;
  startMarquee: (artboardId: string, x0: number, y0: number) => void;
  updateMarquee: (
    x1: number,
    y1: number,
    rectsMap: Record<string, MeasuredRectItem>
  ) => void;
  finishMarquee: () => void;
  setMode: (mode: SelectionStoreState['mode']) => void;
  startTextEditing: (key: NodeId) => void;
  stopTextEditing: () => void;
  setTransientRectOverride: (
    override: SelectionStoreState['transientRectOverride'],
    guides?: SmartAlignmentGuide[]
  ) => void;
  setLastMutationInfo: (info: { selector: string; propSummary: string } | null) => void;
  getPrimaryVNode: (file?: string) => VNode | null;
  getSourceUnitsForNode: (
    node: VNode,
    cssFile?: string
  ) => { width: CssUnit; height: CssUnit };
}

export const useSelectionStore = create<SelectionStoreState>((set, get) => ({
  selectedKeys: ['n_hero'],
  primaryKey: 'n_hero',
  hoverKey: null,
  hoverPath: [],
  artboardId: 'ab_desktop',
  mode: 'idle',
  editingKey: null,
  altPressed: false,
  marquee: null,
  transientRectOverride: null,
  smartGuides: [],
  lastMutationInfo: null,

  setHoverKey: (hoverKey) =>
    set((s) => ({ hoverKey, hoverPath: hoverKey ? s.hoverPath : [] })),
  setHoverHit: (hoverKey, hoverPath = []) => set({ hoverKey, hoverPath }),
  setAltPressed: (altPressed) => set({ altPressed }),

  selectSingle: (key, artboardId) =>
    set((s) => ({
      selectedKeys: key ? [key] : [],
      primaryKey: key,
      artboardId: artboardId ?? s.artboardId,
      mode: 'idle',
      editingKey: null,
    })),

  /**
   * Direct & Progressive Element Selection (Pinegrow / Figma DOM Hybrid):
   * - Normal Click -> Immediately selects the exact hovered/clicked element (`innermost = validPath[0]`)
   *   so buttons, inputs, headings, and cards can be clicked and edited right away.
   * - Shift + Click -> Toggle element in multi-selection.
   * - Alt + Click -> Cycle up one parent level along `validPath`.
   */
  selectProgressive: (hitPath, artboardId, modifiers) => {
    // hitPath is ordered innermost -> outermost from elementsFromPoint / ancestor walk
    const validPath = hitPath.filter((id) => id !== 'n_body' && id !== 'n_main');
    if (validPath.length === 0) {
      set({ selectedKeys: [], primaryKey: null, artboardId, mode: 'idle', editingKey: null });
      return;
    }

    const innermost = validPath[0];

    if (modifiers.shift) {
      get().toggleMultiSelect(innermost, artboardId);
      return;
    }

    if (modifiers.alt) {
      const currentPrimary = get().primaryKey;
      const idxInPath = currentPrimary ? validPath.indexOf(currentPrimary) : -1;
      if (idxInPath >= 0 && idxInPath + 1 < validPath.length) {
        const nextParent = validPath[idxInPath + 1];
        set({
          selectedKeys: [nextParent],
          primaryKey: nextParent,
          artboardId,
          mode: 'idle',
          editingKey: null,
        });
        return;
      }
    }

    set({
      selectedKeys: [innermost],
      primaryKey: innermost,
      artboardId,
      mode: 'idle',
      editingKey: null,
    });
  },

  toggleMultiSelect: (key, artboardId) =>
    set((s) => {
      const exists = s.selectedKeys.includes(key);
      const nextKeys = exists
        ? s.selectedKeys.filter((k) => k !== key)
        : [...s.selectedKeys, key];
      return {
        selectedKeys: nextKeys,
        primaryKey: nextKeys[nextKeys.length - 1] ?? null,
        artboardId,
        mode: 'idle',
      };
    }),

  clearSelection: () =>
    set({
      selectedKeys: [],
      primaryKey: null,
      mode: 'idle',
      editingKey: null,
    }),

  selectParent: () => {
    const s = get();
    if (!s.primaryKey) return;
    const html = projectDoc.getFileText('index.html');
    const tree = parseHtmlToVNodes('index.html', html);
    const node = tree.nodes[s.primaryKey];
    if (node?.parent && tree.nodes[node.parent] && tree.nodes[node.parent].tag !== 'html') {
      set({
        selectedKeys: [node.parent],
        primaryKey: node.parent,
        mode: 'idle',
        editingKey: null,
      });
      return;
    }
    const measured = useCanvasStore.getState().measuredRects[s.artboardId]?.[s.primaryKey];
    if (measured?.parentId && measured.parentId !== 'n_body') {
      set({
        selectedKeys: [measured.parentId],
        primaryKey: measured.parentId,
        mode: 'idle',
        editingKey: null,
      });
    }
  },

  selectFirstChild: () => {
    const s = get();
    if (!s.primaryKey) return;
    const html = projectDoc.getFileText('index.html');
    const tree = parseHtmlToVNodes('index.html', html);
    const node = tree.nodes[s.primaryKey];
    if (node && node.children.length > 0) {
      const firstChild = node.children[0];
      set({
        selectedKeys: [firstChild],
        primaryKey: firstChild,
        mode: 'idle',
        editingKey: null,
      });
    }
  },

  selectSibling: (delta) => {
    const s = get();
    if (!s.primaryKey) return;
    const html = projectDoc.getFileText('index.html');
    const tree = parseHtmlToVNodes('index.html', html);
    const node = tree.nodes[s.primaryKey];
    if (!node?.parent) return;
    const parent = tree.nodes[node.parent];
    if (!parent || parent.children.length === 0) return;

    const idx = parent.children.indexOf(s.primaryKey);
    if (idx < 0) return;
    const nextIdx = (idx + delta + parent.children.length) % parent.children.length;
    const nextId = parent.children[nextIdx];
    set({
      selectedKeys: [nextId],
      primaryKey: nextId,
      mode: 'idle',
      editingKey: null,
    });
  },

  startMarquee: (artboardId, x0, y0) =>
    set({
      mode: 'marquee',
      artboardId,
      marquee: { artboardId, x0, y0, x1: x0, y1: y0 },
    }),

  updateMarquee: (x1, y1, rectsMap) =>
    set((s) => {
      if (!s.marquee) return s;
      const nextMarquee = { ...s.marquee, x1, y1 };
      const minX = Math.min(nextMarquee.x0, x1);
      const maxX = Math.max(nextMarquee.x0, x1);
      const minY = Math.min(nextMarquee.y0, y1);
      const maxY = Math.max(nextMarquee.y0, y1);

      const enclosed: MeasuredRectItem[] = [];
      for (const item of Object.values(rectsMap)) {
        if (item.id === 'n_body' || item.id === 'n_main') continue;
        const bx = item.border.x ?? 0;
        const by = item.border.y ?? 0;
        const bw = item.border.width ?? 0;
        const bh = item.border.height ?? 0;
        if (bx >= minX && by >= minY && bx + bw <= maxX && by + bh <= maxY) {
          enclosed.push(item);
        }
      }

      // Restrict to the same parent level as the first matched item per CANVAS-02 §1
      const targetParent = enclosed[0]?.parentId ?? null;
      const filteredKeys = enclosed
        .filter((it) => it.parentId === targetParent)
        .map((it) => it.id);

      return {
        marquee: nextMarquee,
        selectedKeys: filteredKeys,
        primaryKey: filteredKeys[filteredKeys.length - 1] ?? null,
      };
    }),

  finishMarquee: () =>
    set({
      mode: 'idle',
      marquee: null,
    }),

  setMode: (mode) => set({ mode }),

  startTextEditing: (key) =>
    set({
      selectedKeys: [key],
      primaryKey: key,
      mode: 'textEditing',
      editingKey: key,
    }),

  stopTextEditing: () =>
    set({
      mode: 'idle',
      editingKey: null,
    }),

  setTransientRectOverride: (transientRectOverride, smartGuides = []) =>
    set({ transientRectOverride, smartGuides }),

  setLastMutationInfo: (lastMutationInfo) => set({ lastMutationInfo }),

  getPrimaryVNode: (file = 'index.html') => {
    const primaryKey = get().primaryKey;
    if (!primaryKey) return null;
    const html = projectDoc.getFileText(file);
    const tree = parseHtmlToVNodes(file, html);
    if (tree.nodes[primaryKey]) {
      return tree.nodes[primaryKey];
    }
    const artboardId = get().artboardId;
    const measured = useCanvasStore.getState().measuredRects[artboardId]?.[primaryKey];
    if (measured) {
      return {
        id: primaryKey,
        key: primaryKey,
        type: 'element',
        tag: measured.tag || 'div',
        attrs: [
          { name: 'data-vds-id', value: primaryKey, range: [0, 0] },
          ...(measured.classes.length > 0
            ? [{ name: 'class', value: measured.classes.join(' '), range: [0, 0] as [number, number] }]
            : []),
        ],
        children: [],
        parent: measured.parentId,
        range: [0, 0],
        file,
      };
    }
    return null;
  },

  getSourceUnitsForNode: (node, cssFile = 'css/styles.css') => {
    const cssText = projectDoc.getFileText(cssFile);
    const rules = parseCssRules(cssFile, cssText);
    const classes = (node.attrs.find((a) => a.name === 'class')?.value ?? '')
      .split(/\s+/)
      .filter(Boolean);

    let widthRaw: string | undefined;
    let heightRaw: string | undefined;

    for (const rule of rules) {
      const matchesClass = classes.some((c) => rule.selector.includes(`.${c}`));
      const matchesId = rule.selector.includes(node.id);
      if (matchesClass || matchesId) {
        for (const d of rule.decls) {
          if (d.prop === 'width') widthRaw = d.value;
          if (d.prop === 'height') heightRaw = d.value;
        }
      }
    }

    return {
      width: detectCssUnit(widthRaw),
      height: detectCssUnit(heightRaw),
    };
  },
}));
