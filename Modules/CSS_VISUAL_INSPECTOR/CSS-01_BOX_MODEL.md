---
id: CSS-01
module: CSS_VISUAL_INSPECTOR
features: [F021, F022, F023]
tags: [vds/spec, vds/css]
---

# CSS-01: Box Model & Sizing (Margin, Padding, Border, Size)

- **Navigasi Induk:** [[00_INDEX|Studio Workspace]] > [[Modules/CSS_VISUAL_INSPECTOR/_INDEX|Index Modul CSS_VISUAL_INSPECTOR]]
- **Target Engine:** CSS Parser (PostCSS AST) / Iframe DOM (CSSOM) / Canvas (box-model overlay)
- **Status:** [ ] Planned | [ ] In Progress | [x] Completed
- **Relasi:** [[Modules/CSS_VISUAL_INSPECTOR/CSS-04_CLASSES_STATES|CSS-04 Style Target]] · [[Modules/CANVAS_ENGINE/CANVAS-02_SELECTION_BOUNDS|CANVAS-02 Resize]] · [[01_SYSTEM_ARCHITECTURE#13. Transient Preview vs Commit (60 FPS Rule)|60 FPS Rule]]

---

## 1. UI Hierarchy & Interaksi Workspace

- **Posisi Komponen:** Right Inspector → section **Box Model** & **Size**.
- **Wireframe Tekstual & Elemen Visual:**

```text
┌ Box Model ───────────────────────────── ⛓ link ┐
│ MARGIN                 [ 0 ]                    │
│   ┌ BORDER            [ 1 ]  solid ▾ ■#E2E8F0 ─┐│
│   │ PADDING           [ 24 ]                   ││
│[auto]│[24]   ┌───────────────┐   [24]│[auto]   ││
│   │          │  320 × auto   │                 ││
│   │          └───────────────┘                 ││
│   │                 [ 24 ]                     ││
│   └─────────────────[ 1 ]──────────────────────┘│
│                     [ 32 ]                      │
├ Size ───────────────────────────────────────────┤
│ W [ 20    rem ▾]  H [ auto      ▾]   ↔ Fill ▾  │
│ Min W [ —  ] Max W [ 72rem ] Min H [—] Max H [—]│
│ Aspect [ 16 / 9 ▾]  Box sizing (●border ○content)│
│ Overflow [visible ▾]  Radius [ 12px ] ⛓          │
└─────────────────────────────────────────────────┘
```

  - **Visual box model:** 4 input margin, 4 input border-width, 4 input padding; ⛓ link (Shift+drag = semua sisi, Alt+drag = sisi berlawanan).
  - **Warna nilai:** biru = di-set pada target aktif; abu = inherited/computed dari rule lain (hover menunjukkan sumber); oranye = di-override oleh rule lain (lihat [[Modules/CSS_VISUAL_INSPECTOR/CSS-04_CLASSES_STATES|cascade]]).
  - **Unit dropdown (F023):** `px rem em % vw vh ch auto fit-content min-content max-content` + mode ekspresi (ketik `calc(100% - 2rem)` atau `var(--space-4)`).
  - **Indikator breakpoint:** pill kecil `@768` di samping nilai jika nilai berasal dari media query breakpoint aktif.

- **Interaksi Pengguna (Trigger & Action):**

| Trigger | Action |
|---|---|
| Klik elemen di Canvas | Selection outline → section Box Model terisi computed + declared values |
| Drag horizontal pada label/angka (scrub) | Nilai berubah 1/unit per 2px (`Shift` ×10, `Alt` ×0.1) — transient 60 FPS |
| Ketik nilai + `Enter` | Commit; ekspresi aritmatika `24*2` dievaluasi → `48px` |
| `↑/↓` di input | ±1 (`Shift` ±10); setiap keypress = commit dengan merge (lihat undo) |
| Hover input margin | Kanvas menyorot area margin sisi tsb (overlay tint) |
| Klik kanan nilai | *Reset* (hapus deklarasi) / *Copy CSS* / *Convert to rem* / *Bind to token* |
| Pilih `Fill` di Size | `width: 100%` (block) atau `flex: 1 1 0%` (flex child) atau `align-self: stretch` sesuai konteks |
| Klik toggle "Source Code" | Buka [[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS\|Monaco Live Editor]] pada deklarasi yang sedang diedit |

---

## 2. DOM Mutation & CSS Engine Logic

- **Virtual DOM / AST Handling:**
  - Target tulis = `StyleWriteTarget` dari Selector Bar ([[Modules/CSS_VISUAL_INSPECTOR/CSS-04_CLASSES_STATES|CSS-04]]).
  - Command `style.set { target, decls: [{prop, value}] }` → `compile()`:
    1. **Rule existing:** cari `Declaration` di PostCSS AST. Ada → ganti hanya `valueRange`. Tidak ada → sisipkan baris baru setelah deklarasi terakhir dengan indentasi & `raws.between` (`: ` vs `:`) mengikuti gaya rule tersebut.
    2. **newRule:** sisipkan rule di akhir stylesheet target (atau di dalam blok `@media` yang cocok — dibuat bila belum ada, diurutkan sesuai breakpoint).
    3. **Inline:** parse atribut `style` sebagai declaration list, lakukan operasi yang sama, tulis kembali hanya `attrs.style.valueRange`.
  - **Shorthand intelligence:** jika rule punya `padding: 24px 32px` lalu pengguna mengubah `padding-left` → 40px, hasil = `padding: 24px 32px 24px 40px` (shorthand dipertahankan & diekspansi), bukan menambahkan `padding-left` terpisah. Jika keempat sisi sama → collapse ke `padding: 24px`. Bila shorthand mengandung `var()` yang tidak dapat diekspansi, tambahkan longhand setelahnya.
  - CSSOM iframe: commit menghasilkan `PatchOp.setDecl` (jalur cepat) — tanpa `replaceSync` seluruh sheet.
- **Bi-directional Sync Rules:**
  - Kode → Inspector: perubahan RuleIndex memicu re-query `matchedRules` + computed untuk seleksi; nilai di input diperbarui kecuali input sedang fokus (nilai baru ditampilkan setelah blur, dengan indikator "changed externally").
  - Inspector → Kode: hanya `valueRange` yang berubah; kursor Monaco & scroll tidak bergeser (Yjs relative position).
  - Nilai yang tidak dapat direpresentasikan widget (mis. `margin: clamp(1rem, 2vw, 2rem)`) ditampilkan sebagai chip ekspresi yang bisa diedit sebagai teks.
- **Undo / Redo Stack:** Scrub = transient; satu commit saat pointerup. Ketikan `↑/↓` berturut-turut pada properti & target yang sama dalam 400 ms → `canMerge` = true (satu entri "Set padding-top 24 → 31px").

---

## 3. Data Schema & State Model

- **Local State Komponen:**

```typescript
interface BoxModelState {
  selectedNodeId: string | null;
  target: StyleWriteTarget | null;
  computedStyles: Record<string, string>;      // dari agent getComputedStyle (resolved px)
  declared: Record<BoxProp, DeclaredValue | undefined>;
  linkMode: 'none' | 'all' | 'axis';
  isDragging: boolean;                          // scrub aktif
  transient: Partial<Record<BoxProp, string>>;  // nilai optimistik selama scrub
}

type BoxProp =
  | 'margin-top' | 'margin-right' | 'margin-bottom' | 'margin-left'
  | 'padding-top' | 'padding-right' | 'padding-bottom' | 'padding-left'
  | 'border-top-width' | 'border-right-width' | 'border-bottom-width' | 'border-left-width'
  | 'width' | 'height' | 'min-width' | 'max-width' | 'min-height' | 'max-height'
  | 'aspect-ratio' | 'box-sizing' | 'overflow' | 'border-radius';

interface DeclaredValue {
  raw: string;                 // "1.5rem" | "var(--space-6)" | "calc(...)"
  parsed?: { num: number; unit: string };
  source: { ruleId: string | 'inline'; selector: string; media: string | null; file: string };
  status: 'active' | 'overridden' | 'inherited';
  fromShorthand?: 'margin' | 'padding' | 'border' | 'border-width' | 'inset';
}
```

- **Generated Output Contract (Pure HTML/CSS):**

Target `.card` (rule existing), ubah padding-left ke 40px & width 20rem:

```css
.card {
  width: 20rem;
  padding: 24px 32px 24px 40px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-sizing: border-box;
}
```

Target inline (bila Selector Bar = "This element only"):

```html
<div class="card" style="margin-bottom: 32px;">…</div>
```

Target breakpoint Mobile aktif:

```css
@media (max-width: 767.98px) {
  .card { width: 100%; padding: 16px; }
}
```

---

## 4. Edge Cases, Performance & Sandboxing

- **Iframe Sandboxing & Security:** Nilai yang diketik divalidasi dengan `CSS.supports(prop, value)` di host sebelum commit; nilai mengandung `}` `;` `<` `/*` yang dapat menyuntik rule lain ditolak / di-escape. Agent tidak pernah `eval` string CSS — hanya `setProperty`.
- **Performance:**
  - Scrub: `pointermove` → rAF-throttle → `HostMsg.transient { id, style }` → agent `el.style.setProperty(prop, v, 'important')` pada transient layer; overlay box-model diperbarui dari `rects` frame berikutnya.
  - Computed styles di-query sekali per seleksi + setelah tiap commit (batch properti relevan, bukan seluruh `CSSStyleDeclaration`).
  - Komponen input memo per properti; satu perubahan tidak me-render ulang seluruh inspector.
- **Conflict Handling:**
  - **Class menimpa inline / inline menimpa class:** bila target = `.card` tetapi deklarasi pemenang berasal dari `style=""` (spesifisitas lebih tinggi), nilai input berwarna oranye + tooltip "Overridden by inline style" + aksi *Edit inline* / *Remove inline & apply to class*.
  - **Rule eksternal read-only** (CDN Bootstrap, file vendor ditandai `readOnly`): tidak pernah diubah; edit otomatis membuat rule baru di stylesheet proyek dengan selector sama yang dimuat **setelah** vendor (order menang) atau menambah spesifisitas minimal.
  - **`!important` pihak lain:** tampil 🔒 pada nilai; edit memerlukan konfirmasi menambah `!important`.
  - **Multi-select dengan nilai berbeda:** tampilkan `Mixed`; scrub menerapkan delta relatif ke masing-masing.
  - **`box-sizing` berubah:** tawarkan kompensasi width agar ukuran visual tetap ("Keep visual size").
