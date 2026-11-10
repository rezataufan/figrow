---
id: CANVAS
type: module-index
tags: [vds/module, vds/canvas]
---

# Module M1 — CANVAS_ENGINE

- **Navigasi Induk:** [[00_INDEX|Studio Workspace]] > Index Modul CANVAS_ENGINE
- **Arsitektur:** [[01_SYSTEM_ARCHITECTURE#3. Topologi Runtime (Threads & Origins)|Topologi Runtime]] · [[01_SYSTEM_ARCHITECTURE#13. Transient Preview vs Commit (60 FPS Rule)|60 FPS Rule]]
- **Fitur Inventaris:** F001 – F014 ([[02_FEATURE_INVENTORY|lihat inventaris]])

## Tanggung Jawab
Infinite canvas yang menampung **artboard iframe** (live DOM), kamera (pan/zoom), overlay seleksi di dokumen host, serta seluruh gesture langsung di kanvas (hover, select, resize, drag).

## Spesifikasi Fitur
| Spec | Cakupan | Fitur |
|---|---|---|
| [[Modules/CANVAS_ENGINE/CANVAS-01_ZOOM_PAN\|CANVAS-01 Zoom, Pan & Artboards]] | Kamera, artboard, breakpoint, virtualisasi iframe, rulers | F001–F006 |
| [[Modules/CANVAS_ENGINE/CANVAS-02_SELECTION_BOUNDS\|CANVAS-02 Selection & Bounds]] | Hover, seleksi, box-model overlay, resize, smart guides | F007–F011 |
| [[Modules/CANVAS_ENGINE/CANVAS-03_DRAG_DROP_REORDER\|CANVAS-03 Drag, Drop & Reorder]] | Reorder flow, flex/grid drop, absolute, nudge | F012–F014 |
| [[Modules/CANVAS_ENGINE/CANVAS-04_ARTBOARDS_GUIDES\|CANVAS-04 Multi-Page Artboards, Rulers & Smart Guides]] | Matriks halaman × breakpoint, rulers, guides, LRU iframe freeze/thaw | F005, F006, F011 |

## Layer Rendering Stack (bawah → atas)
```text
z0  Canvas background (grid dots, Canvas2D)
z1  Artboard frames  (div.transform → iframe width=breakpoint, height=auto-measured)
z2  Overlay SVG      (hover outline, selection bounds, box-model tint, guides)
z3  Handles & HUD    (resize handles, dimension badge, insertion indicator)
z4  Floating bars    (context toolbar, breakpoint switcher)
```

## Integrasi
- Seleksi → [[Modules/CSS_VISUAL_INSPECTOR/_INDEX|CSS Visual Inspector]] & [[Modules/DOM_TREE_LAYERS/_INDEX|Layers Tree]]
- Drop dari library → [[Modules/COMPONENT_LIBRARY/COMP-01_INSERTION_LOGIC|Insertion Logic]]
- Seleksi ↔ kursor kode → [[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS|SYNC-01]]
