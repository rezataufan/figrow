---
id: EXP-01
module: EXPORT_BUILD_PIPELINE
features: [F048, F049, F050, F051, F052, F053]
tags: [vds/spec, vds/export, vds/build]
---

# EXP-01: Project Export (Clean HTML/CSS, Tailwind, Assets, ZIP)

- **Navigasi Induk:** [[00_INDEX|Studio Workspace]] > [[Modules/EXPORT_BUILD_PIPELINE/_INDEX|Index Modul EXPORT_BUILD_PIPELINE]]
- **Target Engine:** Build Worker (HTML cleaner, Lightning CSS, Tailwind compile, image codecs, fflate)
- **Status:** [ ] Planned | [ ] In Progress | [x] Completed
- **Relasi:** [[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS|SYNC-01 (sumber)]] · [[Modules/COMPONENT_LIBRARY/COMP-01_INSERTION_LOGIC#Asset Manager Sub-Panel|Asset Manager]] · [[Modules/CSS_VISUAL_INSPECTOR/CSS-04_CLASSES_STATES#Design Tokens Panel|Design Tokens]] · [[Workflows/DESIGN_TO_CODE_LIFECYCLE|Lifecycle]]

---

## 1. UI Hierarchy & Interaksi Workspace

- **Posisi Komponen:** Toolbar `⬇ Export` → modal **Export** (center) + Bottom Panel tab "Build log".
- **Wireframe Tekstual & Elemen Visual:**

```text
┌ Export Project ───────────────────────────────────────────── × ┐
│ Preset: [ Production ▾ ]   (Production · Readable · Tailwind)  │
│ ── Output ─────────────────────────────────────────────────────│
│ Format     (●) ZIP  ( ) Folder  ( ) Copy HTML of selection     │
│ Pages      [✓] index.html [✓] about.html [ ] _drafts/test.html │
│ ── HTML ───────────────────────────────────────────────────────│
│ [✓] Remove design-time artifacts      [ ] Minify HTML          │
│ [✓] Keep comments                     Formatter: Prettier ▾   │
│ ── CSS ────────────────────────────────────────────────────────│
│ Mode (●) Plain CSS ( ) Tailwind v4                             │
│ [✓] Autoprefix (browserslist: "defaults")  [✓] Minify          │
│ [✓] Merge duplicate rules  [ ] Remove unused (report only ▾)  │
│ [ ] Export tokens.json (W3C Design Tokens)                     │
│ ── Assets ─────────────────────────────────────────────────────│
│ Images → [WebP ▾] q[80]  [✓] Generate srcset (1x,2x)          │
│ Fonts  → [✓] Self-host Google Fonts                            │
│ ── Validation ─────────────────────────────────────────────────│
│ ✓ HTML valid   ⚠ 2 images missing alt   ✓ No broken links      │
│                                       [ Cancel ] [ ⬇ Export ] │
└────────────────────────────────────────────────────────────────┘
```

  - **Indikator breakpoint:** ringkasan media query yang akan diekspor (`3 breakpoints: base, ≤1023, ≤767`).

- **Interaksi Pengguna (Trigger & Action):**

| Trigger | Action |
|---|---|
| `Ctrl+E` / klik `⬇ Export` | Buka modal; validasi berjalan otomatis di Build Worker |
| Klik item validasi ⚠ | Tutup modal → pilih elemen bermasalah di kanvas ([[Modules/CANVAS_ENGINE/CANVAS-02_SELECTION_BOUNDS\|selection]]) → [[Modules/CSS_VISUAL_INSPECTOR/CSS-01_BOX_MODEL\|Inspector]] / atribut |
| Klik `Export` | Pipeline berjalan dengan progress bar per stage; hasil diunduh (ZIP) atau ditulis ke folder (File System Access API / Tauri) |
| Klik kanan elemen ▸ *Copy HTML+CSS* | Export parsial: HTML subtree + rule CSS yang match (termasuk state & media) ke clipboard |
| Klik toggle "Source Code" | Buka [[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS\|Monaco Live Editor]] (mis. memperbaiki error validasi) |

---

## 2. DOM Mutation & CSS Engine Logic

- **Virtual DOM / AST Handling:**
  - Export bekerja pada **snapshot immutable** `Y.Doc` (`Y.encodeStateAsUpdate` → doc salinan di worker) sehingga user dapat terus mengedit selama build.
  - **Stage 1 — Validate (F053):** parse5 error list, a11y rules dasar (alt, label form, heading order, kontras via computed colors dari agent), broken internal links/asset, duplicate id.
  - **Stage 2 — HTML Clean (F048):** sumber `Y.Text` sudah bersih dari `data-vds-*` (karena id hanya ada di preview). Cleaner tetap menjalankan *defense in depth*: hapus atribut `data-vds-*`, komentar `<!-- vds:* -->` (opsional), `designMeta` tidak pernah dibaca. Hidden-in-design **tidak** berpengaruh (elemen tetap diekspor).
  - **Stage 3 — CSS Build (F049):** concat sesuai urutan `<link>` per page → Lightning CSS `transform({ minify, targets: browserslistToTargets(...), drafts: { customMedia: true } })`; merge rule duplikat dengan selector & media identik (hanya bila tidak mengubah urutan cascade antar-rule yang berinteraksi); laporan *unused selectors* dihitung dengan `querySelector` terhadap semua page (report-only default, karena kelas bisa ditambahkan JS).
  - **Stage 4 — Tailwind (F050):** dalam mode Tailwind, Inspector menulis utility class (mis. `p-6 md:p-10 hover:bg-indigo-600`); build memanggil `compile(css).build(candidates)` dengan kandidat dari scan semua file HTML/JS → `tailwind.css` minimal. Konversi *Plain → Tailwind* (opsional) memetakan deklarasi ke utility terdekat atau arbitrary value `p-[18px]`.
  - **Stage 5 — Assets (F051):** decode → resize ke lebar tampil maksimum ×2 (diambil dari pengukuran `rects` di semua breakpoint) → encode WebP/AVIF → `srcset`/`sizes` ditulis ke `<img>`; Google Fonts diunduh (`woff2` subset) → `@font-face` lokal menggantikan `<link>` Google.
  - **Stage 6 — Rewrite URLs:** hash content (`styles.3f9a2c.css`) opsional, update referensi di HTML/CSS.
  - **Stage 7 — Package (F052):** `fflate` streaming `Zip` → `Blob` → download; atau tulis berkas satu per satu ke folder.
- **Bi-directional Sync Rules:** Export bersifat satu arah (read-only terhadap dokumen). Satu-satunya efek balik: *quick-fix* dari validasi (mis. tambah `alt`) dijalankan sebagai Command biasa di dokumen live, lalu export memakai snapshot baru.
- **Undo / Redo Stack:** Export tidak menghasilkan entri undo. Quick-fix validasi menghasilkan entri biasa ("Add alt text to img.hero__media"). Riwayat export (`settings.exportHistory`: waktu, preset, hash) disimpan untuk *Re-export last*.

---

## 3. Data Schema & State Model

- **Local State Komponen:**

```typescript
interface ExportConfig {
  preset: 'production' | 'readable' | 'tailwind' | 'custom';
  output: { kind: 'zip' | 'folder' | 'clipboard'; pages: string[] };
  html: { stripDesignArtifacts: true; minify: boolean; keepComments: boolean; format: 'prettier' | 'none' };
  css: { mode: 'plain' | 'tailwind'; autoprefix: boolean; browserslist: string; minify: boolean;
         mergeDuplicates: boolean; unused: 'keep' | 'report' | 'remove'; exportTokensJson: boolean; contentHash: boolean };
  assets: { imageFormat: 'original' | 'webp' | 'avif'; quality: number; srcset: boolean; selfHostFonts: boolean };
}

interface ExportJobState {
  selectedNodeId: string | null;           // untuk export parsial "Copy HTML+CSS"
  computedStyles: Record<string, string>;
  isDragging: boolean;
  stage: 'idle' | 'validate' | 'html' | 'css' | 'tailwind' | 'assets' | 'rewrite' | 'package' | 'done' | 'failed';
  progress: number;                        // 0..1
  issues: Array<{ severity: 'error' | 'warning'; rule: string; file: string; nodeKey?: string; message: string }>;
  output?: { files: Array<{ path: string; bytes: number }>; totalBytes: number; blobUrl?: string };
}
```

- **Generated Output Contract (Pure HTML/CSS):**

Struktur ZIP:

```text
my-site.zip
├── index.html
├── about.html
├── css/
│   └── styles.3f9a2c.css
├── assets/
│   ├── img/hero-1280.webp
│   ├── img/hero-2560.webp
│   └── fonts/inter-latin-600.woff2
└── tokens.json            (opsional)
```

`index.html` hasil export (preset Readable — tanpa jejak studio):

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Acme — Build faster</title>
  <link rel="preload" href="assets/fonts/inter-latin-600.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="css/styles.3f9a2c.css">
</head>
<body>
  <section class="hero">
    <h1 class="hero__title">Build faster</h1>
    <img class="hero__media"
         src="assets/img/hero-1280.webp"
         srcset="assets/img/hero-1280.webp 1280w, assets/img/hero-2560.webp 2560w"
         sizes="(max-width: 767.98px) 100vw, 50vw"
         width="1280" height="720" alt="Dashboard preview">
  </section>
</body>
</html>
```

`styles.css` (Readable, sebelum minify):

```css
@font-face {
  font-family: "Inter";
  src: url("../assets/fonts/inter-latin-600.woff2") format("woff2");
  font-weight: 600;
  font-display: swap;
}
.hero { display: grid; gap: 24px; padding: 96px 64px; }
.hero__title { font: 600 clamp(2rem, 1.2958rem + 3.0047vw, 4rem)/1.1 "Inter", system-ui, sans-serif; }
@media (max-width: 767.98px) {
  .hero { padding: 40px 16px; }
}
```

Preset Tailwind:

```html
<section class="grid gap-6 px-16 py-24 max-md:px-4 max-md:py-10">
  <h1 class="text-[clamp(2rem,1.2958rem+3.0047vw,4rem)] font-semibold leading-[1.1]">Build faster</h1>
</section>
```

---

## 4. Edge Cases, Performance & Sandboxing

- **Iframe Sandboxing & Security:** Build Worker tidak memiliki akses DOM/iframe; pengukuran yang dibutuhkan (ukuran tampil gambar, kontras) diambil dari cache `rects`/computed hasil agent sebelum build. Unduhan font/aset eksternal melalui proxy allowlist; URL `javascript:` dan `data:` HTML di-flag pada validasi.
- **Performance:**
  - Seluruh pipeline di Web Worker; encode gambar paralel (`navigator.hardwareConcurrency - 1` worker pool).
  - Cache inkremental berbasis hash konten: re-export hanya memproses file/aset yang berubah (target < 2 s untuk proyek 20 halaman tanpa perubahan aset).
  - ZIP streaming → memori puncak ≈ ukuran file terbesar, bukan total proyek.
- **Conflict Handling:**
  - **Merge duplikat vs cascade:** dua rule `.a{}` terpisah oleh `.b{}` yang mengubah properti sama tidak digabung (dapat mengubah hasil cascade) — analisis per properti sebelum merge.
  - **Inline styles:** diekspor apa adanya (valid HTML); opsi *Extract inline styles to classes* (membuat `.u-xxxx` hash class) hanya bila diminta.
  - **Class eksternal (CDN):** `<link>` CDN dipertahankan; opsi *Vendor locally* mengunduh dan me-bundle.
  - **Tailwind + plain CSS campuran:** urutan output `@layer base, components, utilities` + CSS proyek di layer `components` agar utility tetap menang sesuai ekspektasi Tailwind.
  - **Unused CSS yang dipakai JS** (class ditambahkan runtime): mode `remove` memerlukan safelist; default `report` agar tidak merusak.
  - **Error validasi severity error** (mis. HTML fatal): export tetap dapat dipaksa dengan konfirmasi, laporan disertakan sebagai `export-report.json`.
