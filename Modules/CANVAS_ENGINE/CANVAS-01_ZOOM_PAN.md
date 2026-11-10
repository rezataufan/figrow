---
id: CANVAS-01
module: CANVAS_ENGINE
features: [F001, F002, F003, F004, F005, F006]
tags: [vds/spec, vds/canvas]
---

# CANVAS-01: Zoom, Pan & Artboards (Infinite Canvas Camera)

- **Navigasi Induk:** [[00_INDEX|Studio Workspace]] > [[Modules/CANVAS_ENGINE/_INDEX|Index Modul CANVAS_ENGINE]]
- **Target Engine:** Canvas (host overlay + camera) / Iframe DOM (artboard)
- **Status:** [ ] Planned | [ ] In Progress | [x] Completed
- **Relasi:** [[Modules/CANVAS_ENGINE/CANVAS-02_SELECTION_BOUNDS|CANVAS-02 Selection]] · [[Modules/CSS_VISUAL_INSPECTOR/CSS-04_CLASSES_STATES|CSS-04 Media Context]] · [[01_SYSTEM_ARCHITECTURE#15. Performance Budgets|Performance Budgets]]

---

## 1. UI Hierarchy & Interaksi Workspace

- **Posisi Komponen:** Canvas Center (viewport), Floating Bar (zoom & breakpoint switcher kanan-bawah), Toolbar (breakpoint presets).
- **Wireframe Tekstual & Elemen Visual:**

```text
┌──────────────────────────── Canvas Center ─────────────────────────────┐
│ 0    200   400   600   800  (ruler-x, unit = CSS px artboard)           │
│ ┌──────────────────────────────┐   ┌──────────────┐   ┌────────┐       │
│ │ index.html — Desktop 1440 ▾ │   │ Tablet 768 ▾ │   │ 375 ▾  │  + Add │
│ │┌────────────────────────────┐│   │┌────────────┐│   │┌──────┐│       │
│ ││  <iframe> live page        ││   ││ <iframe>   ││   ││      ││       │
│ ││                            ││   ││            ││   ││      ││       │
│ │└────────────────────────────┘│   │└────────────┘│   │└──────┘│       │
│ └──────────────────────────────┘   └──────────────┘   └────────┘       │
│                                          ┌───────────────────────────┐ │
│                                          │ − 67% + │ Fit │ 🖥 💻 📱 │ │ │
│                                          └───────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

  - **Artboard header:** nama file + breakpoint label + dropdown (ubah lebar, duplikasi, hapus, "Open in Preview").
  - **Indikator breakpoint responsive:** tombol `Desktop 1440` / `Tablet 768` / `Mobile 375` + custom width. Breakpoint aktif = artboard yang sedang memuat seleksi (highlight biru pada header).
  - **Zoom HUD:** persentase, tombol −/+, Fit All, Fit Selection, 100%.
  - **Rulers & guides (F006):** ruler atas/kiri mengikuti artboard aktif; drag dari ruler membuat guide (disimpan di `settings.guides`, tidak diekspor).

- **Interaksi Pengguna (Trigger & Action):**

| Trigger | Action |
|---|---|
| `Ctrl/⌘ + wheel`, pinch trackpad | Zoom berpusat di kursor (focal zoom) |
| Wheel / two-finger scroll | Pan kamera (bukan scroll iframe) — kecuali mode **Interact** (`Ctrl+Alt+I`) yang meneruskan scroll ke iframe |
| `Space` ditahan + drag, middle-mouse drag, tool `H` | Pan |
| `Ctrl+0` / `Shift+1` / `Shift+2` | 100% / Fit all / Fit selection |
| Klik tombol breakpoint `Tablet 768` | Jika artboard 768 belum ada → buat; scroll kamera ke artboard → set **media context** di [[Modules/CSS_VISUAL_INSPECTOR/CSS-04_CLASSES_STATES\|Inspector Media Query]] |
| Drag tepi kanan artboard | Ubah lebar viewport iframe secara live (menguji media query) — badge menampilkan `812px` |
| Double-click header artboard | Rename / ubah lebar numerik |
| Klik elemen di artboard | → [[Modules/CANVAS_ENGINE/CANVAS-02_SELECTION_BOUNDS\|Selection outline]] → aktifkan [[Modules/CSS_VISUAL_INSPECTOR/CSS-01_BOX_MODEL\|Inspector Box Model]] |
| Klik toggle "Source Code" | Buka bottom panel [[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS\|Monaco Live Editor]] |

---

## 2. DOM Mutation & CSS Engine Logic

- **Virtual DOM / AST Handling:**
  - Zoom/pan **tidak** memutasi AST maupun DOM iframe. Kamera diterapkan sebagai satu `transform: translate(x,y) scale(z)` pada container `#world` di host yang memuat semua artboard.
  - Iframe dirender pada **ukuran CSS sebenarnya** (mis. `width:1440px`) lalu diskalakan oleh transform induk → media query di dalam iframe merespons lebar breakpoint, bukan lebar layar studio.
  - Tinggi artboard = `documentElement.scrollHeight` yang dilaporkan agent (`rects` message) dengan opsi "Fixed height (viewport mode)" untuk menguji `100vh`.
  - Membuat artboard baru **tidak** mengubah file sumber; ia hanya instance render tambahan dari dokumen yang sama (satu `Y.Text`, banyak iframe).
- **Bi-directional Sync Rules:**
  - Edit kode atau visual pada satu artboard → `PatchOp` di-broadcast ke **semua** artboard yang menampilkan file yang sama.
  - Media context aktif (breakpoint artboard terseleksi) dikirim ke Inspector agar edit CSS masuk ke blok `@media` yang tepat.
- **Undo / Redo Stack:** Kamera & zoom **tidak** masuk undo stack (sesuai konvensi Figma). Penambahan/penghapusan artboard & guide masuk undo sebagai `Command` di `settings` (`artboard.add`, `artboard.resize`, `guide.add`). `cameraState` disimpan di `stackItem.meta` agar undo mengembalikan pandangan ke lokasi perubahan.

---

## 3. Data Schema & State Model

- **Local State Komponen:**

```typescript
interface CameraState {
  x: number;            // world offset (px layar)
  y: number;
  zoom: number;         // 0.02 .. 64
}

interface ArtboardDef {
  id: string;
  file: string;               // "index.html"
  breakpointId: string;       // "desktop" | "tablet" | "mobile" | custom
  width: number;              // CSS px
  heightMode: 'content' | 'fixed';
  fixedHeight?: number;
  worldX: number;             // posisi di world space
  worldY: number;
  lifecycle: 'live' | 'frozen' | 'unloaded';   // F005
}

interface CanvasViewportState {
  camera: CameraState;
  artboards: Record<string, ArtboardDef>;
  activeArtboardId: string | null;
  interactMode: boolean;      // scroll/klik diteruskan ke halaman
  isPanning: boolean;
  guides: Array<{ artboardId: string; axis: 'x' | 'y'; pos: number }>;
}

interface BreakpointDef { id: string; label: string; minWidth: number | null; maxWidth: number | null; previewWidth: number }
```

- **Rumus Focal Zoom:**

```typescript
function zoomAt(cam: CameraState, screenX: number, screenY: number, factor: number): CameraState {
  const zoom = clamp(cam.zoom * factor, 0.02, 64);
  const k = zoom / cam.zoom;
  return { zoom, x: screenX - (screenX - cam.x) * k, y: screenY - (screenY - cam.y) * k };
}
// factor dari wheel: Math.exp(-deltaY * 0.0015) (smooth untuk trackpad & mouse)
```

- **Generated Output Contract (Pure HTML/CSS):** Kamera tidak menghasilkan kode. Breakpoint menentukan **media query** standar yang dipakai Inspector saat edit pada artboard tersebut (desktop-first default, dapat diubah ke mobile-first di settings):

```css
/* Desktop = base (tanpa media) */
.hero { padding: 96px 64px; }

/* Tablet artboard aktif */
@media (max-width: 1023.98px) {
  .hero { padding: 64px 32px; }
}

/* Mobile artboard aktif */
@media (max-width: 767.98px) {
  .hero { padding: 40px 16px; }
}
```

---

## 4. Edge Cases, Performance & Sandboxing

- **Iframe Sandboxing & Security:**
  - Setiap artboard memakai `sandbox="allow-scripts allow-forms"` di origin preview terpisah (lihat [[01_SYSTEM_ARCHITECTURE#14. Security & Sandboxing Model|Security Model]]). Pointer events iframe di-set `pointer-events:none` saat mode Design; semua hit-test dilakukan via pesan `hitTest` ke agent sehingga skrip pengguna tidak menerima klik studio.
  - Mode Interact mengaktifkan `pointer-events:auto` hanya pada artboard yang di-double-click.
- **Performance:**
  - Transform kamera ditulis langsung ke `style.transform` dalam `requestAnimationFrame`, **tanpa** re-render React (state kamera di ref + subscribe store bertingkat).
  - `will-change: transform` hanya selama gesture aktif (menghindari blur tekstur saat diam). Setelah gesture berakhir (150 ms), elemen di-rerasterize tajam pada zoom akhir.
  - **F005 Virtualisasi:** artboard di luar viewport + margin 1 layar → `frozen` (screenshot via agent `html-to-image` snapshot, iframe di-`display:none`); > 8 artboard frozen → yang paling lama `unloaded` (iframe dihancurkan, state disimpan). Thaw saat masuk viewport, dengan replay patch yang tertunda (queue per artboard).
  - Zoom < 25%: overlay box-model disembunyikan, label disederhanakan, `rects` hanya untuk seleksi.
- **Conflict Handling:**
  - Jika pengguna membuat breakpoint custom yang tumpang tindih dengan media query existing di CSS (mis. `@media (max-width: 800px)`), Breakpoint Manager mendeteksi media query yang ada di RuleIndex dan menawarkan "Adopt existing breakpoint" agar tidak menduplikasi.
  - Artboard lebar > 4096 px: render dibatasi dengan peringatan (batas tekstur GPU).
  - Halaman dengan `position: fixed` + `100vh`: gunakan `heightMode: 'fixed'` agar elemen fixed tidak memanjang mengikuti tinggi konten.
