import React from 'react';
import {
  CornerLeftUp,
  Copy,
  Trash2,
  Type as TypeIcon,
  Component as SymbolIcon,
} from 'lucide-react';
import type { ArtboardDef, MeasuredRectItem, NodeId } from '../../engine/types';
import {
  useSelectionStore,
  type ResizeHandle,
  type SmartAlignmentGuide,
} from '../../store/selectionStore';
import { useCanvasStore } from '../../store/canvasStore';
import { useLayersStore } from '../../store/layersStore';
import { useInspectorStore } from '../../store/inspectorStore';
import { sandboxRegistry } from '../../engine/sandbox/iframeBridge';
import {
  resolveElementCascade,
  writeInlineStyleAttr,
} from '../../engine/css/cascadeEngine';
import {
  commitElementStyleMutations,
  deleteElementNode,
  duplicateElementNode,
  pxToUnit,
} from '../../engine/ast/htmlAst';
import { makeElementSymbol } from '../../engine/components/symbolSyncEngine';
import {
  CanvasSpacingSpots,
  FloatingRichTextToolbar,
} from './CanvasSpacingAndRichTextSpots';

/**
 * SelectionOverlay — Full implementation of CANVAS-02_SELECTION_BOUNDS.md
 * Renders inside each ArtboardFrame over the sandboxed iframe:
 * - F007: Hover highlight outline (1px light-blue) + `<tag.class>` chip
 * - F008: Single, Multi-select bounding box, and Marquee rectangle
 * - F009: Box-Model Tint Overlay (Orange margin 20%, Green padding 20%) + Parent dashed hint
 * - F010: 8-point Resize Handles with 60 FPS transient preview + unit-preserving CSS commit
 * - F011: Alt-hover red distance measurement lines + Smart alignment guides (snap threshold 4px/zoom)
 */

interface SelectionOverlayProps {
  artboard: ArtboardDef;
  zoom: number;
}

const RESIZE_HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const EMPTY_RECTS_MAP: Record<string, MeasuredRectItem> = {};

function formatNodeChip(item: MeasuredRectItem): string {
  const cls = item.classes.slice(0, 2).join('.');
  return cls ? `${item.tag}.${cls}` : item.tag;
}

export function SelectionOverlay({
  artboard,
  zoom,
}: SelectionOverlayProps): React.ReactElement | null {
  const rectsMap = useCanvasStore(
    (s) => s.measuredRects[artboard.id] ?? EMPTY_RECTS_MAP
  );
  const boxModelOverlayVisible = useCanvasStore((s) => s.boxModelOverlayVisible);
  const interactMode = useCanvasStore((s) => s.interactMode);

  const selectedKeys = useSelectionStore((s) => s.selectedKeys);
  const primaryKey = useSelectionStore((s) => s.primaryKey);
  const hoverKey = useSelectionStore((s) => s.hoverKey);
  const mode = useSelectionStore((s) => s.mode);
  const altPressed = useSelectionStore((s) => s.altPressed);
  const marquee = useSelectionStore((s) => s.marquee);
  const transientRectOverride = useSelectionStore((s) => s.transientRectOverride);
  const smartGuides = useSelectionStore((s) => s.smartGuides);
  const canvasDrag = useLayersStore((s) => s.canvasDrag);

  const selectParent = useSelectionStore((s) => s.selectParent);
  const selectSingle = useSelectionStore((s) => s.selectSingle);
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const setMode = useSelectionStore((s) => s.setMode);
  const startTextEditing = useSelectionStore((s) => s.startTextEditing);
  const setTransientRectOverride = useSelectionStore((s) => s.setTransientRectOverride);
  const setLastMutationInfo = useSelectionStore((s) => s.setLastMutationInfo);
  const getPrimaryVNode = useSelectionStore((s) => s.getPrimaryVNode);
  const getSourceUnitsForNode = useSelectionStore((s) => s.getSourceUnitsForNode);

  if (interactMode) return null;

  const getEffectiveBox = (id: NodeId): MeasuredRectItem | null => {
    const base = rectsMap[id];
    if (!base) return null;
    if (transientRectOverride && transientRectOverride.id === id) {
      return {
        ...base,
        border: {
          x: transientRectOverride.x,
          y: transientRectOverride.y,
          width: transientRectOverride.width,
          height: transientRectOverride.height,
        },
      };
    }
    return base;
  };

  const primaryBox = primaryKey ? getEffectiveBox(primaryKey) : null;
  const hoverBox =
    hoverKey && hoverKey !== primaryKey ? getEffectiveBox(hoverKey) : null;
  const parentBox =
    primaryBox?.parentId && rectsMap[primaryBox.parentId]
      ? rectsMap[primaryBox.parentId]
      : null;

  const handleResizePointerDown = (
    handle: ResizeHandle,
    e: React.PointerEvent<HTMLDivElement>
  ): void => {
    e.stopPropagation();
    e.preventDefault();
    if (!primaryBox || !primaryKey) return;

    const vnode = getPrimaryVNode(artboard.file);
    if (!vnode) return;

    const units = getSourceUnitsForNode(vnode);
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startX = primaryBox.border.x ?? 0;
    const startY = primaryBox.border.y ?? 0;
    const startW = Math.max(1, primaryBox.border.width ?? 100);
    const startH = Math.max(1, primaryBox.border.height ?? 40);
    const aspect = startW / startH;

    // Collect sibling boxes for Smart Guides snapping (F011: 4px / zoom threshold)
    const snapThreshold = 4 / zoom;
    const siblingBoxes = Object.values(rectsMap).filter(
      (it) => it.id !== primaryKey && it.parentId === primaryBox.parentId
    );

    setMode('resizing');

    let latestW = startW;
    let latestH = startH;
    let latestNextX = startX;
    let latestNextY = startY;
    let WidthTouched = false;
    let HeightTouched = false;

    const onPointerMove = (moveEv: PointerEvent): void => {
      const dx = (moveEv.clientX - startClientX) / zoom;
      const dy = (moveEv.clientY - startClientY) / zoom;
      const symFactor = moveEv.altKey ? 2 : 1;

      let nextX = startX;
      let nextY = startY;
      let nextW = startW;
      let nextH = startH;

      if (handle.includes('e')) {
        nextW = Math.max(1, startW + dx * symFactor);
        if (moveEv.altKey) nextX = startX - dx;
        WidthTouched = true;
      }
      if (handle.includes('w')) {
        nextW = Math.max(1, startW - dx * symFactor);
        nextX = startX + dx;
        WidthTouched = true;
      }
      if (handle.includes('s')) {
        nextH = Math.max(1, startH + dy * symFactor);
        if (moveEv.altKey) nextY = startY - dy;
        HeightTouched = true;
      }
      if (handle.includes('n')) {
        nextH = Math.max(1, startH - dy * symFactor);
        nextY = startY + dy;
        HeightTouched = true;
      }

      // Shift modifier locks aspect ratio
      if (moveEv.shiftKey) {
        if (WidthTouched && !HeightTouched) {
          nextH = Math.round(nextW / aspect);
          HeightTouched = true;
        } else if (HeightTouched && !WidthTouched) {
          nextW = Math.round(nextH * aspect);
          WidthTouched = true;
        } else {
          nextH = Math.round(nextW / aspect);
        }
      }

      // Smart Guides Snapping (F011)
      const activeGuides: SmartAlignmentGuide[] = [];
      const rightEdge = nextX + nextW;
      const bottomEdge = nextY + nextH;

      for (const sib of siblingBoxes) {
        const sx = sib.border.x ?? 0;
        const sy = sib.border.y ?? 0;
        const sw = sib.border.width ?? 0;
        const sh = sib.border.height ?? 0;

        if (WidthTouched && Math.abs(rightEdge - (sx + sw)) <= snapThreshold) {
          nextW = sx + sw - nextX;
          activeGuides.push({
            axis: 'x',
            pos: sx + sw,
            from: Math.min(nextY, sy),
            to: Math.max(nextY + nextH, sy + sh),
            label: `${Math.round(nextW)}px`,
          });
        } else if (WidthTouched && Math.abs(nextW - sw) <= snapThreshold) {
          nextW = sw;
          activeGuides.push({
            axis: 'x',
            pos: nextX + nextW,
            from: nextY,
            to: nextY + nextH,
            label: `Match W ${Math.round(sw)}px`,
          });
        }

        if (HeightTouched && Math.abs(bottomEdge - (sy + sh)) <= snapThreshold) {
          nextH = sy + sh - nextY;
          activeGuides.push({
            axis: 'y',
            pos: sy + sh,
            from: Math.min(nextX, sx),
            to: Math.max(nextX + nextW, sx + sw),
            label: `${Math.round(nextH)}px`,
          });
        }
      }

      latestW = Math.round(nextW);
      latestH = Math.round(nextH);
      latestNextX = nextX;
      latestNextY = nextY;

      setTransientRectOverride(
        {
          id: primaryKey,
          x: nextX,
          y: nextY,
          width: latestW,
          height: latestH,
        },
        activeGuides
      );

      // 60 FPS Transient Inline Layer:
      // When dragging West/North handles, counter-translate so the opposite edge stays 100% pinned!
      const offsetX = nextX - startX;
      const offsetY = nextY - startY;

      const transientStyle: Record<string, string> = {
        'box-sizing': 'border-box',
        'max-width': 'none',
        'max-height': 'none',
      };
      if (primaryBox.display === 'inline') {
        transientStyle.display = 'inline-block';
      }
      if (WidthTouched) {
        transientStyle.width = `${latestW}px`;
        transientStyle['min-width'] = `${latestW}px`;
      }
      if (HeightTouched) {
        transientStyle.height = `${latestH}px`;
        transientStyle['min-height'] = `${latestH}px`;
      }
      if (offsetX !== 0 || offsetY !== 0) {
        transientStyle.transform = `translate(${Math.round(offsetX)}px, ${Math.round(offsetY)}px)`;
      }
      sandboxRegistry.send(artboard.id, {
        t: 'transient',
        id: primaryKey,
        style: transientStyle,
      });
    };

    const onPointerUp = (): void => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);

      setTransientRectOverride(null, []);
      setMode('idle');

      if (!WidthTouched && !HeightTouched) {
        sandboxRegistry.send(artboard.id, {
          t: 'clearTransient',
          id: primaryKey,
          revert: true,
        });
        return;
      }

      const unitCtx = {
        parentWidth: primaryBox.parentWidth || artboard.width,
        rootFontSize: primaryBox.rootFontSize || 16,
        fontSize: primaryBox.fontSize || 16,
        vw: artboard.width,
        vh: artboard.measuredHeight,
      };

      const propsToCommit: Record<string, string> = {
        'box-sizing': 'border-box',
      };
      if (primaryBox.display === 'inline') {
        propsToCommit.display = 'inline-block';
      }
      if (WidthTouched) {
        propsToCommit.width = pxToUnit(latestW, units.width, unitCtx);
        propsToCommit['min-width'] = `${latestW}px`;
        propsToCommit['max-width'] = 'none';
      }
      if (HeightTouched) {
        propsToCommit.height = pxToUnit(latestH, units.height, unitCtx);
        propsToCommit['min-height'] = `${latestH}px`;
        propsToCommit['max-height'] = 'none';
      }

      const offsetX = latestNextX - startX;
      const offsetY = latestNextY - startY;

      if (offsetX !== 0 || offsetY !== 0) {
        const cascade = resolveElementCascade(primaryKey, artboard.width, null, artboard.file);
        const isAbs = cascade.declaredProps['position']?.raw === 'absolute';
        if (isAbs) {
          if (offsetX !== 0) propsToCommit.left = `${Math.round(startX + offsetX)}px`;
          if (offsetY !== 0) propsToCommit.top = `${Math.round(startY + offsetY)}px`;
        } else {
          const curLeft = parseFloat(cascade.declaredProps['left']?.raw || '0') || 0;
          const curTop = parseFloat(cascade.declaredProps['top']?.raw || '0') || 0;
          propsToCommit.position = 'relative';
          if (offsetX !== 0) propsToCommit.left = `${Math.round(curLeft + offsetX)}px`;
          if (offsetY !== 0) propsToCommit.top = `${Math.round(curTop + offsetY)}px`;
        }
      }

      // First clear transient preview cleanly, then broadcast permanent style attribute!
      sandboxRegistry.send(artboard.id, {
        t: 'clearTransient',
        id: primaryKey,
        revert: true,
      });

      // Write directly to the element's style attribute so it ALWAYS sticks and NEVER snaps back!
      writeInlineStyleAttr(vnode, propsToCommit);

      useInspectorStore.setState((s) => ({ inspectorRevision: s.inspectorRevision + 1 }));

      const summary = Object.entries(propsToCommit)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      setLastMutationInfo({
        selector: primaryBox.classes[0] ? `.${primaryBox.classes[0]}` : primaryBox.tag,
        propSummary: summary,
      });
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Compute Alt-distance measurement lines between primaryBox and hoverBox (F011)
  const renderAltMeasureLines = (): React.ReactNode => {
    if (!altPressed || !primaryBox || !hoverBox) return null;
    const ax = primaryBox.border.x ?? 0;
    const ay = primaryBox.border.y ?? 0;
    const aw = primaryBox.border.width ?? 0;
    const ah = primaryBox.border.height ?? 0;

    const bx = hoverBox.border.x ?? 0;
    const by = hoverBox.border.y ?? 0;
    const bw = hoverBox.border.width ?? 0;
    const bh = hoverBox.border.height ?? 0;

    const lines: Array<{ x1: number; y1: number; x2: number; y2: number; dist: number }> = [];

    // Horizontal gap
    if (ax + aw < bx) {
      const midY = (Math.max(ay, by) + Math.min(ay + ah, by + bh)) / 2;
      lines.push({ x1: ax + aw, y1: midY, x2: bx, y2: midY, dist: Math.round(bx - (ax + aw)) });
    } else if (bx + bw < ax) {
      const midY = (Math.max(ay, by) + Math.min(ay + ah, by + bh)) / 2;
      lines.push({ x1: bx + bw, y1: midY, x2: ax, y2: midY, dist: Math.round(ax - (bx + bw)) });
    }

    // Vertical gap
    if (ay + ah < by) {
      const midX = (Math.max(ax, bx) + Math.min(ax + aw, bx + bw)) / 2;
      lines.push({ x1: midX, y1: ay + ah, x2: midX, y2: by, dist: Math.round(by - (ay + ah)) });
    } else if (by + bh < ay) {
      const midX = (Math.max(ax, bx) + Math.min(ax + aw, bx + bw)) / 2;
      lines.push({ x1: midX, y1: by + bh, x2: midX, y2: ay, dist: Math.round(ay - (by + bh)) });
    }

    return lines.map((ln, idx) => (
      <g key={idx}>
        <line
          x1={ln.x1}
          y1={ln.y1}
          x2={ln.x2}
          y2={ln.y2}
          stroke="#ef4444"
          strokeWidth={1.5 / zoom}
        />
        <rect
          x={(ln.x1 + ln.x2) / 2 - 20 / zoom}
          y={(ln.y1 + ln.y2) / 2 - 9 / zoom}
          width={40 / zoom}
          height={18 / zoom}
          rx={3 / zoom}
          fill="#ef4444"
        />
        <text
          x={(ln.x1 + ln.x2) / 2}
          y={(ln.y1 + ln.y2) / 2 + 4 / zoom}
          fill="#ffffff"
          fontSize={10 / zoom}
          fontFamily="JetBrains Mono, monospace"
          textAnchor="middle"
        >
          {ln.dist}px
        </text>
      </g>
    ));
  };

  // Show Box-Model tint only when zoom >= 0.25 per CANVAS-01 §4 performance budget
  const showBoxModelTint = boxModelOverlayVisible && zoom >= 0.25 && primaryBox;

  const px = primaryBox?.border.x ?? 0;
  const py = primaryBox?.border.y ?? 0;
  const pw = primaryBox?.border.width ?? 0;
  const ph = primaryBox?.border.height ?? 0;

  const isInlineElement = primaryBox?.display === 'inline';

  return (
    <div className="vds-overlay-layer">
      {/* SVG GEOMETRY OVERLAY (Hover, Box-Model Tint, Parent Hint, Alt-Measure, Smart Guides) */}
      <svg
        className="vds-overlay-svg"
        width={artboard.width}
        height={
          artboard.heightMode === 'fixed'
            ? (artboard.fixedHeight ?? 900)
            : artboard.measuredHeight
        }
      >
        {/* PARENT CONTAINER DASHED HINT */}
        {parentBox && parentBox.id !== 'n_body' && (
          <rect
            x={parentBox.border.x ?? 0}
            y={parentBox.border.y ?? 0}
            width={parentBox.border.width ?? 0}
            height={parentBox.border.height ?? 0}
            fill="none"
            stroke="rgba(148, 163, 184, 0.45)"
            strokeWidth={1 / zoom}
            strokeDasharray={`${4 / zoom} ${4 / zoom}`}
          />
        )}

        {/* HOVER HIGHLIGHT (F007) */}
        {hoverBox && (
          <rect
            x={hoverBox.border.x ?? 0}
            y={hoverBox.border.y ?? 0}
            width={hoverBox.border.width ?? 0}
            height={hoverBox.border.height ?? 0}
            fill="rgba(56, 189, 248, 0.04)"
            stroke="#38bdf8"
            strokeWidth={1.25 / zoom}
          />
        )}

        {/* BOX-MODEL TINT OVERLAY (F009: Margin Orange 20%, Padding Green 20%) */}
        {showBoxModelTint && primaryBox && (
          <g>
            {/* Top Margin */}
            {primaryBox.margin.top > 0 && (
              <rect
                x={px}
                y={py - primaryBox.margin.top}
                width={pw}
                height={primaryBox.margin.top}
                fill="rgba(249, 115, 22, 0.22)"
              />
            )}
            {/* Bottom Margin */}
            {primaryBox.margin.bottom > 0 && (
              <rect
                x={px}
                y={py + ph}
                width={pw}
                height={primaryBox.margin.bottom}
                fill="rgba(249, 115, 22, 0.22)"
              />
            )}
            {/* Left Margin */}
            {primaryBox.margin.left > 0 && (
              <rect
                x={px - primaryBox.margin.left}
                y={py}
                width={primaryBox.margin.left}
                height={ph}
                fill="rgba(249, 115, 22, 0.22)"
              />
            )}
            {/* Right Margin */}
            {primaryBox.margin.right > 0 && (
              <rect
                x={px + pw}
                y={py}
                width={primaryBox.margin.right}
                height={ph}
                fill="rgba(249, 115, 22, 0.22)"
              />
            )}

            {/* Top Padding */}
            {primaryBox.padding.top > 0 && (
              <rect
                x={px}
                y={py}
                width={pw}
                height={primaryBox.padding.top}
                fill="rgba(34, 197, 94, 0.22)"
              />
            )}
            {/* Bottom Padding */}
            {primaryBox.padding.bottom > 0 && (
              <rect
                x={px}
                y={py + ph - primaryBox.padding.bottom}
                width={pw}
                height={primaryBox.padding.bottom}
                fill="rgba(34, 197, 94, 0.22)"
              />
            )}
            {/* Left Padding */}
            {primaryBox.padding.left > 0 && (
              <rect
                x={px}
                y={py + primaryBox.padding.top}
                width={primaryBox.padding.left}
                height={Math.max(
                  0,
                  ph - primaryBox.padding.top - primaryBox.padding.bottom
                )}
                fill="rgba(34, 197, 94, 0.22)"
              />
            )}
            {/* Right Padding */}
            {primaryBox.padding.right > 0 && (
              <rect
                x={px + pw - primaryBox.padding.right}
                y={py + primaryBox.padding.top}
                width={primaryBox.padding.right}
                height={Math.max(
                  0,
                  ph - primaryBox.padding.top - primaryBox.padding.bottom
                )}
                fill="rgba(34, 197, 94, 0.22)"
              />
            )}
          </g>
        )}

        {/* MULTI-SELECT SECONDARY OUTLINES */}
        {selectedKeys
          .filter((k) => k !== primaryKey)
          .map((k) => {
            const box = getEffectiveBox(k);
            if (!box) return null;
            return (
              <rect
                key={k}
                x={box.border.x ?? 0}
                y={box.border.y ?? 0}
                width={box.border.width ?? 0}
                height={box.border.height ?? 0}
                fill="rgba(13, 153, 255, 0.08)"
                stroke="#0d99ff"
                strokeWidth={1.25 / zoom}
              />
            );
          })}

        {/* PRIMARY SELECTION OUTLINE */}
        {primaryBox && (
          <rect
            x={px}
            y={py}
            width={pw}
            height={ph}
            fill="none"
            stroke="#0d99ff"
            strokeWidth={1.75 / zoom}
          />
        )}

        {/* SMART GUIDES (F011) */}
        {smartGuides.map((g, i) =>
          g.axis === 'x' ? (
            <line
              key={i}
              x1={g.pos}
              y1={g.from}
              x2={g.pos}
              y2={g.to}
              stroke="#f24e1e"
              strokeWidth={1.5 / zoom}
            />
          ) : (
            <line
              key={i}
              x1={g.from}
              y1={g.pos}
              x2={g.to}
              y2={g.pos}
              stroke="#f24e1e"
              strokeWidth={1.5 / zoom}
            />
          )
        )}

        {/* ALT-HOVER DISTANCE MEASUREMENTS */}
        {renderAltMeasureLines()}

        {/* MARQUEE SELECTION RECTANGLE (F008) */}
        {mode === 'marquee' && marquee && marquee.artboardId === artboard.id && (
          <rect
            x={Math.min(marquee.x0, marquee.x1)}
            y={Math.min(marquee.y0, marquee.y1)}
            width={Math.abs(marquee.x1 - marquee.x0)}
            height={Math.abs(marquee.y1 - marquee.y0)}
            fill="rgba(13, 153, 255, 0.12)"
            stroke="#0d99ff"
            strokeWidth={1 / zoom}
          />
        )}

        {/* CANVAS DRAG & DROP TARGET CONTAINER & INSERTION BAR (CANVAS-03) */}
        {canvasDrag &&
          canvasDrag.artboardId === artboard.id &&
          canvasDrag.dropSlot &&
          (() => {
            const slot = canvasDrag.dropSlot;
            const targetParentBox = rectsMap[slot.parentKey];
            const strokeColor = canvasDrag.valid ? '#0d99ff' : '#ef4444';
            return (
              <g>
                {targetParentBox && (
                  <rect
                    x={targetParentBox.border.x ?? 0}
                    y={targetParentBox.border.y ?? 0}
                    width={targetParentBox.border.width ?? 0}
                    height={targetParentBox.border.height ?? 0}
                    fill={
                      canvasDrag.valid
                        ? 'rgba(59, 130, 246, 0.05)'
                        : 'rgba(239, 68, 68, 0.06)'
                    }
                    stroke={strokeColor}
                    strokeWidth={1.5 / zoom}
                    strokeDasharray={`${5 / zoom} ${4 / zoom}`}
                  />
                )}
                {slot.indicator.kind === 'line' &&
                  (slot.indicator.orientation === 'h' ? (
                    <g>
                      <line
                        x1={slot.indicator.x}
                        y1={slot.indicator.y}
                        x2={slot.indicator.x + slot.indicator.length}
                        y2={slot.indicator.y}
                        stroke={strokeColor}
                        strokeWidth={2.5 / zoom}
                      />
                      <circle
                        cx={slot.indicator.x}
                        cy={slot.indicator.y}
                        r={4 / zoom}
                        fill={strokeColor}
                      />
                      <circle
                        cx={slot.indicator.x + slot.indicator.length}
                        cy={slot.indicator.y}
                        r={4 / zoom}
                        fill={strokeColor}
                      />
                    </g>
                  ) : (
                    <g>
                      <line
                        x1={slot.indicator.x}
                        y1={slot.indicator.y}
                        x2={slot.indicator.x}
                        y2={slot.indicator.y + slot.indicator.length}
                        stroke={strokeColor}
                        strokeWidth={2.5 / zoom}
                      />
                      <circle
                        cx={slot.indicator.x}
                        cy={slot.indicator.y}
                        r={4 / zoom}
                        fill={strokeColor}
                      />
                      <circle
                        cx={slot.indicator.x}
                        cy={slot.indicator.y + slot.indicator.length}
                        r={4 / zoom}
                        fill={strokeColor}
                      />
                    </g>
                  ))}
              </g>
            );
          })()}
      </svg>

      {/* CANVAS DRAG FLOATING STATUS BADGE (CANVAS-03 §1) */}
      {canvasDrag &&
        canvasDrag.artboardId === artboard.id &&
        canvasDrag.dropSlot && (
          <div
            className={`vds-drag-badge ${
              canvasDrag.valid ? 'is-valid' : 'is-invalid'
            }`}
            style={{
              left: `${canvasDrag.pointerArtboard.x + 12 / zoom}px`,
              top: `${canvasDrag.pointerArtboard.y + 12 / zoom}px`,
              transform: `scale(${Math.min(1 / zoom, 1.7)})`,
              transformOrigin: 'top left',
            }}
          >
            {canvasDrag.valid
              ? `${canvasDrag.copyMode ? 'Copy' : 'Move'} into ${
                  canvasDrag.dropSlot.parentLabel
                } · index ${canvasDrag.dropSlot.index}`
              : `⛔ ${canvasDrag.reason}`}
          </div>
        )}

      {/* HOVER CHIP LABEL */}
      {hoverBox && (
        <div
          className="vds-hover-chip"
          style={{
            left: `${hoverBox.border.x ?? 0}px`,
            top: `${Math.max(0, (hoverBox.border.y ?? 0) - 20 / zoom)}px`,
            transform: `scale(${Math.min(1 / zoom, 1.8)})`,
            transformOrigin: 'bottom left',
          }}
        >
          {formatNodeChip(hoverBox)}
        </div>
      )}

      {/* PRIMARY SELECTION CHIP, 8 RESIZE HANDLES & CONTEXT FLOATING BAR */}
      {primaryBox && mode !== 'textEditing' && (
        <div
          className="vds-selection-frame"
          style={{
            left: `${px}px`,
            top: `${py}px`,
            width: `${pw}px`,
            height: `${ph}px`,
          }}
        >
          {/* TAG.CLASS + DIMENSIONS CHIP */}
          <div
            className="vds-selection-chip"
            style={{
              transform: `scale(${Math.min(1 / zoom, 1.8)})`,
              transformOrigin: 'bottom left',
            }}
          >
            <strong>{formatNodeChip(primaryBox)}</strong>
            <span>
              {Math.round(pw)} × {Math.round(ph)}
            </span>
          </div>

          {/* FLOATING CONTEXT TOOLBAR (Select Parent, Edit Text, Duplicate, Delete) */}
          <div
            className="vds-context-toolbar"
            style={{
              transform: `scale(${Math.min(1 / zoom, 1.6)})`,
              transformOrigin: 'bottom right',
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="vds-ctx-btn"
              title="Select Parent (Esc / Shift+Enter)"
              onClick={selectParent}
            >
              <CornerLeftUp size={12} />
            </button>
            <button
              type="button"
              className="vds-ctx-btn"
              title="Inline Edit Text (Double-click)"
              onClick={() => {
                startTextEditing(primaryBox.id);
                sandboxRegistry.send(artboard.id, {
                  t: 'startInlineEdit',
                  id: primaryBox.id,
                });
              }}
            >
              <TypeIcon size={12} />
            </button>
            <button
              type="button"
              className="vds-ctx-btn"
              title="Create / Sync Reusable Symbol Across Pages"
              style={{ color: '#a78bfa' }}
              onClick={() => {
                makeElementSymbol(artboard.file, primaryBox.id);
                useLayersStore.getState().bumpRevision();
                useInspectorStore.getState().bumpInspector();
              }}
            >
              <SymbolIcon size={12} />
            </button>
            <button
              type="button"
              className="vds-ctx-btn"
              title="Duplicate Element (Ctrl+D)"
              onClick={() => {
                const clonedId = duplicateElementNode(artboard.file, primaryBox.id);
                if (clonedId) selectSingle(clonedId, artboard.id);
              }}
            >
              <Copy size={12} />
            </button>
            <button
              type="button"
              className="vds-ctx-btn vds-ctx-danger"
              title="Delete Element (Delete / Backspace)"
              onClick={() => {
                if (deleteElementNode(artboard.file, primaryBox.id)) {
                  clearSelection();
                }
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>

          {/* ON-CANVAS PADDING & FLEX/GRID GAP DRAG HANDLES */}
          {!isInlineElement && (
            <CanvasSpacingSpots
              artboard={artboard}
              primaryBox={primaryBox}
              zoom={zoom}
            />
          )}

          {/* 8-POINT RESIZE HANDLES (F010) */}
          {!isInlineElement &&
            RESIZE_HANDLES.map((h) => (
              <div
                key={h}
                className={`vds-resize-handle handle-${h}`}
                style={{
                  transform: `scale(${1 / zoom})`,
                }}
                title={`Resize (${h.toUpperCase()}) — Shift: Lock Aspect, Alt: Symmetric`}
                onPointerDown={(e) => handleResizePointerDown(h, e)}
              />
            ))}
        </div>
      )}

      {/* FLOATING RICH-TEXT FORMATTING MINI-TOOLBAR (GrapesJS RichTextEditor UX) */}
      {primaryBox && mode === 'textEditing' && (
        <FloatingRichTextToolbar
          artboardId={artboard.id}
          primaryBox={primaryBox}
          zoom={zoom}
        />
      )}
    </div>
  );
}
