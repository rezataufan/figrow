---
id: CSSI
type: module-index
tags: [vds/module, vds/css]
---

# Module M3 — CSS_VISUAL_INSPECTOR

- **Navigasi Induk:** [[00_INDEX|Studio Workspace]] > Index Modul CSS_VISUAL_INSPECTOR
- **Arsitektur:** [[01_SYSTEM_ARCHITECTURE#6. CSS AST & CSSOM Mapping|CSS AST & CSSOM Mapping]] · [[01_SYSTEM_ARCHITECTURE#13. Transient Preview vs Commit (60 FPS Rule)|60 FPS Rule]]
- **Fitur Inventaris:** F021 – F035

## Tanggung Jawab
Right Inspector bergaya Figma yang **menulis CSS valid ke rule nyata** (class, selector, media query, pseudo-state) — bukan sekadar inline style.

## Anatomi Inspector (atas → bawah)
```text
┌ Selector Bar ─────────────────────────────┐  → CSS-04
│ Target: [.card ▾] State: [none ▾] @[≥768 ▾]│
├ Layout ───────────────────────────────────┤  → CSS-02
├ Box Model / Size ─────────────────────────┤  → CSS-01
├ Typography ───────────────────────────────┤  → CSS-03
├ Background / Border / Effects ────────────┤  (P1, pola sama CSS-01)
└ Computed & Cascade (collapsible) ─────────┘  → CSS-04
```

## Spesifikasi Fitur
| Spec | Cakupan | Fitur |
|---|---|---|
| [[Modules/CSS_VISUAL_INSPECTOR/CSS-01_BOX_MODEL\|CSS-01 Box Model & Sizing]] | margin, padding, border, sizing, scrub input unit-aware | F021–F023 |
| [[Modules/CSS_VISUAL_INSPECTOR/CSS-02_FLEXBOX_GRID\|CSS-02 Flexbox & Grid]] | display, flex, grid, child item | F024–F026 |
| [[Modules/CSS_VISUAL_INSPECTOR/CSS-03_TYPOGRAPHY\|CSS-03 Typography]] | font, unit, line-height, shadow, clamp | F027–F030 |
| [[Modules/CSS_VISUAL_INSPECTOR/CSS-04_CLASSES_STATES\|CSS-04 Classes, States & Media]] | class manager, style target, pseudo-state, media, tokens | F031–F035 |
| [[Modules/CSS_VISUAL_INSPECTOR/CSS-05_BACKGROUNDS_EFFECTS\|CSS-05 Backgrounds, Shadows, Filters & Transforms]] | multi-layer gradient/image, box-shadow, backdrop-filter, 2D/3D transform | F021, F023, F035 |

## Kontrak Bersama: `StyleWriteTarget`
Semua sub-panel menulis via satu command `style.set` dengan target hasil resolusi Selector Bar:
```typescript
type StyleWriteTarget =
  | { kind: 'inline'; nodeId: string }
  | { kind: 'rule'; ruleId: string }                                   // rule existing
  | { kind: 'newRule'; selector: string; file: string; media: string | null; state: string | null };
```
Resolusi target dijelaskan di [[Modules/CSS_VISUAL_INSPECTOR/CSS-04_CLASSES_STATES|CSS-04]].
