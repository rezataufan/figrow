---
id: COMP
type: module-index
tags: [vds/module, vds/components]
---

# Module M4 — COMPONENT_LIBRARY

- **Navigasi Induk:** [[00_INDEX|Studio Workspace]] > Index Modul COMPONENT_LIBRARY
- **Arsitektur:** [[01_SYSTEM_ARCHITECTURE#7. Virtual DOM Sync Pipeline|Virtual DOM Sync Pipeline]]
- **Fitur Inventaris:** F036 – F041

## Tanggung Jawab
Palet **Insert** di Left Sidebar: HTML primitives, blocks siap pakai, Custom Web Components, user symbols, serta **Asset Manager** (gambar, SVG, font).

## Katalog
| Kategori | Contoh | Format Sumber |
|---|---|---|
| Layout | `section`, `div`, `header`, `main`, `footer`, `nav`, `article`, `aside` | snippet HTML |
| Text | `h1`–`h6`, `p`, `span`, `a`, `blockquote`, `ul/ol/li` | snippet HTML |
| Media | `img`, `picture`, `video`, `svg`, `iframe` | snippet HTML + asset ref |
| Form | `form`, `input[type=*]`, `label`, `select`, `textarea`, `button` | snippet HTML |
| Blocks | Navbar, Hero, Card Grid, Pricing, Footer | HTML + CSS scoped (BEM) |
| Web Components | `<vds-accordion>`, user `customElements` | HTML + JS module |
| Symbols (P2) | Komponen buatan user | master file + instance |

## Spesifikasi Fitur
| Spec | Cakupan | Fitur |
|---|---|---|
| [[Modules/COMPONENT_LIBRARY/COMP-01_INSERTION_LOGIC\|COMP-01 Insertion Logic & Assets]] | drop target, content model, CSS merge, web components, assets | F036–F041 |
| [[Modules/COMPONENT_LIBRARY/COMP-02_ASSET_MANAGER\|COMP-02 Asset Manager & SVG/Font Pipeline]] | SHA-256 deduplication, usage graph, SVG sanitizer, oversized detector | F041, F051 |

## Integrasi
- Drop indicator dan hit-test → [[Modules/CANVAS_ENGINE/CANVAS-03_DRAG_DROP_REORDER|CANVAS-03]]
- Drop ke tree → [[Modules/DOM_TREE_LAYERS/LAYER-01_TREE_REORDER|LAYER-01]]
- Asset → [[Modules/EXPORT_BUILD_PIPELINE/EXP-01_PROJECT_EXPORT|Export asset pipeline]]
