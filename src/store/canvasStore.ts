import { create } from 'zustand';
import type { ArtboardDef, BreakpointDef, CameraState, MeasuredRectItem } from '../engine/types';
import { projectDoc } from '../engine/doc/projectDoc';
import { sandboxRegistry } from '../engine/sandbox/iframeBridge';

/**
 * Canvas Viewport & Artboard Store — Specification: CANVAS-01_ZOOM_PAN.md
 * Implements:
 * - F001: Infinite canvas camera model (x, y, zoom)
 * - F002: Focal zoom (2%..6400%), zoom-to-fit, zoom-to-selection, 100%
 * - F003: Panning state & tool mode ('select' | 'hand')
 * - F004: Artboards per page × breakpoint (Desktop 1440, Tablet 768, Mobile 375, custom)
 * - F005: Lifecycle state ('live' | 'frozen' | 'unloaded')
 * - F006: Draggable rulers & guides per artboard
 */

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 64;

export const DEFAULT_BREAKPOINTS: BreakpointDef[] = [
  { id: 'desktop', label: 'Desktop', minWidth: 1024, maxWidth: null, previewWidth: 1440 },
  { id: 'tablet', label: 'Tablet', minWidth: 768, maxWidth: 1023.98, previewWidth: 768 },
  { id: 'mobile', label: 'Mobile', minWidth: null, maxWidth: 767.98, previewWidth: 375 },
];

export function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

/**
 * Focal Zoom Formula from CANVAS-01_ZOOM_PAN.md §3:
 * Keeps the world coordinate directly under (screenX, screenY) stationary.
 */
export function zoomAtPoint(
  cam: CameraState,
  screenX: number,
  screenY: number,
  factor: number
): CameraState {
  const zoom = clamp(cam.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  const k = zoom / cam.zoom;
  return {
    zoom,
    x: screenX - (screenX - cam.x) * k,
    y: screenY - (screenY - cam.y) * k,
  };
}

export interface CanvasGuide {
  id: string;
  artboardId: string;
  axis: 'x' | 'y';
  pos: number;
}

export interface CanvasViewportStore {
  camera: CameraState;
  activeTool: 'select' | 'hand';
  isPanning: boolean;
  interactMode: boolean;
  rulersVisible: boolean;
  boxModelOverlayVisible: boolean;
  breakpoints: BreakpointDef[];
  artboards: Record<string, ArtboardDef>;
  artboardOrder: string[];
  activeArtboardId: string;
  guides: CanvasGuide[];
  measuredRects: Record<string, Record<string, MeasuredRectItem>>;
  canvasBgColor: string;
  pageFiles: string[];
  activeFile: string;
  canvasViewMode: 'single' | 'all';

  // Actions
  setCanvasViewMode: (mode: 'single' | 'all') => void;
  setPageFiles: (files: string[]) => void;
  setCanvasBgColor: (color: string) => void;
  setActiveFile: (file: string) => void;
  addNewPage: (fileName: string) => void;
  setCamera: (cam: CameraState) => void;
  panBy: (dx: number, dy: number) => void;
  zoomAt: (screenX: number, screenY: number, factor: number) => void;
  zoomTo100: (viewportWidth: number, viewportHeight: number) => void;
  zoomToFitAll: (viewportWidth: number, viewportHeight: number, padding?: number) => void;
  focusArtboard: (artboardId: string, viewportWidth: number, viewportHeight: number) => void;
  setActiveTool: (tool: 'select' | 'hand') => void;
  setIsPanning: (panning: boolean) => void;
  toggleInteractMode: () => void;
  toggleRulers: () => void;
  toggleBoxModelOverlay: () => void;
  clearGuides: () => void;
  setActiveArtboard: (artboardId: string) => void;
  activateOrSpawnBreakpoint: (
    breakpointId: string,
    viewportWidth: number,
    viewportHeight: number
  ) => void;
  addCustomArtboard: (width: number, label?: string) => string;
  removeArtboard: (artboardId: string) => void;
  setArtboardWidth: (artboardId: string, width: number) => void;
  setArtboardMeasuredHeight: (artboardId: string, height: number) => void;
  resetAllArtboardHeights: () => void;
  toggleArtboardHeightMode: (artboardId: string) => void;
  updateArtboardLifecycles: (viewportWidth: number, viewportHeight: number) => void;
  setMeasuredRects: (artboardId: string, items: MeasuredRectItem[]) => void;
  addGuide: (artboardId: string, axis: 'x' | 'y', pos: number) => void;
  updateGuide: (id: string, pos: number) => void;
  removeGuide: (id: string) => void;
}

const INITIAL_ARTBOARDS: Record<string, ArtboardDef> = {
  ab_desktop: {
    id: 'ab_desktop',
    file: 'index.html',
    breakpointId: 'desktop',
    label: 'Desktop',
    width: 1440,
    heightMode: 'fixed',
    fixedHeight: 900,
    measuredHeight: 900,
    worldX: 80,
    worldY: 80,
    lifecycle: 'live',
  },
  ab_tablet: {
    id: 'ab_tablet',
    file: 'index.html',
    breakpointId: 'tablet',
    label: 'Tablet',
    width: 768,
    heightMode: 'fixed',
    fixedHeight: 1024,
    measuredHeight: 1024,
    worldX: 1620,
    worldY: 80,
    lifecycle: 'live',
  },
  ab_mobile: {
    id: 'ab_mobile',
    file: 'index.html',
    breakpointId: 'mobile',
    label: 'Mobile',
    width: 375,
    heightMode: 'fixed',
    fixedHeight: 812,
    measuredHeight: 812,
    worldX: 2488,
    worldY: 80,
    lifecycle: 'live',
  },
};

export const useCanvasStore = create<CanvasViewportStore>((set, get) => ({
  camera: { x: 48, y: 48, zoom: 0.48 },
  activeTool: 'select',
  isPanning: false,
  interactMode: false,
  rulersVisible: true,
  boxModelOverlayVisible: true,
  breakpoints: DEFAULT_BREAKPOINTS,
  artboards: INITIAL_ARTBOARDS,
  artboardOrder: ['ab_desktop', 'ab_tablet', 'ab_mobile'],
  activeArtboardId: 'ab_desktop',
  guides: [],
  measuredRects: {},
  canvasBgColor: '#f5f5f5',
  pageFiles: ['index.html'],
  activeFile: 'index.html',
  canvasViewMode: 'single',

  setCanvasViewMode: (canvasViewMode) => set({ canvasViewMode }),
  setPageFiles: (pageFiles) => set({ pageFiles }),
  setCanvasBgColor: (canvasBgColor) => set({ canvasBgColor }),

  setActiveFile: (file) => {
    set((s) => {
      const nextArtboards = { ...s.artboards };
      for (const id of Object.keys(nextArtboards)) {
        nextArtboards[id] = { ...nextArtboards[id], file };
      }
      return { activeFile: file, artboards: nextArtboards };
    });
    const html = projectDoc.getFileText(file);
    const sheets = projectDoc.getStyleSheets();
    sandboxRegistry.broadcastLoad(file, html, sheets);
  },

  addNewPage: (fileName) => {
    const sanitized = fileName.endsWith('.html') ? fileName : `${fileName}.html`;
    if (!projectDoc.files.has(sanitized)) {
      const initialPageContent = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${sanitized.replace('.html', '')}</title>
  <link rel="stylesheet" href="css/styles.css" />
</head>
<body data-vds-id="n_body">
  <main class="page-content" data-vds-id="n_page_main">
    <section class="hero" data-vds-id="n_hero">
      <h1 class="hero__title" data-vds-id="n_h1">${sanitized.replace('.html', '')} Page</h1>
      <p class="hero__lead" data-vds-id="n_lead">Start designing your page visually.</p>
    </section>
  </main>
</body>
</html>`;
      projectDoc.createFile(sanitized, initialPageContent);
    }
    const currentPages = get().pageFiles;
    if (!currentPages.includes(sanitized)) {
      set({ pageFiles: [...currentPages, sanitized] });
    }
    get().setActiveFile(sanitized);
  },

  setCamera: (camera) => set({ camera }),

  panBy: (dx, dy) =>
    set((s) => ({
      camera: {
        ...s.camera,
        x: s.camera.x + dx,
        y: s.camera.y + dy,
      },
    })),

  zoomAt: (screenX, screenY, factor) =>
    set((s) => ({
      camera: zoomAtPoint(s.camera, screenX, screenY, factor),
    })),

  zoomTo100: (viewportWidth, viewportHeight) => {
    const s = get();
    const active = s.artboards[s.activeArtboardId] ?? Object.values(s.artboards)[0];
    if (!active) {
      set({ camera: { x: 60, y: 60, zoom: 1 } });
      return;
    }
    const x = Math.round((viewportWidth - active.width) * 0.5 - active.worldX);
    const y = Math.round(Math.max(48, (viewportHeight - active.measuredHeight) * 0.25) - active.worldY);
    set({ camera: { x, y, zoom: 1 } });
  },

  zoomToFitAll: (viewportWidth, viewportHeight, padding = 72) => {
    const s = get();
    const list = s.artboardOrder.map((id) => s.artboards[id]).filter(Boolean);
    if (list.length === 0 || viewportWidth <= 0 || viewportHeight <= 0) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const ab of list) {
      const h = ab.heightMode === 'fixed' ? (ab.fixedHeight ?? 900) : ab.measuredHeight;
      minX = Math.min(minX, ab.worldX);
      minY = Math.min(minY, ab.worldY);
      maxX = Math.max(maxX, ab.worldX + ab.width);
      maxY = Math.max(maxY, ab.worldY + h);
    }

    const boundsW = Math.max(1, maxX - minX);
    const boundsH = Math.max(1, maxY - minY);
    const availW = Math.max(100, viewportWidth - padding * 2);
    const availH = Math.max(100, viewportHeight - padding * 2);

    const zoom = clamp(Math.min(availW / boundsW, availH / boundsH), MIN_ZOOM, 2);
    const x = Math.round((viewportWidth - boundsW * zoom) * 0.5 - minX * zoom);
    const y = Math.round((viewportHeight - boundsH * zoom) * 0.5 - minY * zoom);

    set({ camera: { x, y, zoom } });
  },

  focusArtboard: (artboardId, viewportWidth, viewportHeight) => {
    const s = get();
    const ab = s.artboards[artboardId];
    if (!ab) return;
    const h = ab.heightMode === 'fixed' ? (ab.fixedHeight ?? 900) : ab.measuredHeight;
    const pad = 80;
    const zoom = clamp(
      Math.min((viewportWidth - pad * 2) / ab.width, (viewportHeight - pad * 2) / h),
      0.15,
      1.25
    );
    const x = Math.round((viewportWidth - ab.width * zoom) * 0.5 - ab.worldX * zoom);
    const y = Math.round(Math.max(56, (viewportHeight - h * zoom) * 0.5) - ab.worldY * zoom);
    set({
      activeArtboardId: artboardId,
      camera: { x, y, zoom },
    });
  },

  setActiveTool: (activeTool) => set({ activeTool }),
  setIsPanning: (isPanning) => set({ isPanning }),
  toggleInteractMode: () => set((s) => ({ interactMode: !s.interactMode })),
  toggleRulers: () => set((s) => ({ rulersVisible: !s.rulersVisible })),
  toggleBoxModelOverlay: () =>
    set((s) => ({ boxModelOverlayVisible: !s.boxModelOverlayVisible })),
  clearGuides: () => set({ guides: [] }),
  setActiveArtboard: (activeArtboardId) => set({ activeArtboardId }),

  activateOrSpawnBreakpoint: (breakpointId, viewportWidth, viewportHeight) => {
    const s = get();
    const existing = s.artboardOrder
      .map((id) => s.artboards[id])
      .find((a) => a && a.breakpointId === breakpointId);

    if (existing) {
      s.focusArtboard(existing.id, viewportWidth, viewportHeight);
      return;
    }

    const bp = s.breakpoints.find((b) => b.id === breakpointId);
    if (!bp) return;

    const newId = get().addCustomArtboard(bp.previewWidth, bp.label);
    get().focusArtboard(newId, viewportWidth, viewportHeight);
  },

  addCustomArtboard: (width, label) => {
    const s = get();
    const clampedWidth = clamp(Math.round(width), 240, 4096);
    let maxRight = 80;
    for (const id of s.artboardOrder) {
      const ab = s.artboards[id];
      if (ab) {
        maxRight = Math.max(maxRight, ab.worldX + ab.width + 100);
      }
    }
    const id = `ab_${Date.now().toString(36)}`;
    const newAb: ArtboardDef = {
      id,
      file: 'index.html',
      breakpointId: label ? label.toLowerCase() : `custom-${clampedWidth}`,
      label: label ?? `Custom ${clampedWidth}`,
      width: clampedWidth,
      heightMode: 'fixed',
      fixedHeight: 900,
      measuredHeight: 900,
      worldX: maxRight,
      worldY: 80,
      lifecycle: 'live',
    };

    set({
      artboards: { ...s.artboards, [id]: newAb },
      artboardOrder: [...s.artboardOrder, id],
      activeArtboardId: id,
    });
    return id;
  },

  removeArtboard: (artboardId) =>
    set((s) => {
      if (s.artboardOrder.length <= 1) return s;
      const nextArtboards = { ...s.artboards };
      delete nextArtboards[artboardId];
      const nextOrder = s.artboardOrder.filter((id) => id !== artboardId);
      const nextActive =
        s.activeArtboardId === artboardId ? (nextOrder[0] ?? '') : s.activeArtboardId;
      return {
        artboards: nextArtboards,
        artboardOrder: nextOrder,
        activeArtboardId: nextActive,
      };
    }),

  setArtboardWidth: (artboardId, width) =>
    set((s) => {
      const ab = s.artboards[artboardId];
      if (!ab) return s;
      // Enforce 4096px GPU texture cap per CANVAS-01 §4
      const nextW = clamp(Math.round(width), 240, 4096);
      return {
        artboards: {
          ...s.artboards,
          [artboardId]: { ...ab, width: nextW },
        },
      };
    }),

  setArtboardMeasuredHeight: (artboardId, height) =>
    set((s) => {
      const ab = s.artboards[artboardId];
      if (!ab) return s;
      const clampedH = Math.max(320, Math.round(height));
      if (Math.abs(ab.measuredHeight - clampedH) < 2) return s;
      return {
        artboards: {
          ...s.artboards,
          [artboardId]: { ...ab, measuredHeight: clampedH },
        },
      };
    }),

  resetAllArtboardHeights: () =>
    set((s) => {
      const next: Record<string, ArtboardDef> = {};
      for (const [id, ab] of Object.entries(s.artboards)) {
        const defaultH = ab.fixedHeight ?? (ab.width >= 1024 ? 900 : ab.width >= 768 ? 1024 : 812);
        next[id] = {
          ...ab,
          heightMode: 'fixed',
          fixedHeight: defaultH,
          measuredHeight: defaultH,
        };
      }
      return { artboards: next };
    }),

  toggleArtboardHeightMode: (artboardId) =>
    set((s) => {
      const ab = s.artboards[artboardId];
      if (!ab) return s;
      return {
        artboards: {
          ...s.artboards,
          [artboardId]: {
            ...ab,
            heightMode: ab.heightMode === 'content' ? 'fixed' : 'content',
          },
        },
      };
    }),

  updateArtboardLifecycles: (viewportWidth, viewportHeight) =>
    set((s) => {
      const { x, y, zoom } = s.camera;
      const marginX = viewportWidth;
      const marginY = viewportHeight;
      let changed = false;
      const next: Record<string, ArtboardDef> = { ...s.artboards };

      for (const id of s.artboardOrder) {
        const ab = next[id];
        if (!ab) continue;
        const h = ab.heightMode === 'fixed' ? (ab.fixedHeight ?? 900) : ab.measuredHeight;
        const screenLeft = ab.worldX * zoom + x;
        const screenTop = ab.worldY * zoom + y;
        const screenRight = screenLeft + ab.width * zoom;
        const screenBottom = screenTop + h * zoom;

        const inExtendedViewport =
          screenRight >= -marginX &&
          screenLeft <= viewportWidth + marginX &&
          screenBottom >= -marginY &&
          screenTop <= viewportHeight + marginY;

        const targetLifecycle: ArtboardDef['lifecycle'] =
          inExtendedViewport || id === s.activeArtboardId ? 'live' : 'frozen';

        if (ab.lifecycle !== targetLifecycle) {
          next[id] = { ...ab, lifecycle: targetLifecycle };
          changed = true;
        }
      }

      return changed ? { artboards: next } : s;
    }),

  setMeasuredRects: (artboardId, items) =>
    set((s) => {
      const map: Record<string, MeasuredRectItem> = {};
      for (const item of items) {
        map[item.id] = item;
      }
      return {
        measuredRects: {
          ...s.measuredRects,
          [artboardId]: map,
        },
      };
    }),

  addGuide: (artboardId, axis, pos) =>
    set((s) => ({
      guides: [
        ...s.guides,
        {
          id: `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          artboardId,
          axis,
          pos: Math.round(pos),
        },
      ],
    })),

  updateGuide: (id, pos) =>
    set((s) => ({
      guides: s.guides.map((g) => (g.id === id ? { ...g, pos: Math.round(pos) } : g)),
    })),

  removeGuide: (id) =>
    set((s) => ({
      guides: s.guides.filter((g) => g.id !== id),
    })),
}));
