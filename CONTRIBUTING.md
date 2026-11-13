# Contributing to Figrow

We're glad you're here. Figrow is built in the open, and whether you're fixing a CSS inspector edge case, adding a new component primitive, or writing a test, your PR makes a real difference.

## How Figrow Works Under the Hood (5-Minute Mental Model)

Figrow's core rule is simple: never clobber the user's source code. Instead of serializing the whole DOM on every click, edits flow through four focused layers:

- **`src/engine/doc/projectDoc.ts`**: Holds the Yjs `Y.Doc` with `Y.Text` buffers for each HTML and CSS file, plus `UndoManager` transaction history.
- **`src/engine/ast/htmlAst.ts`**: Parses HTML with `parse5` (`sourceCodeLocationInfo: true`) and provides byte-range splice helpers so mutations touch only the exact characters that changed.
- **`src/engine/css/cascadeEngine.ts`**: Resolves the W3C L4 CSS cascade using `postcss` and `@bramus/specificity` across media breakpoints and pseudo-states (`:hover`, `:focus`, `:active`, `:disabled`).
- **`src/engine/sandbox/iframeBridge.ts`**: Streams incremental patches and live DOM bounding rects over `MessageChannel` between the studio host and the Desktop, Tablet, and Mobile artboard iframes.

## Where to Find Your First Contribution

If you're new to the codebase, these self-contained areas are great starting points:

- **`src/engine/components/componentCatalog.ts`**: Add semantic HTML5 primitives and prebuilt blocks with clean `.vds-*` default styles.
- **`src/engine/export/tailwindMapper.ts`**: Expand CSS-to-Tailwind v4 utility mappings in `mapDeclarationToUtilities()`.
- **`src/engine/css/styleValueParsers.ts`**: Pure parsing and formatting helpers for CSS values (colors, gradients, `clamp()`, transforms).
- **`src/components/inspector/`**: React inspector panels for Typography, Layout, Backgrounds, and HTML Traits.

Check open issues labeled `good first issue` or `help wanted` if you want a concrete task right away.

## Step-by-Step PR Checklist

1. **Fork & clone** the repository:
   ```bash
   git clone https://github.com/rezataufan/figrow.git
   cd figrow
   npm install
   ```
2. **Create a branch** from `main` using a clear name like `feat/tailwind-filter-mapper` or `fix/clamp-preview`:
   ```bash
   git checkout -b feat/your-change
   ```
3. **Start the dev server** to test your changes live:
   ```bash
   npm run dev
   ```
4. **Add or update tests** in `src/engine/__tests__/` for any new AST, CSS cascade, export, or command logic.
5. **Run the full check suite** before opening your PR:
   ```bash
   npm test -- --run
   npm run build
   ```
6. **Open a Pull Request** explaining what changed, why it helps, and which issue it closes.

## Architectural Invariants

When editing `src/engine/`, please keep these three rules intact:

- **Zero Source Corruption:** HTML and CSS mutations must splice exact AST source ranges inside `projectDoc` (`Y.Text`) rather than re-serializing whole documents blindly.
- **Native Sandbox Fidelity:** User HTML documents rendered inside artboard iframes must keep original `<head>`, `<style>`, `<link>`, and `<script>` execution order.
- **Test Coverage:** New engine capabilities (AST mutations, CSS cascade rules, symbol sync, or WebMCP commands) need matching tests in `src/engine/__tests__/`.

## License

By contributing to Figrow, you agree that your contributions will be licensed under its [MIT License](./LICENSE).
