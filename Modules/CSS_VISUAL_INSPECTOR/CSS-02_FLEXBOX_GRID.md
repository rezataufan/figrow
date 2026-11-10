---
id: CSS-02
module: CSS_VISUAL_INSPECTOR
features: [F024, F025, F026]
tags: [vds/spec, vds/css, vds/layout]
---

# CSS-02: Flexbox & Grid Visual Controls

- **Navigasi Induk:** [[00_INDEX|Studio Workspace]] > [[Modules/CSS_VISUAL_INSPECTOR/_INDEX|Index Modul CSS_VISUAL_INSPECTOR]]
- **Target Engine:** CSS Parser / Iframe DOM (layout probe) / Canvas (grid & flex overlay)
- **Status:** [ ] Planned | [ ] In Progress | [x] Completed
- **Relasi:** [[Modules/CSS_VISUAL_INSPECTOR/CSS-01_BOX_MODEL|CSS-01]] · [[Modules/CANVAS_ENGINE/CANVAS-03_DRAG_DROP_REORDER|CANVAS-03 (drop ke flex/grid)]] · [[Modules/CSS_VISUAL_INSPECTOR/CSS-04_CLASSES_STATES|CSS-04 Target]]

---

## 1. UI Hierarchy & Interaksi Workspace

- **Posisi Komponen:** Right Inspector → section **Layout** (container) & **Layout Item** (muncul bila parent seleksi adalah flex/grid).
- **Wireframe Tekstual & Elemen Visual:**

```text
┌ Layout ───────────────────────────────────────────┐
│ Display [ block | flex | grid | inline… | none ]  │
│ ── Flex ───────────────────────────────────────── │
│ Direction [→ row][↓ col][← rev][↑ rev]  Wrap [⏎]  │
│ ┌ Align matrix (3×3) ┐  Justify [start▾]          │
│ │ ◻ ◻ ◻ │              Align   [center▾]          │
│ │ ◻ ◼ ◻ │  ← klik sel = justify+align sekaligus    │
│ │ ◻ ◻ ◻ │              [⇹ space-between] [stretch]│
│ └───────┘                                          │
│ Gap  ↔ [ 24 px ]  ↕ [ 16 px ]  ⛓                  │
│ ── Grid ───────────────────────────────────────── │
│ Columns [ repeat(3, minmax(0, 1fr)) ]  [+ track]  │
│   ┌ 1fr ┬ 1fr ┬ 1fr ┐   ← track chips, drag resize │
│ Rows    [ auto ]                                    │
│ Areas   [ Edit areas ▦ ]   Auto-flow [row ▾ dense] │
├ Layout Item (child of div.grid) ──────────────────┤
│ Flex: Grow [1] Shrink [1] Basis [0%]  Order [0]   │
│ Grid: Column [ 1 / span 2 ] Row [ auto ]          │
│ Align self [auto▾]  Justify self [auto▾]          │
└───────────────────────────────────────────────────┘
```

  - **Canvas overlay:** saat container flex/grid terseleksi, kanvas menampilkan garis grid track (ungu), nomor line, area gap (hatch), dan arah flex (panah).
  - **Indikator breakpoint:** jika `flex-direction` berbeda per breakpoint, tampil pill `@768: column`.

- **Interaksi Pengguna (Trigger & Action):**

| Trigger | Action |
|---|---|
| Pilih `Display: flex` | `display:flex` ditulis; section Flex muncul; anak-anak menampilkan Layout Item |
| Klik sel align matrix | Tulis `justify-content` + `align-items` (dipetakan sesuai `flex-direction`) |
| Scrub gap | Transient; overlay gap hatch ikut berubah |
| Drag garis track di kanvas (grid) | Ubah ukuran track; nilai `fr` dipertahankan bila track memakai `fr`, px bila px |
| Klik "Edit areas" | Modal grid area painter: drag sel → beri nama area → menghasilkan `grid-template-areas` |
| Drag anak di kanvas ke sel grid | → [[Modules/CANVAS_ENGINE/CANVAS-03_DRAG_DROP_REORDER\|CANVAS-03]] menulis `grid-column/row` |
| Klik elemen di Canvas | Selection outline → aktifkan [[Modules/CSS_VISUAL_INSPECTOR/CSS-01_BOX_MODEL\|Inspector Box Model]] + Layout |
| Klik toggle "Source Code" | Buka [[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS\|Monaco Live Editor]] |

---

## 2. DOM Mutation & CSS Engine Logic

- **Virtual DOM / AST Handling:**
  - Semua kontrol → `style.set` pada `StyleWriteTarget` (sama dengan [[Modules/CSS_VISUAL_INSPECTOR/CSS-01_BOX_MODEL|CSS-01]]).
  - **Pemetaan matrix ↔ properti** bergantung axis:

```typescript
function matrixToProps(cell: { row: 0|1|2; col: 0|1|2 }, dir: 'row' | 'column'): Record<string, string> {
  const pos = ['flex-start', 'center', 'flex-end'];
  return dir === 'row'
    ? { 'justify-content': pos[cell.col], 'align-items': pos[cell.row] }
    : { 'justify-content': pos[cell.row], 'align-items': pos[cell.col] };
}
```
  - **Grid track parser:** `grid-template-columns` di-parse dengan `postcss-value-parser` menjadi `TrackList` (mendukung `repeat()`, `minmax()`, `fit-content()`, line names `[a]`). Edit visual memodifikasi `TrackList` lalu di-*print* kembali **dalam bentuk ringkas** (`repeat(3, 1fr)` dipertahankan bila semua track identik).
  - **Resolved track sizes** untuk overlay diambil dari agent (`getComputedStyle(el).gridTemplateColumns` → nilai px resolved).
  - Mengubah `display` dari `flex` → `block` **tidak** menghapus properti flex lain otomatis; properti yang tidak berlaku ditampilkan redup dengan aksi "Clean up unused flex properties".
- **Bi-directional Sync Rules:**
  - Kode berisi shorthand `flex-flow: row wrap` atau `place-items: center` → Inspector menampilkan nilai terpecah; edit satu sub-nilai menulis kembali ke shorthand yang sama (pola shorthand intelligence dari CSS-01).
  - `grid-template` / `grid` shorthand kompleks yang tidak dapat diedit visual → section Grid beralih ke mode teks dengan preview overlay tetap aktif.
- **Undo / Redo Stack:** Klik matrix = satu command dengan 2 deklarasi (atomik). Drag track = transient → satu commit. Area painter = satu commit saat "Apply".

---

## 3. Data Schema & State Model

- **Local State Komponen:**

```typescript
interface LayoutInspectorState {
  selectedNodeId: string | null;
  computedStyles: Record<string, string>;
  isDragging: boolean;
  container: {
    display: string;
    flex?: { direction: 'row' | 'row-reverse' | 'column' | 'column-reverse'; wrap: 'nowrap' | 'wrap' | 'wrap-reverse';
             justify: string; alignItems: string; alignContent: string; rowGap: string; columnGap: string };
    grid?: { columns: TrackList; rows: TrackList; areas: string[][] | null; autoFlow: string;
             resolvedColumnsPx: number[]; resolvedRowsPx: number[] };
  };
  parentLayout: 'flex' | 'grid' | 'none';
  item?: { grow: string; shrink: string; basis: string; order: string; alignSelf: string;
           gridColumn: string; gridRow: string; justifySelf: string };
}

type Track =
  | { kind: 'size'; value: string }                         // "1fr", "200px", "auto"
  | { kind: 'minmax'; min: string; max: string }
  | { kind: 'repeat'; count: number | 'auto-fill' | 'auto-fit'; tracks: Track[] }
  | { kind: 'lineNames'; names: string[] };
type TrackList = Track[];
```

- **Generated Output Contract (Pure HTML/CSS):**

```css
.features {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
}
.features__promo { grid-column: 1 / span 2; }

.nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  column-gap: 32px;
}

@media (max-width: 767.98px) {
  .features { grid-template-columns: 1fr; }
  .nav { flex-direction: column; align-items: flex-start; }
}
```

Grid areas painter:

```css
.layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  grid-template-areas:
    "header header"
    "sidebar main"
    "footer footer";
}
.layout > header { grid-area: header; }
```

---

## 4. Edge Cases, Performance & Sandboxing

- **Iframe Sandboxing & Security:** Overlay grid digambar di host dari angka resolved yang dikirim agent; tidak ada injeksi DOM debugging ke halaman pengguna.
- **Performance:**
  - Resize track: transient `grid-template-columns` pada elemen (inline transient layer) per frame; overlay dihitung ulang dari nilai lokal tanpa menunggu agent.
  - Overlay grid hanya untuk container terseleksi + (opsional) semua grid yang terlihat ketika `View ▸ Show All Grids` aktif, dibatasi 20 container.
- **Conflict Handling:**
  - **Gap pada flex di browser lama:** tidak relevan untuk target modern; dokumentasi `browserslist` proyek dipakai untuk peringatan di [[Modules/EXPORT_BUILD_PIPELINE/EXP-01_PROJECT_EXPORT|Export validation]].
  - **Anak dengan `margin: auto`** memengaruhi distribusi; Inspector menampilkan hint "Child margin-left:auto overrides justify-content".
  - **`display` dari class lain** (mis. utility `.d-none` dengan spesifisitas sama tetapi urutan lebih akhir) → nilai oranye & link ke rule pemenang di [[Modules/CSS_VISUAL_INSPECTOR/CSS-04_CLASSES_STATES|cascade panel]].
  - **Subgrid / masonry:** didukung sebagai nilai teks; kontrol visual dinonaktifkan dengan label "Edit in code".
  - **Item explicit placement di luar track yang ada** → grid implisit; overlay menampilkan track implisit dengan garis putus-putus.
