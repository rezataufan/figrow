import { create } from 'zustand';
import type { NodeId, PseudoState } from '../engine/types';
import {
  resolveElementCascade,
  writeDeclarationsToTarget,
  updateElementClassList,
  parseDesignTokens,
  setDesignTokenValue,
  type StyleTargetKind,
  type StyleWriteTarget,
} from '../engine/css/cascadeEngine';
import { sandboxRegistry } from '../engine/sandbox/iframeBridge';
import { useCanvasStore } from './canvasStore';

/**
 * CSS Visual Inspector Store — Aligned with CSS-01_BOX_MODEL.md & CSS-04_CLASSES_STATES.md
 * Manages:
 * - Active Inspector Tab ('styles' | 'tokens')
 * - Selector Bar Target (`rule` | `inline` | `newRule`), custom selector, active PseudoState, Media context
 * - Box Model Link Mode ('none' | 'all' | 'axis')
 * - 60 FPS Transient scrubbing preview (`transientProps`) vs Commit
 */

export interface InspectorStoreState {
  activeTab: 'styles' | 'tokens';
  targetKind: StyleTargetKind;
  selectedSelector: string | null; // null = auto-resolve most specific class on selected element
  activeState: PseudoState | null;
  linkMode: 'none' | 'all' | 'axis';
  isScrubbing: boolean;
  transientProps: Record<string, string>;
  highlightedBoxSide:
    | 'margin-top'
    | 'margin-right'
    | 'margin-bottom'
    | 'margin-left'
    | 'padding-top'
    | 'padding-right'
    | 'padding-bottom'
    | 'padding-left'
    | null;
  inspectorRevision: number;

  // Actions
  setActiveTab: (tab: 'styles' | 'tokens') => void;
  setTargetSelector: (kind: StyleTargetKind, selector: string | null) => void;
  setActiveState: (
    state: PseudoState | null,
    selectedNodeId: NodeId | null,
    artboardId: string
  ) => void;
  cycleLinkMode: () => void;
  setHighlightedBoxSide: (side: InspectorStoreState['highlightedBoxSide']) => void;
  previewTransientStyle: (
    artboardId: string,
    nodeId: NodeId,
    props: Record<string, string>
  ) => void;
  commitStyleProps: (
    artboardId: string,
    artboardWidth: number,
    nodeId: NodeId,
    props: Record<string, string | null>
  ) => void;
  addClassToSelected: (nodeId: NodeId, newClass: string) => void;
  removeClassFromSelected: (nodeId: NodeId, cls: string) => void;
  resolveTargetForNode: (
    nodeId: NodeId,
    artboardWidth: number
  ) => StyleWriteTarget;
  updateToken: (name: `--${string}`, value: string, scope?: string) => void;
  getTokens: () => ReturnType<typeof parseDesignTokens>;
}

export function getMediaQueryForWidth(width: number): string | null {
  if (width < 768) return '(max-width: 767.98px)';
  if (width < 1024) return '(max-width: 1023.98px)';
  return null;
}

export const useInspectorStore = create<InspectorStoreState>((set, get) => ({
  activeTab: 'styles',
  targetKind: 'inline',
  selectedSelector: null,
  activeState: null,
  linkMode: 'none',
  isScrubbing: false,
  transientProps: {},
  highlightedBoxSide: null,
  inspectorRevision: 1,

  setActiveTab: (activeTab) => set({ activeTab }),

  setTargetSelector: (targetKind, selectedSelector) =>
    set({ targetKind, selectedSelector }),

  setActiveState: (activeState, selectedNodeId, artboardId) => {
    set({ activeState });
    if (selectedNodeId) {
      sandboxRegistry.send(artboardId, {
        t: 'forceState',
        id: selectedNodeId,
        states: activeState ? [activeState] : [],
      });
    }
  },

  cycleLinkMode: () =>
    set((s) => ({
      linkMode:
        s.linkMode === 'none'
          ? 'axis'
          : s.linkMode === 'axis'
            ? 'all'
            : 'none',
    })),

  setHighlightedBoxSide: (highlightedBoxSide) => set({ highlightedBoxSide }),

  previewTransientStyle: (artboardId, nodeId, props) => {
    set((s) => ({
      isScrubbing: true,
      transientProps: { ...s.transientProps, ...props },
    }));
    sandboxRegistry.send(artboardId, {
      t: 'transient',
      id: nodeId,
      style: props,
    });
  },

  resolveTargetForNode: (nodeId, artboardWidth) => {
    const s = get();
    const activeFile = useCanvasStore.getState().activeFile || 'index.html';
    const cascade = resolveElementCascade(nodeId, artboardWidth, s.activeState, activeFile);
    const media = getMediaQueryForWidth(artboardWidth);

    // If targetKind is 'inline' OR if no explicit class selector was clicked,
    // default to targeting the element's direct inline style!
    // This gives rock-solid Figma-like predictability: editing the selected element
    // modifies THAT element directly, never snaps back, and never breaks other elements!
    if (s.targetKind === 'inline' || !s.selectedSelector) {
      return {
        kind: 'inline',
        selector: 'style=""',
        file: activeFile,
        media: null,
        state: null,
      };
    }

    return {
      kind: 'rule',
      selector: s.selectedSelector,
      file: 'css/styles.css',
      media,
      state: s.activeState,
    };
  },

  commitStyleProps: (artboardId, artboardWidth, nodeId, props) => {
    const s = get();
    const canvasState = useCanvasStore.getState();
    const activeFile = canvasState.artboards[artboardId]?.file || canvasState.activeFile || 'index.html';

    sandboxRegistry.send(artboardId, {
      t: 'clearTransient',
      id: nodeId,
      revert: true,
    });

    const cascade = resolveElementCascade(nodeId, artboardWidth, s.activeState, activeFile);
    if (!cascade.vnode) {
      set({ isScrubbing: false, transientProps: {} });
      return;
    }

    const target = s.resolveTargetForNode(nodeId, artboardWidth);
    writeDeclarationsToTarget(cascade.vnode, target, props);

    set((prev) => ({
      isScrubbing: false,
      transientProps: {},
      inspectorRevision: prev.inspectorRevision + 1,
    }));
  },

  addClassToSelected: (nodeId, newClass) => {
    const clean = newClass.trim().replace(/^\.+/, '');
    if (!clean) return;
    const activeFile = useCanvasStore.getState().activeFile || 'index.html';
    const cascade = resolveElementCascade(nodeId, 1440, null, activeFile);
    const nextClasses = [...cascade.classes, clean];
    updateElementClassList(activeFile, nodeId, nextClasses);
    set((s) => ({
      targetKind: 'rule',
      selectedSelector: `.${clean}`,
      inspectorRevision: s.inspectorRevision + 1,
    }));
  },

  removeClassFromSelected: (nodeId, cls) => {
    const activeFile = useCanvasStore.getState().activeFile || 'index.html';
    const cascade = resolveElementCascade(nodeId, 1440, null, activeFile);
    const nextClasses = cascade.classes.filter((c) => c !== cls);
    updateElementClassList(activeFile, nodeId, nextClasses);
    set((s) => ({
      selectedSelector:
        s.selectedSelector === `.${cls}` ? null : s.selectedSelector,
      inspectorRevision: s.inspectorRevision + 1,
    }));
  },

  updateToken: (name, value, scope = ':root') => {
    setDesignTokenValue(name, value, scope);
    set((s) => ({ inspectorRevision: s.inspectorRevision + 1 }));
  },

  getTokens: () => parseDesignTokens('css/styles.css'),
}));
