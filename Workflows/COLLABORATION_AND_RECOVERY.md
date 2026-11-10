---
id: WF-02
type: workflow
tags: [vds/workflow, vds/state-machine]
---

# Workflow: Real-Time Collaboration, Conflict Resolution & Crash Recovery

- **Navigasi Induk:** [[00_INDEX|Studio Workspace]] > [[01_SYSTEM_ARCHITECTURE|System Architecture]] · [[Workflows/DESIGN_TO_CODE_LIFECYCLE|Design → Code Lifecycle]]
- **Tujuan:** Mendefinisikan alur state machine saat terjadi pengeditan serentak (Visual vs Code, Multi-User CRDT, External File Watcher) serta pemulihan otomatis dari crash atau syntax error.

---

## 1. State Machine Sinkronisasi Dokumen

```mermaid
stateDiagram-v2
  [*] --> InSync : Load Project (OPFS / Disk)
  InSync --> TransientScrub : pointerdown (Canvas / Inspector)
  TransientScrub --> Committing : pointerup (Compile Command)
  TransientScrub --> InSync : Esc (Cancel Gesture)
  Committing --> InSync : Parse Worker ACK + PatchOp Applied
  InSync --> CodeTyping : Monaco Keystroke (Y.Text Delta)
  CodeTyping --> InSync : Valid AST (< 150ms debounce)
  CodeTyping --> DegradedLastGood : Syntax Error Detected
  DegradedLastGood --> InSync : User / Quick-Fix Resolves Syntax
  InSync --> ExternalMerge : Disk Watcher Event (Tauri / FS API)
  ExternalMerge --> InSync : Clean 3-Way Merge
  ExternalMerge --> ConflictModal : Overlapping Line Edits
  ConflictModal --> InSync : User Selects Winner
```

---

## 2. Skenario Operasional Kritis

### A. Skenario 1 — Visual Scrubbing vs Live Code View
1. Pengguna men-drag handle resize di `[[Modules/CANVAS_ENGINE/CANVAS-02_SELECTION_BOUNDS|CANVAS-02]]` atau menggeser slider di `[[Modules/CSS_VISUAL_INSPECTOR/CSS-01_BOX_MODEL|CSS-01]]`.
2. Selama `TransientScrub`, pesan `HostMsg.transient` dikirim ke iframe setiap frame (60 FPS). `Y.Text` dan `[[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS|Monaco Live Editor]]` **tidak** disentuh.
3. Pada `pointerup` (`Committing`), satu `Command` dikompilasi menjadi `TextEdit` presisi pada rentang nilai CSS.
4. `Y.Doc` memancarkan delta → Monaco memperbarui hanya angka yang berubah → Parse Worker memvalidasi AST baru → Iframe membersihkan layer transien dan menerapkan `PatchOp.setDecl`.

### B. Skenario 2 — Syntax Error Recovery (`DegradedLastGood`)
1. Pengguna mengetik kode HTML/CSS di `[[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS|SYNC-01]]` dan meninggalkan tag `<div class="hero"` belum tertutup.
2. Parse Worker mendeteksi error fatal pada rentang baris tersebut dan mempertahankan **Last-Good AST** untuk subtree yang rusak.
3. Kanvas tetap menampilkan visual terakhir yang valid (tidak layar putih/rusak), sementara `[[Modules/CODE_SYNC_ENGINE/SYNC-02_FORMAT_DIAGNOSTICS|SYNC-02 Diagnostics]]` menampilkan garis merah dan tombol `[⚡ Close >]`.
4. Begitu karakter `>` diketik atau tombol Quick-Fix diklik, state kembali ke `InSync` dan antrean mutasi diterapkan.

### C. Skenario 3 — Crash Recovery & Offline Persistence
1. Setiap transaksi `Y.Doc` langsung di-stream secara asinkron ke `IndexedDB` (`y-indexeddb`) dalam < 5 ms, dan di-flush sebagai berkas `.html`/`.css` murni ke **OPFS** setiap debounce 1 detik.
2. Jika tab browser tertutup paksa atau terjadi crash, saat aplikasi dibuka kembali (`[[01_SYSTEM_ARCHITECTURE#11. Project Storage & Autosave|Project Storage]]`), state `Y.Doc` direkonstruksi penuh beserta riwayat `Y.UndoManager` sehingga pengguna tetap dapat menekan `Ctrl+Z` untuk membatalkan aksi sebelum crash.
