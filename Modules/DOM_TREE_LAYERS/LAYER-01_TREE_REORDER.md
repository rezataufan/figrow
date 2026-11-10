---
id: LAYER-01
module: DOM_TREE_LAYERS
features: [F015, F016, F017, F018, F019, F020]
tags: [vds/spec, vds/layers]
---

# LAYER-01: Layers Tree — Reorder, Rename, Lock & Hide

- **Navigasi Induk:** [[00_INDEX|Studio Workspace]] > [[Modules/DOM_TREE_LAYERS/_INDEX|Index Modul DOM_TREE_LAYERS]]
- **Target Engine:** HTML AST (VNode tree) / Iframe DOM (design-time visibility) / designMeta sidecar
- **Status:** [ ] Planned | [ ] In Progress | [x] Completed
- **Relasi:** [[Modules/CANVAS_ENGINE/CANVAS-02_SELECTION_BOUNDS|CANVAS-02 Selection]] · [[Modules/CANVAS_ENGINE/CANVAS-03_DRAG_DROP_REORDER|CANVAS-03 Reorder]] · [[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS|SYNC-01]]

---

## 1. UI Hierarchy & Interaksi Workspace

- **Posisi Komponen:** Left Sidebar → tab **Layers** (di bawah tab Pages).
- **Wireframe Tekstual & Elemen Visual:**

```text
┌ Layers ───────────────── 🔍 filter ─┐
│ ▾ 📄 index.html                     │
│   ▸ <head>                          │
│   ▾ body                            │
│     ▾ header.site-header       👁 🔒 │
│        nav.nav                      │
│     ▾ main                          │
│       ▾ section.hero  "Hero"   👁 🔓 │  ← custom name (italic) + tag.class abu
│          h1.hero__title             │
│          p.hero__lead               │
│        ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │  ← drop line saat drag
│       ▸ section.features   (6)      │  ← jumlah anak saat collapsed
│     ⊘ div.modal  (hidden)      ◌ 🔓 │  ← hidden in design: redup
│     ⋯ #text "© 2026"                │  ← text node (opsional tampil)
└─────────────────────────────────────┘
```

  - Baris: ikon tipe (layout/text/media/form/component), label (`customName` › `#id` › `tag.class1.class2`), tombol 👁 (hide) dan 🔒 (lock) muncul saat hover atau aktif.
  - Badge: `⚡` elemen punya `<script>`/event inline, `◇` web component, `@` elemen di dalam shadow root (read-only).
  - Filter: cari berdasar tag, class, id, teks; mode "Show only matches with ancestors".

- **Interaksi Pengguna (Trigger & Action):**

| Trigger | Action |
|---|---|
| Klik baris | Pilih node → [[Modules/CANVAS_ENGINE/CANVAS-02_SELECTION_BOUNDS\|selection outline di kanvas]] + scroll kamera bila di luar viewport → aktifkan [[Modules/CSS_VISUAL_INSPECTOR/CSS-01_BOX_MODEL\|Inspector Box Model]] |
| `Shift+klik` / `Ctrl+klik` | Range select / toggle |
| Hover baris | Hover outline di kanvas |
| Drag baris | Reorder/reparent dengan validator content model (sama dengan CANVAS-03) |
| Double-click label / `F2` | Rename (layer name, sidecar) |
| Klik 👁 / `Ctrl+Shift+H` | Hide in design (tidak diekspor sebagai `display:none`) |
| Klik 🔒 / `Ctrl+Shift+L` | Lock: tidak bisa diseleksi/drag di kanvas; turunan ikut terkunci |
| `Ctrl+G` / `Ctrl+Shift+G` | Wrap dalam `<div>` / Unwrap (anak dinaikkan ke parent) |
| Context menu ▸ Change tag | `div` → `section`/`article`/… (atribut dipertahankan) |
| `←/→` | Collapse/expand; `↑/↓` navigasi; `Alt+klik ▸` expand rekursif |
| Klik toggle "Source Code" | Buka [[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS\|Monaco Live Editor]] pada node |

---

## 2. DOM Mutation & CSS Engine Logic

- **Virtual DOM / AST Handling:**
  - Tree dirender dari **AST snapshot** (Parse Worker), di-flatten menjadi array baris visible (`FlatRow[]`) setiap kali AST atau set expanded berubah — O(visible).
  - **Reorder/reparent:** command `node.move` yang sama dengan [[Modules/CANVAS_ENGINE/CANVAS-03_DRAG_DROP_REORDER|CANVAS-03]] → `TextEdit` hapus + sisip dengan re-indentasi.
  - **Rename:** command `meta.rename` menulis `designMeta[nodeKey].layerName` — **tidak ada TextEdit** HTML.
  - **Hide in design:** `designMeta.hiddenInDesign = true` → host mengirim `PatchOp` khusus design-time `{ op:'setAttr', name:'data-vds-hidden', value:'' }` hanya ke DOM iframe (bukan ke `Y.Text`); agent memiliki stylesheet internal `[data-vds-hidden]{display:none!important}`.
  - **Lock:** murni host-side; hit-test agent menerima daftar `lockedIds` untuk dilewati.
  - **Wrap:** `TextEdit` sisip `<div>` sebelum range pertama & `</div>` setelah range terakhir dari seleksi kontigu; anak di-re-indent +1 level. Unwrap: hapus start/end tag (pakai `startTagRange`/`endTagRange`), de-indent.
  - **Change tag:** ganti nama di `startTagRange` dan `endTagRange` sekaligus (2 edit, 1 transaksi). Selector CSS bertipe tag (`section > h2`) dicek ulang → warning bila match berubah.
- **Bi-directional Sync Rules:**
  - Mengetik kode yang menambah elemen → tree diperbarui setelah reparse; expanded state disimpan per `NodeKey` sehingga tidak "collapse semua".
  - Edit kode yang menghapus node berlabel → `designMeta` dipindah ke orphan bin; jika node kembali (undo/paste dengan key cocok) metadata dipulihkan.
- **Undo / Redo Stack:** move, wrap, unwrap, change tag, rename, lock, hide = command terpisah (masing-masing satu entri). Karena `designMeta` dilacak oleh `Y.UndoManager` yang sama, undo rename bekerja konsisten dengan undo HTML.

---

## 3. Data Schema & State Model

- **Local State Komponen:**

```typescript
interface LayersPanelState {
  expandedKeys: Set<string>;
  selectedKeys: string[];          // shared dengan SelectionState
  hoverKey: string | null;
  renamingKey: string | null;
  filter: { query: string; showTextNodes: boolean; showHead: boolean };
  drag: { sourceKeys: string[]; target: TreeDropTarget | null; valid: boolean; reason?: string } | null;
  scrollTop: number;
}

interface FlatRow {
  key: string;
  depth: number;
  label: string;                    // computed: layerName ?? #id ?? tag.classes
  tag: string;
  hasChildren: boolean;
  expanded: boolean;
  locked: boolean;                  // termasuk inherited
  hidden: boolean;
  readOnly: boolean;                // shadow DOM / file read-only
}

interface TreeDropTarget { parentKey: string; beforeKey: string | null; position: 'before' | 'after' | 'inside' }
```

- **Content-model validator (shared):**

```typescript
function canContain(parentTag: string, childTag: string, ctx: { parentAncestors: string[] }): { ok: true } | { ok: false; reason: string };
// Sumber aturan: HTML Living Standard "content model" + kategori (flow, phrasing, interactive)
```

- **Generated Output Contract (Pure HTML/CSS):**

Wrap `h1` + `p` (`Ctrl+G`):

```html
<section class="hero">
  <div>
    <h1 class="hero__title">Build faster</h1>
    <p class="hero__lead">Visual tools, real code.</p>
  </div>
</section>
```

Rename "Hero", lock, hide → **tidak ada perubahan HTML/CSS**. Output tetap:

```html
<section class="hero">…</section>
```

Change tag `div.card` → `article`:

```html
<article class="card">…</article>
```

---

## 4. Edge Cases, Performance & Sandboxing

- **Iframe Sandboxing & Security:** Panel Layers tidak membaca DOM iframe sama sekali (sumber = AST) → konten yang dibuat runtime oleh skrip pengguna tidak muncul sebagai node yang dapat diedit; node runtime ditampilkan terpisah (opsional) di bagian "Runtime DOM (read-only)" via snapshot agent.
- **Performance:**
  - Virtualisasi (`@tanstack/react-virtual`), tinggi baris 24px, overscan 10 → 10.000 node render ≤ 8 ms.
  - Diff AST → hanya baris terdampak di-re-render (memo per `key` + versi node).
  - Auto-expand saat drag-hover 600 ms; auto-scroll panel di tepi.
- **Conflict Handling:**
  - **Hidden vs CSS nyata:** jika elemen sudah `display:none` dari CSS (mis. modal), ikon menunjukkan "◌ hidden by CSS" (berbeda dari hide design-time); tombol 👁 menawarkan *Show temporarily (design only)* tanpa mengubah CSS.
  - **Unwrap elemen yang punya style** (class dengan padding/background): konfirmasi "Styling of .wrapper will be lost".
  - **Implied tags** (`<tbody>` otomatis, `</p>` opsional): node implisit ditandai `implied`; move node implisit pertama-tama mematerialisasi tag eksplisit di sumber.
  - **Rename duplikat:** diizinkan (nama hanya label), tidak memengaruhi `id`.
  - **Template/`<slot>`/shadow DOM:** read-only di tree kecuali sumbernya ada di file proyek ([[Modules/COMPONENT_LIBRARY/COMP-01_INSERTION_LOGIC|COMP-01 Web Components]]).
