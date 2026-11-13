# Figrow GitHub Launch & Contributor Kit

Everything needed to publish `rezataufan/figrow` on GitHub and welcome the first wave of open-source contributors. Copy-paste ready for the GitHub API, Releases, and Issues.

---

## 1. Repository "About" Description

- **Character count:** 236 / 350 max

```text
Open-source, local-first Visual DOM & CSS Studio: Figma-style multi-artboard infinite canvas + lossless HTML5 (parse5) & CSS (PostCSS) round-trip AST engine with Yjs CRDT undo & WebMCP AI bridge. Contributors welcome!
```

---

## 2. GitHub Topics (20 / 20 Max)

Ready for `PUT /repos/rezataufan/figrow/topics`:

```json
{
  "names": [
    "visual-builder",
    "html-editor",
    "css-studio",
    "web-design",
    "design-tools",
    "figma-to-code",
    "grapesjs-alternative",
    "pinegrow",
    "infinite-canvas",
    "ast",
    "parse5",
    "postcss",
    "tailwindcss",
    "yjs",
    "crdt",
    "local-first",
    "webmcp",
    "react",
    "typescript",
    "open-source"
  ]
}
```

---

## 3. Release Notes (`v1.0.0`)

### English (Primary Release Body)

```markdown
Figrow v1.0.0 is out.

Most visual web builders force a bad trade-off. Canvas tools like Figma give you infinite artboards and direct manipulation, but they don't edit real HTML and CSS. Traditional page builders output DOM, but they lock you into a single viewport and rewrite your hand-formatted code on export.

Figrow takes a different approach. It pairs a Figma-style multi-artboard infinite canvas with a lossless HTML5 (`parse5`) and CSS (`postcss`) AST engine backed by Yjs CRDT (`Y.Text`). When you drag a padding handle or change a rule in the inspector, Figrow patches only the exact byte range in your source file. Your comments, scripts, and formatting stay intact.

### What's in v1.0.0

- **Multi-Artboard Infinite Canvas:** Inspect and edit Desktop (`1440px`), Tablet (`768px`), and Mobile (`375px`) sandboxed artboards side by side with focal-point zoom (`0.1x` to `8.0x`), smart guides, and offscreen lifecycle freezing.
- **Lossless Source-Range AST Engine:** Byte-range splicing over `Y.Text` buffers with `IndexedDB` persistence and full undo/redo history.
- **W3C L4 CSS Cascade Inspector:** Specificity calculation via `@bramus/specificity` and `postcss-selector-parser`, state pills (`default`, `:hover`, `:focus`, `:active`, `:disabled`), media breakpoint routing, Box Model, Flexbox/Grid, Typography, Filters, and CSS Variables.
- **On-Canvas Direct Manipulation:** Drag-to-reorder Flex/Grid children, drag handles for padding and gap, plus inline rich-text editing.
- **Universal Reusable Symbols:** Sync master components (`data-vds-symbol="<id>"`) across every HTML page in your workspace.
- **Local-First Disk Sync:** Open and auto-save local project folders directly through the Chromium File System Access API.
- **Monaco Code Panel & WebMCP AI Bridge:** Built-in VS Code Monaco editor (`Ctrl+J`), `Ctrl+K` Command Palette, and `navigator.modelContext` / `window.figrowCommands` hooks for AI agents.

### Help Build v1.1

We're actively looking for contributors who enjoy AST tooling, browser layout engines, CSS specs, or canvas UX. Check out the open `good first issue` and `help wanted` tickets in Issues, or read `CONTRIBUTING.md` to get a local dev server running in two minutes.
```

### Bahasa Indonesia

```markdown
Figrow v1.0.0 resmi dirilis.

Selama ini, alat desain web visual sering memaksa kita memilih salah satu: alat kanvas seperti Figma nyaman dipakai dengan multi-artboard, tetapi tidak mengedit HTML dan CSS asli. Sebaliknya, page builder tradisional menghasilkan DOM, tetapi mengunci Anda di satu viewport dan menimpa kerapian kode sumber saat ekspor.

Figrow mengambil jalan berbeda. Kami menggabungkan kanvas tak terbatas multi-artboard ala Figma dengan mesin AST HTML5 (`parse5`) dan CSS (`postcss`) di atas Yjs CRDT (`Y.Text`). Saat Anda menggeser handle padding atau mengubah properti di inspector, Figrow hanya menambal rentang byte yang berubah. Komentar, script, dan format kode asli Anda tetap utuh.

### Fitur Utama v1.0.0

- **Kanvas Multi-Artboard:** Edit tampilan Desktop (`1440px`), Tablet (`768px`), dan Mobile (`375px`) secara bersamaan dengan zoom (`0.1x` hingga `8.0x`), smart guide, dan offscreen freezing.
- **Mesin AST Tanpa Merusak Kode:** Penambalan byte-range langsung pada buffer `Y.Text` dengan penyimpanan `IndexedDB` dan riwayat undo/redo penuh.
- **Inspector Cascade CSS W3C L4:** Perhitungan spesifisitas akurat dengan `@bramus/specificity` dan `postcss-selector-parser`, state (`default`, `:hover`, `:focus`, `:active`, `:disabled`), routing media query, Box Model, Flexbox/Grid, Tipografi, Filter, dan CSS Variables.
- **Manipulasi Langsung di Kanvas:** Geser urutan elemen Flex/Grid, tarik handle padding dan gap langsung di layar, serta edit teks kaya secara inline.
- **Simbol Komponen Universal:** Sinkronkan komponen induk (`data-vds-symbol="<id>"`) ke seluruh halaman HTML dalam satu proyek.
- **Sinkronisasi Disk Lokal:** Buka dan simpan folder proyek langsung dari komputer lewat Chromium File System Access API.
- **Panel Kode Monaco & WebMCP AI Bridge:** Editor Monaco bawaan (`Ctrl+J`), Command Palette (`Ctrl+K`), dan integrasi `navigator.modelContext` / `window.figrowCommands` untuk agen AI.

### Mari Ikut Bangun v1.1

Kami membuka pintu selebar-lebarnya bagi kontributor yang tertarik pada AST, engine layout browser, spesifikasi CSS, atau UX kanvas. Silakan cek label `good first issue` dan `help wanted` di tab Issues, lalu ikuti panduan singkat di `CONTRIBUTING.md`.
```

---

## 4. Starter Contributor Issues (3 Issues — EN & ID)

### Issue 1

- **Title:** `[Good First Issue] Expand Tailwind v4 CSS-to-Utility Mapper for CSS Filters, Backdrop Blur & Grid Spans`
- **Labels:** `["good first issue", "help wanted", "enhancement"]`

#### English Body

```markdown
### Context

`mapDeclarationToUtilities()` in `src/engine/export/tailwindMapper.ts` converts standard CSS declarations (`width`, `padding`, `display`, `flex`, `gap`, `color`, `border-radius`) into clean Tailwind v4 utility classes before falling back to arbitrary `[prop:val]` syntax.

Right now, several common layout and visual effect properties still fall back to arbitrary brackets when exported.

### What to Build

Add deterministic Tailwind v4 utility mappings in `src/engine/export/tailwindMapper.ts` for:
1. **`filter`**: common values such as `blur(...)`, `brightness(...)`, and `grayscale(...)` (e.g., `blur-sm`, `blur-md`, `brightness-90`, `grayscale`).
2. **`backdrop-filter`**: `blur(...)` values mapped to `backdrop-blur-sm`, `backdrop-blur-md`, `backdrop-blur-lg`, etc.
3. **`grid-column` / `grid-row`**: `span N / span N` (or `span N`) mapped to `col-span-*` and `row-span-*`.

### Acceptance Criteria

- [ ] New mappings live inside `mapDeclarationToUtilities` in `src/engine/export/tailwindMapper.ts`.
- [ ] Unrecognized or complex values still fall back cleanly without breaking existing exports.
- [ ] Add unit tests covering the new mappings in `src/engine/__tests__/engine.test.ts` (or a dedicated test block in `src/engine/__tests__/`).
- [ ] `npm test -- --run` and `npm run build` pass.

### Getting Started

Comment below if you'd like to pick this up! Check `CONTRIBUTING.md` for local setup.
```

#### Indonesian Body (Bahasa Indonesia)

```markdown
### Konteks

Fungsi `mapDeclarationToUtilities()` di `src/engine/export/tailwindMapper.ts` bertugas mengubah deklarasi CSS (`width`, `padding`, `display`, `flex`, `gap`, `color`, `border-radius`) menjadi class utilitas Tailwind v4 sebelum jatuh ke sintaks arbitrary `[prop:val]`.

Saat ini, beberapa properti visual dan layout yang sering dipakai masih jatuh ke format arbitrary saat diekspor.

### Target Pengerjaan

Tambahkan pemetaan utilitas Tailwind v4 yang deterministik di `src/engine/export/tailwindMapper.ts` untuk:
1. **`filter`**: nilai umum seperti `blur(...)`, `brightness(...)`, dan `grayscale(...)` (misal `blur-sm`, `blur-md`, `brightness-90`, `grayscale`).
2. **`backdrop-filter`**: nilai `blur(...)` dipetakan ke `backdrop-blur-sm`, `backdrop-blur-md`, `backdrop-blur-lg`, dan seterusnya.
3. **`grid-column` / `grid-row`**: pola `span N / span N` (atau `span N`) dipetakan ke `col-span-*` dan `row-span-*`.

### Kriteria Selesai

- [ ] Pemetaan baru ditambahkan di `mapDeclarationToUtilities` pada `src/engine/export/tailwindMapper.ts`.
- [ ] Nilai kompleks yang belum dikenali tetap aman menggunakan fallback tanpa merusak hasil ekspor lain.
- [ ] Tambahkan unit test di `src/engine/__tests__/` untuk menguji setiap kasus baru.
- [ ] `npm test -- --run` dan `npm run build` berjalan sukses tanpa error.

Silakan tulis komentar di bawah jika ingin mengambil issue ini!
```

---

### Issue 2

- **Title:** `[Good First Issue] Add Semantic HTML5 Interactive Primitives (<details>, <figure>, <blockquote>) to Component Catalog`
- **Labels:** `["good first issue", "help wanted", "components"]`

#### English Body

```markdown
### Context

`COMPONENT_CATALOG` in `src/engine/components/componentCatalog.ts` defines the drag-and-drop and click-to-insert primitives available in Figrow's Component Library. Every insertion is validated against HTML5 nesting rules by `canContain()` in `src/engine/ast/contentModel.ts`.

Adding more semantic HTML5 elements makes it easier for authors to build accessible pages without writing boilerplate by hand.

### What to Build

Add three semantic primitives to `COMPONENT_CATALOG` in `src/engine/components/componentCatalog.ts`:
1. **`prim.details`**: `<details><summary>...</summary><p>...</p></details>`
2. **`prim.figure`**: `<figure><img ... /><figcaption>...</figcaption></figure>`
3. **`prim.blockquote`**: `<blockquote><p>...</p><cite>...</cite></blockquote>`

Include clean default `.vds-*` CSS rules for each primitive, and verify `canContain()` in `src/engine/ast/contentModel.ts` handles their parent/child relationships properly.

### Acceptance Criteria

- [ ] All three primitives appear in `COMPONENT_CATALOG` with clear labels, HTML snippets, and default `.vds-*` styles.
- [ ] `contentModel.ts` allows valid children (`summary`, `figcaption`, `cite`) inside their parent elements.
- [ ] Add insertion and content-model tests in `src/engine/__tests__/engine.test.ts` (or `grapesUpgrades.test.ts`).
- [ ] `npm test -- --run` and `npm run build` pass.

Want to take this on? Drop a quick comment so we can assign it to you.
```

#### Indonesian Body (Bahasa Indonesia)

```markdown
### Konteks

`COMPONENT_CATALOG` di `src/engine/components/componentCatalog.ts` berisi daftar komponen primitif siap pakai yang bisa di-drag atau diklik ke kanvas. Setiap penyisipan elemen divalidasi oleh `canContain()` di `src/engine/ast/contentModel.ts` agar sesuai aturan nesting HTML5.

Menambahkan elemen HTML5 semantik akan membantu pengguna membangun halaman yang aksesibel tanpa mengetik kerangka HTML berulang kali.

### Target Pengerjaan

Tambahkan tiga primitif semantik ke `COMPONENT_CATALOG` di `src/engine/components/componentCatalog.ts`:
1. **`prim.details`**: `<details><summary>...</summary><p>...</p></details>`
2. **`prim.figure`**: `<figure><img ... /><figcaption>...</figcaption></figure>`
3. **`prim.blockquote`**: `<blockquote><p>...</p><cite>...</cite></blockquote>`

Sertakan aturan CSS default `.vds-*` yang rapi untuk masing-masing primitif, dan pastikan `canContain()` di `src/engine/ast/contentModel.ts` mendukung relasi induk-anaknya.

### Kriteria Selesai

- [ ] Ketiga primitif muncul di `COMPONENT_CATALOG` lengkap dengan label, snippet HTML, dan gaya default `.vds-*`.
- [ ] `contentModel.ts` mengizinkan child yang valid (`summary`, `figcaption`, `cite`) di dalam elemen induknya.
- [ ] Tambahkan pengujian penyisipan dan content model di `src/engine/__tests__/`.
- [ ] `npm test -- --run` dan `npm run build` lulus tanpa error.

Tertarik mengerjakan? Tulis komentar singkat di bawah agar bisa kami assign.
```

---

### Issue 3

- **Title:** `[Help Wanted] Add Interactive Visual Preview Bar for Fluid Typography clamp() Generator`
- **Labels:** `["help wanted", "enhancement", "ui/ux"]`

#### English Body

```markdown
### Context

`TypographySection.tsx` (`src/components/inspector/TypographySection.tsx`) includes a Fluid `clamp(minRem, maxRem, minVw, maxVw)` generator (`F030`) that writes responsive `clamp(...)` font-size values into the active CSS rule.

Right now, users have to mentally calculate what `clamp()` resolves to on different screen widths before clicking Apply.

### What to Build

Inside the Fluid `clamp()` popover in `src/components/inspector/TypographySection.tsx`, render a compact live preview bar showing the computed `px` font size at Figrow's three standard artboard widths:
- **Mobile (`375px`)**
- **Tablet (`768px`)**
- **Desktop (`1440px`)**

As the user adjusts `minRem`, `maxRem`, `minVw`, or `maxVw`, the three viewport readouts should update immediately before applying the value to the stylesheet. Keep any pure math helpers in `src/engine/css/styleValueParsers.ts` so they are easy to unit test.

### Acceptance Criteria

- [ ] Live `px` readouts for `375px`, `768px`, and `1440px` appear inside the Fluid `clamp()` popover in `TypographySection.tsx`.
- [ ] Calculation helper is pure, handles edge cases (`minVw >= maxVw`), and has unit tests in `src/engine/__tests__/`.
- [ ] Matches the existing dark studio inspector UI.
- [ ] `npm test -- --run` and `npm run build` pass.

If you'd like to tackle this, leave a comment and feel free to ask any questions about the inspector layout!
```

#### Indonesian Body (Bahasa Indonesia)

```markdown
### Konteks

`TypographySection.tsx` (`src/components/inspector/TypographySection.tsx`) sudah memiliki generator Fluid `clamp(minRem, maxRem, minVw, maxVw)` (`F030`) untuk menulis ukuran font responsif ke aturan CSS aktif.

Saat ini, pengguna masih harus menebak ukuran `px` aktual pada berbagai lebar layar sebelum menekan tombol Apply.

### Target Pengerjaan

Di dalam popover Fluid `clamp()` pada `src/components/inspector/TypographySection.tsx`, tampilkan bar pratinjau ringkas yang menampilkan hasil ukuran `px` terhitung pada tiga lebar artboard standar Figrow:
- **Mobile (`375px`)**
- **Tablet (`768px`)**
- **Desktop (`1440px`)**

Saat pengguna mengubah `minRem`, `maxRem`, `minVw`, atau `maxVw`, ketiga angka viewport tersebut harus langsung terbarui sebelum nilai diterapkan ke stylesheet. Letakkan fungsi perhitungan murninya di `src/engine/css/styleValueParsers.ts` agar mudah diuji dengan unit test.

### Kriteria Selesai

- [ ] Pratinjau ukuran `px` untuk `375px`, `768px`, dan `1440px` tampil langsung di popover Fluid `clamp()` pada `TypographySection.tsx`.
- [ ] Fungsi perhitungan murni menangani edge case (`minVw >= maxVw`) dan memiliki unit test di `src/engine/__tests__/`.
- [ ] Tampilan menyatu rapi dengan UI dark studio inspector yang ada.
- [ ] `npm test -- --run` dan `npm run build` lulus tanpa error.

Silakan berkomentar jika ingin mengambil task ini atau butuh arahan soal struktur komponen inspector!
```
