---
id: COMP-01
module: COMPONENT_LIBRARY
features: [F036, F037, F038, F039, F040, F041]
tags: [vds/spec, vds/components, vds/assets]
---

# COMP-01: Insertion Logic, Blocks, Web Components & Assets

- **Navigasi Induk:** [[00_INDEX|Studio Workspace]] > [[Modules/COMPONENT_LIBRARY/_INDEX|Index Modul COMPONENT_LIBRARY]]
- **Target Engine:** HTML AST (insert) / CSS Parser (merge block CSS) / Iframe DOM (custom elements) / Asset store (OPFS)
- **Status:** [ ] Planned | [ ] In Progress | [x] Completed
- **Relasi:** [[Modules/CANVAS_ENGINE/CANVAS-03_DRAG_DROP_REORDER|CANVAS-03 Drop Slot]] · [[Modules/DOM_TREE_LAYERS/LAYER-01_TREE_REORDER|LAYER-01 Validator]] · [[Modules/CSS_VISUAL_INSPECTOR/CSS-04_CLASSES_STATES|CSS-04 Class Conflicts]] · [[Modules/EXPORT_BUILD_PIPELINE/EXP-01_PROJECT_EXPORT|EXP-01 Asset pipeline]]

---

## 1. UI Hierarchy & Interaksi Workspace

- **Posisi Komponen:** Left Sidebar → tab **Insert** & tab **Assets**; Toolbar `[I] Insert ▾` quick menu; Command Palette.
- **Wireframe Tekstual & Elemen Visual:**

```text
┌ Insert ──────────────── 🔍 "card" ─┐
│ ▾ Layout                           │
│   [▭ Section] [▭ Div] [▭ Container]│
│   [⫴ Flex Row] [⫼ Grid 3col]       │
│ ▾ Text                             │
│   [H1] [H2] [¶ Paragraph] [🔗 Link] │
│ ▾ Media   [🖼 Image] [▶ Video] [SVG] │
│ ▾ Form    [Input] [Select] [Button]│
│ ▾ Blocks                           │
│   ┌──────────┐ ┌──────────┐        │  ← thumbnail render nyata (iframe snapshot)
│   │ Navbar   │ │ Hero     │        │
│   └──────────┘ └──────────┘        │
│ ▾ Web Components                   │
│   [◇ vds-accordion] [◇ my-rating]  │
│ ▾ My Components (P2)               │
└────────────────────────────────────┘
```

  - Item dapat di-drag ke kanvas atau ke Layers; klik = sisip setelah seleksi (atau append ke `body/main` bila kosong).
  - Hover item → tooltip preview + daftar class/CSS yang akan ditambahkan.

- **Interaksi Pengguna (Trigger & Action):**

| Trigger | Action |
|---|---|
| Drag item ke kanvas | [[Modules/CANVAS_ENGINE/CANVAS-03_DRAG_DROP_REORDER\|Drop slot]] + validasi content model → indicator biru/merah |
| Drop | `node.insert` → elemen baru terseleksi → aktifkan [[Modules/CSS_VISUAL_INSPECTOR/CSS-01_BOX_MODEL\|Inspector Box Model]] |
| Klik item | Insert after selection (atau inside jika seleksi container kosong) |
| Drop Block dengan class bentrok | Dialog konflik CSS (lihat §4) |
| Drag gambar dari OS/Assets ke `<div>` | Menu: *Insert `<img>`* / *Set as background-image* / *Replace src* (bila target `<img>`) |
| Paste HTML (`Ctrl+V`) | Diperlakukan sebagai insert (sanitize → validate → insert) |
| Klik toggle "Source Code" | Buka [[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS\|Monaco Live Editor]] menyorot HTML yang baru disisipkan |

---

## 2. DOM Mutation & CSS Engine Logic

- **Virtual DOM / AST Handling:**
  - Setiap item katalog adalah **`ComponentDef`** berisi snippet HTML + CSS opsional + JS opsional + aset.
  - **Insertion pipeline:**
    1. `resolveDropTarget` (dari CANVAS-03 / LAYER-01) → `{ parentKey, beforeKey }`.
    2. `validate`: content model (`canContain`) untuk root snippet; jika gagal coba *auto-wrap* (mis. `<li>` ke `<div>` → tawarkan bungkus `<ul>`).
    3. `prepareHtml`: tokenisasi placeholder (`{{id}}` → id unik `hero-2`), re-indentasi sesuai kedalaman target, resolve URL aset relatif ke file HTML target.
    4. `prepareCss`: untuk Blocks, parse CSS block → cek bentrok selector di RuleIndex (lihat §4) → hasilkan `TextEdit` append ke stylesheet target (default `css/styles.css` atau `css/blocks/<name>.css` + `<link>` bila settings "separate files").
    5. `prepareJs` (Web Components): salin modul ke `js/components/<tag>.js` dan sisip `<script type="module" src>` sekali di `<head>` (dedupe).
    6. Satu transaksi Yjs berisi seluruh edit (HTML + CSS + JS) → satu undo entry.
  - Iframe menerima `PatchOp.insert { html }` (fragment di-parse oleh agent menggunakan `<template>` → `importNode`) dan `replaceSheet` bila CSS bertambah.
  - **Web Components (F038):** di mode Design, skrip pengguna dinonaktifkan — kecuali modul web component yang terdaftar di `settings.trustedComponentModules` yang dimuat agent agar `customElements.define` berjalan dan shadow DOM tampil. Shadow tree ditampilkan read-only di Layers; slot diisi dari light DOM yang dapat diedit.
  - **Symbols (F040, P2):** master disimpan di `components/<name>.html`; instance di halaman adalah salinan HTML biasa dengan marker komentar `<!-- vds:instance name="card" v="3" -->` (opsional, di-strip saat export bila diinginkan). Edit master → command `symbol.propagate` memperbarui instance yang tidak di-override (diff 3-arah per instance).
- **Bi-directional Sync Rules:**
  - Insert visual → Monaco menampilkan blok baru dengan dekorasi "inserted" 600 ms.
  - Mengetik custom tag (`<my-rating>`) di Monaco yang cocok dengan definisi terdaftar → Layers memberi badge ◇ dan Inspector menampilkan atribut yang diobservasi (`observedAttributes`) sebagai field.
- **Undo / Redo Stack:** `node.insert` komposit (HTML + CSS + JS + asset ref) = satu entri "Insert block Hero". Asset binary tidak dihapus dari OPFS saat undo (garbage collected 30 hari jika tidak direferensikan).

---

## 3. Data Schema & State Model

- **Local State Komponen:**

```typescript
interface ComponentDef {
  id: string;                         // "block.hero.split"
  kind: 'primitive' | 'block' | 'webComponent' | 'symbol';
  label: string;
  category: string;
  html: string;                       // snippet dengan placeholder {{uid}}
  css?: string;                       // CSS scoped (BEM prefix block)
  js?: { path: string; code: string; module: true };
  assets?: Array<{ path: string; hash: string }>;
  contentCategory: Array<'flow' | 'phrasing' | 'interactive' | 'sectioning' | 'heading' | 'embedded'>;
  tailwindVariant?: string;           // snippet versi Tailwind (EXP-01 mode)
}

interface InsertState {
  selectedNodeId: string | null;
  computedStyles: Record<string, string>;
  isDragging: boolean;
  draggingDef: ComponentDef | null;
  pendingConflicts: CssConflict[];
}

interface CssConflict { selector: string; existingRuleId: string; incomingCss: string; resolution?: 'rename' | 'merge' | 'keepExisting' | 'overwrite' }

interface AssetRef { hash: string; path: string; mime: string; bytes: number; width?: number; height?: number; usedBy: string[] }
```

- **Generated Output Contract (Pure HTML/CSS):**

Insert Block "Card":

```html
<article class="card">
  <img class="card__media" src="assets/img/placeholder-640x360.webp" alt="" width="640" height="360" loading="lazy">
  <div class="card__body">
    <h3 class="card__title">Card title</h3>
    <p class="card__text">Supporting description text.</p>
    <a class="card__link" href="#">Learn more</a>
  </div>
</article>
```

```css
.card { display: flex; flex-direction: column; border-radius: 12px; overflow: hidden; background: #fff; }
.card__media { display: block; width: 100%; height: auto; aspect-ratio: 16 / 9; object-fit: cover; }
.card__body { display: grid; gap: 8px; padding: 24px; }
```

Web Component:

```html
<head>
  <script type="module" src="js/components/vds-accordion.js"></script>
</head>
<vds-accordion open>
  <span slot="summary">Shipping</span>
  <p>Free worldwide shipping on all orders.</p>
</vds-accordion>
```

### Asset Manager Sub-Panel

```text
┌ Assets ─────────────── [⬆ Upload] 🔍 ┐
│ ▾ Images (24)   grid ▦ / list ☰      │
│   [hero.jpg 2.1MB ⚠] [logo.svg 3KB]  │
│ ▾ Fonts (3)     Brand Sans 400/600   │
│ ▾ Icons (SVG sprite)                 │
│ Unused (4)  [🧹 Clean]               │
└──────────────────────────────────────┘
```

- Upload → hash SHA-256 (dedupe) → simpan di OPFS `assets/` dengan nama sanitasi → `AssetRef` di `Y.Map assets`.
- Badge ⚠ untuk gambar > 500 KB atau resolusi > 2× lebar tampil terbesar (diukur dari `rects` agent).
- Drag ke kanvas → `<img src alt="" width height>` (dimensi intrinsik dimasukkan untuk mencegah CLS) atau `background-image: url(...)` di target Style.
- SVG: pilihan *Inline SVG* (disanitize: hapus `<script>`, `on*`, `foreignObject`) atau `<img src="x.svg">`.
- Optimasi produksi (WebP/AVIF, `srcset`) dilakukan di [[Modules/EXPORT_BUILD_PIPELINE/EXP-01_PROJECT_EXPORT|EXP-01]].

---

## 4. Edge Cases, Performance & Sandboxing

- **Iframe Sandboxing & Security:**
  - Paste/insert HTML eksternal disanitize (DOMPurify profil "studio": izinkan semua elemen/atribut HTML valid; tandai `<script>`, `on*`, `javascript:` → masuk tetapi non-aktif di Design mode dan dilaporkan di Problems panel).
  - Modul web component pihak ketiga hanya dijalankan jika user menandai *trusted*; tetap di sandbox origin.
  - Upload file: validasi MIME via magic bytes, batas 25 MB per file, SVG selalu disanitize.
- **Performance:**
  - Thumbnail Blocks dirender sekali di iframe offscreen → disimpan sebagai WebP di cache.
  - Insert besar (> 200 node) di-parse oleh agent via `<template>` sekali; host tidak menunggu `rects` sebelum menampilkan seleksi (bounds diperkirakan, dikoreksi frame berikutnya).
- **Conflict Handling:**
  - **Bentrok class block vs proyek** (mis. `.card` sudah ada dengan style berbeda): opsi *Rename incoming* (`.card` → `.card-2`, diterapkan konsisten ke HTML & CSS block), *Use existing styles*, *Merge* (deklarasi baru ditambahkan hanya bila properti belum ada), *Overwrite* (dengan peringatan affects N).
  - **Duplikat `id`:** placeholder `{{uid}}` menjamin unik; paste yang membawa `id` duplikat → id di-suffix & `for=`/`aria-*` yang mereferensikannya ikut diperbarui.
  - **Inline styles dari paste** (mis. dari Word/Google Docs): opsi *Strip inline styles* (default on) atau *Convert to classes*.
  - **Insert ke dalam elemen locked** ditolak; insert ke `<head>` hanya untuk item tipe meta/link/script.
