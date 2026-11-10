---
id: EXPORT
type: module-index
tags: [vds/module, vds/export]
---

# Module M6 — EXPORT_BUILD_PIPELINE

- **Navigasi Induk:** [[00_INDEX|Studio Workspace]] > Index Modul EXPORT_BUILD_PIPELINE
- **Arsitektur:** [[01_SYSTEM_ARCHITECTURE#2. Tech Stack|Tech Stack (Lightning CSS, Tailwind, fflate)]] · [[01_SYSTEM_ARCHITECTURE#11. Project Storage & Autosave|Project Storage]]
- **Fitur Inventaris:** F048 – F053

## Tanggung Jawab
Mengubah proyek (yang sudah berupa HTML/CSS nyata) menjadi **artefak produksi**: file bersih tanpa artefak studio, CSS teroptimasi, Tailwind opsional, aset teroptimasi, ZIP/folder.

## Pipeline Stages
```mermaid
flowchart LR
  A["Snapshot Y.Doc"] --> B["Validate"]
  B --> C["HTML Clean"]
  C --> D["CSS Build"]
  D --> E["Tailwind JIT (opsional)"]
  E --> F["Asset Optimize"]
  F --> G["Rewrite URLs"]
  G --> H["ZIP / Folder"]
```

## Spesifikasi Fitur
| Spec | Cakupan | Fitur |
|---|---|---|
| [[Modules/EXPORT_BUILD_PIPELINE/EXP-01_PROJECT_EXPORT\|EXP-01 Project Export]] | clean HTML, CSS build, Tailwind, aset, ZIP, validasi | F048–F053 |
| [[Modules/EXPORT_BUILD_PIPELINE/EXP-02_TAILWIND_VALIDATION\|EXP-02 Tailwind v4 Bilingual Mode & Pre-Export Auditor]] | Bidirectional utility mapper, live JIT, a11y/LCP/semantics auditor | F050, F053 |

## Integrasi
- Sumber data → [[Modules/CODE_SYNC_ENGINE/_INDEX|Code Sync Engine]]
- Aset → [[Modules/COMPONENT_LIBRARY/COMP-01_INSERTION_LOGIC#Asset Manager Sub-Panel|Asset Manager]]
- Alur penuh → [[Workflows/DESIGN_TO_CODE_LIFECYCLE|Design → Code Lifecycle]]
