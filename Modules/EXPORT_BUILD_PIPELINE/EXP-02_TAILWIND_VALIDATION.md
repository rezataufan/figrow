---
id: EXP-02
module: EXPORT_BUILD_PIPELINE
features: [F050, F053]
tags: [vds/spec, vds/export, vds/tailwind]
---

# EXP-02: Tailwind CSS v4 Bilingual Mode & Pre-Export Auditor

- **Navigasi Induk:** [[00_INDEX|Studio Workspace]] > [[Modules/EXPORT_BUILD_PIPELINE/_INDEX|Index Modul EXPORT_BUILD_PIPELINE]]
- **Target Engine:** CSS Parser (Utility ↔ Declaration Mapper) / Build Worker (Tailwind v4 JIT) / HTML AST
- **Status:** [ ] Planned | [ ] In Progress | [x] Completed
- **Relasi:** [[Modules/EXPORT_BUILD_PIPELINE/EXP-01_PROJECT_EXPORT|EXP-01 Project Export]] · [[Modules/CSS_VISUAL_INSPECTOR/CSS-01_BOX_MODEL|CSS-01 Box Model]] · [[Modules/CSS_VISUAL_INSPECTOR/CSS-04_CLASSES_STATES|CSS-04 Classes & States]]

---

## 1. UI Hierarchy & Interaksi Workspace
- **Posisi Komponen:** Right Inspector → **Selector Bar Mode Toggle** (`Plain CSS` ⇄ `Tailwind Utilities`) + Modal Export → tab **Pre-Export Auditor**.
- **Wireframe Tekstual & Elemen Visual:**
  ```text
  ┌ Selector Bar (Tailwind Mode Active) ────────────────────────┐
  │ Authoring: [ ⚡ Tailwind v4 ▾ ]  Breakpoint: [ md: ≥768px ▾ ]│
  │ Classes: [flex] [items-center] [gap-6] [p-6] [md:p-10]      │
  │          [bg-white] [hover:bg-slate-50] [rounded-xl]        │
  ├ Pre-Export Auditor (Score: 96 / 100) ───────────────────────┤
  │ [98] HTML5 Semantics   [94] Accessibility   [96] Performance│
  │ ⚠ img.hero__bg (index.html:18) — Missing fetchpriority="high"│
  │   for LCP element.                     [⚡ Apply Fix] [Locate]│
  │ ⚠ .btn--ghost (styles.css:54) — Contrast ratio 3.8:1 (<4.5) │
  │   against #F8FAFC.                     [⚡ Darken to #475569] │
  └─────────────────────────────────────────────────────────────┘
  ```
  - **Indikator Breakpoint Responsive:** Dalam mode Tailwind, memilih artboard Tablet (`768px`) atau Mobile (`375px`) otomatis mengatur prefix varian responsif (`md:`, `lg:`, atau `max-md:`) pada setiap input visual di Inspector.
- **Interaksi Pengguna (Trigger & Action):**
  - Klik elemen di Canvas -> Muncul selection blue outline -> Aktifkan `[[Modules/CSS_VISUAL_INSPECTOR/CSS-01_BOX_MODEL|Inspector Box Model]]` (membaca nilai dari class Tailwind maupun rule CSS)
  - Klik toggle "Source Code" -> Buka bottom panel `[[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS|Monaco Live Editor]]`
  - Ubah padding di `[[Modules/CSS_VISUAL_INSPECTOR/CSS-01_BOX_MODEL|Box Model]]` dari `24px` ke `32px` saat **Tailwind Mode** aktif -> Hapus class `p-6` dan ganti dengan `p-8` langsung pada atribut `class` elemen HTML.
  - Geser slider ke nilai non-skala (mis. `26px`) -> Hasilkan arbitrary value `p-[26px]` (atau tawarkan *Snap to scale `p-6` (24px)*).
  - Klik `Convert Rule ↔ Tailwind` pada menu class -> Ekstrak daftar utility menjadi komponen `@apply` di CSS, atau sebaliknya konversi deklarasi CSS menjadi utility classes di HTML.

---

## 2. DOM Mutation & CSS Engine Logic
- **Virtual DOM / AST Handling:**
  - **Bidirectional Utility Mapper:** Menyediakan tabel pemetaan deterministik antara `(CSSProperty, CSSValue, PseudoState, Breakpoint)` dan token skala Tailwind v4 (`@theme`):
    - `(padding, 1.5rem, null, base)` ⇄ `p-6`
    - `(background-color, #4f46e5, :hover, base)` ⇄ `hover:bg-indigo-600`
    - `(grid-template-columns, repeat(3, minmax(0, 1fr)), null, md)` ⇄ `md:grid-cols-3`
  - **Conflict Group Resolution (twMerge logic):** Saat pengguna mengubah `p-6` menjadi `px-8`, mapper memahami grup konflik box-model: `p-6` dipecah menjadi `py-6 px-8` pada atribut `class` di AST HTML sehingga padding vertikal tidak hilang.
  - **Live JIT di Sandbox:** Build Worker menjalankan compiler `@tailwindcss/browser` / v4 `compile()` secara inkremental setiap kali set kandidat class di `Y.Doc` bertambah, lalu mengirimkan CSS hasil kompilasi ke iframe melalui `PatchOp.replaceSheet`.
- **Bi-directional Sync Rules:**
  - Mengetik `class="mt-4 flex justify-between"` di `[[Modules/CODE_SYNC_ENGINE/SYNC-01_AST_TO_CANVAS|Monaco Live Editor]]` langsung mencerminkan `margin-top: 1rem`, `display: flex`, dan `justify-content: space-between` di kontrol visual `[[Modules/CSS_VISUAL_INSPECTOR/CSS-01_BOX_MODEL|CSS-01]]` dan `[[Modules/CSS_VISUAL_INSPECTOR/CSS-02_FLEXBOX_GRID|CSS-02]]`.
- **Undo / Redo Stack:**
  - Perubahan class utility saat scrubbing slider di-preview menggunakan inline transient style (60 FPS); hanya pada saat `pointerup` atribut `class` di `Y.Text` dimutasi sebagai satu entri undo.

---

## 3. Data Schema & State Model
- **Local State Komponen:**
  ```typescript
  interface FeatureState {
    selectedNodeId: string | null;
    computedStyles: Record<string, string>;
    isDragging: boolean;
    authoringMode: 'plain-css' | 'tailwind-v4';
    tailwindTheme: {
      spacingBasePx: number; // default 4px (1 = 0.25rem)
      screens: Record<string, string>; // sm: 640px, md: 768px, lg: 1024px, xl: 1280px
      colors: Record<string, string>;
    };
    auditReport: {
      scores: { semantics: number; a11y: number; performance: number; seo: number };
      findings: Array<{
        id: string;
        category: 'semantics' | 'a11y' | 'performance' | 'seo';
        severity: 'error' | 'warning';
        nodeKey: string;
        file: string;
        message: string;
        fixCommand?: { type: string; payload: unknown };
      }>;
    };
  }
  ```
- **Generated Output Contract (Pure HTML/CSS):**
  - Output HTML & CSS `@theme` Tailwind v4 bersih yang siap dipakai di produksi:
  ```html
  <article class="flex flex-col overflow-hidden rounded-xl bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
    <img class="aspect-video w-full object-cover" src="assets/img/cover.webp" alt="Product cover" width="640" height="360">
    <div class="grid gap-2 p-6 md:p-8">
      <h3 class="text-lg font-semibold text-slate-900">Analytics Suite</h3>
      <p class="text-sm leading-relaxed text-slate-600">Real-time insights with zero configuration.</p>
    </div>
  </article>
  ```
  ```css
  @import "tailwindcss";

  @theme {
    --font-sans: "Inter", system-ui, sans-serif;
    --color-brand-500: #6366f1;
    --color-brand-600: #4f46e5;
  }
  ```

---

## 4. Edge Cases, Performance & Sandboxing
- **Iframe Sandboxing & Security:**
  - Auditor kontras warna dan LCP bekerja dengan meminta data geometri dan warna terkomputasi (`getComputedStyle`) dari Runtime Agent di iframe via `MessagePort`, tanpa menyuntikkan library audit pihak ketiga ke dalam konteks eksekusi halaman pengguna.
- **Performance:**
  - Set kandidat class (`Set<string>`) di-cache secara global di Parse Worker. Jika perubahan class hanya menggunakan class yang sudah pernah dikompilasi sebelumnya (mis. `p-4` sudah ada di halaman), compiler Tailwind **tidak** dijalankan ulang — DOM iframe langsung diperbarui via `PatchOp.setAttr` dalam < 1 ms.
- **Conflict Handling:**
  - **Hybrid Plain CSS + Tailwind:** Jika sebuah elemen memiliki class komponen `.card` (di `styles.css`) sekaligus utility `p-8` (Tailwind), Cascade Resolver menampilkan keduanya secara berdampingan dan menempatkan CSS kustom di `@layer components` sehingga utility `p-8` di `@layer utilities` selalu menang tanpa memerlukan `!important`.
