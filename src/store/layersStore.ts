import { create } from 'zustand';
import type { MeasuredRectItem, NodeDesignMeta, NodeId } from '../engine/types';
import {
  parseHtmlToVNodes,
  moveElementNode,
  wrapElementNode,
  unwrapElementNode,
  changeElementTag,
} from '../engine/ast/htmlAst';
import { canContain, getAncestorTags, isDescendantOrSelf, isVoidElement } from '../engine/ast/contentModel';
import { projectDoc, LOCAL_USER_ORIGIN } from '../engine/doc/projectDoc';
import { sandboxRegistry } from '../engine/sandbox/iframeBridge';

/**
 * Layers Tree & Canvas Drag-Drop Reorder Store
 * Implements both:
 * - LAYER-01_TREE_REORDER.md (F015, F016, F017, F018, F019, F020)
 * - CANVAS-03_DRAG_DROP_REORDER.md (F012, F013, F014)
 */

export interface FlatLayerRow {
  key: NodeId;
  depth: number;
  label: string;
  customName?: string;
  tag: string;
  classSummary: string;
  hasChildren: boolean;
  childCount: number;
  expanded: boolean;
  locked: boolean;
  selfLocked: boolean;
  hidden: boolean;
  selfHidden: boolean;
  readOnly: boolean;
  previewText?: string;
  isFlexContainer?: boolean;
  isComponent?: boolean;
}

export interface TreeDropTarget {
  parentKey: NodeId;
  beforeKey: NodeId | null;
  targetRowKey: NodeId;
  position: 'before' | 'after' | 'inside';
}

export interface CanvasDropSlot {
  artboardId: string;
  parentKey: NodeId;
  parentLabel: string;
  beforeKey: NodeId | null;
  index: number;
  axis: 'x' | 'y' | 'grid';
  indicator:
    | { kind: 'line'; x: number; y: number; length: number; orientation: 'h' | 'v' }
    | { kind: 'cell'; x: number; y: number; width: number; height: number };
}

export interface LayersAndDragStoreState {
  expandedKeys: Record<NodeId, boolean>;
  renamingKey: NodeId | null;
  filterQuery: string;
  showHead: boolean;
  docRevision: number;
  designMetaSnapshot: Record<NodeId, NodeDesignMeta>;

  // Tree Drag State (LAYER-01)
  treeDrag: {
    sourceKey: NodeId;
    target: TreeDropTarget | null;
    valid: boolean;
    reason?: string;
  } | null;

  // Canvas Drag State (CANVAS-03)
  canvasDrag: {
    isDragging: boolean;
    sourceKey: NodeId;
    artboardId: string;
    pointerScreen: { x: number; y: number };
    pointerArtboard: { x: number; y: number };
    dropSlot: CanvasDropSlot | null;
    valid: boolean;
    reason?: string;
    copyMode: boolean;
  } | null;

  // Actions
  bumpRevision: () => void;
  toggleExpand: (key: NodeId, recursive?: boolean, file?: string) => void;
  expandAncestorsOf: (key: NodeId, file?: string) => void;
  setFilterQuery: (q: string) => void;
  toggleShowHead: () => void;
  startRenaming: (key: NodeId | null) => void;
  commitRename: (key: NodeId, newName: string) => void;
  toggleLock: (key: NodeId) => void;
  toggleHiddenInDesign: (key: NodeId) => void;
  isNodeLocked: (key: NodeId, file?: string) => boolean;

  // Tree DnD Actions
  startTreeDrag: (sourceKey: NodeId) => void;
  hoverTreeRow: (
    targetRowKey: NodeId,
    position: 'before' | 'after' | 'inside',
    forceValidation?: boolean,
    file?: string
  ) => void;
  commitTreeDrop: (file?: string, forceValidation?: boolean) => NodeId | null;
  cancelTreeDrag: () => void;

  // Canvas DnD Actions (CANVAS-03)
  startCanvasDrag: (
    sourceKey: NodeId,
    artboardId: string,
    screenX: number,
    screenY: number,
    artboardX: number,
    artboardY: number
  ) => void;
  updateCanvasDrag: (
    artboardId: string,
    screenX: number,
    screenY: number,
    artboardX: number,
    artboardY: number,
    rectsMap: Record<NodeId, MeasuredRectItem>,
    modifiers: { alt: boolean; shift: boolean },
    file?: string
  ) => void;
  commitCanvasDrop: (file?: string) => NodeId | null;
  cancelCanvasDrag: () => void;

  // Keyboard Reorder & Structural Ops
  moveSiblingByDelta: (nodeId: NodeId, delta: -1 | 1, file?: string) => boolean;
  wrapNode: (nodeId: NodeId, wrapperTag?: string, file?: string) => NodeId | null;
  unwrapNode: (nodeId: NodeId, file?: string) => NodeId | null;
  changeTag: (nodeId: NodeId, newTag: string, file?: string) => boolean;
  computeFlatRows: (file?: string) => FlatLayerRow[];
}

const DEFAULT_EXPANDED: Record<NodeId, boolean> = {
  n_body: true,
  n_header: true,
  n_header_inner: true,
  n_nav: false,
  n_main: true,
  n_hero: true,
  n_hero_copy: true,
  n_hero_actions: true,
  n_hero_preview: true,
  n_features: true,
};

function readDesignMetaMap(): Record<NodeId, NodeDesignMeta> {
  const out: Record<NodeId, NodeDesignMeta> = {};
  projectDoc.designMeta.forEach((val, key) => {
    out[key] = val;
  });
  return out;
}

export const useLayersStore = create<LayersAndDragStoreState>((set, get) => {
  // Subscribe to Y.Doc transactions so AST & designMeta stay reactive
  projectDoc.subscribe(() => {
    set((s) => ({
      docRevision: s.docRevision + 1,
      designMetaSnapshot: readDesignMetaMap(),
    }));
  });

  return {
    expandedKeys: DEFAULT_EXPANDED,
    renamingKey: null,
    filterQuery: '',
    showHead: false,
    docRevision: 1,
    designMetaSnapshot: readDesignMetaMap(),
    treeDrag: null,
    canvasDrag: null,

    bumpRevision: () =>
      set((s) => ({
        docRevision: s.docRevision + 1,
        designMetaSnapshot: readDesignMetaMap(),
      })),

    toggleExpand: (key, recursive = false, file = 'index.html') =>
      set((s) => {
        const next = { ...s.expandedKeys };
        const targetState = !next[key];
        next[key] = targetState;

        if (recursive) {
          const tree = parseHtmlToVNodes(file, projectDoc.getFileText(file));
          const visit = (id: NodeId): void => {
            next[id] = targetState;
            const n = tree.nodes[id];
            if (n) {
              n.children.forEach(visit);
            }
          };
          visit(key);
        }
        return { expandedKeys: next };
      }),

    expandAncestorsOf: (key, file = 'index.html') =>
      set((s) => {
        const tree = parseHtmlToVNodes(file, projectDoc.getFileText(file));
        const next = { ...s.expandedKeys };
        let curr = tree.nodes[key]?.parent ?? null;
        let changed = false;
        while (curr) {
          if (!next[curr]) {
            next[curr] = true;
            changed = true;
          }
          curr = tree.nodes[curr]?.parent ?? null;
        }
        return changed ? { expandedKeys: next } : s;
      }),

    setFilterQuery: (filterQuery) => set({ filterQuery }),
    toggleShowHead: () => set((s) => ({ showHead: !s.showHead })),
    startRenaming: (renamingKey) => set({ renamingKey }),

    commitRename: (key, newName) => {
      const trimmed = newName.trim();
      projectDoc.undoManager.stopCapturing();
      projectDoc.ydoc.transact(() => {
        const prev = projectDoc.designMeta.get(key) ?? { nodeKey: key };
        projectDoc.designMeta.set(key, {
          ...prev,
          layerName: trimmed.length > 0 ? trimmed : undefined,
        });
      }, LOCAL_USER_ORIGIN);
      projectDoc.undoManager.stopCapturing();
      set({ renamingKey: null });
    },

    toggleLock: (key) => {
      projectDoc.undoManager.stopCapturing();
      projectDoc.ydoc.transact(() => {
        const prev = projectDoc.designMeta.get(key) ?? { nodeKey: key };
        projectDoc.designMeta.set(key, {
          ...prev,
          locked: !prev.locked,
        });
      }, LOCAL_USER_ORIGIN);
      projectDoc.undoManager.stopCapturing();
    },

    toggleHiddenInDesign: (key) => {
      const prev = projectDoc.designMeta.get(key) ?? { nodeKey: key };
      const nextHidden = !prev.hiddenInDesign;
      projectDoc.undoManager.stopCapturing();
      projectDoc.ydoc.transact(() => {
        projectDoc.designMeta.set(key, {
          ...prev,
          hiddenInDesign: nextHidden,
        });
      }, LOCAL_USER_ORIGIN);
      projectDoc.undoManager.stopCapturing();

      // Send design-time visibility PatchOp to live artboards (never written to Y.Text)
      sandboxRegistry.broadcastPatch([
        {
          op: 'setAttr',
          id: key,
          name: 'data-vds-hidden',
          value: nextHidden ? '' : null,
        },
      ]);
    },

    isNodeLocked: (key, file = 'index.html') => {
      const metaMap = get().designMetaSnapshot;
      if (metaMap[key]?.locked) return true;
      const tree = parseHtmlToVNodes(file, projectDoc.getFileText(file));
      let curr = tree.nodes[key]?.parent ?? null;
      while (curr) {
        if (metaMap[curr]?.locked) return true;
        curr = tree.nodes[curr]?.parent ?? null;
      }
      return false;
    },

    startTreeDrag: (sourceKey) =>
      set({
        treeDrag: {
          sourceKey,
          target: null,
          valid: true,
        },
      }),

    hoverTreeRow: (targetRowKey, position, forceValidation = false, file = 'index.html') => {
      const s = get();
      if (!s.treeDrag) return;
      const sourceKey = s.treeDrag.sourceKey;
      const tree = parseHtmlToVNodes(file, projectDoc.getFileText(file));
      const sourceNode = tree.nodes[sourceKey];
      const targetRowNode = tree.nodes[targetRowKey];

      if (!sourceNode || !targetRowNode) return;

      let parentKey: NodeId;
      let beforeKey: NodeId | null = null;

      if (position === 'inside') {
        parentKey = targetRowKey;
        beforeKey = null;
      } else {
        parentKey = targetRowNode.parent ?? 'n_body';
        const parentNode = tree.nodes[parentKey];
        if (!parentNode) return;
        const idx = parentNode.children.indexOf(targetRowKey);
        if (position === 'before') {
          beforeKey = targetRowKey;
        } else {
          beforeKey = idx >= 0 && idx + 1 < parentNode.children.length ? parentNode.children[idx + 1] : null;
        }
      }

      if (isDescendantOrSelf(tree.nodes, sourceKey, parentKey)) {
        set({
          treeDrag: {
            sourceKey,
            target: { parentKey, beforeKey, targetRowKey, position },
            valid: false,
            reason: 'Cannot move into itself or its descendant.',
          },
        });
        return;
      }

      const parentNode = tree.nodes[parentKey];
      const check = canContain(
        parentNode?.tag ?? 'div',
        sourceNode.tag ?? 'div',
        {
          parentAncestors: getAncestorTags(tree.nodes, parentKey),
          force: forceValidation,
        }
      );

      set({
        treeDrag: {
          sourceKey,
          target: { parentKey, beforeKey, targetRowKey, position },
          valid: check.ok,
          reason: check.ok ? undefined : check.reason,
        },
      });
    },

    commitTreeDrop: (file = 'index.html', forceValidation = false) => {
      const s = get();
      const drag = s.treeDrag;
      set({ treeDrag: null });
      if (!drag || !drag.target || (!drag.valid && !forceValidation)) {
        return null;
      }

      const res = moveElementNode(
        file,
        drag.sourceKey,
        drag.target.parentKey,
        drag.target.beforeKey,
        { forceValidation }
      );
      if (res.ok) {
        get().expandAncestorsOf(drag.sourceKey, file);
        return drag.sourceKey;
      }
      return null;
    },

    cancelTreeDrag: () => set({ treeDrag: null }),

    startCanvasDrag: (sourceKey, artboardId, screenX, screenY, artboardX, artboardY) =>
      set({
        canvasDrag: {
          isDragging: true,
          sourceKey,
          artboardId,
          pointerScreen: { x: screenX, y: screenY },
          pointerArtboard: { x: artboardX, y: artboardY },
          dropSlot: null,
          valid: true,
          copyMode: false,
        },
      }),

    /**
     * Drop Slot Algorithm from CANVAS-03_DRAG_DROP_REORDER.md §2:
     * 1. Find deepest container at pointer (excluding self/descendants, locked, void).
     * 2. Determine container axis ('x' for flex-row / inline, 'y' for block / flex-col).
     * 3. Compare pointer against in-flow children midpoints to compute insertion index & indicator bar.
     */
    updateCanvasDrag: (
      artboardId,
      screenX,
      screenY,
      artboardX,
      artboardY,
      rectsMap,
      modifiers,
      file = 'index.html'
    ) => {
      const s = get();
      if (!s.canvasDrag) return;

      const sourceKey = s.canvasDrag.sourceKey;
      const tree = parseHtmlToVNodes(file, projectDoc.getFileText(file));
      const sourceNode = tree.nodes[sourceKey];
      if (!sourceNode) return;

      // Find all containers under pointer (artboardX, artboardY)
      const containerCandidates: MeasuredRectItem[] = [];
      for (const item of Object.values(rectsMap)) {
        if (isDescendantOrSelf(tree.nodes, sourceKey, item.id)) continue;
        if (isVoidElement(item.tag)) continue;
        if (get().isNodeLocked(item.id, file)) continue;

        const bx = item.border.x ?? 0;
        const by = item.border.y ?? 0;
        const bw = item.border.width ?? 0;
        const bh = item.border.height ?? 0;

        if (
          artboardX >= bx &&
          artboardX <= bx + bw &&
          artboardY >= by &&
          artboardY <= by + bh
        ) {
          containerCandidates.push(item);
        }
      }

      // Sort smallest area first (deepest container)
      containerCandidates.sort((a, b) => {
        const areaA = (a.border.width ?? 0) * (a.border.height ?? 0);
        const areaB = (b.border.width ?? 0) * (b.border.height ?? 0);
        return areaA - areaB;
      });

      // Pick first container that either already has children or is a semantic container
      const CONTAINER_TAGS = new Set([
        'body',
        'main',
        'section',
        'div',
        'header',
        'footer',
        'nav',
        'article',
        'aside',
        'ul',
        'ol',
        'form',
      ]);

      // Prioritize the element's current parent container for sibling reordering
      let chosenContainer: MeasuredRectItem | undefined;
      if (sourceNode.parent && rectsMap[sourceNode.parent]) {
        const pRect = rectsMap[sourceNode.parent];
        const pbx = pRect.border.x ?? 0;
        const pby = pRect.border.y ?? 0;
        const pbw = pRect.border.width ?? 0;
        const pbh = pRect.border.height ?? 0;
        if (
          artboardX >= pbx - 20 &&
          artboardX <= pbx + pbw + 20 &&
          artboardY >= pby - 20 &&
          artboardY <= pby + pbh + 20
        ) {
          chosenContainer = pRect;
        }
      }

      if (!chosenContainer) {
        if (modifiers.shift || modifiers.alt) {
          chosenContainer = containerCandidates.find((c) => {
            const vn = tree.nodes[c.id];
            return vn && (vn.children.length > 0 || CONTAINER_TAGS.has(c.tag));
          });
        }
      }

      if (!chosenContainer) {
        set({
          canvasDrag: {
            isDragging: true,
            sourceKey,
            artboardId,
            pointerScreen: { x: screenX, y: screenY },
            pointerArtboard: { x: artboardX, y: artboardY },
            dropSlot: null,
            valid: true,
            copyMode: modifiers.alt,
          },
        });
        return;
      }

      // Edge-zone check (6px near top/bottom of container jumps up to parent container per CANVAS-03 §2.4)
      const cbx = chosenContainer.border.x ?? 0;
      const cby = chosenContainer.border.y ?? 0;
      const cbw = chosenContainer.border.width ?? 0;
      const cbh = chosenContainer.border.height ?? 0;
      if (
        (artboardY - cby < 6 || cby + cbh - artboardY < 6) &&
        chosenContainer.parentId &&
        rectsMap[chosenContainer.parentId] &&
        !isDescendantOrSelf(tree.nodes, sourceKey, chosenContainer.parentId)
      ) {
        chosenContainer = rectsMap[chosenContainer.parentId];
      }

      const parentKey = chosenContainer.id;
      const parentVNode = tree.nodes[parentKey];
      if (!parentVNode) return;

      const validation = canContain(
        parentVNode.tag ?? 'div',
        sourceNode.tag ?? 'div',
        {
          parentAncestors: getAncestorTags(tree.nodes, parentKey),
          force: modifiers.shift,
        }
      );

      // Determine flow axis of container by inspecting child coordinates
      const childIds = parentVNode.children.filter((cid) => cid !== sourceKey);
      const childBoxes = childIds
        .map((cid) => rectsMap[cid])
        .filter((b): b is MeasuredRectItem => Boolean(b));

      let axis: 'x' | 'y' = 'y';
      if (childBoxes.length >= 2) {
        const dy = Math.abs((childBoxes[1].border.y ?? 0) - (childBoxes[0].border.y ?? 0));
        const dx = Math.abs((childBoxes[1].border.x ?? 0) - (childBoxes[0].border.x ?? 0));
        if (dx > dy && dy < 24) {
          axis = 'x';
        }
      }

      let insertIdx = childBoxes.length;
      for (let i = 0; i < childBoxes.length; i++) {
        const b = childBoxes[i].border;
        const mid =
          axis === 'y'
            ? (b.y ?? 0) + (b.height ?? 0) / 2
            : (b.x ?? 0) + (b.width ?? 0) / 2;
        const ptr = axis === 'y' ? artboardY : artboardX;
        if (ptr < mid) {
          insertIdx = i;
          break;
        }
      }

      const beforeKey = insertIdx < childBoxes.length ? childBoxes[insertIdx].id : null;

      // Compute visual insertion indicator bar
      const pRect = chosenContainer.border;
      let indicator: CanvasDropSlot['indicator'];

      if (axis === 'y') {
        let lineY = (pRect.y ?? 0) + 12;
        if (childBoxes.length > 0) {
          if (insertIdx === 0) {
            lineY = Math.max(pRect.y ?? 0, (childBoxes[0].border.y ?? 0) - 6);
          } else if (insertIdx >= childBoxes.length) {
            const last = childBoxes[childBoxes.length - 1].border;
            lineY = (last.y ?? 0) + (last.height ?? 0) + 6;
          } else {
            const prev = childBoxes[insertIdx - 1].border;
            const next = childBoxes[insertIdx].border;
            lineY = ((prev.y ?? 0) + (prev.height ?? 0) + (next.y ?? 0)) / 2;
          }
        }
        indicator = {
          kind: 'line',
          x: (pRect.x ?? 0) + 8,
          y: lineY,
          length: Math.max(40, (pRect.width ?? 200) - 16),
          orientation: 'h',
        };
      } else {
        let lineX = (pRect.x ?? 0) + 12;
        if (childBoxes.length > 0) {
          if (insertIdx === 0) {
            lineX = Math.max(pRect.x ?? 0, (childBoxes[0].border.x ?? 0) - 6);
          } else if (insertIdx >= childBoxes.length) {
            const last = childBoxes[childBoxes.length - 1].border;
            lineX = (last.x ?? 0) + (last.width ?? 0) + 6;
          } else {
            const prev = childBoxes[insertIdx - 1].border;
            const next = childBoxes[insertIdx].border;
            lineX = ((prev.x ?? 0) + (prev.width ?? 0) + (next.x ?? 0)) / 2;
          }
        }
        indicator = {
          kind: 'line',
          x: lineX,
          y: (pRect.y ?? 0) + 8,
          length: Math.max(24, (pRect.height ?? 60) - 16),
          orientation: 'v',
        };
      }

      const parentCls = chosenContainer.classes[0] ? `.${chosenContainer.classes[0]}` : '';
      const parentLabel = `${chosenContainer.tag}${parentCls}`;

      set({
        canvasDrag: {
          isDragging: true,
          sourceKey,
          artboardId,
          pointerScreen: { x: screenX, y: screenY },
          pointerArtboard: { x: artboardX, y: artboardY },
          dropSlot: {
            artboardId,
            parentKey,
            parentLabel,
            beforeKey,
            index: insertIdx,
            axis,
            indicator,
          },
          valid: validation.ok,
          reason: validation.ok ? undefined : validation.reason,
          copyMode: modifiers.alt,
        },
      });
    },

    commitCanvasDrop: (file = 'index.html') => {
      const s = get();
      const drag = s.canvasDrag;
      set({ canvasDrag: null });
      if (!drag || !drag.dropSlot || !drag.valid) {
        return null;
      }

      const res = moveElementNode(
        file,
        drag.sourceKey,
        drag.dropSlot.parentKey,
        drag.dropSlot.beforeKey,
        { copy: drag.copyMode }
      );
      if (res.ok) {
        const finalKey = res.newId ?? drag.sourceKey;
        get().expandAncestorsOf(finalKey, file);
        return finalKey;
      }
      return null;
    },

    cancelCanvasDrag: () => set({ canvasDrag: null }),

    moveSiblingByDelta: (nodeId, delta, file = 'index.html') => {
      const tree = parseHtmlToVNodes(file, projectDoc.getFileText(file));
      const node = tree.nodes[nodeId];
      if (!node?.parent) return false;
      const parent = tree.nodes[node.parent];
      if (!parent) return false;

      const idx = parent.children.indexOf(nodeId);
      if (idx < 0) return false;

      if (delta === -1 && idx > 0) {
        const beforeId = parent.children[idx - 1];
        const res = moveElementNode(file, nodeId, node.parent, beforeId);
        return res.ok;
      }
      if (delta === 1 && idx + 1 < parent.children.length) {
        const beforeId =
          idx + 2 < parent.children.length ? parent.children[idx + 2] : null;
        const res = moveElementNode(file, nodeId, node.parent, beforeId);
        return res.ok;
      }
      return false;
    },

    wrapNode: (nodeId, wrapperTag = 'div', file = 'index.html') => {
      const wrapperId = wrapElementNode(file, nodeId, wrapperTag);
      if (wrapperId) {
        set((s) => ({
          expandedKeys: { ...s.expandedKeys, [wrapperId]: true },
        }));
      }
      return wrapperId;
    },

    unwrapNode: (nodeId, file = 'index.html') => {
      return unwrapElementNode(file, nodeId);
    },

    changeTag: (nodeId, newTag, file = 'index.html') => {
      return changeElementTag(file, nodeId, newTag);
    },

    computeFlatRows: (file = 'index.html') => {
      const s = get();
      const html = projectDoc.getFileText(file);
      const tree = parseHtmlToVNodes(file, html);
      const metaMap = s.designMetaSnapshot;
      const query = s.filterQuery.trim().toLowerCase();

      // Determine matching nodes if filterQuery is active
      const matchedSet = new Set<NodeId>();
      if (query.length > 0) {
        for (const vnode of Object.values(tree.nodes)) {
          const customName = metaMap[vnode.id]?.layerName ?? '';
          const cls = vnode.attrs.find((a) => a.name === 'class')?.value ?? '';
          const haystack = `${vnode.tag ?? ''} ${cls} ${customName} ${vnode.textContent ?? ''} ${vnode.id}`.toLowerCase();
          if (haystack.includes(query)) {
            matchedSet.add(vnode.id);
            let anc = vnode.parent;
            while (anc) {
              matchedSet.add(anc);
              anc = tree.nodes[anc]?.parent ?? null;
            }
          }
        }
      }

      const rows: FlatLayerRow[] = [];

      const visit = (
        id: NodeId,
        depth: number,
        inheritedLocked: boolean,
        inheritedHidden: boolean
      ): void => {
        const vnode = tree.nodes[id];
        if (!vnode || !vnode.tag) return;
        if (vnode.tag === 'head' && !s.showHead) return;
        if (query.length > 0 && !matchedSet.has(id)) return;

        const meta = metaMap[id];
        const selfLocked = Boolean(meta?.locked);
        const selfHidden = Boolean(meta?.hiddenInDesign);
        const locked = inheritedLocked || selfLocked;
        const hidden = inheritedHidden || selfHidden;

        const classAttr = vnode.attrs.find((a) => a.name === 'class')?.value ?? '';
        const classes = classAttr.split(/\s+/).filter(Boolean);
        const classSummary = classes.length > 0 ? `.${classes.slice(0, 2).join('.')}` : '';
        const idAttr = vnode.attrs.find((a) => a.name === 'id')?.value;

        const defaultLabel = idAttr
          ? `${vnode.tag}#${idAttr}`
          : `${vnode.tag}${classSummary}`;

        const hasChildren = vnode.children.length > 0;
        const expanded = query.length > 0 ? true : Boolean(s.expandedKeys[id]);

        const rawText = vnode.textContent?.trim() || '';
        const previewText = rawText.length > 0 ? (rawText.length > 25 ? `${rawText.slice(0, 25)}…` : rawText) : undefined;
        const isComponent = Boolean((meta as any)?.isComponent) || vnode.attrs.some(a => a.name === 'data-vds-component');

        rows.push({
          key: id,
          depth,
          label: meta?.layerName || defaultLabel,
          customName: meta?.layerName,
          tag: vnode.tag,
          classSummary,
          hasChildren,
          childCount: vnode.children.length,
          expanded,
          locked,
          selfLocked,
          hidden,
          selfHidden,
          readOnly: vnode.tag === 'head' || vnode.tag === 'body',
          previewText,
          isComponent,
        });

        if (hasChildren && expanded) {
          for (const childId of vnode.children) {
            visit(childId, depth + 1, locked, hidden);
          }
        }
      };

      for (const rootId of tree.rootIds) {
        visit(rootId, 0, false, false);
      }

      return rows;
    },
  };
});
