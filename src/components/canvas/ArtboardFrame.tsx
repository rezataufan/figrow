import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Monitor, Tablet, Smartphone, Lock, Unlock, Trash2 } from 'lucide-react';
import type { ArtboardDef } from '../../engine/types';
import { sandboxRegistry } from '../../engine/sandbox/iframeBridge';
import { projectDoc } from '../../engine/doc/projectDoc';
import { useCanvasStore } from '../../store/canvasStore';
import { useSelectionStore } from '../../store/selectionStore';
import { useLayersStore } from '../../store/layersStore';
import { useInspectorStore } from '../../store/inspectorStore';
import {
  resolveElementCascade,
  writeInlineStyleAttr,
} from '../../engine/css/cascadeEngine';
import { parseHtmlToVNodes } from '../../engine/ast/htmlAst';
import { SelectionOverlay } from './SelectionOverlay';

interface ArtboardFrameProps {
  artboard: ArtboardDef;
  isActive: boolean;
  interactMode: boolean;
  zoom: number;
}

export function ArtboardFrame({
  artboard,
  isActive,
  interactMode,
  zoom,
}: ArtboardFrameProps): React.ReactElement {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const hitRafRef = useRef<number | null>(null);

  const [isResizingWidth, setIsResizingWidth] = useState(false);
  const [isEditingWidth, setIsEditingWidth] = useState(false);
  const [widthInput, setWidthInput] = useState(String(artboard.width));

  const activeTool = useCanvasStore((s) => s.activeTool);
  const isPanning = useCanvasStore((s) => s.isPanning);
  const setActiveArtboard = useCanvasStore((s) => s.setActiveArtboard);
  const setArtboardWidth = useCanvasStore((s) => s.setArtboardWidth);
  const toggleArtboardHeightMode = useCanvasStore((s) => s.toggleArtboardHeightMode);
  const removeArtboard = useCanvasStore((s) => s.removeArtboard);
  const artboardCount = useCanvasStore((s) => s.artboardOrder.length);
  const allGuides = useCanvasStore((s) => s.guides);
  const guides = useMemo(
    () => allGuides.filter((g) => g.artboardId === artboard.id),
    [allGuides, artboard.id]
  );
  const removeGuide = useCanvasStore((s) => s.removeGuide);

  const selectionMode = useSelectionStore((s) => s.mode);
  const setHoverKey = useSelectionStore((s) => s.setHoverKey);
  const startMarquee = useSelectionStore((s) => s.startMarquee);
  const updateMarquee = useSelectionStore((s) => s.updateMarquee);
  const finishMarquee = useSelectionStore((s) => s.finishMarquee);
  const startTextEditing = useSelectionStore((s) => s.startTextEditing);

  useEffect(() => {
    setWidthInput(String(artboard.width));
  }, [artboard.width]);

  // Register iframe with the MessageChannel sandbox bridge
  useEffect(() => {
    const iframeEl = iframeRef.current;
    if (!iframeEl) return;

    const html = projectDoc.getFileText(artboard.file);
    const sheets = projectDoc.getStyleSheets();

    sandboxRegistry.registerArtboard(artboard.id, iframeEl, {
      t: 'load',
      html,
      sheets,
      mode: 'design',
    });

    return () => {
      sandboxRegistry.unregisterArtboard(artboard.id);
    };
  }, [artboard.id, artboard.file]);

  // Sync frozen lifecycle (F005)
  useEffect(() => {
    sandboxRegistry.setArtboardFrozen(artboard.id, artboard.lifecycle === 'frozen');
  }, [artboard.id, artboard.lifecycle]);

  const toArtboardCoords = (clientX: number, clientY: number): { x: number; y: number } => {
    const el = bodyRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / zoom,
      y: (clientY - rect.top) / zoom,
    };
  };

  // Throttled Hover Hit-Test (1 per animation frame per CANVAS-02 §4)
  const handleBodyPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (interactMode || activeTool === 'hand' || isPanning || selectionMode !== 'idle') {
      return;
    }
    const { x, y } = toArtboardCoords(e.clientX, e.clientY);
    if (hitRafRef.current !== null) return;
    hitRafRef.current = window.requestAnimationFrame(() => {
      hitRafRef.current = null;
      sandboxRegistry.send(artboard.id, {
        t: 'hitTest',
        x,
        y,
        deep: e.ctrlKey || e.metaKey,
      });
    });
  };

  const handleBodyPointerLeave = (): void => {
    if (selectionMode === 'idle') {
      setHoverKey(null);
    }
  };

  // Click Selection, Drag Reorder (CANVAS-03), or Drag Marquee Selection (F008)
  const handleBodyPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (interactMode || activeTool === 'hand' || isPanning || e.button !== 0) {
      return;
    }
    if (selectionMode === 'textEditing') {
      return;
    }

    e.stopPropagation();
    setActiveArtboard(artboard.id);

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startPt = toArtboardCoords(e.clientX, e.clientY);
    const modifiers = {
      ctrlOrMeta: e.ctrlKey || e.metaKey,
      shift: e.shiftKey,
      alt: e.altKey,
    };

    const selStateAtStart = useSelectionStore.getState();
    const currentPrimary = selStateAtStart.primaryKey;
    const hoverAtStart = selStateAtStart.hoverKey;
    const hoverPathAtStart = selStateAtStart.hoverPath;
    const rectsMapAtStart = useCanvasStore.getState().measuredRects[artboard.id] ?? {};
    const layersStore = useLayersStore.getState();

    const currentDisplayHeight =
      artboard.heightMode === 'fixed'
        ? (artboard.fixedHeight ?? 900)
        : artboard.measuredHeight;

    // Determine target candidate for dragging:
    // 1. Primary if clicked inside its bounds and not locked / not full-page wrapper
    // 2. Otherwise hoverAtStart if hovered and not locked / not full-page wrapper
    let targetDragKey: string | null = null;

    if (currentPrimary && currentPrimary !== 'n_body' && currentPrimary !== 'n_main') {
      const pBox = rectsMapAtStart[currentPrimary];
      const isLocked = layersStore.isNodeLocked(currentPrimary, artboard.file);
      const isFull =
        pBox &&
        (pBox.border.width ?? 0) >= artboard.width * 0.95 &&
        (pBox.border.height ?? 0) >= currentDisplayHeight * 0.95;
      if (
        pBox &&
        !isLocked &&
        !isFull &&
        startPt.x >= (pBox.border.x ?? 0) &&
        startPt.x <= (pBox.border.x ?? 0) + (pBox.border.width ?? 0) &&
        startPt.y >= (pBox.border.y ?? 0) &&
        startPt.y <= (pBox.border.y ?? 0) + (pBox.border.height ?? 0)
      ) {
        targetDragKey = currentPrimary;
      }
    }

    if (!targetDragKey && hoverAtStart && hoverAtStart !== 'n_body' && hoverAtStart !== 'n_main') {
      const hBox = rectsMapAtStart[hoverAtStart];
      const isLocked = layersStore.isNodeLocked(hoverAtStart, artboard.file);
      const isFull =
        hBox &&
        (hBox.border.width ?? 0) >= artboard.width * 0.95 &&
        (hBox.border.height ?? 0) >= currentDisplayHeight * 0.95;
      if (hBox && !isLocked && !isFull) {
        targetDragKey = hoverAtStart;
      }
    }

    const dragBox = targetDragKey ? rectsMapAtStart[targetDragKey] : null;

    let movedBeyondThreshold = false;
    let isDraggingElement = false;
    let dragDx = 0;
    let dragDy = 0;

    const onPointerMove = (moveEv: PointerEvent): void => {
      const dist = Math.hypot(moveEv.clientX - startClientX, moveEv.clientY - startClientY);
      const curPt = toArtboardCoords(moveEv.clientX, moveEv.clientY);

      if (!movedBeyondThreshold && dist > 3) {
        movedBeyondThreshold = true;
        if (targetDragKey && dragBox) {
          isDraggingElement = true;
          useSelectionStore.getState().selectSingle(targetDragKey, artboard.id);
          layersStore.startCanvasDrag(
            targetDragKey,
            artboard.id,
            moveEv.clientX,
            moveEv.clientY,
            curPt.x,
            curPt.y
          );
        } else {
          startMarquee(artboard.id, startPt.x, startPt.y);
        }
      }

      if (movedBeyondThreshold) {
        // AutoScroller (GrapesJS AutoScroller pattern): smoothly pan camera when dragging near stage edge
        const stageEl = document.getElementById('vds-canvas-stage');
        if (stageEl) {
          const sr = stageEl.getBoundingClientRect();
          const edgeThreshold = 42;
          let panX = 0;
          let panY = 0;
          if (moveEv.clientY < sr.top + edgeThreshold && moveEv.clientY >= sr.top) {
            panY = 8;
          } else if (moveEv.clientY > sr.bottom - edgeThreshold && moveEv.clientY <= sr.bottom) {
            panY = -8;
          }
          if (moveEv.clientX < sr.left + edgeThreshold && moveEv.clientX >= sr.left) {
            panX = 8;
          } else if (moveEv.clientX > sr.right - edgeThreshold && moveEv.clientX <= sr.right) {
            panX = -8;
          }
          if (panX !== 0 || panY !== 0) {
            useCanvasStore.getState().panBy(panX, panY);
          }
        }

        const rectsMap = useCanvasStore.getState().measuredRects[artboard.id] ?? {};
        if (isDraggingElement && targetDragKey && dragBox) {
          dragDx = curPt.x - startPt.x;
          dragDy = curPt.y - startPt.y;

          // 60 FPS Transient live preview of the dragged element in the iframe
          sandboxRegistry.send(artboard.id, {
            t: 'transient',
            id: targetDragKey,
            style: {
              transform: `translate(${Math.round(dragDx)}px, ${Math.round(dragDy)}px)`,
              opacity: '0.85',
              'pointer-events': 'none',
              'z-index': '9999',
            },
          });

          // Move the blue selection bounding box live with the pointer
          useSelectionStore.getState().setTransientRectOverride({
            id: targetDragKey,
            x: (dragBox.border.x ?? 0) + dragDx,
            y: (dragBox.border.y ?? 0) + dragDy,
            width: dragBox.border.width ?? 0,
            height: dragBox.border.height ?? 0,
          });

          // Update layers dropSlot reorder calculation
          layersStore.updateCanvasDrag(
            artboard.id,
            moveEv.clientX,
            moveEv.clientY,
            curPt.x,
            curPt.y,
            rectsMap,
            { alt: moveEv.altKey, shift: moveEv.shiftKey },
            artboard.file
          );
        } else {
          updateMarquee(curPt.x, curPt.y, rectsMap);
        }
      }
    };

    const onPointerUp = (upEv: PointerEvent): void => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);

      if (movedBeyondThreshold) {
        if (isDraggingElement && targetDragKey && dragBox) {
          const drag = useLayersStore.getState().canvasDrag;
          const tree = parseHtmlToVNodes(artboard.file, projectDoc.getFileText(artboard.file));
          const sourceNode = tree.nodes[targetDragKey];

          // Reorder on canvas is ONLY allowed when explicitly holding Alt or Shift.
          // Standard dragging on canvas is 100% pure Figma-style free movement (never swaps DOM nodes)!
          const allowCanvasReorder = Boolean(drag && (upEv.altKey || upEv.shiftKey));
          const hasSiblingDrop =
            allowCanvasReorder &&
            drag &&
            drag.dropSlot &&
            drag.valid &&
            sourceNode &&
            drag.dropSlot.parentKey === sourceNode.parent;

          // First restore transient drag overlay properties cleanly before committing permanent styles
          sandboxRegistry.send(artboard.id, {
            t: 'clearTransient',
            id: targetDragKey,
            revert: true,
          });
          useSelectionStore.getState().setTransientRectOverride(null);

          if (hasSiblingDrop) {
            const finalKey = useLayersStore.getState().commitCanvasDrop(artboard.file);
            if (finalKey) {
              useSelectionStore.getState().selectSingle(finalKey, artboard.id);
            }
          } else {
            // Dragged to a new position on canvas (Figma-like free position move)
            useLayersStore.getState().cancelCanvasDrag();

            if (Math.hypot(dragDx, dragDy) > 3) {
              const cascade = resolveElementCascade(targetDragKey, artboard.width, null, artboard.file);
              const isAbs = cascade.declaredProps['position']?.raw === 'absolute';
              const curLeft = parseFloat(cascade.declaredProps['left']?.raw || '0') || 0;
              const curTop = parseFloat(cascade.declaredProps['top']?.raw || '0') || 0;

              const propsToCommit: Record<string, string> = {};
              if (isAbs) {
                propsToCommit.left = `${Math.round(curLeft + dragDx)}px`;
                propsToCommit.top = `${Math.round(curTop + dragDy)}px`;
              } else {
                propsToCommit.position = 'relative';
                propsToCommit.left = `${Math.round(curLeft + dragDx)}px`;
                propsToCommit.top = `${Math.round(curTop + dragDy)}px`;
              }

              const nodeToWrite = sourceNode ?? cascade.vnode;
              if (nodeToWrite) {
                writeInlineStyleAttr(nodeToWrite, propsToCommit);
              }
            }
          }

          useInspectorStore.setState((s) => ({ inspectorRevision: s.inspectorRevision + 1 }));
        } else {
          finishMarquee();
        }
        return;
      }

      // Perform immediate hit-based selection prioritizing live elementsFromPoint hover hit
      const rectsMap = useCanvasStore.getState().measuredRects[artboard.id] ?? {};
      const layersStore = useLayersStore.getState();
      const liveSel = useSelectionStore.getState();
      const activeHover = liveSel.hoverKey ?? hoverAtStart;
      const activeHoverPath =
        liveSel.hoverPath.length > 0 ? liveSel.hoverPath : hoverPathAtStart;

      let hitPath: string[] = [];

      if (
        activeHover &&
        activeHover !== 'n_body' &&
        !layersStore.isNodeLocked(activeHover, artboard.file)
      ) {
        if (activeHoverPath.length > 0) {
          hitPath = activeHoverPath.filter(
            (id) => id !== 'n_body' && !layersStore.isNodeLocked(id, artboard.file)
          );
        } else {
          let curId: string | null = activeHover;
          const visited = new Set<string>();
          while (curId && curId !== 'n_body' && !visited.has(curId)) {
            visited.add(curId);
            if (!layersStore.isNodeLocked(curId, artboard.file)) {
              hitPath.push(curId);
            }
            curId = rectsMap[curId]?.parentId ?? null;
          }
        }
      }

      if (hitPath.length === 0) {
        const hitCandidates = Object.values(rectsMap).filter((item) => {
          if (item.id === 'n_body') return false;
          if (layersStore.isNodeLocked(item.id, artboard.file)) return false;
          const bx = item.border.x ?? 0;
          const by = item.border.y ?? 0;
          const bw = item.border.width ?? 0;
          const bh = item.border.height ?? 0;
          if (bw <= 0 || bh <= 0) return false;
          return (
            startPt.x >= bx &&
            startPt.x <= bx + bw &&
            startPt.y >= by &&
            startPt.y <= by + bh
          );
        });

        hitCandidates.sort((a, b) => {
          const areaA = (a.border.width ?? 0) * (a.border.height ?? 0);
          const areaB = (b.border.width ?? 0) * (b.border.height ?? 0);
          return areaA - areaB;
        });

        const deepest = hitCandidates[0];
        if (deepest) {
          let curId: string | null = deepest.id;
          const visited = new Set<string>();
          while (curId && curId !== 'n_body' && !visited.has(curId)) {
            visited.add(curId);
            if (!layersStore.isNodeLocked(curId, artboard.file)) {
              hitPath.push(curId);
            }
            curId = rectsMap[curId]?.parentId ?? null;
          }
        }
      }

      useSelectionStore.getState().selectProgressive(hitPath, artboard.id, modifiers);
      const nextPrimary = useSelectionStore.getState().primaryKey;
      if (nextPrimary) {
        layersStore.expandAncestorsOf(nextPrimary, artboard.file);
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Double-click element to enter inline text editing (CANVAS-02 §1 & §4)
  const handleBodyDoubleClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (interactMode) return;
    e.stopPropagation();
    const sel = useSelectionStore.getState();
    const targetKey = sel.hoverKey ?? sel.primaryKey;
    if (!targetKey || targetKey === 'n_body') return;
    startTextEditing(targetKey);
    sandboxRegistry.send(artboard.id, {
      t: 'startInlineEdit',
      id: targetKey,
    });
  };

  const handleRightEdgePointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.stopPropagation();
    e.preventDefault();
    setActiveArtboard(artboard.id);
    setIsResizingWidth(true);

    const startX = e.clientX;
    const startW = artboard.width;

    const onPointerMove = (moveEv: PointerEvent): void => {
      const deltaWorld = (moveEv.clientX - startX) / zoom;
      setArtboardWidth(artboard.id, startW + deltaWorld);
    };

    const onPointerUp = (): void => {
      setIsResizingWidth(false);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const commitWidthInput = (): void => {
    setIsEditingWidth(false);
    const parsed = parseInt(widthInput, 10);
    if (Number.isFinite(parsed)) {
      setArtboardWidth(artboard.id, parsed);
    } else {
      setWidthInput(String(artboard.width));
    }
  };

  const displayHeight =
    artboard.heightMode === 'fixed'
      ? (artboard.fixedHeight ?? 900)
      : artboard.measuredHeight;

  const BpIcon =
    artboard.width >= 1024 ? Monitor : artboard.width >= 768 ? Tablet : Smartphone;

  const allowIframePointer =
    (interactMode && isActive) || (selectionMode === 'textEditing' && isActive);

  return (
    <div
      className={`vds-artboard ${isActive ? 'is-active' : ''} ${
        artboard.lifecycle === 'frozen' ? 'is-frozen' : ''
      }`}
      style={{
        transform: `translate3d(${artboard.worldX}px, ${artboard.worldY}px, 0)`,
        width: `${artboard.width}px`,
      }}
      onPointerDown={() => setActiveArtboard(artboard.id)}
    >
      {/* ARTBOARD HEADER */}
      <div
        className="vds-artboard-header"
        style={{
          transform: `scale(${Math.min(1 / zoom, 2.2)})`,
          transformOrigin: 'bottom left',
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setIsEditingWidth(true);
        }}
      >
        <BpIcon size={13} />
        <span className="vds-artboard-file">{artboard.file}</span>
        <span className="vds-artboard-sep">—</span>
        <span className="vds-artboard-label">{artboard.label}</span>

        {isEditingWidth ? (
          <input
            className="vds-artboard-width-input"
            type="number"
            min={240}
            max={4096}
            value={widthInput}
            autoFocus
            onChange={(e) => setWidthInput(e.target.value)}
            onBlur={commitWidthInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitWidthInput();
              if (e.key === 'Escape') {
                setWidthInput(String(artboard.width));
                setIsEditingWidth(false);
              }
            }}
          />
        ) : (
          <span
            className="vds-artboard-dims"
            title="Double-click to set exact viewport width"
          >
            {artboard.width} × {displayHeight}px
          </span>
        )}

        <button
          type="button"
          className="vds-artboard-icon-btn"
          title={
            artboard.heightMode === 'content'
              ? 'Height: Auto Content (Click for Fixed 100vh Mode)'
              : 'Height: Fixed Viewport (Click for Auto Content)'
          }
          onClick={(e) => {
            e.stopPropagation();
            toggleArtboardHeightMode(artboard.id);
          }}
        >
          {artboard.heightMode === 'fixed' ? <Lock size={12} /> : <Unlock size={12} />}
        </button>

        {artboardCount > 1 && (
          <button
            type="button"
            className="vds-artboard-icon-btn"
            title="Remove Artboard"
            onClick={(e) => {
              e.stopPropagation();
              removeArtboard(artboard.id);
            }}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {/* ARTBOARD BODY + SANDBOX IFRAME + SELECTION OVERLAY */}
      <div
        ref={bodyRef}
        className="vds-artboard-body"
        style={{
          width: `${artboard.width}px`,
          height: `${displayHeight}px`,
        }}
        onPointerMove={handleBodyPointerMove}
        onPointerLeave={handleBodyPointerLeave}
        onPointerDown={handleBodyPointerDown}
        onDoubleClick={handleBodyDoubleClick}
      >
        <iframe
          ref={iframeRef}
          title={`${artboard.file} @ ${artboard.label}`}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
          className="vds-artboard-iframe"
          style={{
            width: `${artboard.width}px`,
            height: `${displayHeight}px`,
            pointerEvents: allowIframePointer ? 'auto' : 'none',
            display: artboard.lifecycle === 'frozen' ? 'none' : 'block',
          }}
        />

        {artboard.lifecycle === 'frozen' && (
          <div className="vds-artboard-frozen-placeholder">
            <span>Frozen Offscreen Artboard ({artboard.width}px)</span>
          </div>
        )}

        {/* SELECTION, HOVER, BOX-MODEL & RESIZE HANDLES OVERLAY (CANVAS-02) */}
        <SelectionOverlay artboard={artboard} zoom={zoom} />

        {/* DRAGGABLE GUIDES OVERLAY (F006) */}
        {guides.map((g) =>
          g.axis === 'x' ? (
            <div
              key={g.id}
              className="vds-guide vds-guide-x"
              style={{ left: `${g.pos}px` }}
              title={`Guide X: ${g.pos}px (Double-click to remove)`}
              onDoubleClick={(e) => {
                e.stopPropagation();
                removeGuide(g.id);
              }}
            >
              <span className="vds-guide-badge">{g.pos}px</span>
            </div>
          ) : (
            <div
              key={g.id}
              className="vds-guide vds-guide-y"
              style={{ top: `${g.pos}px` }}
              title={`Guide Y: ${g.pos}px (Double-click to remove)`}
              onDoubleClick={(e) => {
                e.stopPropagation();
                removeGuide(g.id);
              }}
            >
              <span className="vds-guide-badge">{g.pos}px</span>
            </div>
          )
        )}

        {/* LIVE WIDTH RESIZE HANDLE */}
        <div
          className={`vds-artboard-resize-e ${isResizingWidth ? 'is-dragging' : ''}`}
          title="Drag to test responsive media queries live"
          onPointerDown={handleRightEdgePointerDown}
        />

        {isResizingWidth && (
          <div className="vds-artboard-live-badge">{artboard.width}px</div>
        )}
      </div>
    </div>
  );
}
