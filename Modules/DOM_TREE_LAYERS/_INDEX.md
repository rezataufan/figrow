---
id: LAYERS
type: module-index
tags: [vds/module, vds/layers]
---

# Module M2 — DOM_TREE_LAYERS

- **Navigasi Induk:** [[00_INDEX|Studio Workspace]] > Index Modul DOM_TREE_LAYERS
- **Arsitektur:** [[01_SYSTEM_ARCHITECTURE#5. HTML AST & Node Identity|HTML AST & Node Identity]] · [[01_SYSTEM_ARCHITECTURE#4. Document Model — Source of Truth|Document Model (designMeta)]]
- **Fitur Inventaris:** F015 – F020

## Tanggung Jawab
Representasi hierarkis **VNode tree** (bukan DOM live) di Left Sidebar: reorder/reparent, rename, lock, hide, wrap/unwrap, dan sinkron seleksi dua arah dengan kanvas & kode.

## Spesifikasi Fitur
| Spec | Cakupan | Fitur |
|---|---|---|
| [[Modules/DOM_TREE_LAYERS/LAYER-01_TREE_REORDER\|LAYER-01 Tree, Reorder & Layer Ops]] | Virtualized tree, DnD, content-model validation, rename/lock/hide, wrap | F015–F020 |
| [[Modules/DOM_TREE_LAYERS/LAYER-02_STRUCTURAL_OPS\|LAYER-02 Structural Operations & Semantics]] | Wrap/Unwrap, Change semantic tag, HTML/ARIA attributes, selector impact | F019–F020 |

## Aturan Kunci
1. Tree dibangun dari AST Parse Worker, **bukan** dari `iframe.document` — sehingga node yang `display:none`, `<template>`, dan `<head>` tetap terlihat.
2. Semua mutasi melalui Command Bus → [[01_SYSTEM_ARCHITECTURE#12. Command Bus & Command Palette|Command Bus]].
3. Lock/hide/nama = sidecar `designMeta`, tidak diekspor → [[Modules/EXPORT_BUILD_PIPELINE/EXP-01_PROJECT_EXPORT|Export]].

## Integrasi
- Seleksi dan reveal ↔ [[Modules/CANVAS_ENGINE/CANVAS-02_SELECTION_BOUNDS|Selection & Bounds]]
- Reorder di kanvas berbagi validator dengan → [[Modules/CANVAS_ENGINE/CANVAS-03_DRAG_DROP_REORDER|CANVAS-03]]
