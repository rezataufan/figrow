# Design Document: Figma 100% Functionality & Clean White Canvas Replica in Figrow

## 1. Intent & The Why
Figrow is a visual DOM and CSS studio designed to provide a 1:1 professional design experience matching Figma, while compiling directly to clean, semantic, non-destructive HTML and CSS.
The goal of this project is to achieve full functional parity with the core Figma editing workflow:
1. Replicating the complete suite of Figma edit tools (color/fill, effects, typography, location/geometry, 4-corner radius & squircle, constraints, blend modes, alignment bar, and 1-click export).
2. Organizing the left sidebar so that HTML layers are cleanly structured, easy to navigate, and rapid to edit (Pages accordion, semantic icons `#`/`|||`/`T`/`❖`, smart text preview naming, and right-click context menu).
3. Adapting the canvas appearance to match Figma's clean white workspace (Figma Dark Shell with `#F5F5F5` / `#FFFFFF` clean canvas and white `#FFFFFF` artboards).

---

## 2. Architecture & Decisions Settled

### A. Canvas Viewport & Theme Model
- **Theme**: Option A (Figma Dark Shell `#2c2c2c` + Clean White Canvas `#F5F5F5` / `#FFFFFF`).
- **Artboards**: Pure white `#FFFFFF` frames with subtle drop shadows (`0 2px 10px rgba(0,0,0,0.06)`), 11px gray/blue headers, and light rulers (`#F0F0F0`).
- **Page Canvas Background Color Picker**: When clicking the empty canvas (no layer selected), the Right Inspector displays the **Page: Canvas Background** property. Changing this updates the infinite canvas viewport backdrop dynamically without polluting production CSS.
- **Pages Accordion**: Follows Figma's Single Active Page model. Selecting `index.html`, `about.html`, or adding a new page (`+`) sets the active page context for the canvas, updating the sandboxed artboards and layers tree.

### B. Left Sidebar Organization (Pages & Layers)
- **Pages Accordion**: Located at the top of the Left Sidebar. Displays all project HTML files with active indicator, click-to-switch, and `+` button to add new HTML pages.
- **Semantic Hierarchy & Icons**:
  - `#` Frame / Container (`<section>`, `<header>`, `<footer>`, `<main>`, `<div>`)
  - `|||` Auto Layout Container (elements with `display: flex` / `inline-flex`)
  - `T` Typography (`<h1>`–`<h6>`, `<p>`, `<span>`, `<a>`)
  - `❖` Components / Reusable Blocks
  - `▭` Shapes / Primitives
  - `🖼` Media (`<img>`, `<svg>`, `<video>`)
- **Smart Layer Naming**: Text elements automatically show a preview of their text string (e.g. *"Build Fast with Figrow"*) instead of raw `<p>`.
- **Clean Hover Controls**: Eye (Hide in design) and Lock (Lock layer) icons reveal only when hovering a layer row, maintaining a clean Figma-like list.
- **Right-Click Context Menu**:
  - Rename Layer (`F2` / double-click)
  - Duplicate (`Ctrl+D`)
  - Group / Wrap in Frame (`Ctrl+G`)
  - Ungroup (`Ctrl+Shift+G`)
  - Add / Remove Auto Layout (`Shift+A`)
  - Convert Semantic Tag (`div` ↔ `section` ↔ `button` ↔ `article`)
  - Delete (`Del` / `Backspace`)

### C. Right Inspector Edit Tools (100% Feature-Complete)
1. **Top Alignment & Distribute Bar**:
   - 6 Alignment Buttons: Align Left (`Alt+A`), Align Horizontal Centers (`Alt+H`), Align Right (`Alt+D`), Align Top (`Alt+W`), Align Vertical Centers (`Alt+V`), Align Bottom (`Alt+S`).
   - 2 Distribute Spacing Buttons: Distribute Horizontal, Distribute Vertical.
   - Flow intelligence: If element is in normal flow / Auto Layout, alignment maps to `align-self`, `justify-content`, or `margin: auto`. If element is absolute or multi-selected, aligns coordinates.
2. **Geometry & Position**:
   - Coordinates **X** and **Y** with an **"Absolute position" toggle (`⬚+`)**:
     - By default, elements flow cleanly via responsive Auto Layout (Flexbox).
     - When "Absolute position" is toggled ON, element receives `position: absolute`, and X / Y directly edit `left` / `top`.
   - Dimensions **W** and **H** with Constrain Proportions lock (🔗).
   - Rotation angle (**∠ 0°**) compiling to `transform: rotate(...)`.
   - **Corner Radius**: Unified radius input + independent 4-corner expansion (`top-left`, `top-right`, `bottom-right`, `bottom-left`) mapping to `border-radius`.
   - **Resizing**: Dropdown presets: `Fixed` (px), `Hug contents` (`auto` / `max-content`), `Fill container` (`100%`).
   - **Clip content**: Checkbox mapping to `overflow: hidden`.
3. **Constraints**:
   - Visual constraint box: Horizontal (*Left, Right, Left & Right, Center, Scale*) and Vertical (*Top, Bottom, Top & Bottom, Center, Scale*).
4. **Layer Blend Mode & Opacity**:
   - `mix-blend-mode` dropdown: Pass through / Normal, Multiply, Screen, Overlay, Darken, Lighten.
   - Layer Opacity percentage (`100%`) compiling to `opacity`.
5. **Auto Layout**:
   - 3 Directions: Horizontal (`→`), Vertical (`↓`), and Wrap (`↵`) mapping to `flex-direction` and `flex-wrap`.
   - Interactive 9-point visual alignment box mapping to `justify-content` and `align-items`.
   - Gap between items (`gap`).
   - Padding: Unified and independent 4-way padding (`padding: T R B L`).
6. **Typography**:
   - Font Family picker with Google Fonts auto-link injection and system font stacks.
   - Font Weight (400, 500, 600, 700), Font Size, Line Height, Letter Spacing, and Paragraph Spacing.
   - Text Alignment (Left, Center, Right, Justify).
   - Text Box Resizing (Auto Width, Auto Height, Fixed).
   - Text Case (Uppercase, Lowercase, Title Case) and Text Decoration (Underline, Strikethrough).
   - Direct text color fill.
7. **Fill (Colors & Gradients)**:
   - Swatch thumbnail, Solid/Gradient picker, Hex input (`#0D99FF`), Opacity %, Eyedropper (`I`), visibility toggle, and add/remove multi-fills.
8. **Stroke (Border)**:
   - Color swatch + Hex, stroke weight (px), position (Inside, Center, Outside), border styles (solid, dashed), and individual sides (top, right, bottom, left).
9. **Effects (Shadows & Blurs)**:
   - Drop Shadow, Inner Shadow, Layer Blur, Background Blur with configuration modal (X, Y, Blur, Spread, Color, Opacity).
10. **Export Panel (Direct 1-Click Export)**:
    - Scale presets (1x, 2x, 3x) and formats (PNG, SVG, HTML/CSS, Tailwind).
    - "Export Selection" button: Direct 1-click export of the selected layer/component.

---

## 3. Goals, Non-Goals, & Anti-Goals
- **Goals**: 100% functional visual parity with Figma editor; clean white canvas; organized left sidebar with pages & right-click actions; full right inspector edit tool suite; compiling to clean, non-destructive HTML and CSS.
- **Non-Goals**: Replacing browser rendering engine; changing CRDT Y.Doc architecture.
- **Anti-Goals**: Never break document flow without the user explicitly toggling "Absolute position"; never pollute HTML with proprietary attributes.

---

## 4. Work Left to the Builder
- Component modularization and state connections in:
  - `studio.css` (Clean White canvas styles, ruler colors, artboard shadow, pages accordion)
  - `LayersTreePanel.tsx` (Pages section, semantic Figma icons, context menu, smart text labels)
  - `CssVisualInspector.tsx` (Alignment bar, Absolute position toggle, geometry, squircle corners, blend mode, constraints, export section)
  - `LayoutSection.tsx` (3-way layout direction, 9-point alignment matrix, resizing presets)
  - `TypographySection.tsx` (Advanced typography popover, letter/line height, text case/decoration)
  - `BackgroundEffectsSection.tsx` (Color swatch popover, hex/opacity, stroke position, effects configuration modal)
  - `CanvasRulers.tsx` (Light ruler palette matching clean white canvas)
- Automated verification via Vitest (`engine.test.ts`) and TypeScript compilation (`npm run build`).
