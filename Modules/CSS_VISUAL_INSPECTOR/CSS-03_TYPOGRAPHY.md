---
id: CSS-03
module: CSS_VISUAL_INSPECTOR
features: [F027, F028, F029, F030]
tags: [vds/spec, vds/css, vds/typography]
---

# CSS-03: Typography (Fonts, Units, Line-Height, Text Shadow)

- **Navigasi Induk:** [[00_INDEX|Studio Workspace]] > [[Modules/CSS_VISUAL_INSPECTOR/_INDEX|Index Modul CSS_VISUAL_INSPECTOR]]
- **Target Engine:** CSS Parser / Iframe DOM (font loading, computed) / Asset pipeline (font files)
- **Status:** [ ] Planned | [ ] In Progress | [x] Completed
- **Relasi:** [[Modules/CSS_VISUAL_INSPECTOR/CSS-04_CLASSES_STATES|CSS-04 Tokens]] · [[Modules/COMPONENT_LIBRARY/COMP-01_INSERTION_LOGIC#Asset Manager Sub-Panel|Asset Manager (fonts)]] · [[Modules/EXPORT_BUILD_PIPELINE/EXP-01_PROJECT_EXPORT|Export (self-host fonts)]]

---

## 1. UI Hierarchy & Interaksi Workspace

- **Posisi Komponen:** Right Inspector → section **Typography**.
- **Wireframe Tekstual & Elemen Visual:**

```text
┌ Typography ────────────────────────────── Aa ┐
│ Font   [ Inter                        ▾ ]    │  ← searchable: Project · Google · System
│ Weight [ 600 SemiBold ▾]  Style [ normal ▾]  │
│ Size   [ 1.25  rem ▾ ]  = 20px               │  ← konversi live
│ Line   [ 1.4   — ▾ ]   Letter [ -0.01 em ]   │  ← "—" = unitless (direkomendasikan)
│ Color  [■ #0F172A ] [ var(--text-1) ⛓ ]      │
│ Align  [⯇][≡][⯈][☰]  Transform [Aa|AA|aa]    │
│ Decor  [ U ][ S ][ ⎯ ]  Wrap [balance ▾]      │
│ ▸ Text shadow (2)                         +  │
│    0 1px 2px rgba(0,0,0,.2)   👁 🗑          │
│    0 0 24px #6366F1           👁 🗑          │
│ ▸ Fluid size (clamp)  ☐                       │
│    min [1rem] @ [375px]  max [1.5rem] @ [1440]│
└──────────────────────────────────────────────┘
```

  - **Font picker:** tiga grup — *Project fonts* (`@font-face` di proyek), *Google Fonts* (katalog API), *System stacks* (`system-ui`, `ui-serif`, `ui-monospace`). Preview nama font dalam font-nya sendiri (lazy-load subset latin).
  - **Weight dropdown** hanya menampilkan weight yang tersedia untuk family tsb (variable font → slider 100–900).
  - **Unit konversi:** di sebelah nilai tampil hasil px computed (`= 20px`) agar desainer memahami rem/em.
  - **Indikator breakpoint:** pill `@375` bila ukuran berbeda di mobile.

- **Interaksi Pengguna (Trigger & Action):**

| Trigger | Action |
|---|---|
| Pilih font Google | Tambah `<link rel="preconnect">` + `<link href="fonts.googleapis.com/css2?...">` ke `<head>` (atau `@import`, sesuai settings) & tulis `font-family` dengan fallback stack |
| Ganti unit `px → rem` | Nilai dikonversi mempertahankan ukuran visual (20px → 1.25rem) |
| Scrub size/line-height | Transient 60 FPS, reflow teks live |
| Tambah shadow `+` | Layer baru default `0 1px 2px rgb(0 0 0 / .25)`; editor offset XY pad, blur, warna |
| Aktifkan Fluid size | Generator `clamp()` (F030) |
| Double-click teks di Canvas | Inline edit konten (lihat [[Modules/CANVAS_ENGINE/CANVAS-02_SELECTION_BOUNDS\|CANVAS-02]]) |
| Klik elemen di Canvas | Selection outline → aktifkan [[Modules/CSS_VISUAL_INSPECTOR/CSS-01_BOX_MODEL\|Inspector Box Model]] + Typography |
| Klik toggle "Source Code" | Buka [[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS\|Monaco Live Editor]] |

---

## 2. DOM Mutation & CSS Engine Logic

- **Virtual DOM / AST Handling:**
  - Properti teks → `style.set` (lihat kontrak di [[Modules/CSS_VISUAL_INSPECTOR/_INDEX|Index modul]]).
  - **Font Google:** command komposit `font.addFamily` = (a) `TextEdit` HTML pada `<head>` setiap page yang memakai stylesheet terkait — sisip setelah `<link rel="stylesheet">` terakhir atau update URL `css2?family=` existing dengan menggabungkan family/weight (tidak duplikat link); (b) `style.set font-family`.
  - **Project font upload** (`.woff2`): aset disimpan di OPFS → `@font-face` rule ditambahkan ke stylesheet `fonts.css` (dibuat bila belum ada) dengan `font-display: swap`.
  - **Text-shadow:** `postcss-value-parser` memecah list dipisah koma → `ShadowLayer[]`; toggle 👁 menyembunyikan layer secara transient saja (tidak bisa "disable" di CSS tanpa menghapus) — saat commit layer tersembunyi dihapus dari nilai, tapi disimpan di `designMeta.disabledShadows` agar bisa diaktifkan kembali.
  - **Fluid clamp generator:**

```typescript
function fluidClamp(minRem: number, maxRem: number, minVwPx: number, maxVwPx: number, root = 16): string {
  const slope = ((maxRem - minRem) * root) / (maxVwPx - minVwPx);        // px per px
  const interceptRem = minRem - (slope * minVwPx) / root;
  return `clamp(${minRem}rem, ${round(interceptRem, 4)}rem + ${round(slope * 100, 4)}vw, ${maxRem}rem)`;
}
// fluidClamp(1, 1.5, 375, 1440) -> "clamp(1rem, 0.8239rem + 0.7512vw, 1.5rem)"
```
- **Bi-directional Sync Rules:**
  - `font` shorthand (`font: 600 1.25rem/1.4 Inter, sans-serif`) di kode → Inspector memecah ke sub-kontrol; edit satu sub-nilai menulis kembali ke shorthand (urutan grammar `font` dihormati).
  - Edit manual URL Google Fonts di Monaco → Font picker mendeteksi family yang tersedia dari URL (parse query `family=`).
  - Nilai dengan `var()` ditampilkan sebagai chip token; resolved value terlihat di tooltip.
- **Undo / Redo Stack:** `font.addFamily` (link + declaration) = satu entri atomik "Use font Inter 400/600". Shadow layer add/remove/edit = entri per commit.

---

## 3. Data Schema & State Model

- **Local State Komponen:**

```typescript
interface TypographyState {
  selectedNodeId: string | null;
  computedStyles: Record<string, string>;     // font-size resolved px, line-height px, color rgb
  isDragging: boolean;
  declared: Partial<Record<TypoProp, DeclaredValue>>;   // DeclaredValue dari CSS-01
  fontAvailability: { family: string; weights: number[]; italic: boolean; variableAxes?: Record<string, [number, number]> } | null;
  fontLoadStatus: 'loaded' | 'loading' | 'fallback' | 'error';   // dari agent document.fonts
  shadows: ShadowLayer[];
  fluid: { enabled: boolean; minRem: number; maxRem: number; minVw: number; maxVw: number } | null;
}

type TypoProp = 'font-family' | 'font-weight' | 'font-style' | 'font-size' | 'line-height' | 'letter-spacing'
  | 'color' | 'text-align' | 'text-transform' | 'text-decoration-line' | 'text-wrap' | 'text-shadow' | 'font-variation-settings';

interface ShadowLayer { x: string; y: string; blur: string; color: string; hidden?: boolean }

interface FontAsset { family: string; source: 'google' | 'project' | 'system'; files?: Array<{ weight: number; style: 'normal' | 'italic'; path: string; format: 'woff2' | 'woff' }> }
```

- **Generated Output Contract (Pure HTML/CSS):**

```html
<head>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap">
  <link rel="stylesheet" href="css/styles.css">
</head>
```

```css
.hero__title {
  font-family: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
  font-weight: 600;
  font-size: clamp(2rem, 1.2958rem + 3.0047vw, 4rem);
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: var(--text-1);
  text-wrap: balance;
  text-shadow: 0 1px 2px rgb(0 0 0 / 0.2), 0 0 24px #6366f1;
}

/* project font */
@font-face {
  font-family: "Brand Sans";
  src: url("../assets/fonts/brand-sans-600.woff2") format("woff2");
  font-weight: 600;
  font-style: normal;
  font-display: swap;
}
```

---

## 4. Edge Cases, Performance & Sandboxing

- **Iframe Sandboxing & Security:** Font eksternal hanya dari allowlist (`fonts.googleapis.com`, `fonts.gstatic.com`, domain yang ditambahkan user). CSP iframe `font-src` & `style-src` mengikuti allowlist. File font upload divalidasi magic bytes (`wOF2`/`wOFF`) sebelum disimpan.
- **Performance:**
  - Preview font di picker memakai `text=` subset (`&text=Inter`) → < 2 KB per item; list virtualized (1.500+ family).
  - Scrub font-size memicu reflow; tetap 60 FPS untuk dokumen tipikal karena transient hanya pada satu elemen. Jika frame > 24 ms terdeteksi 3× berturut-turut, transient beralih ke update per 2 frame (adaptive throttle).
  - Agent memantau `document.fonts.onloadingdone` → kirim `rects` ulang (layout shift setelah font termuat).
- **Conflict Handling:**
  - **Inheritance:** nilai yang diwarisi (dari `body`) ditampilkan abu dengan label "inherited from body"; mengedit menulis ke target saat ini, tidak ke `body`.
  - **`em` bertingkat:** mengubah `font-size` parent mengubah turunan ber-`em`; Inspector memperingatkan "N descendants use em and will scale".
  - **Font belum termuat / gagal:** status `fallback` tampil ⚠ dan nama font fallback aktual (dari `document.fonts.check`).
  - **Weight tidak tersedia** (mis. 800 untuk family yang hanya 400/700): browser melakukan synthesis; Inspector menandai "faux bold".
  - **Class utility Tailwind** (mode Tailwind, [[Modules/EXPORT_BUILD_PIPELINE/EXP-01_PROJECT_EXPORT|EXP-01]]): kontrol menulis class (`text-xl font-semibold`) alih-alih deklarasi CSS.
