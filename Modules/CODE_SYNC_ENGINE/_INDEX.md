---
id: SYNC
type: module-index
tags: [vds/module, vds/code-sync]
---

# Module M5 — CODE_SYNC_ENGINE

- **Navigasi Induk:** [[00_INDEX|Studio Workspace]] > Index Modul CODE_SYNC_ENGINE
- **Arsitektur:** [[01_SYSTEM_ARCHITECTURE#7. Virtual DOM Sync Pipeline|Virtual DOM Sync Pipeline]] · [[01_SYSTEM_ARCHITECTURE#5. HTML AST & Node Identity|Node Identity]] · [[01_SYSTEM_ARCHITECTURE#10. Hot-Reloading State|Hot Reload]]
- **Fitur Inventaris:** F042 – F047

## Tanggung Jawab
Jantung "Pinegrow-style" two-way editing: Monaco ↔ `Y.Text` ↔ AST ↔ live DOM. Menjamin edit visual menghasilkan **diff kode minimal** dan edit kode langsung tercermin di kanvas tanpa reload.

## Spesifikasi Fitur
| Spec | Cakupan | Fitur |
|---|---|---|
| [[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS\|SYNC-01 AST ↔ Canvas Sync]] | Monaco, printer, reparse, reconciliation, error tolerance, Prettier | F042–F047 |
| [[Modules/CODE_SYNC_ENGINE/SYNC-02_FORMAT_DIAGNOSTICS\|SYNC-02 Formatter, Diagnostics & Conflict Recovery]] | Minimal-diff Prettier, error fence, quick-fix, 3-way external disk merge | F046–F047 |

## Invarian Sinkronisasi
| # | Invarian |
|---|---|
| I1 | `Y.Text` = satu-satunya sumber. Monaco model & AST adalah turunan. |
| I2 | Edit visual tidak pernah mengubah byte di luar range yang terdampak. |
| I3 | AST tidak pernah diterapkan ke kanvas bila parse menghasilkan error fatal (pakai last-good). |
| I4 | NodeId stabil lintas reparse selama node tidak diubah secara struktural. |

## Konsumen
[[Modules/CSS_VISUAL_INSPECTOR/_INDEX|Inspector]] · [[Modules/DOM_TREE_LAYERS/_INDEX|Layers]] · [[Modules/CANVAS_ENGINE/_INDEX|Canvas]] · [[Modules/EXPORT_BUILD_PIPELINE/_INDEX|Export]]
