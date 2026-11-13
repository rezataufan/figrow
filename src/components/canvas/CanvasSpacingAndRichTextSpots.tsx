import React, { useState } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Code,
  Link as LinkIcon,
  RemoveFormatting,
  Check,
} from 'lucide-react';
import type { ArtboardDef, MeasuredRectItem } from '../../engine/types';
import { sandboxRegistry } from '../../engine/sandbox/iframeBridge';
import { useInspectorStore } from '../../store/inspectorStore';
import { useSelectionStore } from '../../store/selectionStore';

/**
 * Modular Canvas Spots for Spacing (Padding & Flex/Grid Gap scrubbing on canvas)
 * and Floating Rich-Text Formatting Mini-Toolbar.
 * Inspired by GrapesJS `CanvasSpot` (`Spacing` & `RichTextEditor`) + Figma Auto-Layout handles.
 */

interface CanvasSpacingSpotsProps {
  artboard: ArtboardDef;
  primaryBox: MeasuredRectItem;
  zoom: number;
}

type PaddingSide = 'top' | 'right' | 'bottom' | 'left';

export function CanvasSpacingSpots({
  artboard,
  primaryBox,
  zoom,
}: CanvasSpacingSpotsProps): React.ReactElement | null {
  const [activeScrubLabel, setActiveScrubLabel] = useState<string | null>(null);

  const previewTransientStyle = useInspectorStore((s) => s.previewTransientStyle);
  const commitStyleProps = useInspectorStore((s) => s.commitStyleProps);
  const setHighlightedBoxSide = useInspectorStore((s) => s.setHighlightedBoxSide);

  const pw = primaryBox.border.width ?? 0;
  const ph = primaryBox.border.height ?? 0;

  if (pw < 36 || ph < 24) return null;

  const isFlexOrGrid =
    primaryBox.display.includes('flex') || primaryBox.display.includes('grid');

  const handlePaddingPointerDown = (
    side: PaddingSide,
    e: React.PointerEvent<HTMLDivElement>
  ): void => {
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const startPad = Math.max(0, Math.round(primaryBox.padding[side] ?? 0));
    let latestVal = startPad;

    setHighlightedBoxSide(`padding-${side}`);
    setActiveScrubLabel(`Pad ${side}: ${startPad}px`);

    const onMove = (moveEv: PointerEvent): void => {
      const dx = (moveEv.clientX - startX) / zoom;
      const dy = (moveEv.clientY - startY) / zoom;

      let delta = 0;
      if (side === 'top') delta = dy;
      else if (side === 'bottom') delta = -dy;
      else if (side === 'left') delta = dx;
      else if (side === 'right') delta = -dx;

      latestVal = Math.max(0, Math.round(startPad + delta));
      const valPx = `${latestVal}px`;

      if (moveEv.shiftKey) {
        setActiveScrubLabel(`Padding (All): ${valPx}`);
        previewTransientStyle(artboard.id, primaryBox.id, {
          'padding-top': valPx,
          'padding-right': valPx,
          'padding-bottom': valPx,
          'padding-left': valPx,
        });
      } else if (moveEv.altKey) {
        if (side === 'top' || side === 'bottom') {
          setActiveScrubLabel(`Pad Y: ${valPx}`);
          previewTransientStyle(artboard.id, primaryBox.id, {
            'padding-top': valPx,
            'padding-bottom': valPx,
          });
        } else {
          setActiveScrubLabel(`Pad X: ${valPx}`);
          previewTransientStyle(artboard.id, primaryBox.id, {
            'padding-left': valPx,
            'padding-right': valPx,
          });
        }
      } else {
        setActiveScrubLabel(`Pad ${side}: ${valPx}`);
        previewTransientStyle(artboard.id, primaryBox.id, {
          [`padding-${side}`]: valPx,
        });
      }
    };

    const onUp = (upEv: PointerEvent): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setHighlightedBoxSide(null);
      setActiveScrubLabel(null);

      const valPx = `${latestVal}px`;
      if (upEv.shiftKey) {
        commitStyleProps(artboard.id, artboard.width, primaryBox.id, {
          'padding-top': valPx,
          'padding-right': valPx,
          'padding-bottom': valPx,
          'padding-left': valPx,
        });
      } else if (upEv.altKey) {
        if (side === 'top' || side === 'bottom') {
          commitStyleProps(artboard.id, artboard.width, primaryBox.id, {
            'padding-top': valPx,
            'padding-bottom': valPx,
          });
        } else {
          commitStyleProps(artboard.id, artboard.width, primaryBox.id, {
            'padding-left': valPx,
            'padding-right': valPx,
          });
        }
      } else {
        commitStyleProps(artboard.id, artboard.width, primaryBox.id, {
          [`padding-${side}`]: valPx,
        });
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleGapPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const startGap = Math.max(0, Math.round(primaryBox.gap ?? 0));
    const isColumn = (primaryBox.flexDirection ?? '').includes('column');
    let latestGap = startGap;

    setActiveScrubLabel(`Gap: ${startGap}px`);

    const onMove = (moveEv: PointerEvent): void => {
      const delta = isColumn
        ? (moveEv.clientY - startY) / zoom
        : (moveEv.clientX - startX) / zoom;
      latestGap = Math.max(0, Math.round(startGap + delta));
      setActiveScrubLabel(`Gap: ${latestGap}px`);
      previewTransientStyle(artboard.id, primaryBox.id, {
        gap: `${latestGap}px`,
      });
    };

    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setActiveScrubLabel(null);
      commitStyleProps(artboard.id, artboard.width, primaryBox.id, {
        gap: `${latestGap}px`,
      });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const invScale = Math.min(1 / zoom, 1.6);
  const padT = Math.max(4, Math.min(primaryBox.padding.top || 6, ph * 0.35));
  const padB = Math.max(4, Math.min(primaryBox.padding.bottom || 6, ph * 0.35));
  const padL = Math.max(4, Math.min(primaryBox.padding.left || 6, pw * 0.35));
  const padR = Math.max(4, Math.min(primaryBox.padding.right || 6, pw * 0.35));

  return (
    <>
      {/* TOP PADDING BAR HANDLE */}
      <div
        className="vds-spacing-spot vds-spacing-pad-h"
        style={{
          position: 'absolute',
          left: '50%',
          top: `${padT / 2}px`,
          width: `${18 * invScale}px`,
          height: `${4 * invScale}px`,
          transform: 'translate(-50%, -50%)',
          borderRadius: 99,
          background: '#22c55e',
          opacity: 0.75,
          cursor: 'ns-resize',
          pointerEvents: 'auto',
          zIndex: 14,
        }}
        title={`Drag Top Padding (${Math.round(primaryBox.padding.top)}px) · Alt: Y-axis · Shift: All`}
        onPointerEnter={() => setHighlightedBoxSide('padding-top')}
        onPointerLeave={() => setHighlightedBoxSide(null)}
        onPointerDown={(e) => handlePaddingPointerDown('top', e)}
      />

      {/* BOTTOM PADDING BAR HANDLE */}
      <div
        className="vds-spacing-spot vds-spacing-pad-h"
        style={{
          position: 'absolute',
          left: '50%',
          bottom: `${padB / 2}px`,
          width: `${18 * invScale}px`,
          height: `${4 * invScale}px`,
          transform: 'translate(-50%, 50%)',
          borderRadius: 99,
          background: '#22c55e',
          opacity: 0.75,
          cursor: 'ns-resize',
          pointerEvents: 'auto',
          zIndex: 14,
        }}
        title={`Drag Bottom Padding (${Math.round(primaryBox.padding.bottom)}px) · Alt: Y-axis · Shift: All`}
        onPointerEnter={() => setHighlightedBoxSide('padding-bottom')}
        onPointerLeave={() => setHighlightedBoxSide(null)}
        onPointerDown={(e) => handlePaddingPointerDown('bottom', e)}
      />

      {/* LEFT PADDING BAR HANDLE */}
      <div
        className="vds-spacing-spot vds-spacing-pad-v"
        style={{
          position: 'absolute',
          left: `${padL / 2}px`,
          top: '50%',
          width: `${4 * invScale}px`,
          height: `${18 * invScale}px`,
          transform: 'translate(-50%, -50%)',
          borderRadius: 99,
          background: '#22c55e',
          opacity: 0.75,
          cursor: 'ew-resize',
          pointerEvents: 'auto',
          zIndex: 14,
        }}
        title={`Drag Left Padding (${Math.round(primaryBox.padding.left)}px) · Alt: X-axis · Shift: All`}
        onPointerEnter={() => setHighlightedBoxSide('padding-left')}
        onPointerLeave={() => setHighlightedBoxSide(null)}
        onPointerDown={(e) => handlePaddingPointerDown('left', e)}
      />

      {/* RIGHT PADDING BAR HANDLE */}
      <div
        className="vds-spacing-spot vds-spacing-pad-v"
        style={{
          position: 'absolute',
          right: `${padR / 2}px`,
          top: '50%',
          width: `${4 * invScale}px`,
          height: `${18 * invScale}px`,
          transform: 'translate(50%, -50%)',
          borderRadius: 99,
          background: '#22c55e',
          opacity: 0.75,
          cursor: 'ew-resize',
          pointerEvents: 'auto',
          zIndex: 14,
        }}
        title={`Drag Right Padding (${Math.round(primaryBox.padding.right)}px) · Alt: X-axis · Shift: All`}
        onPointerEnter={() => setHighlightedBoxSide('padding-right')}
        onPointerLeave={() => setHighlightedBoxSide(null)}
        onPointerDown={(e) => handlePaddingPointerDown('right', e)}
      />

      {/* FLEX / GRID GAP HANDLE */}
      {isFlexOrGrid && (
        <div
          className="vds-spacing-spot vds-spacing-gap"
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: `${14 * invScale}px`,
            height: `${6 * invScale}px`,
            transform: 'translate(-50%, -50%)',
            borderRadius: 99,
            background: '#ec4899',
            border: `${1 * invScale}px solid #ffffff`,
            opacity: 0.85,
            cursor: (primaryBox.flexDirection ?? '').includes('column')
              ? 'ns-resize'
              : 'ew-resize',
            pointerEvents: 'auto',
            zIndex: 15,
          }}
          title={`Drag Flex/Grid Gap (${Math.round(primaryBox.gap ?? 0)}px)`}
          onPointerDown={handleGapPointerDown}
        />
      )}

      {/* LIVE SCRUB READOUT PILL */}
      {activeScrubLabel && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: `translate(-50%, -140%) scale(${invScale})`,
            background: '#0f172a',
            color: '#4ade80',
            border: '1px solid #22c55e',
            borderRadius: 4,
            padding: '2px 7px',
            fontSize: 11,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 40,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          {activeScrubLabel}
        </div>
      )}
    </>
  );
}

interface FloatingRichTextToolbarProps {
  artboardId: string;
  primaryBox: MeasuredRectItem;
  zoom: number;
}

export function FloatingRichTextToolbar({
  artboardId,
  primaryBox,
  zoom,
}: FloatingRichTextToolbarProps): React.ReactElement {
  const [linkPromptOpen, setLinkPromptOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('https://');
  const stopTextEditing = useSelectionStore((s) => s.stopTextEditing);

  const px = primaryBox.border.x ?? 0;
  const py = primaryBox.border.y ?? 0;
  const invScale = Math.min(1 / zoom, 1.5);

  const runFormat = (
    command:
      | 'bold'
      | 'italic'
      | 'underline'
      | 'code'
      | 'createLink'
      | 'unlink'
      | 'removeFormat',
    value?: string
  ): void => {
    sandboxRegistry.send(artboardId, {
      t: 'execInlineFormat',
      id: primaryBox.id,
      command,
      value,
    });
  };

  return (
    <div
      className="vds-rte-floating-bar"
      style={{
        position: 'absolute',
        left: `${px}px`,
        top: `${Math.max(4, py - 36 * invScale)}px`,
        transform: `scale(${invScale})`,
        transformOrigin: 'bottom left',
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        padding: '4px 6px',
        borderRadius: 6,
        background: '#0f172a',
        border: '1px solid #38bdf8',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
        pointerEvents: 'auto',
        zIndex: 60,
      }}
      onMouseDown={(e) => {
        // Prevent blurring the iframe contenteditable element when clicking toolbar buttons
        if (!(e.target instanceof HTMLInputElement)) {
          e.preventDefault();
        }
        e.stopPropagation();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="vds-ctx-btn"
        title="Bold (Ctrl+B)"
        onClick={() => runFormat('bold')}
      >
        <Bold size={12} />
      </button>
      <button
        type="button"
        className="vds-ctx-btn"
        title="Italic (Ctrl+I)"
        onClick={() => runFormat('italic')}
      >
        <Italic size={12} />
      </button>
      <button
        type="button"
        className="vds-ctx-btn"
        title="Underline (Ctrl+U)"
        onClick={() => runFormat('underline')}
      >
        <Underline size={12} />
      </button>
      <button
        type="button"
        className="vds-ctx-btn"
        title="Wrap in <code>"
        onClick={() => runFormat('code')}
      >
        <Code size={12} />
      </button>
      <button
        type="button"
        className="vds-ctx-btn"
        title="Insert Link (<a>)"
        onClick={() => setLinkPromptOpen((v) => !v)}
      >
        <LinkIcon size={12} />
      </button>
      <button
        type="button"
        className="vds-ctx-btn"
        title="Clear Formatting"
        onClick={() => runFormat('removeFormat')}
      >
        <RemoveFormatting size={12} />
      </button>

      {linkPromptOpen && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginLeft: 4 }}>
          <input
            type="text"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://..."
            style={{
              width: 120,
              fontSize: 11,
              padding: '2px 5px',
              background: '#1e293b',
              color: '#f8fafc',
              border: '1px solid #475569',
              borderRadius: 4,
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                runFormat('createLink', linkUrl);
                setLinkPromptOpen(false);
              }
            }}
          />
          <button
            type="button"
            className="vds-ctx-btn"
            title="Apply Link"
            onClick={() => {
              runFormat('createLink', linkUrl);
              setLinkPromptOpen(false);
            }}
          >
            <Check size={11} />
          </button>
        </div>
      )}

      <div
        style={{
          width: 1,
          height: 14,
          background: 'rgba(255,255,255,0.15)',
          margin: '0 2px',
        }}
      />
      <button
        type="button"
        className="vds-ctx-btn"
        style={{ color: '#38bdf8', fontWeight: 600, fontSize: 10.5, padding: '0 5px' }}
        title="Finish Editing Text (Enter / Esc)"
        onClick={() => {
          sandboxRegistry.send(artboardId, {
            t: 'commitInlineEdit',
            id: primaryBox.id,
          });
          stopTextEditing();
        }}
      >
        Done
      </button>
    </div>
  );
}
