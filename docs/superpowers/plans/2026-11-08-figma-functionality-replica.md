# Figma 100% Functionality & Clean White Canvas Replica Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Figrow into a 100% functional replica of Figma's editing experience with a clean white canvas workspace, an organized left sidebar (Pages accordion, semantic icons, smart naming, right-click context menu), and the complete suite of Figma edit tools in the right inspector (Alignment bar, Constraints, Absolute position toggle, 4-corner squircle, Auto Layout direction & 9-point align, Typography popover, Fill/Stroke/Effects, and 1-click Export).

**Architecture:** Maintain Figrow's non-destructive AST and Y.Doc CRDT data model while updating the UI shell tokens, canvas viewport styling, and inspector style mutation dispatchers. Gated coordinates (X, Y) via an "Absolute position" toggle preserve semantic document flow (Flexbox/Block) by default, while 1-click export and context actions connect directly to existing store pipelines.

**Tech Stack:** React 18, TypeScript, Vite, Zustand stores (`canvasStore`, `selectionStore`, `inspectorStore`, `layersStore`), TanStack Virtualizer (`@tanstack/react-virtual`), Lucide React, Vitest.

**Spec:** [`docs/superpowers/specs/2026-11-08-figma-functionality-replica-design.md`](file:///F:/AI%20VAULT/Figrow/docs/superpowers/specs/2026-11-08-figma-functionality-replica-design.md)

## Global Constraints

- **Theme Palette**: Figma Dark Shell (`--bg-shell: #2c2c2c; --bg-panel: #2c2c2c;`), Clean Canvas (`--bg-canvas: #f5f5f5;`), Pure White Artboard (`#ffffff;`), Figma Blue Accent (`--accent-primary: #0d99ff;`).
- **AST Integrity**: Edits must never write non-standard HTML attributes or corrupt source HTML/CSS files.
- **Document Flow Rule**: In-flow elements (Flex/Block) must never receive `position: absolute` unless the user explicitly toggles the "Absolute position" button.
- **Verification**: Every task must pass `npm test` and `npm run build` with zero TypeScript errors.

## Review Focus

1. **Canvas Viewport Contrast**: Light rulers and canvas background `#f5f5f5` must provide sufficient contrast with `#ffffff` artboard frames.
2. **Absolute Position Toggle**: Switching between in-flow and absolute mode must preserve computed dimensions and not collapse element size.
3. **Multi-Page Switching**: Switching pages via the Pages Accordion must reload artboards without leaking iframe sandboxes or losing selection state.
4. **4-Corner Radius Sync**: Modifying unified radius vs. independent 4 corners must correctly serialize to `border-radius: tl tr br bl` without NaN values.
5. **Context Menu Dismissal**: Right-click context menus in the layers panel must cleanly dismiss on outside clicks or Escape key.

---

### Task 1: Clean White Canvas Theme & Light Rulers

**Files:**
- Modify: `src/styles/studio.css:7-25` (Canvas background token, artboard shadow, and viewport styling)
- Modify: `src/store/canvasStore.ts:50-80` (Add `canvasBgColor` state and action)
- Modify: `src/components/canvas/CanvasRulers.tsx:20-60` (Light palette for ticks, background, and labels)
- Modify: `src/components/canvas/InfiniteCanvas.tsx:180-220` (Apply `canvasBgColor` to viewport stage)

**Interfaces:**
- Produces: `useCanvasStore.getState().setCanvasBgColor(color: string)`
- Consumes: `--bg-canvas` CSS variable, `canvasBgColor` from `canvasStore`.

- [ ] **Step 1: Write test for canvas background store state**
  Add test in `src/engine/__tests__/engine.test.ts`:
  ```ts
  it('updates canvas background color in store without affecting production styles', () => {
    const { setCanvasBgColor } = useCanvasStore.getState();
    setCanvasBgColor('#ffffff');
    expect(useCanvasStore.getState().canvasBgColor).toBe('#ffffff');
  });
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run: `npx.cmd vitest run src/engine/__tests__/engine.test.ts -t "updates canvas background color"`
  Expected: FAIL (property `canvasBgColor` does not exist on `useCanvasStore`).

- [ ] **Step 3: Implement canvas store property & clean white canvas styles**
  In `src/store/canvasStore.ts`, add `canvasBgColor: string` (default `'#f5f5f5'`) and `setCanvasBgColor: (color: string) => void`.
  In `src/styles/studio.css`, set `--bg-canvas: #f5f5f5;`, update `.vds-artboard-body` with soft drop shadow `0 2px 10px rgba(0, 0, 0, 0.08)`, and update `.vds-artboard-header` text colors.
  In `src/components/canvas/CanvasRulers.tsx`, update background to `#f0f0f0`, tick stroke to `#d1d5db`, and font fill to `#6b7280`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx.cmd vitest run src/engine/__tests__/engine.test.ts -t "updates canvas background color"`
  Expected: PASS.

- [ ] **Step 5: Verify build**
  Run: `npm.cmd run build`
  Expected: Exit code 0.

---

### Task 2: Pages Accordion & Multi-Page Switching in Left Sidebar

**Files:**
- Modify: `src/store/canvasStore.ts:30-65` (Active page file management)
- Modify: `src/components/layers/LayersTreePanel.tsx:1-80, 160-220` (Add collapsible Pages accordion with active file highlight and `+` add page button)
- Modify: `src/styles/studio.css` (Styles for `.vds-pages-accordion`, `.vds-page-item`, `.vds-page-item.is-active`)

**Interfaces:**
- Produces: `useCanvasStore.getState().activeFile`, `useCanvasStore.getState().setActiveFile(file: string)`
- Produces: `useCanvasStore.getState().addNewPage(fileName: string)`

- [ ] **Step 1: Write test for multi-page switching in canvas store**
  Add test in `src/engine/__tests__/engine.test.ts`:
  ```ts
  it('manages pages and switches active canvas file', () => {
    const store = useCanvasStore.getState();
    store.addNewPage('about.html');
    expect(useCanvasStore.getState().pageFiles).toContain('about.html');
    store.setActiveFile('about.html');
    expect(useCanvasStore.getState().activeFile).toBe('about.html');
  });
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run: `npx.cmd vitest run src/engine/__tests__/engine.test.ts -t "manages pages"`
  Expected: FAIL (`pageFiles` or `addNewPage` not defined).

- [ ] **Step 3: Implement multi-page switching in `canvasStore` and `LayersTreePanel`**
  In `src/store/canvasStore.ts`:
  - Add `pageFiles: string[]` defaulting to `['index.html']`.
  - Add `activeFile: string` defaulting to `'index.html'`.
  - Implement `setActiveFile(file: string)` which updates artboard targets and active file.
  - Implement `addNewPage(fileName: string)` which registers new file in `projectDoc` with standard boilerplate and appends to `pageFiles`.
  In `src/components/layers/LayersTreePanel.tsx`:
  - Render collapsible Pages accordion at top with `ChevronDown`/`ChevronRight`, page rows with checkmark icon `✓`, and `+` button that prompts/creates new HTML page.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx.cmd vitest run src/engine/__tests__/engine.test.ts -t "manages pages"`
  Expected: PASS.

- [ ] **Step 5: Verify build**
  Run: `npm.cmd run build`
  Expected: Exit code 0.

---

### Task 3: Semantic Layer Icons, Smart Text Previews, Hover Controls & Right-Click Context Menu

**Files:**
- Modify: `src/components/layers/LayersTreePanel.tsx:40-120, 260-390` (Semantic Figma icons, text preview labels, hover-only buttons, context menu state)
- Modify: `src/store/layersStore.ts:180-220` (Text preview string extraction in `computeFlatRows`)
- Modify: `src/styles/studio.css` (Styles for `.vds-context-menu`, `.vds-layer-icon-figma`, hover-reveal opacity)

**Interfaces:**
- Produces: `getTagIcon(tag: string, isFlex: boolean, isComponent: boolean): React.ReactNode`
- Produces: `contextMenu: { x: number; y: number; row: FlatLayerRow } | null`

- [ ] **Step 1: Write test for smart text previews in layers store**
  Add test in `src/engine/__tests__/engine.test.ts`:
  ```ts
  it('extracts smart text previews for text nodes in flat layers list', () => {
    const rows = useLayersStore.getState().computeFlatRows('index.html');
    const textRow = rows.find(r => r.tag === 'h1' || r.tag === 'p');
    if (textRow) {
      expect(textRow.previewText).toBeDefined();
    }
  });
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run: `npx.cmd vitest run src/engine/__tests__/engine.test.ts -t "smart text previews"`
  Expected: FAIL (`previewText` not present on `FlatLayerRow`).

- [ ] **Step 3: Implement semantic icons, text previews, and context menu**
  In `src/store/layersStore.ts`:
  - In `FlatLayerRow`, add `previewText?: string; isFlexContainer?: boolean;`.
  - When traversing nodes, if node has text children or text content, assign first 30 chars as `previewText`.
  In `src/components/layers/LayersTreePanel.tsx`:
  - Map icons: `#` for frame/section, `|||` for flex container, `T` for text, `❖` for component, `▭` for box/shape.
  - Render `previewText` in quotes for text elements (e.g. `T "Build Fast..."`).
  - Make Eye (hide) and Lock buttons have `opacity: 0` by default, transitioning to `opacity: 1` on row hover (or if active).
  - Add `onContextMenu` handler on rows opening floating menu with: Rename (`F2`), Duplicate (`Ctrl+D`), Wrap in Frame (`Ctrl+G`), Ungroup (`Ctrl+Shift+G`), Convert Tag, and Delete (`Del`). Close menu on outside click or Escape.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx.cmd vitest run src/engine/__tests__/engine.test.ts -t "smart text previews"`
  Expected: PASS.

- [ ] **Step 5: Verify build**
  Run: `npm.cmd run build`
  Expected: Exit code 0.

---

### Task 4: Alignment Bar, Constraints & Absolute Position Geometry

**Files:**
- Modify: `src/components/inspector/CssVisualInspector.tsx:1-120, 650-800` (Add Alignment Bar at top, Absolute Position toggle in geometry, 4-corner independent inputs, Constraints widget)
- Modify: `src/styles/studio.css` (Styles for `.vds-align-bar`, `.vds-align-btn`, `.vds-corner-expand`, `.vds-constraints-widget`)

**Interfaces:**
- Produces: `applyAlignment(action: 'left'|'center'|'right'|'top'|'middle'|'bottom'|'dist-h'|'dist-v')`
- Produces: `toggleAbsolutePosition()`

- [ ] **Step 1: Write test for alignment and absolute position style commitments**
  Add test in `src/engine/__tests__/engine.test.ts`:
  ```ts
  it('toggles absolute position and sets coordinates correctly', () => {
    const inspector = useInspectorStore.getState();
    const activeArtboardId = useCanvasStore.getState().activeArtboardId;
    inspector.commitStyleProps(activeArtboardId, 1440, 'n_header', {
      position: 'absolute',
      left: '40px',
      top: '60px'
    });
    const cascade = resolveElementCascade('n_header', 1440, null);
    expect(cascade?.declaredProps['position']?.effectiveValue).toBe('absolute');
    expect(cascade?.declaredProps['left']?.effectiveValue).toBe('40px');
  });
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run: `npx.cmd vitest run src/engine/__tests__/engine.test.ts -t "toggles absolute position"`
  Expected: PASS or verify assertion matches expected structure.

- [ ] **Step 3: Implement Alignment Bar & Geometry section in `CssVisualInspector.tsx`**
  - Add Alignment Bar with 6 alignment buttons (`|←`, `↔`, `→|`, `↑`, `↕`, `↓`) and 2 distribute buttons (`|||`, `≡`).
  - In normal flow: Align Left/Center/Right adjusts `align-self` / `margin: auto` or flex parent `justify-content`. In absolute mode: calculates parent-relative coordinates.
  - In Geometry:
    - Add `Absolute position` toggle button (`⬚+`). When active, sets `position: absolute`.
    - Coordinates X, Y scrub inputs.
    - Dimensions W, H with aspect ratio lock button (🔗).
    - Rotation scrub input (`0°` -> `transform: rotate(...)`).
    - Unified Corner Radius + expand button opening 4 independent corner inputs (`top-left`, `top-right`, `bottom-right`, `bottom-left`).
    - Resizing dropdown presets: `Fixed`, `Hug contents` (`width: max-content`), `Fill container` (`width: 100%`).
    - Clip content checkbox (`overflow: hidden`).
    - Constraints widget with 2 dropdowns (Horizontal & Vertical pinning).

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx.cmd vitest run src/engine/__tests__/engine.test.ts -t "toggles absolute position"`
  Expected: PASS.

- [ ] **Step 5: Verify build**
  Run: `npm.cmd run build`
  Expected: Exit code 0.

---

### Task 5: Auto Layout 3-Way Direction & 9-Point Alignment Matrix

**Files:**
- Modify: `src/components/inspector/LayoutSection.tsx:30-180` (Layout direction toggle, 9-point align box, Gap & Padding)
- Modify: `src/styles/studio.css` (Styles for `.vds-9point-grid`, `.vds-9point-cell`, `.vds-dir-btn`)

**Interfaces:**
- Consumes: `onCommit(props: Record<string, string | null>)`
- Produces: Responsive flexbox layout properties (`flex-direction`, `flex-wrap`, `justify-content`, `align-items`, `gap`, `padding`)

- [ ] **Step 1: Write test for Auto Layout 3-way direction and 9-point alignment properties**
  Add test in `src/engine/__tests__/engine.test.ts`:
  ```ts
  it('commits Auto Layout wrap and 9-point alignment matrix properties', () => {
    const activeArtboardId = useCanvasStore.getState().activeArtboardId;
    useInspectorStore.getState().commitStyleProps(activeArtboardId, 1440, 'n_header', {
      display: 'flex',
      'flex-direction': 'row',
      'flex-wrap': 'wrap',
      'justify-content': 'center',
      'align-items': 'center',
      gap: '16px'
    });
    const cascade = resolveElementCascade('n_header', 1440, null);
    expect(cascade?.declaredProps['flex-wrap']?.effectiveValue).toBe('wrap');
    expect(cascade?.declaredProps['gap']?.effectiveValue).toBe('16px');
  });
  ```

- [ ] **Step 2: Run test to verify it fails/passes**
  Run: `npx.cmd vitest run src/engine/__tests__/engine.test.ts -t "commits Auto Layout wrap"`
  Expected: PASS.

- [ ] **Step 3: Implement Layout Direction & 9-point alignment in `LayoutSection.tsx`**
  - Direction buttons: Horizontal (`→` row), Vertical (`↓` column), and Wrap (`↵` wrap).
  - 9-Point visual alignment grid (3x3 grid) mapping directly to `justify-content` (flex-start, center, flex-end) and `align-items` (flex-start, center, flex-end).
  - Gap scrub input (`gap: <n>px`).
  - Unified & 4-side independent padding inputs (`padding: top right bottom left`).

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx.cmd vitest run src/engine/__tests__/engine.test.ts -t "commits Auto Layout wrap"`
  Expected: PASS.

- [ ] **Step 5: Verify build**
  Run: `npm.cmd run build`
  Expected: Exit code 0.

---

### Task 6: Typography Advanced Controls & Fill/Stroke/Effects Refinements

**Files:**
- Modify: `src/components/inspector/TypographySection.tsx:50-200` (Add letter spacing %, line height %, paragraph spacing, text case, text decoration)
- Modify: `src/components/inspector/BackgroundEffectsSection.tsx:50-240` (Figma-style fill row with Hex/Opacity input, stroke inside/center/outside, effects settings modal)
- Modify: `src/styles/studio.css` (Styles for `.vds-figma-color-row`, `.vds-effects-settings-popover`)

**Interfaces:**
- Produces: `line-height`, `letter-spacing`, `text-transform`, `text-decoration`, `mix-blend-mode`, `box-shadow` configurations.

- [ ] **Step 1: Write test for advanced typography and blend mode properties**
  Add test in `src/engine/__tests__/engine.test.ts`:
  ```ts
  it('commits advanced typography and blend mode properties', () => {
    const activeArtboardId = useCanvasStore.getState().activeArtboardId;
    useInspectorStore.getState().commitStyleProps(activeArtboardId, 1440, 'n_header', {
      'letter-spacing': '0.05em',
      'line-height': '1.5',
      'text-transform': 'uppercase',
      'mix-blend-mode': 'multiply'
    });
    const cascade = resolveElementCascade('n_header', 1440, null);
    expect(cascade?.declaredProps['mix-blend-mode']?.effectiveValue).toBe('multiply');
    expect(cascade?.declaredProps['text-transform']?.effectiveValue).toBe('uppercase');
  });
  ```

- [ ] **Step 2: Run test to verify it fails/passes**
  Run: `npx.cmd vitest run src/engine/__tests__/engine.test.ts -t "commits advanced typography"`
  Expected: PASS.

- [ ] **Step 3: Implement Typography & Fill/Stroke/Effects refinements**
  - In `TypographySection.tsx`:
    - Add Line Height (`line-height`) scrub input with auto / % / px.
    - Add Letter Spacing (`letter-spacing`) scrub input.
    - Add Paragraph Spacing (`margin-bottom` on text block).
    - Add Text Case buttons (None, UPPERCASE, lowercase, Capitalize).
    - Add Text Decoration buttons (None, Underline, Strikethrough).
  - In `BackgroundEffectsSection.tsx`:
    - Authentic Figma fill row: swatch square, Hex text input (e.g. `0D99FF`), Opacity input (e.g. `100%`), Eyedropper button (`I`), Visibility toggle (eye), and remove button.
    - Stroke position: Inside (`box-sizing: border-box`), Center, Outside (`outline`).
    - Effects: Drop Shadow, Inner Shadow, Layer Blur, Background Blur with popup settings modal for X, Y, Blur, Spread.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx.cmd vitest run src/engine/__tests__/engine.test.ts -t "commits advanced typography"`
  Expected: PASS.

- [ ] **Step 5: Verify build**
  Run: `npm.cmd run build`
  Expected: Exit code 0.

---

### Task 7: 1-Click Export Panel & Page Canvas Background Picker

**Files:**
- Modify: `src/components/inspector/CssVisualInspector.tsx:850-930` (Export section & Canvas page property when nothing selected)
- Modify: `src/engine/export/exportPipeline.ts:1-60` (Selected node export helper)
- Modify: `src/styles/studio.css` (Styles for `.vds-export-bar`, `.vds-page-props-card`)

**Interfaces:**
- Produces: `exportSelectedNode(artboardId: string, nodeId: string, format: string, scale: string)`
- Produces: `Page: Canvas Background` color picker in inspector when `primaryKey` is null.

- [ ] **Step 1: Write test for isolated node snippet export**
  Add test in `src/engine/__tests__/engine.test.ts`:
  ```ts
  it('exports isolated HTML and CSS for a selected node', () => {
    const exported = projectDoc.getFileText('index.html');
    expect(exported).toContain('<!DOCTYPE html>');
  });
  ```

- [ ] **Step 2: Run test to verify it passes**
  Run: `npx.cmd vitest run src/engine/__tests__/engine.test.ts -t "exports isolated HTML"`
  Expected: PASS.

- [ ] **Step 3: Implement Export Panel & Canvas Page properties in Inspector**
  In `CssVisualInspector.tsx`:
  - When `primaryKey` is null (canvas clicked / no element selected):
    - Render "Page Properties" header with Canvas Background color picker.
    - Selecting a color updates `useCanvasStore.getState().setCanvasBgColor(...)` live on the canvas stage.
  - When an element is selected:
    - At the bottom of the inspector, render the Figma Export section.
    - Dropdowns: Scale (`1x`, `2x`, `3x`, `0.5x`) and Format (`PNG`, `SVG`, `HTML / CSS`, `Tailwind`).
    - "Export Selection" button: triggers instant download of the selected subtree (or copies snippet if code format).

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx.cmd vitest run src/engine/__tests__/engine.test.ts -t "exports isolated HTML"`
  Expected: PASS.

- [ ] **Step 5: Verify build**
  Run: `npm.cmd run build`
  Expected: Exit code 0.

---

### Task 8: Comprehensive Automated Vitest Suite & Build Verification

**Files:**
- Modify: `src/engine/__tests__/engine.test.ts` (Full test suite covering all new Figma features)

- [ ] **Step 1: Write comprehensive tests for the full Figma replica suite**
  Add tests covering:
  - Canvas background color update.
  - Multi-page creation and active page switching.
  - Semantic layer tags and text preview generation.
  - Absolute position coordinate toggling.
  - 9-point layout matrix resolution.
  - Blend mode and advanced typography styles.
  - Selection export generation.

- [ ] **Step 2: Run all tests to verify 100% pass**
  Run: `npm.cmd test`
  Expected: PASS on all tests with 0 failures.

- [ ] **Step 3: Run complete TypeScript and Vite production build**
  Run: `npm.cmd run build`
  Expected: Exit code 0.
