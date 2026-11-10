# Design Document: Figma-Like Visual HTML Studio Engine

**Date:** 2026-11-08  
**Topic:** Figma-Like Direct Manipulation, Native HTML/CSS Rendering, Multi-Page Project Folder Workspace, and Auto-Synced Navbar Components  
**Status:** Approved by Builder Review — Ready for User Approval  

---

## 1. Intent and the Why

### Problem Statement
Existing visual web tools and Figma plugins attempt to bridge the gap between design and web code, but they fundamentally fail in two ways:
1. **HTML-to-Figma / SVG Converters:** They convert HTML into vector shapes or SVG. In doing so, typography breaks, flexbox/grid layouts collapse into absolute positions, fonts fail to render accurately, and the result is completely disconnected from real browser behavior ("berbeda jauh tampilannya dengan HTML yang asli"). Furthermore, exporting back produces unmaintainable, messy absolute `<div>` code.
2. **Traditional Web Visual Builders (Webflow, etc.):** They force all direct manipulation into strict CSS document flow. When a user tries to drag an element 5px to adjust its position, the element either refuses to move or aggressively jumps into an unrelated parent container. When pulling a resize handle on one side, centered or inline elements cause the opposite side to expand unexpectedly. In addition, changes made to shared classes frequently conflict with cascade specificity, causing elements to snap back to their initial state ("bentuknya balik ke awal lagi").

### Vision
Figrow transforms HTML/CSS editing into an experience that feels **as effortless, free, and intuitive as manipulating objects in Figma** ("semudah edit gambar di Figma"):
- **Native Browser Engine:** HTML and CSS are executed natively inside a sandboxed browser environment—never flattened into lossy SVG. What you see is 100% real web rendering.
- **Direct Visual Manipulation:** Click any element to drag it freely without random jumps, resize it with 1px precision without opposite-edge warping, and pick colors with zero friction or cascade bounce-back.
- **Non-Destructive Roundtrip ("Masuk bagaimana, keluar begitu"):** Only the exact properties and elements edited by the user are modified in the files. Original comments, scripts, structure, class names, and formatting remain 100% intact.
- **Multi-Page Folder Workspace:** Users can open an entire project folder containing multiple HTML pages, stylesheets, and assets.
- **Smart Zero-Code Navbar Sync:** Editing a shared navigation bar or header on any page automatically updates the corresponding navbar across all HTML pages in the project folder without requiring manual copy-pasting or template knowledge.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
1. **Figma-Grade Direct Manipulation:**
   - **Canvas Move:** Dragging an element on the canvas moves it smoothly under the cursor at 60 FPS. Sibling reordering is strictly confined to immediate siblings of the same parent container. Outside sibling reorder zones, dragging commits the element's position freely without reparenting.
   - **Anchor-Pinned 8-Point Resize:** Pulling any resize handle (e.g. West or North) pins the opposite edge completely stationary. Inline elements automatically receive `display: inline-block` and `box-sizing: border-box` to prevent CSS layout rejections.
   - **Frictionless Color & Style Editing:** Swatch inputs and text fields immediately update the element's style attribute with specificity `1-0-0-0`, ensuring modifications never revert or collide with shared classes.
2. **Native HTML/CSS Fidelity:**
   - Directly import and render vanilla HTML and CSS files natively in browser iframe viewports. No SVG translation.
3. **Non-Destructive Roundtrip (Source-First Invariant):**
   - Clean, human-readable, production-ready code output. AST updates are surgical; unedited code is untouched.
4. **Multi-Page Project Folder Workspace:**
   - Full support for opening project directories containing multiple `.html` files (`index.html`, `about.html`, `contact.html`), CSS files, and assets with an intuitive left-panel Pages navigator.
   - Dual-path persistence: Direct in-place save to disk (`Ctrl+S` / Save button) via File System Access API, plus 1-Click ZIP/Folder export.
5. **Smart Cross-Page Navbar Synchronization:**
   - Automatically detect matching navigation containers (`<header>` / `<nav>`) across all project HTML files and propagate visual edits made on one page to all other pages in the background, while preserving page-specific active tab links.

### Non-Goals
- Replacing general-purpose code IDEs (e.g., full-blown language servers or debugging environments). Figrow focuses on visual design and CSS/DOM layout manipulation with focused code inspection.
- Converting HTML into static vector graphic files like SVG or PDF.
- Requiring server-side template engines (PHP, Jinja, Handlebars) or heavy JavaScript frameworks. Figrow works natively with vanilla HTML5 and CSS3.

### Anti-Goals
- **Never convert HTML to SVG:** The canvas must render genuine DOM nodes with native browser typography and layout.
- **Never scramble or regenerate entire files:** No automated re-indentation of untouched blocks or deletion of user comments and scripts.
- **Never allow elements to jump into foreign containers during drag:** A drag operation must never unexpectedly relocate a hero button into a footer or main container.
- **Never allow resize to warp the opposite edge:** Pulling the left handle must never push the right edge outward.
- **Never allow style changes to bounce back:** Edits must take immediate and permanent effect.

---

## 3. Constraints & Builder Architectural Calls

### 3.1 Project Persistence Model: In-Place Disk Writeback + Export Pipeline
- **Decision (Builder Call):** Implement a dual-path persistence model:
  1. **Direct In-Place Disk Save:** When opened via `showDirectoryPicker()` (supported in Chrome/Edge), changes can be saved directly back to the files on disk via `FileSystemFileHandle` streams using `Ctrl+S` or a "Save Project" button in the top bar. All runtime internal markers (such as `data-vds-id`) are stripped prior to disk writeback so source files stay pristine.
  2. **1-Click Export Pipeline (ZIP / Folder):** Works universally across all browsers (including Firefox and webkitdirectory fallback), allowing users to download the complete, clean project archive at any time.

### 3.2 Local Asset Bridge Architecture: Blob Object URL Mapping
- **Decision (Builder Call):** Binary assets (images, local webfonts, media) loaded from the directory are registered in a local Blob registry (`URL.createObjectURL(file)`). In the sandboxed iframe, relative paths (`images/hero.png`) are resolved to their blob URLs dynamically in `iframe.srcDoc`. On export and disk save, all blob URLs are cleanly translated back to original relative paths (`images/hero.png`).

### 3.3 Smart Navbar Sync: State-Preserving Reconciliation
- **Decision (Builder Call):** When propagating changes across matching navigation containers (`<header>` / `<nav>`), the sync engine performs semantic reconciliation rather than a naive string wipe:
  - Preserves each target page's specific active tab markers (e.g. `.active`, `.current`, `aria-current="page"`).
  - Automatically re-bases relative link paths based on folder depth (e.g. `index.html` vs `../index.html`).
  - Supports an explicit **"❖ Detach Component"** option via right-click context menu for pages (like standalone login or landing pages) that require a distinct, unlinked header.

### 3.4 Responsive Artboard Direct Manipulation Scope
- **Decision (Builder Call):**
  - **Desktop Artboard (Primary):** Direct canvas edits write to the base element style (`writeInlineStyleAttr`), establishing the canonical layout.
  - **Tablet / Mobile Artboards (Responsive Breakpoints):** Direct canvas edits on mobile or tablet frames automatically target element-scoped responsive media rules (`@media (max-width: 767.98px) { [data-vds-id="..."] { ... } }`), ensuring mobile adjustments adapt responsively without breaking the desktop design.

---

## 4. Architectural Detailed Specifications

### 4.1 Direct Canvas Manipulation Architecture

#### A. Canvas Drag & Move ("Geser")
- **Target Selection:** When pointerdown occurs, the system identifies the target element under the cursor. If the element is not yet selected, it is immediately selected.
- **60 FPS Transient Motion:** During drag, the element in the sandboxed iframe receives `transient` style `transform: translate(dx, dy); opacity: 0.88; pointer-events: none; z-index: 9999;`. Simultaneously, the canvas selection overlay bounding box moves with the cursor via `setTransientRectOverride`.
- **Strict Sibling-Only Reorder Constraint:**
  - `updateCanvasDrag` checks if the cursor is hovering over direct siblings belonging to the **same direct parent** (`parentKey === sourceNode.parent`).
  - If hovering over an immediate sibling in that parent, an insertion line indicator is displayed.
  - If the cursor moves into whitespace or outside the sibling list, `dropSlot` is set to `null`. It will **never** fall back to `n_main` or `n_body`.
- **Commit on PointerUp:**
  - If a valid sibling reorder slot was active, `commitCanvasDrop` updates the DOM order within that parent.
  - Otherwise (free canvas move), the element's position is updated at its dropped coordinate:
    - If `position === 'absolute'`: `left = startX + dx`, `top = startY + dy`.
    - If normal flow: `position: relative`, `left = curLeft + dragDx`, `top = curTop + dragDy`.
    - The style is committed directly to the element via `writeInlineStyleAttr`, preventing cascade overrides and ensuring it never jumps or reverts.

#### B. Anchor-Pinned 8-Point Resize ("Ubah Size")
- **Handle Dynamics & Counter-Translation:**
  - Pulling East (`e`): `nextW = startW + dx`. Left edge is anchored.
  - Pulling West (`w`): `nextW = startW - dx`, `nextX = startX + dx`. To keep the right edge locked in place, the iframe element receives `width: nextW` plus `transform: translateX(dx)`.
  - Pulling South (`s`): `nextH = startH + dy`. Top edge is anchored.
  - Pulling North (`n`): `nextH = startH - dy`, `nextY = startY + dy`. To keep the bottom edge locked in place, the iframe element receives `height: nextH` plus `transform: translateY(dy)`.
  - Corner handles (`nw`, `ne`, `sw`, `se`) combine horizontal and vertical counter-translations so the opposite diagonal corner remains fixed.
- **Inline Element Immunity:** If the element is `display: inline` (e.g., `<a>`, `<span>`, `<button>`), the system automatically ensures `display: inline-block` and `box-sizing: border-box`, allowing width and height to take effect.
- **Commit:** The new dimensions and position offsets are committed directly via `writeInlineStyleAttr(vnode, propsToCommit)`. Transient style is cleared only after permanent attributes are written, eliminating any visual bounce-back.

#### C. Direct Element Styling ("Ganti Warna")
- Default target for inspector changes and canvas manipulations is `targetKind: 'inline'`.
- Setting a fill color or text color applies directly to the element's `style` attribute via `writeInlineStyleAttr` (`style="background-color: ..."` or `style="color: ..."`).
- With specificity `1-0-0-0`, the style is immune to class-level cascade overrides, avoids corrupting sibling elements that share classes, and never reverts.
- Power users can still target class rules (e.g., `.btn`) by clicking class chips in the Selector Bar.

---

## 5. Verification and Acceptance Criteria

1. **Canvas Move Test:**
   - Dragging any button, card, or element on canvas moves it smoothly under the cursor at 60 FPS.
   - Dropping outside direct siblings preserves the element in its parent and commits its position without jumping into unrelated containers.
2. **Canvas Resize Test:**
   - Pulling the West handle moves only the left edge; the right edge remains 100% stationary.
   - Pulling the North handle moves only the top edge; the bottom edge remains 100% stationary.
   - On release, the element retains its new size and never snaps back.
3. **Color & Fill Test:**
   - Changing fill or text color updates the element live and stays permanently committed.
4. **Folder Workspace Test:**
   - Loading a folder with multiple HTML files populates the Pages panel. Clicking any page loads that page on canvas.
   - Saving via `Ctrl+S` writes directly back to disk files without polluting source code with internal runtime attributes.
5. **Navbar Auto-Sync Test:**
   - Editing the navbar on `index.html` automatically synchronizes the changes to `about.html` while preserving `about.html`'s active link.
6. **Code Export Test:**
   - Exported HTML/CSS files maintain original structure, scripts, and comments, with only edited properties modified.
