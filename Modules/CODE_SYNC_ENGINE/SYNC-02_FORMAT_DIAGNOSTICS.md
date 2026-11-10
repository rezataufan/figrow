---
id: SYNC-02
module: CODE_SYNC_ENGINE
features: [F046, F047]
tags: [vds/spec, vds/code-sync, vds/diagnostics]
---

# SYNC-02: Formatter (Prettier), Diagnostics & Conflict Recovery

- **Navigasi Induk:** [[00_INDEX|Studio Workspace]] > [[Modules/CODE_SYNC_ENGINE/_INDEX|Index Modul CODE_SYNC_ENGINE]]
- **Target Engine:** Format Worker (Prettier + diff-match-patch) / Parse Worker (Validators) / Code Editor (Monaco Markers)
- **Status:** [ ] Planned | [ ] In Progress | [x] Completed
- **Relasi:** [[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS|SYNC-01 AST ↔ Canvas]] · [[01_SYSTEM_ARCHITECTURE#8. Undo Redo CRDT Command Layer|Undo/Redo CRDT]] · [[Modules/EXPORT_BUILD_PIPELINE/EXP-01_PROJECT_EXPORT|EXP-01 Pre-export Validation]]

---

## 1. UI Hierarchy & Interaksi Workspace
- **Posisi Komponen:** Bottom Panel → tab **Problems** & **History Diff** (di sebelah Monaco Live Editor), serta Status Bar di bagian paling bawah studio.
- **Wireframe Tekstual & Elemen Visual:**
  ```text
  ┌ Problems (3) │ Console │ History Diff ────── Filter: [All][Error][Warn][A11y] ┐
  │ ⛔ index.html:42:18   Unclosed tag <div class="card">       [⚡ Close </div>] │
  │ ⚠  styles.css:88:5    Unknown property 'padding-horz'       [⚡ Change to padding-inline]│
  │ ♿ index.html:19:5    <button> has no accessible text       [⚡ Add aria-label]│
  ├───────────────────────────────────────────────────────────────────────────────┤
  │ Status Bar:  🟢 AST Synced (4.2ms) │ Prettier: 2 spaces │ UTF-8 │ HTML5       │
  └───────────────────────────────────────────────────────────────────────────────┘
  ```
  - **Indikator Breakpoint Responsive:** Jika diagnostic CSS terjadi di dalam blok `@media (max-width: 767.98px)`, baris masalah menampilkan pill `@Mobile` yang jika diklik langsung mengaktifkan artboard Mobile dan memindahkan kursor Monaco ke baris tersebut.
- **Interaksi Pengguna (Trigger & Action):**
  - Klik elemen di Canvas -> Muncul selection blue outline -> Aktifkan `[[Modules/CSS_VISUAL_INSPECTOR/CSS-01_BOX_MODEL|Inspector Box Model]]` dan filter tab Problems untuk menampilkan peringatan elemen terpilih
  - Klik toggle "Source Code" -> Buka bottom panel `[[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS|Monaco Live Editor]]`
  - Tekan `Shift+Alt+F` atau klik `✨ Format` -> Jalankan Prettier di Format Worker -> Terapkan minimal whitespace diff ke `Y.Text` tanpa mereset posisi kursor atau seleksi kanvas.
  - Klik tombol `[⚡ Quick Fix]` pada baris masalah -> Terapkan `TextEdit[]` perbaikan secara langsung melalui Command Bus.
  - Jika berkas diubah di luar aplikasi (mis. lewat VS Code / Git pull saat mode desktop Tauri) -> Muncul banner **External Change Detected** dengan opsi *Auto-merged* atau *Resolve Conflict (3-Way Diff)*.

---

## 2. DOM Mutation & CSS Engine Logic
- **Virtual DOM / AST Handling:**
  - **Minimal-Granularity Prettier Formatting:** Prettier menghasilkan string utuh yang telah diformat (`formattedText`). Alih-alih melakukan `ytext.delete(0, len); ytext.insert(0, formattedText)` yang akan menghancurkan seluruh *relative cursor positions* Yjs dan memicu rebuild DOM penuh, Format Worker menjalankan algoritma Myers diff (`fast-diff`) antara `oldText` dan `formattedText` lalu hanya mengirim potongan whitespace/newline yang berubah sebagai `TextEdit[]` dalam satu transaksi `ydoc.transact()`.
  - **Karena perubahan murni bersifat kosmetik (whitespace di luar teks konten):** Hasil reparse menghasilkan AST yang secara semantik identik → `PatchOp[]` kosong (0 mutasi DOM ke iframe), hanya offset `range` pada VNode dan RuleIndex yang diperbarui!
  - **Fault-Tolerant Error Fence:** Ketika pengguna mengetik sintaks yang belum selesai di Monaco (mis. `.card { padding: ` tanpa titik koma atau `}`), PostCSS/parse5 menandai rentang blok tersebut sebagai `errorRegion: [start, end]`. Parse Worker menyisipkan node lama dari `lastGoodAst` khusus untuk rentang tersebut agar kanvas tidak berkedip atau kehilangan style pada elemen lain.
- **Bi-directional Sync Rules:**
  - Saat berkas berada dalam state `lastGood` (ada syntax error di baris 42), edit visual di Canvas/Inspector pada elemen yang berada di baris 10 (sebelum `errorRegion`) **tetap diizinkan** karena offset di atas baris 42 masih akurat. Edit visual pada elemen di bawah baris 42 ditahan sementara dengan tooltip *"Fix syntax error on line 42 to edit this element visually"*.
- **Undo / Redo Stack:**
  - Operasi `editor.format` dan `diagnostic.quickFix` tercatat sebagai satu langkah atomik di `Y.UndoManager`. Perubahan dari watcher filesystem eksternal dicatat dengan `origin = 'external-fs'` sehingga tidak menghapus atau mencemari undo stack pengguna lokal.

---

## 3. Data Schema & State Model
- **Local State Komponen:**
  ```typescript
  interface FeatureState {
    selectedNodeId: string | null;
    computedStyles: Record<string, string>;
    isDragging: boolean;
    prettierConfig: {
      printWidth: number;
      tabWidth: number;
      useTabs: boolean;
      singleQuote: boolean;
      htmlWhitespaceSensitivity: 'css' | 'strict' | 'ignore';
    };
    formatOnSave: boolean;
    diagnostics: Array<{
      id: string;
      file: string;
      range: [number, number];
      line: number;
      column: number;
      severity: 'error' | 'warning' | 'info';
      source: 'html-parser' | 'css-parser' | 'content-model' | 'a11y' | 'asset';
      message: string;
      nodeKey?: string;
      quickFixes: Array<{ label: string; edits: Array<{ range: [number, number]; insert: string }> }>;
    }>;
    externalConflict: {
      file: string;
      baseText: string;
      localText: string;
      diskText: string;
    } | null;
  }
  ```
- **Generated Output Contract (Pure HTML/CSS):**
  - Contoh hasil eksekusi Quick-Fix + Prettier pada kode yang tadinya berantakan dan memiliki tag tidak tertutup:
  ```html
  <!-- Sebelum -->
  <section class="hero"><div class="hero__inner"><h1>Fast web studio</h1><p>Real HTML & CSS.</div></section>

  <!-- Sesudah Quick-Fix (tutup </p>) + Shift+Alt+F (Prettier htmlWhitespaceSensitivity: 'css') -->
  <section class="hero">
    <div class="hero__inner">
      <h1>Fast web studio</h1>
      <p>Real HTML &amp; CSS.</p>
    </div>
  </section>
  ```

---

## 4. Edge Cases, Performance & Sandboxing
- **Iframe Sandboxing & Security:**
  - Seluruh proses linting, formatting (Prettier), dan diffing berjalan di dalam Web Worker terisolasi tanpa akses jaringan maupun DOM.
  - Rule diagnostik keamanan memeriksa penggunaan `<a target="_blank">` tanpa `rel="noopener"`, skrip inline tanpa SRI hash, dan URL `http://` tidak terenkripsi.
- **Performance:**
  - **Inline Whitespace Sensitivity:** Prettier secara default menggunakan `htmlWhitespaceSensitivity: "css"` agar elemen inline seperti `<span>Hello</span> <strong>world</strong>` tidak dipaksa turun baris jika itu akan menambah atau menghilangkan spasi visual di browser.
  - Kalkulasi diff Prettier pada berkas 5.000 baris selesai dalam < 25 ms di Format Worker tanpa memblokir animasi 60 FPS di main thread.
- **Conflict Handling:**
  - **3-Way Merge untuk Edit Disk Eksternal:** Jika pengguna mengedit `styles.css` di Inspector pada saat yang sama ketika tool eksternal (mis. Git atau editor lain) memodifikasi berkas di disk, sistem menjalankan `node-diff3` terhadap `lastSyncedDiskText` (base):
    - Jika perubahan tidak tumpang tindih (clean merge) → diterapkan otomatis ke `Y.Text`.
    - Jika tumpang tindih pada baris yang sama → buka tampilan **Monaco Diff Editor** berdampingan (*Accept Local Visual Changes* vs *Accept Disk Changes* vs *Merge Manually*).
