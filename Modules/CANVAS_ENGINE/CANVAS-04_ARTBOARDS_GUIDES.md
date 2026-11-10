---
id: CANVAS-04
module: CANVAS_ENGINE
features: [F005, F006, F011]
tags: [vds/spec, vds/canvas, vds/artboards]
---

# CANVAS-04: Multi-Page Artboards, Rulers & Smart Guides

- **Navigasi Induk:** [[00_INDEX|Studio Workspace]] > [[Modules/CANVAS_ENGINE/_INDEX|Index Modul CANVAS_ENGINE]]
- **Target Engine:** Canvas (host rulers, smart guides, viewport culling) / Iframe DOM (artboard freeze/thaw)
- **Status:** [ ] Planned | [ ] In Progress | [x] Completed
- **Relasi:** [[Modules/CANVAS_ENGINE/CANVAS-01_ZOOM_PAN|CANVAS-01 Zoom & Pan]] · [[Modules/CANVAS_ENGINE/CANVAS-02_SELECTION_BOUNDS|CANVAS-02 Selection]] · [[Modules/CSS_VISUAL_INSPECTOR/CSS-04_CLASSES_STATES|CSS-04 Breakpoints]]

---

## 1. UI Hierarchy & Interaksi Workspace
- **Posisi Komponen:** Canvas Center (tepi atas & kiri untuk Rulers, area world untuk Artboard Grid & Smart Guides), Left Sidebar → tab **Pages** (manajemen halaman `.html`).
- **Wireframe Tekstual & Elemen Visual:**
  ```text
  ┌─ Pages ────────── + ┐ ┌───┬──────────────────────────────────────────────────────┐
  │ 📄 index.html     ● │ │ px│ 0        360        720        1080       1440       │
  │ 📄 pricing.html     │ ├───┼──────────────────────────────────────────────────────┤
  │ 📄 about.html       │ │ 0 │  ┌─ index.html @1440 ─────┐  ┌─ index.html @375 ───┐ │
  ├─────────────────────┤ │   │  │      │x=720 (guide)    │  │                     │ │
  │ Breakpoint Matrix:  │ │300│ ─┼──────┼─────────────────┼──┤                     │ │
  │ [✓] 1440 Desktop    │ │   │  │  ┌───┴───┐   ← 24px →  │  │                     │ │
  │ [✓] 768  Tablet     │ │600│  │  │ .card │──────┬──────┤  │                     │ │
  │ [✓] 375  Mobile     │ │   │  └──┴───────┴──────┴──────┘  └─────────────────────┘ │
  └─────────────────────┘ └───┴──────────────────────────────────────────────────────┘
  ```
  - **Rulers (20px bar):** Menampilkan skala piksel CSS relatif terhadap origin `(0,0)` dari artboard yang sedang aktif.
  - **Draggable Guides:** Garis cyan/magenta yang ditarik dari ruler, menempel (*snap*) pada tepi elemen atau grid kolom.
  - **Indikator Breakpoint Responsive:** Matriks halaman × breakpoint (`index.html @1440`, `@768`, `@375`) disusun otomatis dalam *Auto-Layout Canvas Grid* (baris = halaman, kolom = breakpoint).
- **Interaksi Pengguna (Trigger & Action):**
  - Klik elemen di Canvas -> Muncul selection blue outline -> Aktifkan `[[Modules/CSS_VISUAL_INSPECTOR/CSS-01_BOX_MODEL|Inspector Box Model]]`
  - Klik toggle "Source Code" -> Buka bottom panel `[[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS|Monaco Live Editor]]`
  - Drag dari Ruler atas/kiri ke Canvas -> Buat *Guide* baru pada koordinat piksel artboard; double-click guide untuk input angka presisi; drag kembali ke ruler untuk menghapus.
  - Tahan `Alt` saat memilih elemen + hover elemen lain -> Render *Red Distance Guides* (jarak piksel ke 4 sisi elemen target atau parent).
  - Klik `+` di tab Pages -> Buat berkas `.html` baru di `Y.Doc` -> Otomatis spawn deretan artboard Desktop/Tablet/Mobile di baris bawah kanvas.

---

## 2. DOM Mutation & CSS Engine Logic
- **Virtual DOM / AST Handling:**
  - Penambahan halaman baru (`page.create`) menulis berkas baru ke `Y.Map<Y.Text>` (`files.set("pricing.html", new Y.Text(BOILERPLATE))`) dan memicu Parse Worker untuk membangun VNode tree awal.
  - Rulers, Guides, dan posisi world artboard disimpan di `settings.canvasLayout` (sidecar metadata), **tidak** memutasi AST HTML maupun CSSOM.
  - **Snap & Alignment Engine:** Saat pengguna men-drag atau me-resize elemen (`[[Modules/CANVAS_ENGINE/CANVAS-02_SELECTION_BOUNDS|CANVAS-02]]`), koordinat tepi (`left, centerX, right, top, centerY, bottom`) dibandingkan terhadap spatial index (R-tree / sorted arrays) dari sibling dan guides aktif. Jika jarak `< 4 / camera.zoom`, delta dikunci (*snapped*) dan nilai CSS yang dikompilasi menggunakan angka bulat hasil snap.
- **Bi-directional Sync Rules:**
  - Jika pengguna menambahkan `@media (max-width: 960px)` di `[[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS|Monaco Live Editor]]`, CSS Parser mendeteksi breakpoint baru dan menawarkan chip `+ Spawn 960px Artboard` di header kanvas.
  - Jika berkas `.html` dihapus atau di-rename dari tab Pages/Code Editor, seluruh instance artboard terkait di kanvas langsung di-unmount atau diperbarui judulnya.
- **Undo / Redo Stack:**
  - Operasi `page.create`, `page.delete`, dan `page.rename` masuk ke `Y.UndoManager` utama karena memodifikasi daftar berkas proyek.
  - Penambahan/penghapusan guide masuk ke command `guide.set` dengan *captureTimeout* tersendiri agar tidak menginterupsi riwayat edit CSS/HTML.

---

## 3. Data Schema & State Model
- **Local State Komponen:**
  ```typescript
  interface FeatureState {
    selectedNodeId: string | null;
    computedStyles: Record<string, string>;
    isDragging: boolean;
    activePageFile: string;
    rulersVisible: boolean;
    guides: Array<{
      id: string;
      artboardId: string;
      axis: 'x' | 'y';
      offsetPx: number;
      locked: boolean;
    }>;
    smartGuides: Array<{
      kind: 'align' | 'spacing';
      x1: number; y1: number; x2: number; y2: number;
      label?: string; // e.g., "24px"
    }>;
    lifecycleStats: { liveCount: number; frozenCount: number; unloadedCount: number };
  }
  ```
- **Generated Output Contract (Pure HTML/CSS):**
  - Saat halaman baru dibuat dari Multi-Page Artboard manager, template HTML5 standar dan link stylesheet yang bersih dihasilkan tanpa atribut internal:
  ```html
  <!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Pricing — Project</title>
    <link rel="stylesheet" href="css/styles.css">
  </head>
  <body>
    <main class="page-main"></main>
  </body>
  </html>
  ```

---

## 4. Edge Cases, Performance & Sandboxing
- **Iframe Sandboxing & Security:**
  - Setiap artboard berjalan di `<iframe sandbox="allow-scripts allow-forms">` terisolasi. Navigasi antar-halaman via klik `<a href="pricing.html">` di dalam iframe dicegat oleh Runtime Agent (`click` listener dengan `preventDefault()`) dan diterjemahkan menjadi pesan `{ t: 'focusArtboard', file: 'pricing.html' }` ke host agar iframe tidak melakukan navigasi mandiri yang memutus `MessagePort`.
- **Performance:**
  - **LRU Iframe Virtualization (F005):** Maksimal **6 iframe** berstatus `live` pada satu waktu. Artboard yang keluar dari viewport > 1.5× ukuran layar selama > 3 detik dibekukan (`frozen`): agent merender snapshot bitmap ringan (atau `content-visibility: hidden`), `ResizeObserver` dihentikan, dan antrean `PatchOp` disimpan di buffer host. Saat kembali ke viewport, seluruh patch di-flush dalam satu batch sebelum iframe ditampilkan kembali (menjaga 60 FPS saat pan melintasi 20+ artboard).
  - Rulers digambar menggunakan satu `<canvas>` 2D dengan *devicePixelRatio* scaling; redraw hanya dipicu oleh perubahan `camera.x/y/zoom`.
- **Conflict Handling:**
  - Jika dua artboard dari berkas `.html` yang sama memiliki elemen yang di-edit secara bersamaan (mis. pengguna membuka split view), mutasi selalu diserialisasi melalui `Y.Text` tunggal sehingga kedua artboard menerima `PatchOp` dengan nomor urut (`seq`) yang identik.
