# Changelog

All notable changes to **Figrow — Visual DOM & CSS Studio** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-10

### Added
- **Multi-Artboard Infinite Canvas:** Simultaneous Desktop (`1440px`), Tablet (`768px`), and Mobile (`375px`) live sandboxed viewports with focal-point zoom (`0.1x`–`8.0x`), rulers, smart guides, and offscreen lifecycle freezing.
- **Lossless Source-Range AST Engine:** Non-destructive HTML5 (`parse5`) and CSS (`postcss`) byte-range mutations backed by **Yjs CRDT (`Y.Text`)** and `IndexedDB` persistence.
- **W3C L4 CSS Cascade Engine:** Accurate selector matching and specificity calculation powered by `@bramus/specificity` and `postcss-selector-parser`.
- **On-Canvas Direct Manipulation:** Flex/Grid sibling drag-and-drop reorder, on-canvas Padding & Gap drag handles, and inline Rich-Text formatting toolbar (`Bold`, `Italic`, `Underline`, `Code`, `Link`).
- **HTML Attributes / Traits Inspector:** Context-aware editor for native HTML attributes (`href`, `target`, `src`, `alt`, `type`, `placeholder`, `aria-label`, and custom `data-*`).
- **Universal Reusable Symbols Engine:** Master component synchronization (`data-vds-symbol="<id>"`) across multi-page HTML workspaces.
- **Command Palette & WebMCP AI Bridge:** `Ctrl+K` Command Palette (`18+` commands) and `navigator.modelContext` / `window.figrowCommands` integration for AI agents.
- **Direct Local Disk Sync:** Two-way file and folder synchronization via the Chromium File System Access API.
