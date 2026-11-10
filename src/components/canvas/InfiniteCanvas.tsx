import React, { useEffect, useRef, useState } from 'react';
import {
  Minus,
  Plus,
  Maximize2,
  Monitor,
  Tablet,
  Smartphone,
  PlusCircle,
} from 'lucide-react';
import { useCanvasStore } from '../../store/canvasStore';
import { useSelectionStore } from '../../store/selectionStore';
import { useLayersStore } from '../../store/layersStore';
import { sandboxRegistry } from '../../engine/sandbox/iframeBridge';
import {
  commitElementTextMutation,
  deleteElementNode,
  duplicateElementNode,
  reloadArtboardsForFile,
  syncHydratedBodyHtml,
} from '../../engine/ast/htmlAst';
import { projectDoc } from '../../engine/doc/projectDoc';
import { useInspectorStore } from '../../store/inspectorStore';
import { resolveElementCascade } from '../../engine/css/cascadeEngine';
import {
  COMPONENT_CATALOG,
  insertComponentIntoDocument,
} from '../../engine/components/componentCatalog';
import { ArtboardFrame } from './ArtboardFrame';
import { CanvasRulers } from './CanvasRulers';

let clipboardNodeId: string | null = null;

/**
 * InfiniteCanvas — Full implementation of CANVAS-01_ZOOM_PAN.md
 * - 60 FPS Camera transform (`translate3d(x,y,0) scale(zoom)`) with rAF batching
 * - `will-change: transform` active only during gesture, cleared 150ms after gesture ends
 * - Ctrl/Cmd + Wheel focal zoom (`Math.exp(-deltaY * 0.0015)`)
 * - Two-finger scroll / Space+Drag / Middle-Mouse / Hand tool panning
 * - Keyboard shortcuts: V (Select), H (Hand), Space (temporary pan), Ctrl+0 (100%), Shift+1 (Fit All)
 * - Floating HUD (Bottom-Right): Zoom -, %, +, Fit, Breakpoint quick-jump, + Add Artboard
 */
export function InfiniteCanvas(): React.ReactElement {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<HTMLDivElement | null>(null);
  const gestureTimerRef = useRef<number | null>(null);
  const spacePressedRef = useRef<boolean>(false);

  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({
    width: 1200,
    height: 800,
  });
  const [isGestureActive, setIsGestureActive] = useState(false);

  const camera = useCanvasStore((s) => s.camera);
  const activeTool = useCanvasStore((s) => s.activeTool);
  const isPanning = useCanvasStore((s) => s.isPanning);
  const interactMode = useCanvasStore((s) => s.interactMode);
  const artboards = useCanvasStore((s) => s.artboards);
  const artboardOrder = useCanvasStore((s) => s.artboardOrder);
  const activeArtboardId = useCanvasStore((s) => s.activeArtboardId);
  const canvasBgColor = useCanvasStore((s) => s.canvasBgColor);
  const canvasViewMode = useCanvasStore((s) => s.canvasViewMode);
  const setCanvasViewMode = useCanvasStore((s) => s.setCanvasViewMode);

  const panBy = useCanvasStore((s) => s.panBy);
  const zoomAt = useCanvasStore((s) => s.zoomAt);
  const zoomTo100 = useCanvasStore((s) => s.zoomTo100);
  const zoomToFitAll = useCanvasStore((s) => s.zoomToFitAll);
  const setActiveTool = useCanvasStore((s) => s.setActiveTool);
  const setIsPanning = useCanvasStore((s) => s.setIsPanning);
  const activateOrSpawnBreakpoint = useCanvasStore((s) => s.activateOrSpawnBreakpoint);
  const addCustomArtboard = useCanvasStore((s) => s.addCustomArtboard);
  const setArtboardMeasuredHeight = useCanvasStore((s) => s.setArtboardMeasuredHeight);
  const setMeasuredRects = useCanvasStore((s) => s.setMeasuredRects);
  const updateArtboardLifecycles = useCanvasStore((s) => s.updateArtboardLifecycles);

  const markGestureActive = (): void => {
    setIsGestureActive(true);
    if (gestureTimerRef.current !== null) {
      window.clearTimeout(gestureTimerRef.current);
    }
    gestureTimerRef.current = window.setTimeout(() => {
      setIsGestureActive(false);
    }, 150);
  };

  // Subscribe to AgentMsg ('rects', 'ack', 'hit', 'inlineTextCommitted', 'domHydrated') from sandboxed artboards
  useEffect(() => {
    return sandboxRegistry.onMessage((artboardId, msg) => {
      if (msg.t === 'rects') {
        setArtboardMeasuredHeight(artboardId, msg.contentHeight);
        setMeasuredRects(artboardId, msg.items);
      } else if (msg.t === 'ack' && typeof msg.contentHeight === 'number') {
        setArtboardMeasuredHeight(artboardId, msg.contentHeight);
      } else if (msg.t === 'hit') {
        useSelectionStore.getState().setHoverHit(msg.id, msg.path);
      } else if (msg.t === 'domHydrated') {
        const ab = useCanvasStore.getState().artboards[artboardId];
        if (ab && syncHydratedBodyHtml(ab.file, msg.bodyHtml)) {
          useLayersStore.getState().bumpRevision();
        }
      } else if (msg.t === 'inlineTextCommitted') {
        const ab = useCanvasStore.getState().artboards[artboardId];
        if (ab) {
          commitElementTextMutation(ab.file, msg.id, msg.text);
          useLayersStore.getState().bumpRevision();
        }
        useSelectionStore.getState().stopTextEditing();
      }
    });
  }, [setArtboardMeasuredHeight, setMeasuredRects]);

  // Measure stage viewport & fit artboards on initial mount
  useEffect(() => {
    const stageEl = stageRef.current;
    if (!stageEl) return;

    const updateSize = (): void => {
      const rect = stageEl.getBoundingClientRect();
      setViewportSize({ width: rect.width, height: rect.height });
    };

    updateSize();
    const initRect = stageEl.getBoundingClientRect();
    zoomToFitAll(initRect.width, initRect.height, 64);

    const ro = new ResizeObserver(updateSize);
    ro.observe(stageEl);
    return () => ro.disconnect();
  }, [zoomToFitAll]);

  // Update offscreen artboard freeze/thaw lifecycles (F005)
  useEffect(() => {
    updateArtboardLifecycles(viewportSize.width, viewportSize.height);
  }, [camera, viewportSize.width, viewportSize.height, updateArtboardLifecycles]);

  // Non-passive wheel listener for smooth focal zoom & trackpad pan
  useEffect(() => {
    const stageEl = stageRef.current;
    if (!stageEl) return;

    const onWheel = (e: WheelEvent): void => {
      // Allow native scroll inside active artboard when Interact Mode is enabled
      const state = useCanvasStore.getState();
      if (state.interactMode) return;

      e.preventDefault();
      markGestureActive();

      if (e.ctrlKey || e.metaKey) {
        const rect = stageEl.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const factor = Math.exp(-e.deltaY * 0.0015);
        state.zoomAt(screenX, screenY, factor);
      } else {
        state.panBy(-e.deltaX, -e.deltaY);
      }
    };

    stageEl.addEventListener('wheel', onWheel, { passive: false });
    return () => stageEl.removeEventListener('wheel', onWheel);
  }, []);

  const zoomToSelection = (targetPadding = 80): void => {
    const sel = useSelectionStore.getState();
    const ab = artboards[activeArtboardId];
    if (!ab || viewportSize.width <= 0 || viewportSize.height <= 0) return;

    if (sel.primaryKey) {
      const rectMap = useCanvasStore.getState().measuredRects[activeArtboardId];
      const rect = rectMap?.[sel.primaryKey];
      if (rect) {
        const box = rect.border;
        const boxW = Math.max(24, box.width ?? 100);
        const boxH = Math.max(24, box.height ?? 100);
        const worldX = ab.worldX + (box.x ?? 0);
        const worldY = ab.worldY + (box.y ?? 0);

        const availW = Math.max(80, viewportSize.width - targetPadding * 2);
        const availH = Math.max(80, viewportSize.height - targetPadding * 2);
        const newZoom = Math.min(Math.max(Math.min(availW / boxW, availH / boxH), 0.05), 3.0);

        const x = Math.round((viewportSize.width - boxW * newZoom) * 0.5 - worldX * newZoom);
        const y = Math.round((viewportSize.height - boxH * newZoom) * 0.5 - worldY * newZoom);

        useCanvasStore.getState().setCamera({ x, y, zoom: newZoom });
        return;
      }
    }

    useCanvasStore.getState().focusArtboard(activeArtboardId, viewportSize.width, viewportSize.height);
  };

  // Global keyboard shortcuts (V, H, R, O, I, Space, Ctrl+0, Shift+1, Shift+2, Nudge, Copy/Paste)
  useEffect(() => {
    const isInputFocused = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || target.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Alt') {
        useSelectionStore.getState().setAltPressed(true);
      }

      if (isInputFocused(e.target)) return;
      if (useSelectionStore.getState().mode === 'textEditing') return;

      if (e.code === 'Space' && !spacePressedRef.current) {
        e.preventDefault();
        spacePressedRef.current = true;
        setIsPanning(true);
        return;
      }

      // Undo / Redo via Y.UndoManager (01_SYSTEM_ARCHITECTURE.md §8)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          projectDoc.undoManager.redo();
        } else {
          projectDoc.undoManager.undo();
        }
        reloadArtboardsForFile('index.html');
        return;
      }

      // Wrap / Unwrap (Ctrl+G / Ctrl+Shift+G — LAYER-01)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        const sel = useSelectionStore.getState();
        if (!sel.primaryKey) return;
        const layers = useLayersStore.getState();
        if (e.shiftKey) {
          const childId = layers.unwrapNode(sel.primaryKey);
          if (childId) sel.selectSingle(childId, sel.artboardId);
        } else {
          const wrapId = layers.wrapNode(sel.primaryKey, 'div');
          if (wrapId) sel.selectSingle(wrapId, sel.artboardId);
        }
        return;
      }

      // Hide in Design (Ctrl+Shift+H) / Lock Layer (Ctrl+Shift+L) — LAYER-01
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        const pk = useSelectionStore.getState().primaryKey;
        if (pk) useLayersStore.getState().toggleHiddenInDesign(pk);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        const pk = useSelectionStore.getState().primaryKey;
        if (pk) useLayersStore.getState().toggleLock(pk);
        return;
      }

      // Rename Layer (F2 — LAYER-01)
      if (e.key === 'F2') {
        e.preventDefault();
        const pk = useSelectionStore.getState().primaryKey;
        if (pk) useLayersStore.getState().startRenaming(pk);
        return;
      }

      // Keyboard Sibling Reorder (Alt+Up / Alt+Down — CANVAS-03)
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const pk = useSelectionStore.getState().primaryKey;
        if (pk) {
          useLayersStore
            .getState()
            .moveSiblingByDelta(pk, e.key === 'ArrowUp' ? -1 : 1);
        }
        return;
      }

      // Keyboard Nudge (Arrow Keys / Shift+Arrow — F014)
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && !e.altKey) {
        const sel = useSelectionStore.getState();
        if (sel.primaryKey) {
          e.preventDefault();
          const delta = e.shiftKey ? 10 : 1;
          const dx = e.key === 'ArrowLeft' ? -delta : e.key === 'ArrowRight' ? delta : 0;
          const dy = e.key === 'ArrowUp' ? -delta : e.key === 'ArrowDown' ? delta : 0;

          const ab = artboards[sel.artboardId || activeArtboardId];
          const abWidth = ab?.width ?? 1440;
          const insp = useInspectorStore.getState();

          const cascade = resolveElementCascade(sel.primaryKey, abWidth, null);
          const currentLeft = parseFloat(cascade.declaredProps['left']?.raw || '0') || 0;
          const currentTop = parseFloat(cascade.declaredProps['top']?.raw || '0') || 0;

          const nextProps: Record<string, string | null> = {};
          if (cascade.declaredProps['position']?.raw !== 'absolute') {
            nextProps.position = 'relative';
          }
          nextProps['left'] = `${Math.round(currentLeft + dx)}px`;
          nextProps['top'] = `${Math.round(currentTop + dy)}px`;

          insp.commitStyleProps(ab?.id || activeArtboardId, abWidth, sel.primaryKey, nextProps);
          return;
        }
      }

      // Copy Element (Ctrl+C)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        const sel = useSelectionStore.getState();
        if (sel.primaryKey) {
          clipboardNodeId = sel.primaryKey;
        }
        return;
      }

      // Paste Element (Ctrl+V)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        if (clipboardNodeId) {
          e.preventDefault();
          const sel = useSelectionStore.getState();
          const cloned = duplicateElementNode('index.html', clipboardNodeId);
          if (cloned) {
            sel.selectSingle(cloned, sel.artboardId);
          }
        }
        return;
      }

      // Cancel active Canvas Drag or Select Parent on Escape
      if (e.key === 'Escape' || (e.shiftKey && e.key === 'Enter')) {
        e.preventDefault();
        if (useLayersStore.getState().canvasDrag) {
          useLayersStore.getState().cancelCanvasDrag();
          return;
        }
        useSelectionStore.getState().selectParent();
        return;
      }

      // Duplicate Element (Ctrl+D)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const sel = useSelectionStore.getState();
        if (sel.primaryKey) {
          const cloned = duplicateElementNode('index.html', sel.primaryKey);
          if (cloned) sel.selectSingle(cloned, sel.artboardId);
        }
        return;
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        useSelectionStore.getState().selectFirstChild();
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        useSelectionStore.getState().selectSibling(e.shiftKey ? -1 : 1);
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const sel = useSelectionStore.getState();
        if (sel.primaryKey) {
          e.preventDefault();
          if (deleteElementNode('index.html', sel.primaryKey)) {
            sel.clearSelection();
          }
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        zoomTo100(viewportSize.width, viewportSize.height);
        return;
      }

      // Shift+1: Zoom to Fit All
      if (e.shiftKey && (e.key === '!' || e.key === '1' || e.code === 'Digit1')) {
        e.preventDefault();
        zoomToFitAll(viewportSize.width, viewportSize.height);
        return;
      }

      // Shift+2: Zoom to Selection
      if (e.shiftKey && (e.key === '@' || e.key === '2' || e.code === 'Digit2')) {
        e.preventDefault();
        zoomToSelection();
        return;
      }

      // Shift+R: Toggle Rulers
      if (e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        useCanvasStore.getState().toggleRulers();
        return;
      }

      // Tool shortcuts (V, H, R, O, I)
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        if (e.key === 'v' || e.key === 'V') {
          setActiveTool('select');
        } else if (e.key === 'h' || e.key === 'H') {
          setActiveTool('hand');
        } else if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          const boxDef = COMPONENT_CATALOG.find((c) => c.id === 'prim.div-box');
          if (boxDef) {
            const sel = useSelectionStore.getState();
            const res = insertComponentIntoDocument(boxDef, sel.primaryKey, 'inside');
            if (res.ok && res.insertedNodeId) sel.selectSingle(res.insertedNodeId);
          }
        } else if (e.key === 'o' || e.key === 'O') {
          e.preventDefault();
          const circleDef = {
            id: 'prim.circle',
            kind: 'primitive' as const,
            label: 'Ellipse',
            description: 'Circular container box',
            category: 'Layout' as const,
            rootTag: 'div',
            html: `<div class="vds-circle" style="width: 80px; height: 80px; border-radius: 50%; background: #0d99ff;"></div>`,
          };
          const sel = useSelectionStore.getState();
          const res = insertComponentIntoDocument(circleDef, sel.primaryKey, 'inside');
          if (res.ok && res.insertedNodeId) sel.selectSingle(res.insertedNodeId);
        } else if (e.key === 'i' || e.key === 'I') {
          if (typeof window !== 'undefined' && 'EyeDropper' in window) {
            e.preventDefault();
            const EyeDropperClass = (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
            const eyeDropper = new EyeDropperClass();
            const sel = useSelectionStore.getState();
            if (sel.primaryKey) {
              const ab = artboards[sel.artboardId || activeArtboardId];
              const abWidth = ab?.width ?? 1440;
              eyeDropper.open().then((res) => {
                useInspectorStore.getState().commitStyleProps(ab?.id || activeArtboardId, abWidth, sel.primaryKey!, {
                  'background-color': res.sRGBHex,
                });
              }).catch(() => {});
            }
          }
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.key === 'Alt') {
        useSelectionStore.getState().setAltPressed(false);
      }
      if (e.code === 'Space') {
        spacePressedRef.current = false;
        setIsPanning(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [
    activeArtboardId,
    artboards,
    setActiveTool,
    setIsPanning,
    viewportSize.height,
    viewportSize.width,
    zoomTo100,
    zoomToFitAll,
  ]);

  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    const isMiddleClick = e.button === 1;
    const shouldPan =
      isMiddleClick || activeTool === 'hand' || spacePressedRef.current;

    if (!shouldPan) return;

    e.preventDefault();
    setIsPanning(true);
    markGestureActive();

    let lastX = e.clientX;
    let lastY = e.clientY;

    const onPointerMove = (moveEv: PointerEvent): void => {
      const dx = moveEv.clientX - lastX;
      const dy = moveEv.clientY - lastY;
      lastX = moveEv.clientX;
      lastY = moveEv.clientY;
      panBy(dx, dy);
    };

    const onPointerUp = (): void => {
      if (!spacePressedRef.current) {
        setIsPanning(false);
      }
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const activeArtboard = artboards[activeArtboardId];
  const cursorClass = isPanning
    ? 'cursor-grabbing'
    : activeTool === 'hand'
      ? 'cursor-grab'
      : 'cursor-default';

  return (
    <main
      ref={stageRef}
      id="vds-canvas-stage"
      className={`vds-canvas-stage ${cursorClass}`}
      aria-label="Infinite Design Canvas"
      onPointerDown={handleStagePointerDown}
      style={{
        backgroundColor: canvasBgColor || '#f5f5f5',
        backgroundPosition: `${camera.x}px ${camera.y}px`,
        backgroundSize: `${Math.max(8, 24 * camera.zoom)}px ${Math.max(8, 24 * camera.zoom)}px`,
      }}
    >
      {/* WORLD TRANSFORM LAYER */}
      <div
        ref={worldRef}
        id="world"
        className="vds-canvas-world"
        style={{
          transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.zoom})`,
          willChange: isGestureActive ? 'transform' : 'auto',
        }}
      >
        {(canvasViewMode === 'single'
          ? [activeArtboardId || artboardOrder[0] || 'ab_desktop']
          : artboardOrder
        ).map((id) => {
          const ab = artboards[id];
          if (!ab) return null;
          return (
            <ArtboardFrame
              key={ab.id}
              artboard={ab}
              isActive={ab.id === activeArtboardId}
              interactMode={interactMode}
              zoom={camera.zoom}
            />
          );
        })}
      </div>

      {/* CANVAS RULERS (F006) */}
      <CanvasRulers
        viewportWidth={viewportSize.width}
        viewportHeight={viewportSize.height}
      />

      {/* FLOATING ZOOM & BREAKPOINT HUD (Bottom-Right per CANVAS-01 wireframe) */}
      <div className="vds-canvas-hud" role="region" aria-label="Canvas Zoom and Breakpoint Controls">
        <button
          type="button"
          className="vds-hud-btn"
          title="Zoom Out"
          onClick={() =>
            zoomAt(viewportSize.width / 2, viewportSize.height / 2, 1 / 1.25)
          }
        >
          <Minus size={13} />
        </button>

        <button
          type="button"
          className="vds-hud-zoom-pct"
          title="Reset Zoom to 100% (Ctrl+0)"
          onClick={() => zoomTo100(viewportSize.width, viewportSize.height)}
        >
          {Math.round(camera.zoom * 100)}%
        </button>

        <button
          type="button"
          className="vds-hud-btn"
          title="Zoom In"
          onClick={() =>
            zoomAt(viewportSize.width / 2, viewportSize.height / 2, 1.25)
          }
        >
          <Plus size={13} />
        </button>

        <div className="vds-hud-sep" />

        <button
          type="button"
          className="vds-hud-btn"
          title="Zoom to Fit All Artboards (Shift+1)"
          onClick={() => zoomToFitAll(viewportSize.width, viewportSize.height)}
        >
          <Maximize2 size={13} />
          <span>Fit</span>
        </button>

        <div className="vds-hud-sep" />

        <button
          type="button"
          className={`vds-hud-btn ${
            activeArtboard?.breakpointId === 'desktop' ? 'active' : ''
          }`}
          title="Focus Desktop 1440px Artboard"
          onClick={() =>
            activateOrSpawnBreakpoint(
              'desktop',
              viewportSize.width,
              viewportSize.height
            )
          }
        >
          <Monitor size={13} />
        </button>
        <button
          type="button"
          className={`vds-hud-btn ${
            activeArtboard?.breakpointId === 'tablet' ? 'active' : ''
          }`}
          title="Focus Tablet 768px Artboard"
          onClick={() =>
            activateOrSpawnBreakpoint(
              'tablet',
              viewportSize.width,
              viewportSize.height
            )
          }
        >
          <Tablet size={13} />
        </button>
        <button
          type="button"
          className={`vds-hud-btn ${
            activeArtboard?.breakpointId === 'mobile' ? 'active' : ''
          }`}
          title="Focus Mobile 375px Artboard"
          onClick={() =>
            activateOrSpawnBreakpoint(
              'mobile',
              viewportSize.width,
              viewportSize.height
            )
          }
        >
          <Smartphone size={13} />
        </button>

        <div className="vds-hud-sep" />

        <button
          type="button"
          className={`vds-hud-btn ${canvasViewMode === 'single' ? 'active' : ''}`}
          title="Toggle between Single Frame (Figma Mode) and Multi-Breakpoint side-by-side"
          onClick={() => setCanvasViewMode(canvasViewMode === 'single' ? 'all' : 'single')}
        >
          <span>{canvasViewMode === 'single' ? '⏹ Single (Figma)' : '☷ Multi-Frame'}</span>
        </button>

        <div className="vds-hud-sep" />

        <button
          type="button"
          className="vds-hud-btn"
          title="Add Custom Breakpoint Artboard"
          onClick={() => addCustomArtboard(1280, 'Laptop 1280')}
        >
          <PlusCircle size={13} />
          <span>+ Add</span>
        </button>
      </div>
    </main>
  );
}
