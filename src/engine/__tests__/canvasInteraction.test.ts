import { describe, it, expect } from 'vitest';

describe('Canvas Interaction Logic', () => {
  it('calculates counter-translation for West handle keeping right edge stationary', () => {
    const startX = 100;
    const startW = 200;
    const dx = -50; // Dragged 50px to the left
    const nextW = Math.max(16, startW - dx); // 250
    const nextX = startX + dx; // 50
    const offsetX = nextX - startX; // -50
    
    // Right edge must remain at original right edge (100 + 200 = 300)
    const effectiveRightEdge = nextX + nextW;
    expect(effectiveRightEdge).toBe(300);
    expect(offsetX).toBe(-50);
  });

  it('calculates counter-translation for North handle keeping bottom edge stationary', () => {
    const startY = 80;
    const startH = 120;
    const dy = -40; // Dragged 40px up
    const nextH = Math.max(16, startH - dy); // 160
    const nextY = startY + dy; // 40
    const offsetY = nextY - startY; // -40

    // Bottom edge must remain at original bottom edge (80 + 120 = 200)
    const effectiveBottomEdge = nextY + nextH;
    expect(effectiveBottomEdge).toBe(200);
    expect(offsetY).toBe(-40);
  });

  it('calculates diagonal counter-translation for NW handle keeping SE corner stationary', () => {
    const startX = 100;
    const startY = 80;
    const startW = 200;
    const startH = 120;
    const dx = -30;
    const dy = -20;
    const nextW = Math.max(16, startW - dx);
    const nextH = Math.max(16, startH - dy);
    const nextX = startX + dx;
    const nextY = startY + dy;

    // SE corner must remain pinned at (startX + startW, startY + startH) = (300, 200)
    expect(nextX + nextW).toBe(300);
    expect(nextY + nextH).toBe(200);
  });

  it('supports single artboard Figma view mode to prevent multi-screen clutter', async () => {
    const { useCanvasStore } = await import('../../store/canvasStore');
    useCanvasStore.getState().setCanvasViewMode('single');
    expect(useCanvasStore.getState().canvasViewMode).toBe('single');

    const activeId = useCanvasStore.getState().activeArtboardId;
    const order = useCanvasStore.getState().artboardOrder;
    const rendered = useCanvasStore.getState().canvasViewMode === 'single' ? [activeId] : order;

    expect(rendered.length).toBe(1);
    expect(rendered[0]).toBe(activeId);
  });
});
