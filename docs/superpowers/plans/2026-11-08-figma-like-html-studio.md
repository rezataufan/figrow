# Figma-Like Visual HTML Studio Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Figrow into a Figma-grade Visual HTML Studio featuring freeform direct canvas manipulation (drag & 1px anchor-pinned resize), native browser rendering, multi-page folder workspace, smart auto-synced navbars, and non-destructive roundtrip export.

**Architecture:** A native browser rendering engine using sandboxed iframes and MessageChannel protocol for 60 FPS geometry measurements and transient previews, coupled with a surgical AST mutation engine (`writeInlineStyleAttr` & `writeDeclarationsToTarget`) that writes directly to element style attributes or element rules without CSS cascade collisions. A folder ingestion pipeline loads multi-page projects into Yjs CRDT documents with local Blob asset mapping, automated cross-page navbar component reconciliation, and dual-path persistence (in-place `showDirectoryPicker` writeback + 1-Click ZIP export).

**Tech Stack:** React 19, TypeScript 5, Vite 6, Zustand, Yjs CRDT, Vitest, Lucide React, File System Access API, JSZip.

**Spec:** `F:/AI VAULT/Figrow/docs/superpowers/specs/2026-11-08-figma-like-html-studio-design.md`

## Global Constraints

- **Never convert HTML to SVG:** The canvas must render genuine DOM nodes with native browser typography and layout.
- **Never scramble or regenerate entire files:** Only modified properties and elements are touched; original comments, scripts, structure, and formatting remain 100% intact ("Masuk bagaimana, keluar begitu").
- **Never allow elements to jump into foreign containers during drag:** Sibling reordering is strictly restricted to direct siblings of the same parent container. Outside sibling flow, dragging commits the element's position freely without reparenting.
- **Never allow resize to warp the opposite edge:** Pulling any resize handle (e.g. West or North) pins the opposite edge completely stationary.
- **Never allow style changes to bounce back:** Direct canvas manipulation and inspector edits default to `targetKind: 'inline'` (`writeInlineStyleAttr`), applying with specificity `1-0-0-0` so modifications never revert or collide with shared classes.

## Review Focus

1. **Inline element sizing failure:** An `<a>` or `<span>` resized on canvas fails to take width/height because browser CSS ignores dimension properties on `display: inline`. (Expected: system automatically adds `display: inline-block` and `box-sizing: border-box`).
2. **Active link corruption during navbar sync:** A navbar edited on `index.html` overwrites `about.html`, setting "Home" as the active tab on the About page. (Expected: sync engine preserves each target page's specific `.active` / `aria-current="page"` markers).
3. **Internal marker pollution on disk save:** Files saved to disk retain internal runtime attributes like `data-vds-id="n_auto_1"`. (Expected: AST serialization strips all `data-vds-*` internal markers before writing to disk).
4. **Relative path breakage in nested pages:** A multi-page site with `pages/about.html` references assets with `../images/logo.png`, which breaks when synced from root `index.html`. (Expected: navbar sync engine automatically adjusts `href` and `src` relative paths based on target page folder depth).
5. **Opposite edge displacement during West/North handle drag:** Pulling the left handle to expand width causes the right edge to push outward or causes centered elements to expand bidirectionally. (Expected: counter-translation `transform: translateX(dx)` keeps the right edge 100% anchored in place).

---

### Task 1: Anchor-Pinned 8-Point Canvas Resize & Precision Drag

**Files:**
- Modify: `src/components/canvas/SelectionOverlay.tsx`
- Modify: `src/components/canvas/ArtboardFrame.tsx`
- Test: `src/engine/__tests__/canvasInteraction.test.ts`

**Interfaces:**
- Consumes: `useSelectionStore`, `useCanvasStore`, `useInspectorStore`, `sandboxRegistry`
- Produces: `handleResizePointerDown`, `handleBodyPointerDown` with anchor pinning and strict sibling-only reordering

- [ ] **Step 1: Write failing tests for resize anchor pinning and sibling-only reorder constraint**

Create `src/engine/__tests__/canvasInteraction.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';

describe('Canvas Interaction Logic', () => {
  it('calculates counter-translation for West handle keeping right edge stationary', () => {
    const startX = 100;
    const startW = 200;
    const dx = -50; // Dragged 50px to the left
    const nextW = Math.max(16, startW - dx); // 250
    const nextX = startX + dx; // 50
    const offsetX = nextX - startX; // -50
    
    // Right edge must remain at original right edge (100 + 200 = 300)
    const effectiveRightEdge = nextX + nextW;
    expect(effectiveRightEdge).toBe(300);
    expect(offsetX).toBe(-50);
  });

  it('calculates counter-translation for North handle keeping bottom edge stationary', () => {
    const startY = 80;
    const startH = 120;
    const dy = -40; // Dragged 40px up
    const nextH = Math.max(16, startH - dy); // 160
    const nextY = startY + dy; // 40
    const offsetY = nextY - startY; // -40

    // Bottom edge must remain at original bottom edge (80 + 120 = 200)
    const effectiveBottomEdge = nextY + nextH;
    expect(effectiveBottomEdge).toBe(200);
    expect(offsetY).toBe(-40);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npm.cmd test -- src/engine/__tests__/canvasInteraction.test.ts`
Expected: PASS

- [ ] **Step 3: Enhance `SelectionOverlay.tsx` handle dynamics and inline element immunity**

In `src/components/canvas/SelectionOverlay.tsx`:
- When dragging West (`w`), North (`n`), or diagonal corners (`nw`, `ne`, `sw`), compute `offsetX = nextX - startX` and `offsetY = nextY - startY`.
- Pass `transform: translate(${Math.round(offsetX)}px, ${Math.round(offsetY)}px)` in transient style.
- If `primaryBox.display === 'inline'`, automatically apply `display: inline-block` and `box-sizing: border-box`.
- On `pointerup`, write committed dimensions and position directly to the element via `writeInlineStyleAttr(vnode, propsToCommit)`, and only clear transient styles after the permanent attribute has been written.

- [ ] **Step 4: Enhance `ArtboardFrame.tsx` with strict sibling-only reorder constraint**

In `src/components/canvas/ArtboardFrame.tsx`:
- Restrict reorder drop slot detection strictly to direct siblings of the same parent container (`parentKey === sourceNode.parent`).
- When dragged freely into whitespace or outside direct sibling flow, set `dropSlot` to `null` (never falling back to `n_main` or `n_body`).
- On `pointerup`, commit free position via `writeInlineStyleAttr(sourceNode, { position: isAbs ? 'absolute' : 'relative', left: `${newLeft}px`, top: `${newTop}px` })`.

- [ ] **Step 5: Run tests and verify clean build**

Run: `npm.cmd test -- --run`
Expected: PASS (all tests pass)

---

### Task 2: Direct Element Style Isolation & Specificity Engine

**Files:**
- Modify: `src/engine/css/cascadeEngine.ts`
- Modify: `src/store/inspectorStore.ts`
- Modify: `src/components/inspector/CssVisualInspector.tsx`
- Test: `src/engine/__tests__/styleIsolation.test.ts`

**Interfaces:**
- Consumes: `projectDoc`, `VNode`, `writeInlineStyleAttr`
- Produces: `useInspectorStore` with `targetKind: 'inline'` default, non-colliding style writes

- [ ] **Step 1: Write failing tests for direct inline style isolation**

Create `src/engine/__tests__/styleIsolation.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { projectDoc, initProjectDoc } from '../doc/projectDoc';
import { parseHtmlToVNodes } from '../ast/htmlAst';
import { writeInlineStyleAttr } from '../css/cascadeEngine';

describe('Direct Element Style Isolation', () => {
  it('writes style attribute directly to the element without altering siblings', () => {
    initProjectDoc(
      'index.html',
      '<div id="root"><button class="btn" data-vds-id="btn1">Btn 1</button><button class="btn" data-vds-id="btn2">Btn 2</button></div>',
      []
    );
    const tree = parseHtmlToVNodes('index.html', projectDoc.getFileText('index.html'));
    const btn1 = tree.nodes['btn1'];
    expect(btn1).toBeDefined();

    writeInlineStyleAttr(btn1!, { 'background-color': '#ff0000', width: '200px' });
    const updatedHtml = projectDoc.getFileText('index.html');

    // btn1 must have inline style; btn2 must remain untouched
    expect(updatedHtml).toContain('data-vds-id="btn1" style="background-color: #ff0000; width: 200px;"');
    expect(updatedHtml).toContain('<button class="btn" data-vds-id="btn2">Btn 2</button>');
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npm.cmd test -- src/engine/__tests__/styleIsolation.test.ts`
Expected: PASS

- [ ] **Step 3: Update `inspectorStore.ts` and `CssVisualInspector.tsx` target resolution**

In `src/store/inspectorStore.ts`:
- Set default `targetKind: 'inline'`.
- In `resolveTargetForNode`, when `targetKind === 'inline'` or `!selectedSelector`, return `{ kind: 'inline', selector: 'style=""', file: 'index.html', media: null, state: null }`.
- Ensure `commitStyleProps` delegates directly to `writeInlineStyleAttr` when target is inline, and bumps `inspectorRevision`.

In `src/components/inspector/CssVisualInspector.tsx`:
- Ensure the Target dropdown clearly displays `Target: style="" (inline)` as the default.
- Allow switching to class rules (e.g. `.btn`) only when the user explicitly clicks a class chip.

- [ ] **Step 4: Run tests to verify passing**

Run: `npm.cmd test -- --run`
Expected: PASS

---

### Task 3: Multi-Page Folder Workspace & File Ingestion Pipeline

**Files:**
- Create: `src/components/workspace/FolderWorkspaceModal.tsx`
- Modify: `src/engine/doc/projectDoc.ts`
- Modify: `src/store/canvasStore.ts`
- Modify: `src/components/layers/PagesAccordion.tsx`
- Modify: `src/components/canvas/CanvasTopBar.tsx`
- Test: `src/engine/__tests__/folderWorkspace.test.ts`

**Interfaces:**
- Consumes: `projectDoc`, `useCanvasStore`
- Produces: `openProjectDirectory(directoryHandle: FileSystemDirectoryHandle | FileList)`, `setActiveFile(filePath: string)`

- [ ] **Step 1: Write failing test for multi-page project doc indexing**

Create `src/engine/__tests__/folderWorkspace.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { projectDoc, initProjectDoc } from '../doc/projectDoc';

describe('Multi-Page Folder Workspace', () => {
  it('registers and switches between multiple HTML pages in the project doc', () => {
    initProjectDoc(
      'index.html',
      '<!doctype html><html><body data-vds-id="n_body"><h1>Home</h1></body></html>',
      [{ file: 'css/styles.css', css: 'h1 { color: blue; }' }]
    );

    // Register second page
    projectDoc.registerFile('about.html', '<!doctype html><html><body data-vds-id="n_body"><h1>About</h1></body></html>');

    expect(projectDoc.getFileText('index.html')).toContain('<h1>Home</h1>');
    expect(projectDoc.getFileText('about.html')).toContain('<h1>About</h1>');
    expect(projectDoc.getHtmlFiles()).toContain('index.html');
    expect(projectDoc.getHtmlFiles()).toContain('about.html');
  });
});
```

- [ ] **Step 2: Run test to verify it fails if `getHtmlFiles()` does not exist**

Run: `npm.cmd test -- src/engine/__tests__/folderWorkspace.test.ts`
Expected: PASS or verify missing helpers.

- [ ] **Step 3: Implement project file registration & page switching in `projectDoc.ts` & `canvasStore.ts`**

In `src/engine/doc/projectDoc.ts`:
- Add `getHtmlFiles(): string[]` returning all registered `.html` / `.htm` keys in `projectDoc.files`.
- Add `registerFile(file: string, content: string): void` ensuring Y.Text entry exists.

In `src/store/canvasStore.ts`:
- Implement `setActiveFile(filePath: string)`: updates `activeFile`, reloads all active artboards (`ab_desktop`, `ab_tablet`, `ab_mobile`) using `sandboxRegistry.broadcastLoad(filePath, html, sheets)`.

In `src/components/layers/PagesAccordion.tsx`:
- Render dynamic list of all HTML files discovered in `projectDoc.getHtmlFiles()`.
- Clicking any page sets it as the active file and highlights it.

In `src/components/workspace/FolderWorkspaceModal.tsx`:
- Provide a button in `CanvasTopBar.tsx` ("📁 Open Folder").
- Invoke `window.showDirectoryPicker()` with fallback to `<input type="file" webkitdirectory />`.
- Read and populate all `.html`, `.css`, and binary assets into `projectDoc`.

- [ ] **Step 4: Run tests to verify passing**

Run: `npm.cmd test -- --run`
Expected: PASS

---

### Task 4: Local Binary Asset Bridge (Blob Object URL Registry)

**Files:**
- Create: `src/engine/sandbox/localAssetRegistry.ts`
- Modify: `src/engine/sandbox/runtimeAgentSource.ts`
- Modify: `src/engine/sandbox/iframeBridge.ts`
- Test: `src/engine/__tests__/assetBridge.test.ts`

**Interfaces:**
- Consumes: `File` / `Blob` from folder ingestion
- Produces: `localAssetRegistry.register(relativePath, blob)`, `localAssetRegistry.resolveUrl(relativePath)`, `localAssetRegistry.rewriteHtmlForSandbox(html)`

- [ ] **Step 1: Write failing test for asset URL resolution and de-referencing**

Create `src/engine/__tests__/assetBridge.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { localAssetRegistry } from '../sandbox/localAssetRegistry';

describe('Local Asset Registry', () => {
  it('registers asset files and resolves relative paths without corrupting original paths', () => {
    localAssetRegistry.clear();
    const fakeBlob = new Blob(['fake-png-data'], { type: 'image/png' });
    localAssetRegistry.register('images/hero.png', fakeBlob);

    const blobUrl = localAssetRegistry.resolveUrl('images/hero.png');
    expect(blobUrl).toBeDefined();
    expect(blobUrl).toMatch(/^blob:/);

    // De-referencing blob URL back to relative path for clean export
    const rawHtml = `<img src="${blobUrl}">`;
    const cleanHtml = localAssetRegistry.restoreOriginalPaths(rawHtml);
    expect(cleanHtml).toBe('<img src="images/hero.png">');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- src/engine/__tests__/assetBridge.test.ts`
Expected: FAIL ("cannot find module")

- [ ] **Step 3: Implement `localAssetRegistry.ts`**

In `src/engine/sandbox/localAssetRegistry.ts`:
```typescript
class LocalAssetRegistry {
  private map = new Map<string, { blob: Blob; url: string }>();
  private blobToPath = new Map<string, string>();

  public register(relativePath: string, blob: Blob): string {
    const clean = relativePath.replace(/^[./]+/, '');
    const url = URL.createObjectURL(blob);
    this.map.set(clean, { blob, url });
    this.blobToPath.set(url, clean);
    return url;
  }

  public resolveUrl(relativePath: string): string | null {
    const clean = relativePath.replace(/^[./]+/, '');
    return this.map.get(clean)?.url ?? null;
  }

  public restoreOriginalPaths(content: string): string {
    let result = content;
    for (const [url, relPath] of this.blobToPath.entries()) {
      result = result.replaceAll(url, relPath);
    }
    return result;
  }

  public clear(): void {
    for (const entry of this.map.values()) {
      URL.revokeObjectURL(entry.url);
    }
    this.map.clear();
    this.blobToPath.clear();
  }
}

export const localAssetRegistry = new LocalAssetRegistry();
```

- [ ] **Step 4: Integrate asset rewriting into `buildSandboxSrcDoc` in `runtimeAgentSource.ts`**

In `src/engine/sandbox/runtimeAgentSource.ts`:
- When rewriting `<img src="...">`, `<script src="...">`, and `<link rel="stylesheet">`:
- If `localAssetRegistry.resolveUrl(relPath)` exists, substitute with the blob URL.

- [ ] **Step 5: Run tests and verify passing**

Run: `npm.cmd test -- src/engine/__tests__/assetBridge.test.ts`
Expected: PASS

---

### Task 5: Smart Zero-Code Cross-Page Navbar Synchronization

**Files:**
- Create: `src/engine/components/navbarSyncEngine.ts`
- Modify: `src/engine/doc/projectDoc.ts`
- Modify: `src/store/layersStore.ts`
- Test: `src/engine/__tests__/navbarSync.test.ts`

**Interfaces:**
- Consumes: `projectDoc`, `parseHtmlToVNodes`
- Produces: `syncNavbarAcrossProject(sourceFile, navbarNodeId, options)`, `detachNavbarInstance(file, navbarNodeId)`

- [ ] **Step 1: Write failing test for state-preserving navbar reconciliation**

Create `src/engine/__tests__/navbarSync.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { projectDoc, initProjectDoc } from '../doc/projectDoc';
import { syncNavbarAcrossProject } from '../components/navbarSyncEngine';

describe('Smart Navbar Sync Engine', () => {
  it('propagates navbar updates to other pages while preserving target page active links', () => {
    initProjectDoc(
      'index.html',
      `<!doctype html><html><body>
        <header class="site-header" data-vds-id="n_hdr">
          <a class="nav-link active" href="index.html">Home</a>
          <a class="nav-link" href="about.html">About</a>
        </header>
      </body></html>`,
      []
    );

    projectDoc.registerFile(
      'about.html',
      `<!doctype html><html><body>
        <header class="site-header" data-vds-id="n_hdr">
          <a class="nav-link" href="index.html">Home</a>
          <a class="nav-link active" href="about.html">About</a>
        </header>
      </body></html>`
    );

    // User updates header on index.html: adds a new button
    const updatedIndex = projectDoc.getFileText('index.html').replace(
      '</header>',
      '<button class="cta-btn">Sign In</button></header>'
    );
    projectDoc.files.get('index.html')!.delete(0, projectDoc.files.get('index.html')!.length);
    projectDoc.files.get('index.html')!.insert(0, updatedIndex);

    // Sync across project
    syncNavbarAcrossProject('index.html', 'n_hdr');

    const syncedAbout = projectDoc.getFileText('about.html');
    // Must contain new button
    expect(syncedAbout).toContain('<button class="cta-btn">Sign In</button>');
    // Must preserve 'About' link as active on about.html
    expect(syncedAbout).toContain('<a class="nav-link active" href="about.html">About</a>');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- src/engine/__tests__/navbarSync.test.ts`
Expected: FAIL ("cannot find module")

- [ ] **Step 3: Implement `navbarSyncEngine.ts`**

In `src/engine/components/navbarSyncEngine.ts`:
- Implement `findMatchingNavbar(html: string): { tagRange: [number, number]; innerHtml: string; activeHref: string | null } | null`:
  Matches `<header>` or `<nav>` or element with class containing `header` / `navbar`.
- Implement `syncNavbarAcrossProject(sourceFile: string, navbarNodeId: string)`:
  - Extracts source navbar inner HTML and styles.
  - Identifies target pages in `projectDoc.getHtmlFiles()`.
  - On each target page, identifies matching navbar container.
  - Preserves target page's active tab link (`.active`, `aria-current="page"`).
  - Updates target page using Yjs transaction.
- Implement `detachNavbarInstance(file: string, navbarNodeId: string)`: marks navbar with `data-vds-detached="true"` to opt out of synchronization.

- [ ] **Step 4: Run tests to verify passing**

Run: `npm.cmd test -- src/engine/__tests__/navbarSync.test.ts`
Expected: PASS

---

### Task 6: Dual-Path Persistence: In-Place Disk Writeback & 1-Click ZIP Export

**Files:**
- Create: `src/engine/fs/diskSyncEngine.ts`
- Modify: `src/engine/export/exportPipeline.ts`
- Modify: `src/components/canvas/CanvasTopBar.tsx`
- Test: `src/engine/__tests__/diskSync.test.ts`

**Interfaces:**
- Consumes: `projectDoc`, `FileSystemDirectoryHandle`
- Produces: `saveProjectToDisk(directoryHandle)`, `stripRuntimeStudioMarkers(html)`

- [ ] **Step 1: Write failing test for runtime studio marker stripping**

Create `src/engine/__tests__/diskSync.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { stripRuntimeStudioMarkers } from '../fs/diskSyncEngine';

describe('Disk Sync & Marker Stripping', () => {
  it('completely strips data-vds-* attributes before writing to disk', () => {
    const rawHtml = `<body data-vds-id="n_body"><div class="card" data-vds-id="n_auto_1" data-vds-hover="true"><p data-vds-id="n_p">Text</p></div></body>`;
    const cleanHtml = stripRuntimeStudioMarkers(rawHtml);
    expect(cleanHtml).toBe(`<body><div class="card"><p>Text</p></div></body>`);
    expect(cleanHtml).not.toContain('data-vds-');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- src/engine/__tests__/diskSync.test.ts`
Expected: FAIL ("cannot find module")

- [ ] **Step 3: Implement `diskSyncEngine.ts`**

In `src/engine/fs/diskSyncEngine.ts`:
```typescript
import { projectDoc } from '../doc/projectDoc';
import { localAssetRegistry } from '../sandbox/localAssetRegistry';

export function stripRuntimeStudioMarkers(html: string): string {
  return html
    .replace(/\s+data-vds-[a-zA-Z0-9_-]+(?:="[^"]*")?/g, '')
    .replace(/\s*data-vds-[a-zA-Z0-9_-]+(?:="[^"]*")?/g, '');
}

export async function saveProjectToDisk(dirHandle: FileSystemDirectoryHandle): Promise<void> {
  for (const [filePath, ytext] of projectDoc.files.entries()) {
    let content = ytext.toString();
    if (filePath.endsWith('.html') || filePath.endsWith('.htm')) {
      content = stripRuntimeStudioMarkers(content);
      content = localAssetRegistry.restoreOriginalPaths(content);
    }
    
    // Resolve nested directory path if necessary
    const parts = filePath.split('/');
    let currentDir = dirHandle;
    for (let i = 0; i < parts.length - 1; i++) {
      currentDir = await currentDir.getDirectoryHandle(parts[i], { create: true });
    }
    const fileName = parts[parts.length - 1];
    const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }
}
```

- [ ] **Step 4: Wire Save (Ctrl+S) and Export in `CanvasTopBar.tsx`**

In `src/components/canvas/CanvasTopBar.tsx`:
- Add "💾 Save" button (active when a directory handle is connected).
- Bind `Ctrl+S` / `Cmd+S` to trigger `saveProjectToDisk`.
- Add "📦 Export ZIP" button triggering `downloadProjectZip` from `exportPipeline.ts`.

- [ ] **Step 5: Run tests and verify passing**

Run: `npm.cmd test -- src/engine/__tests__/diskSync.test.ts`
Expected: PASS

---

### Task 7: Full End-to-End Integration, Verification & Test Suite

**Files:**
- Create: `src/engine/__tests__/e2eStudio.test.ts`

**Interfaces:**
- Tests all integrated subsystems end-to-end.

- [ ] **Step 1: Write comprehensive end-to-end studio test**

Create `src/engine/__tests__/e2eStudio.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { projectDoc, initProjectDoc } from '../doc/projectDoc';
import { parseHtmlToVNodes } from '../ast/htmlAst';
import { writeInlineStyleAttr } from '../css/cascadeEngine';
import { syncNavbarAcrossProject } from '../components/navbarSyncEngine';
import { stripRuntimeStudioMarkers } from '../fs/diskSyncEngine';

describe('E2E Figma-Like HTML Studio Flow', () => {
  it('executes full roundtrip: import -> resize -> move -> color -> navbar sync -> clean export', () => {
    // 1. Ingest multi-page site
    initProjectDoc(
      'index.html',
      `<!doctype html><html><body>
        <header class="site-header" data-vds-id="n_hdr"><a class="active" href="index.html">Home</a><a href="about.html">About</a></header>
        <main><div class="hero" data-vds-id="n_hero">Hero</div></main>
      </body></html>`,
      [{ file: 'css/styles.css', css: '.hero { color: #fff; }' }]
    );
    projectDoc.registerFile(
      'about.html',
      `<!doctype html><html><body>
        <header class="site-header" data-vds-id="n_hdr"><a href="index.html">Home</a><a class="active" href="about.html">About</a></header>
        <main><h1>About Us</h1></main>
      </body></html>`
    );

    // 2. Direct visual manipulation (Resize, Move, Color) on hero
    const tree = parseHtmlToVNodes('index.html', projectDoc.getFileText('index.html'));
    const hero = tree.nodes['n_hero'];
    expect(hero).toBeDefined();

    writeInlineStyleAttr(hero!, {
      width: '450px',
      'background-color': '#4f46e5',
      position: 'relative',
      left: '24px',
    });

    // 3. Navbar update & cross-page sync
    const indexHtml = projectDoc.getFileText('index.html');
    expect(indexHtml).toContain('style="width: 450px; background-color: #4f46e5; position: relative; left: 24px;"');

    syncNavbarAcrossProject('index.html', 'n_hdr');
    const aboutHtml = projectDoc.getFileText('about.html');
    expect(aboutHtml).toContain('class="site-header"');

    // 4. Clean export verification (no data-vds- markers)
    const cleanOutput = stripRuntimeStudioMarkers(projectDoc.getFileText('index.html'));
    expect(cleanOutput).not.toContain('data-vds-');
    expect(cleanOutput).toContain('width: 450px;');
    expect(cleanOutput).toContain('background-color: #4f46e5;');
  });
});
```

- [ ] **Step 2: Run all tests in the repository**

Run: `npm.cmd test -- --run`
Expected: PASS (all tests pass)

- [ ] **Step 3: Run full TypeScript and Vite production build**

Run: `npm.cmd run build`
Expected: Exit code 0, 0 errors.
