---
id: CSS-04
module: CSS_VISUAL_INSPECTOR
features: [F031, F032, F033, F034, F035]
tags: [vds/spec, vds/css, vds/cascade]
---

# CSS-04: Classes, Pseudo-States, Media Queries & Design Tokens

- **Navigasi Induk:** [[00_INDEX|Studio Workspace]] > [[Modules/CSS_VISUAL_INSPECTOR/_INDEX|Index Modul CSS_VISUAL_INSPECTOR]]
- **Target Engine:** CSS Parser (RuleIndex, selector parser, cascade resolver) / HTML AST (class attr) / Iframe DOM (forced states)
- **Status:** [ ] Planned | [ ] In Progress | [x] Completed
- **Relasi:** [[Modules/CSS_VISUAL_INSPECTOR/CSS-01_BOX_MODEL|CSS-01]] · [[Modules/CSS_VISUAL_INSPECTOR/CSS-02_FLEXBOX_GRID|CSS-02]] · [[Modules/CSS_VISUAL_INSPECTOR/CSS-03_TYPOGRAPHY|CSS-03]] · [[Modules/CANVAS_ENGINE/CANVAS-01_ZOOM_PAN|CANVAS-01 Breakpoints]] · [[01_SYSTEM_ARCHITECTURE#6. CSS AST & CSSOM Mapping|CSS AST & CSSOM]]

---

## 1. UI Hierarchy & Interaksi Workspace

- **Posisi Komponen:** Right Inspector → **Selector Bar** (paling atas, sticky) + section **Cascade** (bawah) + tab **Tokens**.
- **Wireframe Tekstual & Elemen Visual:**

```text
┌ Selector Bar (sticky) ──────────────────────────────────────┐
│ <button>  Classes: [ btn ×][ btn--primary ×][ + add… ]      │
│ Style target: [ .btn.btn--primary ▾ ]                       │
│    ├ ● .btn--primary            styles.css:42   (affects 7) │
│    ├ ○ .btn                     styles.css:18   (affects 23)│
│    ├ ○ This element only (inline)                           │
│    └ ○ New selector…  [ .hero .btn--primary ]               │
│ State: [ none | :hover | :focus-visible | :active | ::before ▾]│
│ Media: [ 🖥 Base ][ 💻 ≤1023 ][ 📱 ≤767 ][ + custom ]       │
├ … Box Model / Layout / Typography (menulis ke target ini) … ┤
├ Cascade ▾ (untuk properti yang di-hover / semua)            ┤
│  background-color                                           │
│   ✓ #4F46E5   .btn--primary:hover      styles.css:51        │
│   ✗ #6366F1   .btn--primary            styles.css:42 (struck)│
│   ✗ #E5E7EB   .btn                     styles.css:18 (struck)│
└─────────────────────────────────────────────────────────────┘
┌ Tokens (tab) ───────────────────────────────────────────────┐
│ Color   ■ --brand-600 #4F46E5   ■ --text-1 #0F172A   + new  │
│ Space   --space-4 1rem  --space-6 1.5rem                    │
│ Radius  --radius-md 12px      Scope: :root ▾  Mode: light/dark│
└─────────────────────────────────────────────────────────────┘
```

  - **Class chips (F031):** add (autocomplete dari class di proyek), remove, rename (global atau lokal), drag reorder.
  - **Style target (F032):** daftar rule yang *match* elemen, diurutkan spesifisitas & urutan, dengan jumlah elemen terdampak.
  - **State (F033):** pilih pseudo-class/pseudo-element; canvas memaksa state tsb pada elemen terpilih.
  - **Media (F034):** tombol breakpoint sinkron dengan artboard aktif ([[Modules/CANVAS_ENGINE/CANVAS-01_ZOOM_PAN|CANVAS-01]]).
  - **Indikator:** titik biru pada tombol state/media yang sudah memiliki deklarasi.

- **Interaksi Pengguna (Trigger & Action):**

| Trigger | Action |
|---|---|
| Klik elemen di Canvas | Selection outline → Selector Bar memuat classes & matched rules → aktifkan [[Modules/CSS_VISUAL_INSPECTOR/CSS-01_BOX_MODEL\|Inspector Box Model]] |
| `+ add` class `btn--ghost` | Tambah ke atribut `class`; jika rule belum ada → target otomatis = *New selector* `.btn--ghost` |
| Pilih State `:hover` | Agent memaksa hover; edit apa pun → rule `.btn--primary:hover` (dibuat bila perlu) |
| Klik `📱 ≤767` | Kamera pindah ke artboard Mobile; edit → di dalam `@media (max-width: 767.98px)` |
| Hover baris Cascade | Kanvas menyorot semua elemen yang dipengaruhi rule itu |
| Klik nama file:line | Buka [[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS\|Monaco Live Editor]] tepat di rule |
| Rename class (global) | Ganti di semua atribut `class` + semua selector CSS (preview diff sebelum apply) |
| Klik toggle "Source Code" | Buka bottom panel [[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS\|Monaco Live Editor]] |

---

## 2. DOM Mutation & CSS Engine Logic

- **Virtual DOM / AST Handling:**
  - **Matched rules:** agent menjalankan `el.matches(selectorTextWithoutPseudo)` untuk setiap rule di RuleIndex (pre-filter dengan index class/id/tag → hanya kandidat yang relevan), mengembalikan rule yang match beserta media yang aktif (`matchMedia(media).matches` di viewport artboard).
  - **Cascade resolver** (host): urutkan menurut *origin & importance → @layer → specificity → order*; tandai pemenang per properti; inline `style` dan `!important` diperhitungkan.
  - **Resolusi `StyleWriteTarget` default** (urutan prioritas):
    1. Jika user memilih eksplisit → pakai itu.
    2. Jika elemen punya class "paling spesifik milik proyek" (non-vendor) yang hanya dipakai elemen ini atau komponen sejenis → rule class itu.
    3. Jika tidak ada class → tawarkan *auto-class* berbasis BEM (`.hero__title`) dibuat dari konteks parent; fallback inline bila user menolak.
  - **Pseudo-state & media composition:** target akhir = `selector + state` dibungkus `@media` breakpoint aktif. Rule dicari (normalisasi selector via `postcss-selector-parser`: whitespace, urutan tidak diubah); jika tidak ada dibuat & disisipkan **tepat setelah** rule dasar (untuk state) atau di blok `@media` yang ada (diurutkan desktop-first / mobile-first).
  - **Forced state:** agent tidak bisa memaksa `:hover` asli lintas origin tanpa DevTools Protocol, sehingga agent **menulis ulang** rule yang mengandung `:hover`/`:focus`/`:active` menjadi duplikat dengan atribut `[data-vds-force~="hover"]` di sheet internal design-time (bukan di sumber) lalu men-set atribut tersebut pada elemen. Contoh: `.btn:hover` → sheet internal juga memuat `.btn[data-vds-force~="hover"]`.
  - **Class add/remove:** `TextEdit` pada `attrs.class.valueRange` (atau sisip atribut `class=""` baru setelah nama tag).
  - **Tokens (F035):** CSS custom properties di `:root` (atau scope pilihan / `[data-theme="dark"]`). "Bind to token" mengganti nilai literal dengan `var(--token)`.
- **Bi-directional Sync Rules:**
  - Kode menambah rule baru yang match seleksi → daftar Style target diperbarui otomatis; target pilihan user dipertahankan via `ruleId` stabil (hash `file + selector + media + ordinal`).
  - Menghapus rule target di kode → target fallback ke resolusi default + toast "Target rule removed".
  - Rename class global = satu command komposit yang menyentuh banyak file dalam **satu** transaksi Yjs.
- **Undo / Redo Stack:** `class.add`, `class.remove`, `class.rename` (komposit), `rule.create` (sering implisit bersama `style.set` pertama → digabung ke satu entri "Set color on .btn--primary:hover"), `token.create/update`. Perubahan State/Media/Target (pilihan UI) **bukan** command.

---

## 3. Data Schema & State Model

- **Local State Komponen:**

```typescript
interface SelectorBarState {
  selectedNodeId: string | null;
  classes: string[];
  matchedRules: MatchedRule[];
  target: StyleWriteTarget;                 // lihat CSS_VISUAL_INSPECTOR/_INDEX
  state: PseudoState | null;
  mediaContext: { breakpointId: string; query: string | null };
  computedStyles: Record<string, string>;
  isDragging: boolean;
}

type PseudoState = ':hover' | ':focus' | ':focus-visible' | ':focus-within' | ':active' | ':visited' | ':disabled' | '::before' | '::after' | '::placeholder' | '::selection';

interface MatchedRule {
  ruleId: string;
  selector: string;
  file: string; line: number;
  media: string | null; layer: string | null;
  specificity: [number, number, number];
  order: number;
  affects: number;                          // jumlah elemen yang match di dokumen
  readOnly: boolean;                        // vendor / CDN
}

interface CascadeEntry {
  prop: string;
  winner: { value: string; ruleId: string | 'inline'; important: boolean };
  overridden: Array<{ value: string; ruleId: string | 'inline'; reason: 'specificity' | 'order' | 'importance' | 'layer' | 'media-inactive' }>;
}

interface DesignToken { name: `--${string}`; value: string; group: 'color' | 'space' | 'radius' | 'font' | 'shadow' | 'other'; scope: string; modes?: Record<string, string> }
```

- **Generated Output Contract (Pure HTML/CSS):**

```html
<button class="btn btn--primary" type="button">Get started</button>
```

```css
:root {
  --brand-600: #4f46e5;
  --brand-500: #6366f1;
  --radius-md: 12px;
}
[data-theme="dark"] {
  --brand-600: #818cf8;
}

.btn--primary {
  background-color: var(--brand-500);
  border-radius: var(--radius-md);
}
.btn--primary:hover {
  background-color: var(--brand-600);
}
.btn--primary:focus-visible {
  outline: 2px solid var(--brand-600);
  outline-offset: 2px;
}
.btn--primary::after {
  content: "→";
  margin-left: 0.5rem;
}

@media (max-width: 767.98px) {
  .btn--primary { width: 100%; }
}
```

### Design Tokens Panel
- Token dibaca dari semua deklarasi `--*` di RuleIndex; dikelompokkan otomatis via heuristik nilai (warna, panjang, angka).
- Edit token = `style.set` pada rule `:root` (atau scope) → seluruh elemen yang memakai `var()` berubah serentak di semua artboard.
- Export token ke JSON (W3C Design Tokens format) tersedia di [[Modules/EXPORT_BUILD_PIPELINE/EXP-01_PROJECT_EXPORT|EXP-01]].

---

## 4. Edge Cases, Performance & Sandboxing

- **Iframe Sandboxing & Security:** Sheet internal forced-state & `data-vds-*` hanya ada di DOM preview; di-strip saat export. Selector yang diketik user divalidasi `postcss-selector-parser` + `document.querySelector` try/catch di agent sebelum rule dibuat.
- **Performance:**
  - Index rule per class/id/tag → matching O(kandidat) bukan O(seluruh rule). Recompute matched rules hanya saat seleksi berubah, class berubah, atau RuleIndex berubah pada rule kandidat.
  - Hitung `affects` dengan `querySelectorAll(selector).length` lazy (saat dropdown dibuka), di-cache per versi dokumen.
- **Conflict Handling:**
  - **Class menimpa inline styles:** tidak bisa (inline menang kecuali `!important`). Bila user mengedit class tetapi inline memenangkan properti tsb → peringatan + aksi *Move inline → class*.
  - **Class eksternal (vendor/CDN) menang** karena spesifisitas lebih tinggi (`.navbar .btn`) → saat membuat rule baru, sistem menghitung spesifisitas minimal yang menang dan menyarankan selector (mis. `.hero .btn--primary`) atau `@layer` reorder; tidak pernah mengedit file vendor.
  - **Shared class blast radius:** mengedit `.btn` (affects 23) memunculkan konfirmasi pertama kali per sesi dengan opsi "Create modifier class instead" (`.btn--hero`).
  - **Media inactive:** deklarasi di media yang tidak aktif pada artboard saat ini ditampilkan redup dengan alasan `media-inactive`.
  - **Pseudo-element tanpa `content`:** saat memilih `::before` dan rule belum ada, sistem menambahkan `content: ""` otomatis.
  - **`@layer` / `@scope` / `@container`:** dipahami resolver; kontrol "Container query" mengikuti pola media (P2).
