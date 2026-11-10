import React, { useEffect, useRef } from 'react';
import { useCanvasStore } from '../../store/canvasStore';

/**
 * High-DPI Canvas2D Rulers (F006 — CANVAS-01_ZOOM_PAN.md)
 * - Renders pixel coordinates relative to the active artboard's origin (0,0)
 * - Dragging from the top ruler creates a horizontal (Y) guide on the active artboard
 * - Dragging from the left ruler creates a vertical (X) guide on the active artboard
 */

interface CanvasRulersProps {
  viewportWidth: number;
  viewportHeight: number;
}

function chooseStep(zoom: number): number {
  const raw = 80 / zoom;
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
  for (const s of steps) {
    if (s >= raw) return s;
  }
  return 2000;
}

export function CanvasRulers({
  viewportWidth,
  viewportHeight,
}: CanvasRulersProps): React.ReactElement | null {
  const topCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const leftCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const rulersVisible = useCanvasStore((s) => s.rulersVisible);
  const camera = useCanvasStore((s) => s.camera);
  const activeArtboard = useCanvasStore((s) => s.artboards[s.activeArtboardId]);
  const addGuide = useCanvasStore((s) => s.addGuide);

  useEffect(() => {
    if (!rulersVisible || !activeArtboard) return;
    const dpr = window.devicePixelRatio || 1;
    const step = chooseStep(camera.zoom);
    const subStep = step / 5;

    // Draw Horizontal Ruler (Top)
    const topCanvas = topCanvasRef.current;
    if (topCanvas && viewportWidth > 0) {
      topCanvas.width = viewportWidth * dpr;
      topCanvas.height = 20 * dpr;
      const ctx = topCanvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, viewportWidth, 20);

        // Highlight active artboard span
        const abStartScreen = activeArtboard.worldX * camera.zoom + camera.x;
        const abEndScreen =
          (activeArtboard.worldX + activeArtboard.width) * camera.zoom + camera.x;
        ctx.fillStyle = 'rgba(13, 153, 255, 0.15)';
        ctx.fillRect(abStartScreen, 0, abEndScreen - abStartScreen, 20);

        const minArtboardPx =
          Math.floor((-camera.x / camera.zoom - activeArtboard.worldX) / step) * step;
        const maxArtboardPx =
          Math.ceil(
            ((viewportWidth - camera.x) / camera.zoom - activeArtboard.worldX) / step
          ) * step;

        ctx.strokeStyle = '#d1d5db';
        ctx.fillStyle = '#6b7280';
        ctx.font = '9px Inter, sans-serif';

        for (let px = minArtboardPx; px <= maxArtboardPx; px += subStep) {
          const worldX = activeArtboard.worldX + px;
          const screenX = Math.round(worldX * camera.zoom + camera.x) + 0.5;
          if (screenX < 20 || screenX > viewportWidth) continue;

          const isMajor = Math.abs(px % step) < 0.001;
          ctx.beginPath();
          ctx.moveTo(screenX, isMajor ? 4 : 13);
          ctx.lineTo(screenX, 20);
          ctx.stroke();

          if (isMajor) {
            ctx.fillText(String(Math.round(px)), screenX + 3, 12);
          }
        }
      }
    }

    // Draw Vertical Ruler (Left)
    const leftCanvas = leftCanvasRef.current;
    if (leftCanvas && viewportHeight > 0) {
      leftCanvas.width = 20 * dpr;
      leftCanvas.height = viewportHeight * dpr;
      const ctx = leftCanvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, 20, viewportHeight);

        const h =
          activeArtboard.heightMode === 'fixed'
            ? (activeArtboard.fixedHeight ?? 900)
            : activeArtboard.measuredHeight;
        const abTopScreen = activeArtboard.worldY * camera.zoom + camera.y;
        const abBottomScreen = (activeArtboard.worldY + h) * camera.zoom + camera.y;
        ctx.fillStyle = 'rgba(13, 153, 255, 0.15)';
        ctx.fillRect(0, abTopScreen, 20, abBottomScreen - abTopScreen);

        const minArtboardPy =
          Math.floor((-camera.y / camera.zoom - activeArtboard.worldY) / step) * step;
        const maxArtboardPy =
          Math.ceil(
            ((viewportHeight - camera.y) / camera.zoom - activeArtboard.worldY) / step
          ) * step;

        ctx.strokeStyle = '#d1d5db';
        ctx.fillStyle = '#6b7280';
        ctx.font = '9px Inter, sans-serif';

        for (let py = minArtboardPy; py <= maxArtboardPy; py += subStep) {
          const worldY = activeArtboard.worldY + py;
          const screenY = Math.round(worldY * camera.zoom + camera.y) + 0.5;
          if (screenY < 20 || screenY > viewportHeight) continue;

          const isMajor = Math.abs(py % step) < 0.001;
          ctx.beginPath();
          ctx.moveTo(isMajor ? 4 : 13, screenY);
          ctx.lineTo(20, screenY);
          ctx.stroke();

          if (isMajor) {
            ctx.save();
            ctx.translate(11, screenY + 3);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText(String(Math.round(py)), 0, 0);
            ctx.restore();
          }
        }
      }
    }
  }, [rulersVisible, camera, activeArtboard, viewportWidth, viewportHeight]);

  if (!rulersVisible || !activeArtboard) return null;

  const handleTopRulerClick = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect();
    const screenY = e.clientY - rect.top;
    // Create a horizontal guide at 120px or clicked offset inside active artboard
    const defaultPos = Math.max(
      40,
      Math.round((screenY + 120 - camera.y) / camera.zoom - activeArtboard.worldY)
    );
    addGuide(activeArtboard.id, 'y', clampGuide(defaultPos, activeArtboard.measuredHeight));
  };

  const handleLeftRulerClick = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const defaultPos = Math.max(
      40,
      Math.round((screenX + 160 - camera.x) / camera.zoom - activeArtboard.worldX)
    );
    addGuide(activeArtboard.id, 'x', clampGuide(defaultPos, activeArtboard.width));
  };

  return (
    <>
      <div className="vds-ruler-corner" title="Unit: CSS px" />
      <canvas
        ref={topCanvasRef}
        className="vds-ruler-top"
        style={{ width: `${viewportWidth}px`, height: '20px' }}
        title="Click to drop a horizontal guide on active artboard"
        onClick={handleTopRulerClick}
      />
      <canvas
        ref={leftCanvasRef}
        className="vds-ruler-left"
        style={{ width: '20px', height: `${viewportHeight}px` }}
        title="Click to drop a vertical guide on active artboard"
        onClick={handleLeftRulerClick}
      />
    </>
  );
}

function clampGuide(pos: number, max: number): number {
  return Math.max(16, Math.min(max - 16, pos));
}
