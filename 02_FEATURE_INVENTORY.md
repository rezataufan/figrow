---
id: INVENTORY
type: feature-inventory
tags: [vds/inventory]
version: 1.0
---

# 02 — Feature Inventory (F001 – F056)

- **Navigasi Induk:** [[00_INDEX|Studio Workspace]] > [[01_SYSTEM_ARCHITECTURE|System Architecture]]
- **Konvensi:** Setiap fitur atomik (Fxxx) dipetakan ke satu dokumen spesifikasi modul (`[MODUL]-NN`). Satu spec dapat mencakup beberapa fitur atomik yang berbagi engine yang sama.
- **Prioritas:** `P0` = MVP wajib · `P1` = rilis 1.0 · `P2` = pasca-1.0

---

## M1 · Canvas Engine → [[Modules/CANVAS_ENGINE/_INDEX|CANVAS_ENGINE]]

| ID | Fitur | Prioritas | Spec |
|---|---|---|---|
| F001 | Infinite canvas viewport & camera model (x, y, zoom) | P0 | [[Modules/CANVAS_ENGINE/CANVAS-01_ZOOM_PAN\|CANVAS-01]] |
| F002 | Zoom: wheel/pinch/keyboard, zoom-to-fit, zoom-to-selection (2%–6400%) | P0 | [[Modules/CANVAS_ENGINE/CANVAS-01_ZOOM_PAN\|CANVAS-01]] |
| F003 | Pan: Space+drag, middle mouse, trackpad two-finger | P0 | [[Modules/CANVAS_ENGINE/CANVAS-01_ZOOM_PAN\|CANVAS-01]] |
| F004 | Artboards = iframe per page × breakpoint (Desktop/Tablet/Mobile/custom) | P0 | [[Modules/CANVAS_ENGINE/CANVAS-01_ZOOM_PAN\|CANVAS-01]] |
| F005 | Multi-page iframe virtualization (freeze/thaw offscreen artboards) | P1 | [[Modules/CANVAS_ENGINE/CANVAS-04_ARTBOARDS_GUIDES\|CANVAS-04]] |
| F006 | Rulers & draggable guides per artboard | P1 | [[Modules/CANVAS_ENGINE/CANVAS-04_ARTBOARDS_GUIDES\|CANVAS-04]] |
| F007 | Hover highlight + tag/class label chip | P0 | [[Modules/CANVAS_ENGINE/CANVAS-02_SELECTION_BOUNDS\|CANVAS-02]] |
| F008 | Single, multi (Shift), deep (Ctrl), marquee selection | P0 | [[Modules/CANVAS_ENGINE/CANVAS-02_SELECTION_BOUNDS\|CANVAS-02]] |
| F009 | Selection bounds + box-model overlay (margin/padding tint) | P0 | [[Modules/CANVAS_ENGINE/CANVAS-02_SELECTION_BOUNDS\|CANVAS-02]] |
| F010 | Resize handles → `width`/`height` CSS (unit-preserving) | P0 | [[Modules/CANVAS_ENGINE/CANVAS-02_SELECTION_BOUNDS\|CANVAS-02]] |
| F011 | Smart guides & Alt-measure distances | P1 | [[Modules/CANVAS_ENGINE/CANVAS-02_SELECTION_BOUNDS\|CANVAS-02]] |
| F012 | Drag reorder dalam normal flow dengan insertion indicator | P0 | [[Modules/CANVAS_ENGINE/CANVAS-03_DRAG_DROP_REORDER\|CANVAS-03]] |
| F013 | Drag ke container flex/grid & lintas artboard/page | P1 | [[Modules/CANVAS_ENGINE/CANVAS-03_DRAG_DROP_REORDER\|CANVAS-03]] |
| F014 | Drag posisi absolut (`top/left/inset`) & keyboard nudge | P1 | [[Modules/CANVAS_ENGINE/CANVAS-03_DRAG_DROP_REORDER\|CANVAS-03]] |

## M2 · DOM Tree Layers → [[Modules/DOM_TREE_LAYERS/_INDEX|DOM_TREE_LAYERS]]

| ID | Fitur | Prioritas | Spec |
|---|---|---|---|
| F015 | Virtualized layers tree (10k+ node) | P0 | [[Modules/DOM_TREE_LAYERS/LAYER-01_TREE_REORDER\|LAYER-01]] |
| F016 | Drag reorder/reparent dengan validasi content model HTML | P0 | [[Modules/DOM_TREE_LAYERS/LAYER-01_TREE_REORDER\|LAYER-01]] |
| F017 | Rename layer (sidecar, tidak mengotori HTML) | P0 | [[Modules/DOM_TREE_LAYERS/LAYER-01_TREE_REORDER\|LAYER-01]] |
| F018 | Hide (design-time) & Lock | P0 | [[Modules/DOM_TREE_LAYERS/LAYER-01_TREE_REORDER\|LAYER-01]] |
| F019 | Expand/collapse, reveal-in-tree, sinkron seleksi kanvas | P0 | [[Modules/DOM_TREE_LAYERS/LAYER-01_TREE_REORDER\|LAYER-01]] |
| F020 | Keyboard nav, Wrap/Unwrap, change tag (`div`→`section`) | P1 | [[Modules/DOM_TREE_LAYERS/LAYER-02_STRUCTURAL_OPS\|LAYER-02]] |

## M3 · CSS Visual Inspector → [[Modules/CSS_VISUAL_INSPECTOR/_INDEX|CSS_VISUAL_INSPECTOR]]

| ID | Fitur | Prioritas | Spec |
|---|---|---|---|
| F021 | Visual box model (4 margin, 4 padding, 4 border) | P0 | [[Modules/CSS_VISUAL_INSPECTOR/CSS-01_BOX_MODEL\|CSS-01]] |
| F022 | Sizing: width/height/min/max, aspect-ratio, box-sizing, overflow | P0 | [[Modules/CSS_VISUAL_INSPECTOR/CSS-01_BOX_MODEL\|CSS-01]] |
| F023 | Unit-aware scrub input (px/rem/em/%/vw/vh, `calc()`, `var()`) | P0 | [[Modules/CSS_VISUAL_INSPECTOR/CSS-01_BOX_MODEL\|CSS-01]] |
| F024 | Display + Flexbox controls (direction, wrap, justify, align, gap) | P0 | [[Modules/CSS_VISUAL_INSPECTOR/CSS-02_FLEXBOX_GRID\|CSS-02]] |
| F025 | Grid template editor (tracks, `fr`, `minmax`, areas) | P1 | [[Modules/CSS_VISUAL_INSPECTOR/CSS-02_FLEXBOX_GRID\|CSS-02]] |
| F026 | Child item controls (grow/shrink/basis, order, align-self, grid placement) | P1 | [[Modules/CSS_VISUAL_INSPECTOR/CSS-02_FLEXBOX_GRID\|CSS-02]] |
| F027 | Font family/weight/style, Google Fonts & local fonts | P0 | [[Modules/CSS_VISUAL_INSPECTOR/CSS-03_TYPOGRAPHY\|CSS-03]] |
| F028 | Size (rem/em/px), line-height, letter-spacing, align, transform, decoration | P0 | [[Modules/CSS_VISUAL_INSPECTOR/CSS-03_TYPOGRAPHY\|CSS-03]] |
| F029 | Text-shadow multi-layer editor | P1 | [[Modules/CSS_VISUAL_INSPECTOR/CSS-03_TYPOGRAPHY\|CSS-03]] |
| F030 | Fluid type `clamp()` generator | P2 | [[Modules/CSS_VISUAL_INSPECTOR/CSS-03_TYPOGRAPHY\|CSS-03]] |
| F031 | Class manager (add/remove/rename/reorder class) | P0 | [[Modules/CSS_VISUAL_INSPECTOR/CSS-04_CLASSES_STATES\|CSS-04]] |
| F032 | Style target selector (inline / class / rule existing) + cascade origin | P0 | [[Modules/CSS_VISUAL_INSPECTOR/CSS-04_CLASSES_STATES\|CSS-04]] |
| F033 | Pseudo-states (`:hover`, `:focus`, `:active`, `:focus-visible`, `::before/after`) + force state | P0 | [[Modules/CSS_VISUAL_INSPECTOR/CSS-04_CLASSES_STATES\|CSS-04]] |
| F034 | Media query / breakpoint editing context | P0 | [[Modules/CSS_VISUAL_INSPECTOR/CSS-04_CLASSES_STATES\|CSS-04]] |
| F035 | Design tokens panel (CSS custom properties) | P1 | [[Modules/CSS_VISUAL_INSPECTOR/CSS-04_CLASSES_STATES\|CSS-04]] |

## M4 · Component Library & Asset Manager → [[Modules/COMPONENT_LIBRARY/_INDEX|COMPONENT_LIBRARY]]

| ID | Fitur | Prioritas | Spec |
|---|---|---|---|
| F036 | HTML primitives palette (layout, text, media, form, semantic) | P0 | [[Modules/COMPONENT_LIBRARY/COMP-01_INSERTION_LOGIC\|COMP-01]] |
| F037 | Prebuilt blocks (navbar, hero, card grid, footer, pricing) | P1 | [[Modules/COMPONENT_LIBRARY/COMP-01_INSERTION_LOGIC\|COMP-01]] |
| F038 | Custom Web Components (`customElements`, shadow DOM preview) | P1 | [[Modules/COMPONENT_LIBRARY/COMP-01_INSERTION_LOGIC\|COMP-01]] |
| F039 | Insertion logic: drop target resolution, content model, CSS scoping | P0 | [[Modules/COMPONENT_LIBRARY/COMP-01_INSERTION_LOGIC\|COMP-01]] |
| F040 | User components / symbols (master + instance, override slot) | P2 | [[Modules/COMPONENT_LIBRARY/COMP-01_INSERTION_LOGIC\|COMP-01]] |
| F041 | Asset Manager: upload, dedupe hash, drag gambar → `<img>`/`background-image` | P0 | [[Modules/COMPONENT_LIBRARY/COMP-02_ASSET_MANAGER\|COMP-02]] |

## M5 · Code Sync Engine (Code View / Monaco) → [[Modules/CODE_SYNC_ENGINE/_INDEX|CODE_SYNC_ENGINE]]

| ID | Fitur | Prioritas | Spec |
|---|---|---|---|
| F042 | Monaco multi-file editor (HTML/CSS/JS) + Emmet | P0 | [[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS\|SYNC-01]] |
| F043 | Visual → Code: range-splice printer (formatting-preserving) | P0 | [[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS\|SYNC-01]] |
| F044 | Code → Visual: incremental reparse + ID reconciliation | P0 | [[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS\|SYNC-01]] |
| F045 | Cursor ↔ selection sync (dua arah) | P0 | [[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS\|SYNC-01]] |
| F046 | Error tolerance: last-good AST, diagnostics, quick-fix | P0 | [[Modules/CODE_SYNC_ENGINE/SYNC-02_FORMAT_DIAGNOSTICS\|SYNC-02]] |
| F047 | Prettier format (worker), format-on-save opsional | P1 | [[Modules/CODE_SYNC_ENGINE/SYNC-02_FORMAT_DIAGNOSTICS\|SYNC-02]] |

## M6 · Export Build Pipeline → [[Modules/EXPORT_BUILD_PIPELINE/_INDEX|EXPORT_BUILD_PIPELINE]]

| ID | Fitur | Prioritas | Spec |
|---|---|---|---|
| F048 | Clean HTML export (strip design-time artifacts) | P0 | [[Modules/EXPORT_BUILD_PIPELINE/EXP-01_PROJECT_EXPORT\|EXP-01]] |
| F049 | CSS build: dedupe, prefix, minify (Lightning CSS), unused-rule report | P0 | [[Modules/EXPORT_BUILD_PIPELINE/EXP-01_PROJECT_EXPORT\|EXP-01]] |
| F050 | Tailwind mode (utility authoring + JIT compile) | P1 | [[Modules/EXPORT_BUILD_PIPELINE/EXP-02_TAILWIND_VALIDATION\|EXP-02]] |
| F051 | Asset pipeline (resize, WebP/AVIF, `srcset`, self-host font) | P1 | [[Modules/EXPORT_BUILD_PIPELINE/EXP-01_PROJECT_EXPORT\|EXP-01]] |
| F052 | ZIP builder & folder export (streaming) | P0 | [[Modules/EXPORT_BUILD_PIPELINE/EXP-01_PROJECT_EXPORT\|EXP-01]] |
| F053 | Pre-export validation (HTML validity, a11y, broken links) | P1 | [[Modules/EXPORT_BUILD_PIPELINE/EXP-02_TAILWIND_VALIDATION\|EXP-02]] |

## M0 · Cross-Cutting Engine → [[01_SYSTEM_ARCHITECTURE|System Architecture]]

| ID | Fitur | Prioritas | Spec |
|---|---|---|---|
| F054 | Undo/Redo CRDT (Yjs UndoManager, gesture grouping) | P0 | [[01_SYSTEM_ARCHITECTURE#8. Undo Redo CRDT Command Layer\|ARCH §8]] |
| F055 | Hot-reloading state preservation | P0 | [[01_SYSTEM_ARCHITECTURE#10. Hot-Reloading State\|ARCH §10]] |
| F056 | Command Bus, Command Palette, autosave OPFS | P0 | [[01_SYSTEM_ARCHITECTURE#12. Command Bus & Command Palette\|ARCH §12]] |

---

## Ringkasan Cakupan

| Modul | Jumlah Fitur | P0 | P1 | P2 |
|---|---|---|---|---|
| Canvas Engine | 14 | 9 | 5 | 0 |
| DOM Tree Layers | 6 | 5 | 1 | 0 |
| CSS Visual Inspector | 15 | 10 | 4 | 1 |
| Component Library & Assets | 6 | 3 | 2 | 1 |
| Code Sync Engine | 6 | 5 | 1 | 0 |
| Export Build Pipeline | 6 | 3 | 3 | 0 |
| Cross-Cutting | 3 | 3 | 0 | 0 |
| **Total** | **56** | **38** | **16** | **2** |

➡️ Alur integrasi seluruh fitur: [[Workflows/DESIGN_TO_CODE_LIFECYCLE|Design → Code Lifecycle]]
