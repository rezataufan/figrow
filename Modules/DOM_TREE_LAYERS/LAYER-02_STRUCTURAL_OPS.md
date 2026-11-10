---
id: LAYER-02
module: DOM_TREE_LAYERS
features: [F019, F020]
tags: [vds/spec, vds/layers, vds/semantics]
---

# LAYER-02: Structural Operations (Wrap, Unwrap, Semantic Tag & Attributes)

- **Navigasi Induk:** [[00_INDEX|Studio Workspace]] > [[Modules/DOM_TREE_LAYERS/_INDEX|Index Modul DOM_TREE_LAYERS]]
- **Target Engine:** HTML AST (parse5 range splicer) / CSS Parser (selector impact analyzer) / Iframe DOM
- **Status:** [ ] Planned | [ ] In Progress | [x] Completed
- **Relasi:** [[Modules/DOM_TREE_LAYERS/LAYER-01_TREE_REORDER|LAYER-01 Tree Reorder]] · [[Modules/CANVAS_ENGINE/CANVAS-02_SELECTION_BOUNDS|CANVAS-02 Selection]] · [[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS|SYNC-01 AST Sync]]

---

## 1. UI Hierarchy & Interaksi Workspace
- **Posisi Komponen:** Left Sidebar (konteks menu Layers & header bar Layers) + Right Inspector (panel **Element Attributes & Semantics** di atas Box Model) + Floating Context Bar di Canvas.
- **Wireframe Tekstual & Elemen Visual:**
  ```text
  ┌ Element & Semantics ──────────────────────────────────────────┐
  │ Tag    [ section          ▾ ]  Role [ region             ▾ ]  │
  │ ID     [ features-grid      ]  Title [ Key product features ] │
  │ Quick  [ ⧉ Wrap div ] [ ⧠ Wrap Flex ] [ ⤒ Unwrap ] [ ⌫ Del ] │
  ├ Attributes (HTML5 / ARIA / Data) ────────────────────────── + ┤
  │  aria-labelledby  │  features-heading                      🗑 │
  │  data-theme       │  dark                                  🗑 │
  │  hidden           │  (boolean)                             🗑 │
  ├ Breakpoint Visibility (Responsive Utility) ───────────────────┤
  │  [🖥 Desktop: Show]  [💻 Tablet: Show]  [📱 Mobile: Hide]      │
  └───────────────────────────────────────────────────────────────┘
  ```
- **Interaksi Pengguna (Trigger & Action):**
  - Klik elemen di Canvas -> Muncul selection blue outline -> Aktifkan `[[Modules/CSS_VISUAL_INSPECTOR/CSS-01_BOX_MODEL|Inspector Box Model]]` dan panel **Element & Semantics**
  - Klik toggle "Source Code" -> Buka bottom panel `[[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS|Monaco Live Editor]]`
  - Tekan `Ctrl+G` (atau klik `Wrap div`) pada 1..N elemen sibling terpilih -> Bungkus elemen dalam `<div class="...">` baru, otomatis pilih wrapper baru di Layers & Canvas.
  - Tekan `Ctrl+Shift+G` (`Unwrap`) -> Hapus elemen pembungkus, naikkan seluruh anaknya ke posisi pembungkus di parent.
  - Ubah dropdown **Tag** dari `div` menjadi `section` / `nav` / `article` / `header` / `footer` / `aside` / `button` / `a` -> Mutasi tag pembuka & penutup secara atomik.

---

## 2. DOM Mutation & CSS Engine Logic
- **Virtual DOM / AST Handling:**
  - **Change Tag (`node.setTag`):** Menggunakan `VNode.startTagRange` dan `VNode.endTagRange` dari parse5. Untuk elemen normal, menghasilkan 2 `TextEdit` yang mengganti tepat karakter nama tag (`<div class="a">...</div>` → `<section class="a">...</section>`). Jika diubah ke *void element* (`img`, `hr`, `input`), anak-anaknya ditolak (validasi gagal) kecuali kosong, dan `endTagRange` dihapus.
  - **Wrap (`node.wrap`):** Menghitung rentang gabungan dari sibling terpilih `[first.range[0], last.range[1]]`, menyisipkan tag pembuka sebelum `first`, meng-indentasi baris di antaranya +1 level, dan menyisipkan tag penutup setelah `last`.
  - **Unwrap (`node.unwrap`):** Menghapus `startTagRange` dan `endTagRange` dari node target, lalu men-deindentasi isi di antaranya -1 level.
  - **Attribute Mutation (`node.setAttr`):** Jika atribut sudah ada di `VNode.attrs`, ganti `attr.range`; jika belum ada, sisipkan tepat sebelum `>` pada `startTagRange`. Atribut boolean (`disabled`, `required`, `hidden`) ditulis tanpa `=""`.
  - **Agent Patching:** Karena DOM browser tidak mengizinkan pengubahan `Element.tagName` secara in-place, agent menangani patch `changeTag` dengan membuat elemen baru (`document.createElement`), menyalin seluruh atribut & `data-vds-id` yang sama, memindahkan seluruh `childNodes` dengan `appendChild` (sehingga state anak tidak hilang), lalu `replaceWith()`.
- **Bi-directional Sync Rules:**
  - Saat pengguna mengubah nama tag di `[[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS|Monaco Live Editor]]`, auto-rename tag Monaco memperbarui tag penutup; Parse Worker mengenali posisi `NodeKey` yang sama dan mengirim patch `changeTag` tanpa kehilangan seleksi.
  - Saat atribut `id` diubah melalui panel ini, seluruh referensi di halaman yang sama (`label[for]`, `aria-labelledby`, `href="#id"`) dideteksi dan ditawarkan untuk ikut diperbarui.
- **Undo / Redo Stack:**
  - `node.wrap`, `node.unwrap`, `node.setTag`, dan `node.setAttr` masing-masing dikemas dalam satu transaksi `Y.Doc` sehingga `Ctrl+Z` mengembalikan struktur DOM dan indentasi kode persis seperti semula.

---

## 3. Data Schema & State Model
- **Local State Komponen:**
  ```typescript
  interface FeatureState {
    selectedNodeId: string | null;
    computedStyles: Record<string, string>;
    isDragging: boolean;
    tagName: string;
    attributes: Array<{ name: string; value: string | null; isBoolean: boolean }>;
    a11yHints: Array<{ code: string; message: string; suggestedFix?: { attr: string; value: string } }>;
    affectedCssSelectors: string[]; // selector seperti "div.card" yang terdampak jika tag diubah
  }
  ```
- **Generated Output Contract (Pure HTML/CSS):**
  - Mengubah `div` menjadi `<section>`, menambahkan atribut ARIA, dan membungkus header di dalam `<header>`:
  ```html
  <section id="features-grid" class="features" aria-labelledby="features-heading" data-theme="dark">
    <header class="features__header">
      <h2 id="features-heading" class="features__title">Everything you need</h2>
      <p class="features__subtitle">Built for modern teams.</p>
    </header>
  </section>
  ```

---

## 4. Edge Cases, Performance & Sandboxing
- **Iframe Sandboxing & Security:**
  - Penambahan atribut event inline (`onclick`, `onload`, `onerror`) atau `href="javascript:..."` melalui Inspector dicegat: di mode Design atribut tersebut disimpan di kode sumber bila pengguna memaksa, tetapi di-strip pada DOM preview iframe agar tidak mengeksekusi skrip di dalam sandbox.
- **Performance:**
  - Operasi `Wrap` / `Unwrap` pada subtree besar (ratusan node anak) menggunakan pemindahan referensi `childNodes` di agent (< 1 ms) tanpa mem-parse ulang HTML subtree di dalam iframe.
- **Conflict Handling:**
  - **Tag-Qualified CSS Selectors:** Jika pengguna mengubah `<div class="card">` menjadi `<article class="card">`, namun di `styles.css` terdapat selector `div.card { padding: 24px; }`, **Selector Impact Analyzer** memberi peringatan: *"1 CSS rule (`div.card`) depends on tag `div`"* dengan tombol **Update selector to `.card` / `article.card`**.
  - **Non-Contiguous Multi-Select Wrap:** Jika pengguna memilih elemen ke-1 dan ke-3 (melompati elemen ke-2) lalu menekan `Ctrl+G`, elemen ke-3 dipindahkan tepat setelah elemen ke-1 di dalam wrapper baru (dengan notifikasi toast bahwa urutan DOM disesuaikan).
