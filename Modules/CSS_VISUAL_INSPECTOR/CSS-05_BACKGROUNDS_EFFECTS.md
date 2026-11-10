---
id: CSS-05
module: CSS_VISUAL_INSPECTOR
features: [F021, F023, F035]
tags: [vds/spec, vds/css, vds/effects]
---

# CSS-05: Backgrounds, Gradients, Box Shadows, Filters & Transforms

- **Navigasi Induk:** [[00_INDEX|Studio Workspace]] > [[Modules/CSS_VISUAL_INSPECTOR/_INDEX|Index Modul CSS_VISUAL_INSPECTOR]]
- **Target Engine:** CSS Parser (`postcss-value-parser`) / Iframe DOM (CSSOM) / Canvas (gradient & transform handles)
- **Status:** [ ] Planned | [ ] In Progress | [x] Completed
- **Relasi:** [[Modules/CSS_VISUAL_INSPECTOR/CSS-01_BOX_MODEL|CSS-01 Box Model]] · [[Modules/CSS_VISUAL_INSPECTOR/CSS-04_CLASSES_STATES|CSS-04 Tokens & States]] · [[Modules/COMPONENT_LIBRARY/COMP-01_INSERTION_LOGIC|COMP-01 Assets]]

---

## 1. UI Hierarchy & Interaksi Workspace
- **Posisi Komponen:** Right Inspector → di bawah section Typography: **Backgrounds**, **Effects (Shadow & Filter)**, dan **Transforms & Transitions**.
- **Wireframe Tekstual & Elemen Visual:**
  ```text
  ┌ Backgrounds (Multi-Layer) ─────────────────────────────── + ┐
  │ ≡ [▒▒] Linear 135° (#6366F1 → #A855F7)          blend ▾ 👁 🗑│
  │ ≡ [🖼] url(hero-bg.webp)  cover · center · no-repeat    👁 🗑│
  │ Color  [■ #0F172A ]   Token: [ var(--surface-1) ⛓ ]         │
  │ Clip   [ border-box ▾ ]   Origin [ padding-box ▾ ]          │
  ├ Effects & Box Shadow ──────────────────────────────────── + ┤
  │ Opacity [ 100% ───● ]     Mix Blend [ normal            ▾ ] │
  │ ≡ Outset  X[ 0 ] Y[ 10 ] Blur[ 25 ] Spread[ -5 ] ■rgba() 👁 🗑│
  │ ≡ Inset   X[ 0 ] Y[ 1  ] Blur[ 0  ] Spread[ 0  ] ■#FFF2  👁 🗑│
  │ Filter [ blur(0) ▾ ]  Backdrop [ blur(12px) saturate(180%) ]│
  ├ 2D/3D Transforms & Transition ──────────────────────────────┤
  │ Move X [ 0px ] Y [ -2px ]  Scale [ 1.02 ]  Rotate [ 0deg ]  │
  │ Transition: [ transform, box-shadow ▾ ] [ 200ms ] [ ease ▾ ]│
  └─────────────────────────────────────────────────────────────┘
  ```
  - **Indikator Breakpoint Responsive:** Menampilkan badge `@hover` atau `@768` ketika layer background, shadow, atau transform didefinisikan pada state/media query tertentu (mis. efek *card lift on hover*).
- **Interaksi Pengguna (Trigger & Action):**
  - Klik elemen di Canvas -> Muncul selection blue outline -> Aktifkan `[[Modules/CSS_VISUAL_INSPECTOR/CSS-01_BOX_MODEL|Inspector Box Model]]` dan panel **Backgrounds & Effects**
  - Klik toggle "Source Code" -> Buka bottom panel `[[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS|Monaco Live Editor]]`
  - Klik swatch Gradient -> Buka *Popover Color Ramp* + tampilkan **On-Canvas Gradient Line Handle** di atas elemen terpilih (drag titik awal/akhir & color stops langsung di kanvas).
  - Drag urutan layer di **Backgrounds** atau **Box Shadow** -> Ubah urutan comma-separated list di CSS (`background-image` layer pertama berada paling atas).
  - Pilih gambar dari picker background -> Buka `[[Modules/COMPONENT_LIBRARY/COMP-02_ASSET_MANAGER|Asset Manager]]` untuk memilih aset lokal dan menyisipkan path relatif `url("../assets/img/...")`.

---

## 2. DOM Mutation & CSS Engine Logic
- **Virtual DOM / AST Handling:**
  - **Multi-Layer Background Serialization:** CSS mendukung banyak layer pada `background-image`, `background-size`, `background-position`, `background-repeat`, dan `background-blend-mode` sebagai daftar yang dipisahkan koma. Parser membaca seluruh properti terkait, menyatukannya ke dalam array `BackgroundLayer[]` berindeks, dan saat diedit menyimpannya kembali secara sinkron per indeks (atau sebagai shorthand `background` jika sudah berbentuk shorthand di kode sumber).
  - **Box-Shadow & Filter AST:** Di-parse dengan `postcss-value-parser` agar fungsi bersarang seperti `rgb(15 23 42 / 0.12)` atau `drop-shadow(0 4px 8px var(--shadow-color))` tidak rusak saat di-split berdasarkan koma.
  - **Transform Preservation:** Menggunakan properti individual CSS modern (`translate`, `rotate`, `scale`) secara default jika didukung target `browserslist`, atau memodifikasi urutan fungsi di dalam `transform: translateY(-2px) scale(1.02)` tanpa menghilangkan fungsi yang tidak disentuh.
- **Bi-directional Sync Rules:**
  - Jika pengguna menulis `background: radial-gradient(circle at 20% 20%, #fff, transparent), url("noise.svg")` di `[[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS|Monaco Live Editor]]`, Inspector otomatis menampilkan 2 baris layer (1 Radial Gradient, 1 Image) dalam urutan yang tepat.
  - Scrubbing slider `blur`, `angle`, atau `translate` menggunakan jalur transien `HostMsg.transient` (60 FPS) dan baru melakukan *range-splice* ke `Y.Text` pada saat `pointerup`.
- **Undo / Redo Stack:**
  - Selama color picker atau gradient handle digeser di kanvas, `UndoManager.stopCapturing()` dipanggil saat `pointerdown` dan satu command `style.set` di-commit saat `pointerup` / penutupan popover.

---

## 3. Data Schema & State Model
- **Local State Komponen:**
  ```typescript
  interface FeatureState {
    selectedNodeId: string | null;
    computedStyles: Record<string, string>;
    isDragging: boolean;
    backgroundColor: string;
    backgroundLayers: Array<{
      id: string;
      enabled: boolean;
      kind: 'image' | 'linear-gradient' | 'radial-gradient' | 'conic-gradient';
      value: string;
      size: string;
      position: string;
      repeat: string;
      blendMode: string;
    }>;
    boxShadows: Array<{
      id: string;
      enabled: boolean;
      inset: boolean;
      x: string; y: string; blur: string; spread: string; color: string;
    }>;
    filters: Array<{ fn: 'blur' | 'brightness' | 'contrast' | 'grayscale' | 'saturate' | 'hue-rotate'; value: string }>;
    backdropFilters: Array<{ fn: string; value: string }>;
    transform: { translateX: string; translateY: string; scaleX: string; scaleY: string; rotate: string; skewX: string; skewY: string };
    transition: Array<{ property: string; duration: string; timing: string; delay: string }>;
  }
  ```
- **Generated Output Contract (Pure HTML/CSS):**
  - Contoh kartu *glassmorphism* dengan efek *hover lift* yang dihasilkan murni dalam CSS3:
  ```css
  .card {
    background-color: rgb(255 255 255 / 0.72);
    background-image:
      linear-gradient(135deg, rgb(99 102 241 / 0.12) 0%, rgb(168 85 247 / 0.04) 100%),
      url("../assets/img/grain.png");
    background-size: 100% 100%, 160px 160px;
    background-repeat: no-repeat, repeat;
    backdrop-filter: blur(12px) saturate(180%);
    box-shadow:
      0 10px 25px -5px rgb(15 23 42 / 0.08),
      inset 0 1px 0 0 rgb(255 255 255 / 0.6);
    transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 200ms ease;
  }

  .card:hover {
    transform: translateY(-2px) scale(1.01);
    box-shadow:
      0 20px 32px -8px rgb(15 23 42 / 0.14),
      inset 0 1px 0 0 rgb(255 255 255 / 0.8);
  }
  ```

---

## 4. Edge Cases, Performance & Sandboxing
- **Iframe Sandboxing & Security:**
  - Nilai `url(...)` pada `background-image` divalidasi: path relatif dipetakan ke blob/asset URL sandbox selama mode Design, sedangkan di `Y.Text` tetap tersimpan sebagai path relatif bersih (`../assets/img/...`). Skema `javascript:` atau `data:text/html` ditolak.
- **Performance:**
  - `backdrop-filter: blur()` dan multi-shadow ber-radius besar cukup berat di GPU saat di-scrub. Ketika frame time > 16.6 ms terdeteksi selama drag slider, agent membatasi resolusi layer dengan `will-change: transform, filter` sementara dan mencabutnya 150 ms setelah `pointerup`.
- **Conflict Handling:**
  - **Shorthand `background` vs `background-color`:** Jika sebuah rule menggunakan shorthand `background: url(a.png) no-repeat` lalu pengguna mengatur `background-color`, deklarasi `background-color` disisipkan **setelah** shorthand (atau digabungkan ke akhir shorthand) agar tidak di-reset menjadi `transparent` oleh shorthand.
  - **Relative URL Resolution:** Jika `styles.css` berada di subfolder `css/styles.css` sedangkan `index.html` di root, pemilihan aset dari `assets/img/bg.webp` otomatis menghasilkan `url("../assets/img/bg.webp")` bila ditulis ke `css/styles.css`, tetapi menghasilkan `url("assets/img/bg.webp")` bila ditulis ke inline `style=""` atau `<style>` di `index.html`.
