---
id: COMP-02
module: COMPONENT_LIBRARY
features: [F041, F051]
tags: [vds/spec, vds/assets, vds/media]
---

# COMP-02: Asset Manager (Images, SVGs, Fonts & Deduplication)

- **Navigasi Induk:** [[00_INDEX|Studio Workspace]] > [[Modules/COMPONENT_LIBRARY/_INDEX|Index Modul COMPONENT_LIBRARY]]
- **Target Engine:** Asset Store (OPFS + SHA-256 index) / HTML & CSS AST (reference tracker) / Iframe DOM
- **Status:** [ ] Planned | [ ] In Progress | [x] Completed
- **Relasi:** [[Modules/COMPONENT_LIBRARY/COMP-01_INSERTION_LOGIC|COMP-01 Insertion Logic]] · [[Modules/CSS_VISUAL_INSPECTOR/CSS-03_TYPOGRAPHY|CSS-03 Fonts]] · [[Modules/CSS_VISUAL_INSPECTOR/CSS-05_BACKGROUNDS_EFFECTS|CSS-05 Backgrounds]] · [[Modules/EXPORT_BUILD_PIPELINE/EXP-01_PROJECT_EXPORT|EXP-01 Export Asset Pipeline]]

---

## 1. UI Hierarchy & Interaksi Workspace
- **Posisi Komponen:** Left Sidebar → tab **Assets** (berdampingan dengan Pages, Layers, Insert) + Modal **Asset Picker** saat memilih gambar/font dari Inspector.
- **Wireframe Tekstual & Elemen Visual:**
  ```text
  ┌ Assets ────────────────────────── [⬆ Upload] [📁 Folder] ┐
  │ 🔍 Search assets...                 [All][Img][SVG][Font]│
  ├──────────────────────────────────────────────────────────┤
  │ ┌──────────┐ ┌──────────┐ ┌──────────┐                   │
  │ │ [preview]│ │ [preview]│ │   <svg>  │                   │
  │ │ hero.webp│ │ team.jpg │ │ logo.svg │                   │
  │ │ 1280×720 │ │ 4000×3000│ │ 2.4 KB   │                   │
  │ │ 84 KB  ✓ │ │ 3.2 MB ⚠ │ │ 4 uses   │                   │
  │ └──────────┘ └──────────┘ └──────────┘                   │
  ├ Inspector Detail: team.jpg ──────────────────────────────┤
  │ Path: assets/img/team.jpg      Used in: index.html (2)   │
  │ Intrinsic: 4000×3000 · Max rendered @Desktop: 640×480    │
  │ Alt Default: [ Team collaborating in studio           ]  │
  │ Actions: [⚡ Optimize to WebP 1280w] [🔄 Replace] [🗑 Del] │
  └──────────────────────────────────────────────────────────┘
  ```
  - **Indikator Breakpoint Responsive:** Menampilkan ukuran render maksimum aset di setiap breakpoint (`@1440: 640×480`, `@375: 343×257`) untuk mendeteksi gambar yang terlalu besar (*oversized image warning* ⚠).
- **Interaksi Pengguna (Trigger & Action):**
  - Klik elemen `<img>` atau elemen ber-background di Canvas -> Muncul selection blue outline -> Aktifkan `[[Modules/CSS_VISUAL_INSPECTOR/CSS-01_BOX_MODEL|Inspector Box Model]]` dan sorot aset terkait di panel Assets
  - Klik toggle "Source Code" -> Buka bottom panel `[[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS|Monaco Live Editor]]`
  - Drag berkas gambar/SVG/font dari OS Explorer ke Canvas atau panel Assets -> Hash SHA-256 -> Simpan ke OPFS `assets/` -> Jika di-drop di kanvas, langsung jalankan `[[Modules/COMPONENT_LIBRARY/COMP-01_INSERTION_LOGIC|COMP-01 Insertion Logic]]`.
  - Klik `🔄 Replace` pada aset -> Pilih berkas baru -> Perbarui berkas di OPFS dan segarkan seluruh `<img>` serta `background-image` di semua artboard tanpa mengubah struktur DOM.
  - Klik kanan SVG ▸ *Convert to Inline `<svg>`* -> Sanitize dan ganti `<img src="logo.svg">` menjadi elemen `<svg>` di AST HTML agar warnanya dapat dikontrol dengan `currentColor` di CSS.

---

## 2. DOM Mutation & CSS Engine Logic
- **Virtual DOM / AST Handling:**
  - **Content-Addressable Deduplication:** Saat berkas diunggah atau di-paste dari clipboard, Build Worker menghitung SHA-256. Jika hash sudah ada di `Y.Map<AssetRef>`, studio menggunakan kembali path yang ada (mencegah `hero (1).png`, `hero (2).png`).
  - **Reference Graph (`usedBy`):** Parse Worker memindai seluruh atribut `src`, `srcset`, `poster`, `<link href>`, `<use href>`, serta fungsi `url(...)` di PostCSS AST untuk membangun peta referensi dua arah `AssetPath ↔ Array<NodeKey | RuleId>`.
  - **Rename / Move Asset:** Ketika pengguna mengubah path `assets/team.jpg` → `assets/img/team-photo.jpg`, Command Bus menghasilkan `TextEdit[]` yang memperbarui setiap atribut HTML dan deklarasi CSS `url(...)` yang mereferensikan aset tersebut dalam **satu transaksi Yjs**.
- **Bi-directional Sync Rules:**
  - Jika pengguna mengetik `<img src="assets/img/baru.png">` di `[[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS|Monaco Live Editor]]` dan berkasnya belum ada, panel Assets menampilkan entri *Missing Asset* merah dengan tombol `⬆ Upload baru.png` untuk langsung mengisi path tersebut.
  - Perubahan dimensi intrinsik (setelah klik `⚡ Optimize` atau `Replace`) otomatis memperbarui atribut `width` dan `height` pada elemen `<img>` yang menggunakannya untuk menjaga rasio aspek dan mencegah *Cumulative Layout Shift (CLS)*.
- **Undo / Redo Stack:**
  - `asset.rename`, `asset.replace`, dan `asset.inlineSvg` memodifikasi `Y.Doc` (`assets` map + `files` text) dalam satu transaksi sehingga `Ctrl+Z` memulihkan path kode maupun pointer blob sebelumnya (blob lama dipertahankan di OPFS selama sesi undo).

---

## 3. Data Schema & State Model
- **Local State Komponen:**
  ```typescript
  interface FeatureState {
    selectedNodeId: string | null;
    computedStyles: Record<string, string>;
    isDragging: boolean;
    selectedAssetHash: string | null;
    filterKind: 'all' | 'image' | 'svg' | 'font' | 'unused';
    searchQuery: string;
    uploadQueue: Array<{ fileName: string; progress: number; status: 'hashing' | 'optimizing' | 'done' | 'error' }>;
    usageMap: Record<string, Array<{ file: string; kind: 'html-attr' | 'css-url'; targetId: string; renderedMaxPx?: [number, number] }>>;
  }
  ```
- **Generated Output Contract (Pure HTML/CSS):**
  - Drag-and-drop gambar `hero.webp` menghasilkan markup responsif lengkap dengan dimensi intrinsik dan `loading="lazy"`:
  ```html
  <figure class="media-card">
    <img class="media-card__img"
         src="assets/img/hero.webp"
         alt="Team collaborating in studio"
         width="1280"
         height="720"
         loading="lazy"
         decoding="async">
  </figure>
  ```
  - Konversi `logo.svg` menjadi inline SVG bersih (atribut editor grafis seperti `xmlns:sketch`, `data-name`, `<script>` telah dibersihkan oleh SVGO/sanitizer):
  ```html
  <svg class="brand-logo" viewBox="0 0 32 32" width="32" height="32" fill="currentColor" aria-hidden="true">
    <path d="M16 2L2 28h28L16 2zm0 7.2L23.8 24H8.2L16 9.2z"/>
  </svg>
  ```

---

## 4. Edge Cases, Performance & Sandboxing
- **Iframe Sandboxing & Security:**
  - **SVG Sanitization Wajib:** SVG adalah dokumen XML yang dapat memuat `<script>`, `<foreignObject>`, atau `onload=""`. Setiap SVG yang diunggah atau di-inline wajib melewati parser sanitizer ketat (menghapus semua elemen eksekusi dan event handler) sebelum diizinkan masuk ke OPFS atau DOM preview iframe.
  - **Blob URL Mapping:** Karena iframe berjalan di origin sandbox terpisah dan tidak bisa mengakses OPFS host secara langsung, Runtime Agent mendaftarkan *Service Worker* ringan di origin preview (atau me-rewrite URL di preview serializer) yang melayani `/__vds_asset__/assets/...` dari `MessagePort` streaming + cache memori.
- **Performance:**
  - Thumbnail di panel Assets dibuat di Web Worker menggunakan `OffscreenCanvas` (maks 256×256 WebP) dan di-cache di IndexedDB sehingga membuka proyek dengan 500+ gambar beresolusi tinggi tetap instan dan hemat RAM.
- **Conflict Handling:**
  - **Deleting Used Asset:** Jika pengguna menghapus aset yang masih memiliki `usageMap.length > 0`, dialog konfirmasi menampilkan daftar halaman/rule CSS yang menggunakannya dengan pilihan *Cancel*, *Replace with another asset*, atau *Delete anyway (leave broken links)*.
