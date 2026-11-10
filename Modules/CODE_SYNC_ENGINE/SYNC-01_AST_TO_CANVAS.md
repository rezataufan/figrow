---
id: SYNC-01
module: CODE_SYNC_ENGINE
features: [F042, F043, F044, F045, F046, F047]
tags: [vds/spec, vds/code-sync, vds/monaco]
---

# SYNC-01: AST ↔ Canvas Two-Way Sync (Monaco Live Editor)

- **Navigasi Induk:** [[00_INDEX|Studio Workspace]] > [[Modules/CODE_SYNC_ENGINE/_INDEX|Index Modul CODE_SYNC_ENGINE]]
- **Target Engine:** Code Editor (Monaco) / HTML & CSS Parser (Parse Worker) / Iframe DOM (PatchOp)
- **Status:** [ ] Planned | [ ] In Progress | [x] Completed
- **Relasi:** [[01_SYSTEM_ARCHITECTURE#7. Virtual DOM Sync Pipeline|Sync Pipeline]] · [[01_SYSTEM_ARCHITECTURE#5. HTML AST & Node Identity|Node Identity]] · [[01_SYSTEM_ARCHITECTURE#10. Hot-Reloading State|Hot Reload]] · [[Modules/CANVAS_ENGINE/CANVAS-02_SELECTION_BOUNDS|CANVAS-02]]

---

## 1. UI Hierarchy & Interaksi Workspace

- **Posisi Komponen:** Bottom Panel (default 35% tinggi, dapat di-dock ke kanan / pop-out window).
- **Wireframe Tekstual & Elemen Visual:**

```text
┌ Code ─ [index.html ●][css/styles.css][js/app.js] ── ⇄ Sync: Live ▾ ─ ✨ Format ─ ⤢ ┐
│ 12 │  <section class="hero">                                                     │
│ 13 │    <h1 class="hero__title">Build faster</h1>   ◀ highlight = seleksi kanvas  │
│ 14 │    <p class="hero__lead">Visual tools, real code.</p                         │
│    │                                              ~~~~ ⛔ expected '>'            │
│ 15 │  </section>                                                                 │
├────┴──────────────────────────────────────────────────────────────────────────────┤
│ Problems (1) │ Console │ History                                                  │
│ ⛔ index.html:14:52  Unclosed start tag <p>. Canvas shows last valid version.  [Fix]│
└───────────────────────────────────────────────────────────────────────────────────┘
```

  - **Tabs file** dengan dot ● untuk perubahan belum tersimpan ke disk.
  - **Sync mode:** `Live` (default, debounce 150 ms) · `On save` · `Paused`.
  - **Banner status:** hijau "In sync" / kuning "Canvas showing last valid version" / merah "Parse error".
  - **Gutter markers:** titik biru untuk baris yang sesuai node terseleksi; warna untuk rule yang match elemen terseleksi (CSS file).

- **Interaksi Pengguna (Trigger & Action):**

| Trigger | Action |
|---|---|
| Klik elemen di Canvas | Monaco membuka file & reveal start tag; rule CSS terkait di-highlight di tab CSS |
| Gerakkan kursor di Monaco | Kanvas memilih node terdalam yang memuat kursor (debounce 100 ms) → [[Modules/CANVAS_ENGINE/CANVAS-02_SELECTION_BOUNDS\|selection outline]] → [[Modules/CSS_VISUAL_INSPECTOR/CSS-01_BOX_MODEL\|Inspector Box Model]] |
| Kursor di dalam rule CSS | Kanvas menyorot semua elemen yang match selector |
| Ketik kode | Reparse inkremental → PatchOp → kanvas update tanpa reload |
| `Shift+Alt+F` | Prettier format dokumen/seleksi (worker) |
| Klik `[Fix]` di Problems | Quick-fix (tutup tag, tambah `;`, hapus atribut duplikat) |
| `Ctrl+S` | Flush ke disk/OPFS (autosave tetap berjalan) |
| Klik toggle "Source Code" (Toolbar) | Show/hide panel ini |

---

## 2. DOM Mutation & CSS Engine Logic

- **Virtual DOM / AST Handling:**

  **A. Code → Visual (F044)**
  1. `y-monaco` binding menerapkan ketikan ke `Y.Text`.
  2. `Y.Text.observe` → kumpulkan delta → debounce 150 ms (atau segera bila delta hanya di dalam satu nilai atribut/teks).
  3. Parse Worker:
     - **HTML:** reparse penuh parse5 untuk file ≤ 200 KB (≈ 8 ms); file lebih besar → reparse hanya *subtree terkecil yang membungkus delta* bila delta tidak menyeberangi batas tag (cek dengan range start/end tag), lalu splice ke tree.
     - **CSS:** reparse hanya rule/at-rule yang memuat delta (PostCSS per-rule), rebuild RuleIndex entry terkait.
  4. **Keyed diff** AST lama vs baru → rekonsiliasi `NodeId` ([[01_SYSTEM_ARCHITECTURE#5. HTML AST & Node Identity|algoritma]]) → hasilkan `PatchOp[]` minimal.
  5. Host mengirim patch ke semua artboard file tsb; agent menerapkan; seleksi dipetakan via NodeKey.

  **B. Visual → Code (F043) — Range-Splice Printer**
  - Command menghasilkan `TextEdit[]` berbasis `range` AST (bukan serialize ulang). Aturan printer:
    - Atribut baru: disisip sebelum `>` start tag dengan 1 spasi; jika start tag multi-baris, ikut indentasi atribut terakhir.
    - Elemen baru: indentasi = indentasi sibling; jika parent inline satu baris (`<p>Hi <b>x</b></p>`) → sisip inline tanpa newline.
    - Deklarasi CSS baru: meniru `raws.before` & `raws.between` deklarasi sebelumnya; rule baru meniru gaya rule tetangga (brace on same line, 2/4 spasi/tab).
    - Quote style atribut mengikuti mayoritas file (`"` default).
  - Setelah edit diterapkan, parser **tidak** perlu menebak: edit visual sudah tahu node mana yang berubah → patch langsung dikirim (fast-path), reparse dilakukan di belakang untuk verifikasi (dev assert: AST hasil == AST prediksi).

- **Bi-directional Sync Rules:**

| Situasi | Aturan |
|---|---|
| User mengetik di Monaco & menggeser slider bersamaan (dua view, satu user) | Keduanya menulis ke `Y.Text`; CRDT menjamin konvergen. Slider transient tidak menulis sampai commit. |
| Teks sedang tidak valid (tag belum ditutup) | Kanvas memakai **last-good AST**; Inspector & Layers read-only untuk node di area error (banner kuning); edit visual pada node lain tetap diizinkan karena range-splice tidak bergantung pada region rusak |
| Edit visual saat dokumen error | Diizinkan jika target node berada di luar *error region* (range dari diagnostic); jika di dalam → diblokir dengan tooltip |
| Sync mode Paused | Edit kode tidak diparse sampai Resume; edit visual dinonaktifkan untuk file tsb (menghindari dua kebenaran) |
| Edit `<script>` | Tidak ada patch DOM; mode Preview → reload penuh dengan state restore ([[01_SYSTEM_ARCHITECTURE#10. Hot-Reloading State\|Hot Reload]]) |
| File eksternal berubah di disk | Diff 3-arah → transaksi origin `external`; Monaco menampilkan dekorasi "changed on disk" |

- **Undo / Redo Stack:** Monaco undo bawaan **dinonaktifkan**; `Ctrl+Z` di editor diteruskan ke `Y.UndoManager` global sehingga satu riwayat mencakup ketikan & edit visual. Ketikan digabung per 400 ms / per kata (captureTimeout) — sama seperti UX editor biasa. Format Prettier = satu entri "Format document".

---

## 3. Data Schema & State Model

- **Local State Komponen:**

```typescript
interface CodeSyncState {
  selectedNodeId: string | null;
  computedStyles: Record<string, string>;   // tidak dipakai editor, dipertahankan untuk kontrak umum
  isDragging: boolean;                      // true → tunda reveal/scroll otomatis editor
  openFiles: string[];
  activeFile: string;
  syncMode: 'live' | 'onSave' | 'paused';
  status: 'inSync' | 'parsing' | 'lastGood' | 'error';
  diagnostics: Diagnostic[];
  lastGoodVersion: Record<string, number>;  // file -> Y.Text version (state vector hash)
  cursorNodeKey: string | null;
}

interface Diagnostic {
  file: string;
  range: [number, number];
  severity: 'error' | 'warning' | 'info';
  code: string;                             // parse5 error code, e.g. "missing-end-tag-name", or "css-unclosed-block"
  message: string;
  quickFix?: { title: string; edits: TextEdit[] };
}

interface ParseResult {
  file: string;
  version: number;
  ast: VNodeSnapshot | CssRuleIndexSnapshot;
  fatal: boolean;                           // true → jangan terapkan
  patches: PatchOp[];
  idMap: Record<string, string>;            // oldId -> newId (setelah rekonsiliasi)
}
```

- **Generated Output Contract (Pure HTML/CSS):**

Contoh minimal-diff. User mengubah `padding` via Inspector pada file yang ditulis dengan gaya kustom (tab, tanpa spasi setelah `:`):

```css
/* sebelum (format asli user) */
.hero{
	padding:96px 64px;
	color:#0f172a;
}
/* sesudah — hanya "96px 64px" → "80px 48px" berubah, gaya tab & tanpa spasi utuh */
.hero{
	padding:80px 48px;
	color:#0f172a;
}
```

Diff unified yang dihasilkan (yang terlihat di History panel):

```diff
 .hero{
-	padding:96px 64px;
+	padding:80px 48px;
 	color:#0f172a;
 }
```

Setelah `Format Document` (Prettier, opt-in):

```css
.hero {
  padding: 80px 48px;
  color: #0f172a;
}
```

---

## 4. Edge Cases, Performance & Sandboxing

- **Iframe Sandboxing & Security:** Teks kode tidak pernah dieksekusi di host. Preview serializer menyisipkan `data-vds-id` dan CSP nonce hanya di salinan yang dikirim ke iframe. Monaco worker (language services) berjalan di Web Worker host tanpa akses ke iframe.
- **Performance:**
  - Debounce 150 ms (adaptive: 50 ms untuk file < 20 KB, 300 ms untuk > 500 KB).
  - Parse Worker membatalkan job usang (versi lebih lama) — hanya versi terbaru yang menghasilkan patch.
  - Diff AST O(n) dengan short-circuit pada subtree yang range & hash kontennya tidak berubah.
  - Patch > 500 op atau perubahan `<head>` → fallback `replaceDocument` terkontrol (masih menjaga scroll & seleksi).
  - Prettier dijalankan di worker terpisah; hasil diterapkan sebagai diff minimal (`diff-match-patch`) agar kursor & riwayat CRDT tetap stabil.
- **Conflict Handling:**
  - **Inline style ditulis manual vs class dari Inspector:** keduanya sah; cascade resolver ([[Modules/CSS_VISUAL_INSPECTOR/CSS-04_CLASSES_STATES|CSS-04]]) menampilkan siapa yang menang. Tidak ada auto-migrasi tanpa persetujuan user.
  - **Atribut duplikat** (`class="a" class="b"`): parse5 mempertahankan yang pertama; diagnostic warning + quick-fix merge.
  - **Kode yang tidak dapat dipetakan** (template syntax `{{ }}`, PHP `<?php ?>`): ditandai *opaque region*; dirender apa adanya, node di dalamnya read-only di kanvas.
  - **Rekonsiliasi gagal (skor rendah):** seleksi jatuh ke parent; designMeta node lama masuk orphan bin; user dapat "Reattach layer name" dari Layers.
  - **Kolaborasi (fase lanjut):** edit remote masuk dengan origin remote, tidak memengaruhi undo stack lokal; kursor remote ditampilkan di Monaco & sebagai outline berwarna di kanvas.
