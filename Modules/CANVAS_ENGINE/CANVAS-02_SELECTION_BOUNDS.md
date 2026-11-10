---
id: CANVAS-02
module: CANVAS_ENGINE
features: [F007, F008, F009, F010, F011]
tags: [vds/spec, vds/canvas]
---

# CANVAS-02: Selection, Bounds & Resize Handles

- **Navigasi Induk:** [[00_INDEX|Studio Workspace]] > [[Modules/CANVAS_ENGINE/_INDEX|Index Modul CANVAS_ENGINE]]
- **Target Engine:** Canvas (host overlay) / Iframe DOM (hit-test & measure via agent)
- **Status:** [ ] Planned | [ ] In Progress | [x] Completed
- **Relasi:** [[Modules/CANVAS_ENGINE/CANVAS-01_ZOOM_PAN|CANVAS-01]] · [[Modules/CANVAS_ENGINE/CANVAS-03_DRAG_DROP_REORDER|CANVAS-03]] · [[Modules/DOM_TREE_LAYERS/LAYER-01_TREE_REORDER|LAYER-01]] · [[Modules/CSS_VISUAL_INSPECTOR/CSS-01_BOX_MODEL|CSS-01]]

---

## 1. UI Hierarchy & Interaksi Workspace

- **Posisi Komponen:** Canvas Center (overlay SVG di atas artboard), Floating Bar (context toolbar di atas seleksi).
- **Wireframe Tekstual & Elemen Visual:**

```text
        ┌ div.card ─ 320 × 184 ┐                      ← label chip (tag.class + ukuran)
   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░                 ← margin tint (oranye 20%)
   ░ ■━━━━━━━━━━━━━■━━━━━━━━━━━━━━■ ░                 ← selection bounds biru 1px + 8 handles
   ░ ┃▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒┃ ░                 ← padding tint (hijau 20%)
   ░ ■▒  [ content box ]          ▒■ ░
   ░ ┃▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒┃ ░
   ░ ■━━━━━━━━━━━━━■━━━━━━━━━━━━━━■ ░
   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
              ↕ 24                                    ← Alt-measure ke elemen tetangga (merah)
   ┌──────────────────────────┐
   │ <section.features>       │                       ← parent hint (dashed)
```

  - **Hover outline (F007):** 1px biru muda + chip `h2.title`.
  - **Selection (F008/F009):** outline biru 1.5px, 8 handle resize, tint box-model (toggle `View ▸ Box Model Overlay`).
  - **Multi-select:** bounding box gabungan + outline tipis per item.
  - **Context toolbar:** `Select parent ⤒`, `Wrap`, `Duplicate`, `Delete`, `Edit code </>`.

- **Interaksi Pengguna (Trigger & Action):**

| Trigger | Action |
|---|---|
| Hover elemen | Agent `hitTest` → overlay hover + chip |
| Klik | Pilih elemen *terluar yang belum dipilih* dalam konteks seleksi saat ini (Figma-like progressive) → outline biru → aktifkan [[Modules/CSS_VISUAL_INSPECTOR/CSS-01_BOX_MODEL\|Inspector Box Model]] & reveal di [[Modules/DOM_TREE_LAYERS/LAYER-01_TREE_REORDER\|Layers Tree]] |
| `Ctrl/⌘ + klik` | Deep select (elemen terdalam di titik kursor) |
| `Shift + klik` | Toggle tambah/kurang multi-select |
| Drag di area kosong artboard | Marquee: memilih elemen yang bounding-box-nya sepenuhnya di dalam marquee, dibatasi pada level parent yang sama |
| `Esc` / `Shift+Enter` / `Enter` | Select parent / parent / first child |
| `Tab` / `Shift+Tab` | Sibling berikut / sebelum |
| Double-click elemen teks | Masuk inline text edit (`contenteditable` sementara di agent) |
| Drag handle resize | Ubah `width`/`height` (transient → commit), `Shift` = lock rasio, `Alt` = resize simetris |
| `Alt` tahan + hover | Garis jarak merah antara seleksi dan elemen hover |
| Klik toggle "Source Code" | Buka [[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS\|Monaco Live Editor]] dengan kursor pada start tag seleksi |

---

## 2. DOM Mutation & CSS Engine Logic

- **Virtual DOM / AST Handling:**
  - **Seleksi tidak memutasi DOM.** Seleksi disimpan sebagai `NodeKey[]` (stabil lintas reparse, lihat [[01_SYSTEM_ARCHITECTURE#5. HTML AST & Node Identity|Node Identity]]).
  - **Hit-test:** host mengonversi koordinat layar → koordinat iframe (`(screen - artboardOrigin - camera) / zoom`), kirim `hitTest {x,y,deep}`; agent memanggil `document.elementsFromPoint()`, menyaring elemen transient/overlay internal, mengembalikan `id` + `path` leluhur. Elemen dengan `designMeta.locked` dilewati (dipilih leluhur terdekat yang tidak locked).
  - **Resize → CSS:** saat commit, handler membaca *unit asal* deklarasi pemenang (`width: 50%` tetap persen, `20rem` tetap rem) melalui cascade resolver, lalu mengonversi delta piksel:

```typescript
function pxToUnit(px: number, unit: CssUnit, ctx: { parentWidth: number; rootFontSize: number; fontSize: number; vw: number; vh: number }): string {
  switch (unit) {
    case 'px':  return `${round(px, 0)}px`;
    case 'rem': return `${round(px / ctx.rootFontSize, 3)}rem`;
    case 'em':  return `${round(px / ctx.fontSize, 3)}em`;
    case '%':   return `${round((px / ctx.parentWidth) * 100, 2)}%`;
    case 'vw':  return `${round((px / ctx.vw) * 100, 2)}vw`;
    default:    return `${round(px, 0)}px`;
  }
}
```
  - Jika lebar ditentukan oleh flex (`flex: 1`) dan bukan `width`, resize horizontal menulis `flex-basis` + `flex-grow: 0` dengan konfirmasi chip "Fixed width in flex container".
- **Bi-directional Sync Rules:**
  - Seleksi kanvas → Monaco: `editor.revealRangeInCenterIfOutsideViewport(startTagRange)` + dekorasi highlight; **tidak** memindahkan fokus keyboard dari kanvas.
  - Kursor Monaco → kanvas: node terdalam yang `range`-nya memuat offset kursor dipilih (debounce 100 ms), lihat [[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS|SYNC-01]].
  - Setelah reparse, seleksi dipetakan via `NodeKey`; bila node hilang, seleksi jatuh ke parent terdekat yang masih ada.
- **Undo / Redo Stack:** Seleksi bukan command (tidak dapat di-undo sendiri) tetapi disimpan di `stackItem.meta.selectionKeys` sehingga undo resize memilih kembali elemennya. Resize = satu command `style.set { props: { width, height } }` dengan `canMerge` false (satu gesture = satu entri).

---

## 3. Data Schema & State Model

- **Local State Komponen:**

```typescript
interface SelectionState {
  selectedKeys: string[];                 // NodeKey, urut sesuai urutan klik
  primaryKey: string | null;              // untuk Inspector saat multi-select
  hoverKey: string | null;
  artboardId: string | null;              // konteks breakpoint seleksi
  mode: 'idle' | 'marquee' | 'resizing' | 'textEditing';
  marquee?: { x0: number; y0: number; x1: number; y1: number };
}

interface MeasuredBox {                    // dari agent message 'rects'
  id: string;
  border: { x: number; y: number; width: number; height: number };   // koordinat iframe
  margin: { top: number; right: number; bottom: number; left: number };
  padding: { top: number; right: number; bottom: number; left: number };
  transform?: string;                      // matrix bila elemen ditransformasi
}

interface ResizeGesture {
  handle: 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
  startBox: MeasuredBox;
  sourceUnits: { width: CssUnit; height: CssUnit };
  target: StyleWriteTarget;                // lihat CSS_VISUAL_INSPECTOR/_INDEX
  modifiers: { shift: boolean; alt: boolean };
}
type CssUnit = 'px' | 'rem' | 'em' | '%' | 'vw' | 'vh' | 'auto';
```

- **Generated Output Contract (Pure HTML/CSS):**

Resize `.card` dari 300px ke 320px (target = class rule, unit asal rem, root 16px):

```css
/* sebelum */
.card { width: 18.75rem; padding: 1.5rem; }
/* sesudah — hanya value range yang diganti, format lain utuh */
.card { width: 20rem; padding: 1.5rem; }
```

Inline text edit pada `<h2>`:

```html
<h2 class="card__title">Fast &amp; reliable hosting</h2>
```

---

## 4. Edge Cases, Performance & Sandboxing

- **Iframe Sandboxing & Security:** Overlay dirender di host; agent hanya mengirim angka (rect) dan ID. `contenteditable` untuk inline text dinyalakan pada satu elemen, dimatikan saat blur; hasil teks diambil sebagai `textContent`/inline HTML yang di-sanitize (hanya `b,i,em,strong,a,br,span,code`) sebelum dikompilasi ke command `node.setText`.
- **Performance:**
  - Agent mengirim `rects` hanya untuk `selectedKeys ∪ hoverKey ∪ children seleksi (smart guides)`, digabung per frame (rAF) dan dikirim sebagai `Float32Array` transferable bila > 50 item.
  - Hover hit-test di-throttle per frame; jika pointer bergerak > 3 hit-test tertunda, hanya yang terakhir dikirim.
  - Resize: transient `width/height` via `HostMsg.transient`, overlay mengikuti pointer langsung (tidak menunggu rect agent) → 60 FPS.
  - Smart guides (F011): kandidat snapping = edges/center siblings + parent padding box; dihitung di host dengan sort pada sumbu → O(n log n), snap threshold 4px / zoom.
- **Conflict Handling:**
  - **Inline vs class:** jika `width` pemenang berasal dari `style=""` sementara target Inspector adalah class, resize menulis ke inline (pemenang) dan menampilkan chip ⚠ "Inline style overrides .card — Move to class?" (aksi: pindahkan deklarasi ke rule & hapus dari inline).
  - **`!important` eksternal** (mis. dari framework CSS read-only): resize ditolak pada target tersebut; tawarkan membuat rule baru dengan spesifisitas lebih tinggi atau `!important` eksplisit.
  - **Elemen ber-transform/rotate:** bounds digambar sebagai quad (matrix agent); handle resize menulis ke ukuran pre-transform.
  - **Elemen `display: inline`:** width/height tidak berlaku → handle dinonaktifkan, tooltip menawarkan `display: inline-block`.
  - **Pseudo-elemen `::before/::after`:** tidak bisa di-hit-test langsung; dipilih via Layers/Inspector (lihat [[Modules/CSS_VISUAL_INSPECTOR/CSS-04_CLASSES_STATES|CSS-04]]).
