---
id: CANVAS-03
module: CANVAS_ENGINE
features: [F012, F013, F014]
tags: [vds/spec, vds/canvas]
---

# CANVAS-03: Drag, Drop & Reorder

- **Navigasi Induk:** [[00_INDEX|Studio Workspace]] > [[Modules/CANVAS_ENGINE/_INDEX|Index Modul CANVAS_ENGINE]]
- **Target Engine:** Canvas (gesture + indicator) / Iframe DOM (layout probe) / HTML AST (move)
- **Status:** [ ] Planned | [ ] In Progress | [x] Completed
- **Relasi:** [[Modules/DOM_TREE_LAYERS/LAYER-01_TREE_REORDER|LAYER-01 (shared validator)]] · [[Modules/COMPONENT_LIBRARY/COMP-01_INSERTION_LOGIC|COMP-01 (drop dari library)]] · [[Modules/CSS_VISUAL_INSPECTOR/CSS-02_FLEXBOX_GRID|CSS-02 (flex/grid context)]]

---

## 1. UI Hierarchy & Interaksi Workspace

- **Posisi Komponen:** Canvas Center (drag ghost + insertion indicator), Floating badge (target info).
- **Wireframe Tekstual & Elemen Visual:**

```text
 Normal flow (block):              Flex row container:             Grid container:
 ┌ section.features ──────────┐    ┌ div.row (flex) ───────────┐    ┌ div.grid ───────────────┐
 │ [ card A ]                 │    │ [A] ┃ [B]  [C]            │    │ [A] [B] [C]             │
 │ ━━━━━━━━━━━━━━━━━━━━━━━━━━ │ ←  │     ┃ ← vertical bar      │    │ [D] [▒▒▒] ← cell target │
 │ [ card B ]   insertion bar │    └───────────────────────────┘    └─────────────────────────┘
 └────────────────────────────┘
 Badge:  "Move into section.features · index 1"     Absolute: "top 120 · left 48" + guides
```

  - **Ghost:** snapshot semi-transparan (opacity 0.6) dari elemen yang di-drag (bitmap dari agent atau outline sederhana saat zoom < 50%).
  - **Insertion indicator:** bar 2px biru — horizontal untuk flow vertikal, vertikal untuk `flex-direction: row`; sel grid tersorot untuk grid.
  - **Parent highlight:** outline dashed pada container target.
  - **Indikator invalid:** bar merah + badge "`<li>` hanya boleh di dalam `<ul>/<ol>`".

- **Interaksi Pengguna (Trigger & Action):**

| Trigger | Action |
|---|---|
| Drag elemen terseleksi > 4px | Mulai gesture move (static flow) |
| Hover di atas container saat drag | Hitung drop slot (lihat algoritma) → tampilkan indicator |
| Tahan 500 ms di atas elemen non-container (mis. `div` kosong) | "Spring-load": izinkan drop *ke dalam* elemen tersebut |
| `Alt` saat drop | Duplikasi (copy) alih-alih move |
| `Esc` saat drag | Batalkan, tidak ada command |
| Drag ke artboard lain / page lain | Cross-file move (F013): HTML dipindah; CSS terkait diperiksa (rule yang hanya dipakai node ini disalin bila stylesheet berbeda) |
| Drag elemen `position: absolute/fixed` | Mode posisi (F014): tulis `top/left` (atau `inset`) alih-alih reorder |
| `Alt+↑ / Alt+↓` | Pindah sebelum/sesudah sibling (keyboard reorder) |
| Panah (elemen absolute) | Nudge 1px, `Shift` 10px |
| Drop berhasil | Seleksi tetap pada elemen, [[Modules/DOM_TREE_LAYERS/LAYER-01_TREE_REORDER\|Layers Tree]] reveal posisi baru |

---

## 2. DOM Mutation & CSS Engine Logic

- **Virtual DOM / AST Handling:**
  - **Algoritma Drop Slot** (dijalankan di agent, karena butuh layout live):
    1. `elementsFromPoint(x,y)` → kandidat terdalam yang **container-capable** (bukan void element, bukan `designMeta.locked`, content model mengizinkan elemen yang di-drag).
    2. Tentukan **axis** dari computed style container: `display:flex` → `flex-direction`; `grid` → 2D; lainnya → axis `y` (block) atau `x` (inline formatting).
    3. Ambil anak in-flow (abaikan `position:absolute/fixed`, `display:none`), hitung titik tengah tiap anak pada axis; index = jumlah anak yang titik tengahnya < pointer.
    4. Zona tepi 6px pada container tanpa padding → naik ke parent (memungkinkan drop *sebelum/sesudah* container).
    5. Grid: cari sel `(row, col)` dari `getComputedStyle().gridTemplateColumns` resolved track sizes; jika auto-placement → index; jika area/eksplisit → tulis `grid-column/grid-row` pada item.
  - **Commit:** command `node.move { key, newParentKey, beforeKey }` → `compile()` menghasilkan dua `TextEdit`: hapus range sumber (termasuk whitespace indentasi baris penuh) dan sisipkan teks node di offset target dengan **re-indentasi** mengikuti indentasi sibling target.
  - DOM iframe menerima `PatchOp { op:'move' }` — node DOM yang sama dipindah (`insertBefore`), bukan dibuat ulang → state elemen (video playback, input value) terjaga.
- **Bi-directional Sync Rules:**
  - Selama drag, Monaco tidak berubah. Saat commit, Monaco menerima delta `Y.Text` (dua edit) dan dekorasi "moved" berkedip 600 ms pada range baru.
  - Jika pengguna sedang mengetik di Monaco pada file yang sama (fokus editor), drag kanvas tetap diizinkan; CRDT menggabungkan (Yjs relative positions menjaga posisi kursor).
- **Undo / Redo Stack:** `node.move` = satu entri ("Move card B into section.features"). Undo melakukan inverse text edits via `Y.UndoManager`; NodeKey dipertahankan karena reconciler mengenali subtree identik (hash konten) sebagai *moved*, bukan delete+insert.

---

## 3. Data Schema & State Model

- **Local State Komponen:**

```typescript
interface DragState {
  isDragging: boolean;
  kind: 'move' | 'copy' | 'insertFromLibrary' | 'absolutePosition';
  sourceKeys: string[];
  pointer: { screenX: number; screenY: number };
  dropSlot: DropSlot | null;
  validation: { ok: true } | { ok: false; reason: string };
  springLoadTimer: number | null;
}

interface DropSlot {
  artboardId: string;
  parentKey: string;
  beforeKey: string | null;     // null = append
  axis: 'x' | 'y' | 'grid';
  gridCell?: { row: number; col: number; explicit: boolean };
  indicator: { x: number; y: number; length: number; orientation: 'h' | 'v' } | { cellRect: DOMRectInit };
}

interface MoveNodeCommand {
  type: 'node.move';
  payload: { keys: string[]; parentKey: string; beforeKey: string | null; copy: boolean; crossFile?: { fromFile: string; toFile: string } };
}
```

- **Generated Output Contract (Pure HTML/CSS):**

Reorder card B sebelum card A (indentasi asli dipertahankan):

```html
<section class="features">
  <article class="card">B</article>
  <article class="card">A</article>
</section>
```

Drop ke grid sel eksplisit (baris 2, kolom 3):

```css
.card--promo { grid-column: 3; grid-row: 2; }
```

Drag elemen absolute:

```css
.badge { position: absolute; top: 12px; left: 248px; }
```

---

## 4. Edge Cases, Performance & Sandboxing

- **Iframe Sandboxing & Security:** Drag diproses oleh host (pointer capture pada overlay), bukan HTML5 DnD di iframe — skrip pengguna tidak pernah menerima event `dragstart/drop` studio. Agent hanya menjawab query `dropProbe {x,y,sourceTag}` dengan `DropSlot`.
- **Performance:**
  - `dropProbe` di-throttle ke 1 per frame; hasil di-cache per `(parentKey, pointer bucket 4px)`.
  - Rect anak container dihitung sekali saat pointer masuk container lalu di-cache sampai keluar (tidak ada `getBoundingClientRect` per mousemove untuk semua anak).
  - Auto-scroll kamera saat pointer < 40px dari tepi viewport (kecepatan proporsional).
- **Conflict Handling / Validasi (shared dengan LAYER-01):**
  - **Content model HTML:** tabel aturan (mis. `li` ⊂ `ul|ol|menu`, `tr` ⊂ `thead|tbody|tfoot|table`, interactive tidak boleh di dalam `a`/`button`, `p` tidak boleh memuat block). Pelanggaran → drop ditolak (merah) kecuali `Shift` ditahan ("force", dengan warning diagnostics).
  - **Drop ke dalam diri sendiri/keturunan:** selalu ditolak.
  - **Cross-file move:** class yang dipakai node tetapi rule-nya tidak ada di stylesheet tujuan → dialog: *Copy rules* / *Link stylesheet* / *Ignore*.
  - **Selector bergantung struktur** (`.list > li:first-child`, `:nth-child`) — setelah move, cascade resolver membandingkan computed style sebelum/sesudah; bila berubah, chip ⚠ "Styling changed due to structural selectors" dengan link ke rule terkait di [[Modules/CSS_VISUAL_INSPECTOR/CSS-04_CLASSES_STATES|CSS-04]].
  - **Absolute positioning vs class bersama:** jika `.badge` dipakai banyak elemen, menggeser satu elemen menulis ke target sesuai Selector Bar; default = buat modifier class/inline dengan peringatan "affects N elements" bila menulis ke class bersama.
