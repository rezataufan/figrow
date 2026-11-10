import { describe, it, expect, beforeEach } from 'vitest';
import { projectDoc } from '../doc/projectDoc';
import { loadFolderFromFiles } from '../fs/folderWorkspace';
import { localAssetRegistry } from '../sandbox/localAssetRegistry';
import { parseHtmlToVNodes } from '../ast/htmlAst';
import { writeInlineStyleAttr } from '../css/cascadeEngine';
import { syncNavbarAcrossProject } from '../components/navbarSyncEngine';
import { stripRuntimeStudioMarkers, exportCleanProjectZip } from '../fs/diskSyncEngine';
import { buildSandboxSrcDoc } from '../sandbox/runtimeAgentSource';
import { useCanvasStore } from '../../store/canvasStore';

describe('End-to-End Figma-Like HTML Studio Journey', () => {
  beforeEach(() => {
    projectDoc.resetProject();
    localAssetRegistry.clear();
  });

  it('executes full workflow: folder import -> 1px isolated edit -> navbar sync -> offline asset -> clean export', async () => {
    // 1. INGEST MULTI-PAGE PROJECT FOLDER
    const indexSource = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <!-- Brand Header Comment -->
  <title>Home</title>
  <link rel="stylesheet" href="css/styles.css">
</head>
<body>
  <header class="navbar">
    <a href="index.html" class="active">Home</a>
    <a href="about.html">About</a>
  </header>
  <main>
    <img src="images/logo.png" alt="Company Logo" class="logo">
    <div class="card" id="hero-card">
      <h2>Welcome</h2>
      <p>Custom vanilla HTML site.</p>
    </div>
  </main>
</body>
</html>`;

    const aboutSource = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>About</title>
  <link rel="stylesheet" href="css/styles.css">
</head>
<body>
  <header class="navbar">
    <a href="index.html">Home</a>
    <a href="about.html">About</a>
  </header>
  <main>
    <h1>About Our Team</h1>
  </main>
</body>
</html>`;

    const cssSource = `
.navbar { display: flex; gap: 16px; }
.card { padding: 24px; background: white; }
`;

    const f1 = new File([indexSource], 'index.html', { type: 'text/html' });
    Object.defineProperty(f1, 'webkitRelativePath', { value: 'my-project/index.html' });

    const f2 = new File([aboutSource], 'about.html', { type: 'text/html' });
    Object.defineProperty(f2, 'webkitRelativePath', { value: 'my-project/about.html' });

    const f3 = new File([cssSource], 'styles.css', { type: 'text/css' });
    Object.defineProperty(f3, 'webkitRelativePath', { value: 'my-project/css/styles.css' });

    const f4 = new File(['mock-png-bytes'], 'logo.png', { type: 'image/png' });
    Object.defineProperty(f4, 'webkitRelativePath', { value: 'my-project/images/logo.png' });

    const loadRes = await loadFolderFromFiles([f1, f2, f3, f4]);
    expect(loadRes.ok).toBe(true);
    expect(useCanvasStore.getState().pageFiles).toEqual(expect.arrayContaining(['index.html', 'about.html']));

    // 2. VERIFY OFFLINE ASSET RENDERING VIA BLOB OBJECT URL
    const registeredBlobUrl = localAssetRegistry.resolveUrl('images/logo.png');
    expect(registeredBlobUrl).toMatch(/^blob:/);

    const artboardSrcDoc = buildSandboxSrcDoc('ab_desktop', projectDoc.getFileText('index.html'), projectDoc.getStyleSheets());
    expect(artboardSrcDoc).toContain(`src="${registeredBlobUrl}"`);

    // 3. EDIT EXACT ELEMENT 1px WITHOUT SNAP-BACK OR SIBLING COLLISION
    // User drags/resizes or recolors the card by exactly 1px
    const indexWithIds = projectDoc.getFileText('index.html');
    const cardIdMatch = indexWithIds.match(/id="hero-card"[^>]*data-vds-id="([^"]+)"/);
    expect(cardIdMatch).not.toBeNull();
    const heroCardNodeId = cardIdMatch![1]!;

    // Commit isolated visual style props (1-0-0-0 inline specificity)
    const tree = parseHtmlToVNodes('index.html', projectDoc.getFileText('index.html'));
    const heroCardVNode = tree.nodes[heroCardNodeId];
    expect(heroCardVNode).toBeDefined();

    writeInlineStyleAttr(heroCardVNode!, {
      width: '401px',
      'background-color': '#ff4757',
    });

    const updatedIndex = projectDoc.getFileText('index.html');
    expect(updatedIndex).toContain('width: 401px');
    expect(updatedIndex).toContain('background-color: #ff4757');

    // Sibling elements (.logo, h2) remain 100% untouched
    expect(updatedIndex).toContain('class="logo"');
    expect(updatedIndex).toContain('Welcome</h2>');

    // 4. CROSS-PAGE NAVBAR SYNCHRONIZATION
    // User adds a "Blog" link to the navbar in index.html
    const navWithBlog = updatedIndex.replace('About</a>', 'About</a>\n    <a href="blog.html">Blog</a>');
    projectDoc.registerFile('index.html', navWithBlog);

    const syncRes = syncNavbarAcrossProject('index.html');
    expect(syncRes.syncedCount).toBe(1);
    expect(syncRes.targetFiles).toContain('about.html');

    // about.html now automatically has the "Blog" link
    const updatedAbout = projectDoc.getFileText('about.html');
    expect(updatedAbout).toContain('<a href="blog.html">Blog</a>');
    // about.html page content (About Our Team) is preserved
    expect(updatedAbout).toContain('About Our Team</h1>');

    // 5. CLEAN PERSISTENCE & EXPORT ("Masuk bagaimana, keluar begitu")
    const cleanedExport = stripRuntimeStudioMarkers(projectDoc.getFileText('index.html'));

    // All data-vds markers stripped
    expect(cleanedExport).not.toContain('data-vds-id');
    expect(cleanedExport).not.toContain('data-vds-agent');
    // Blob URLs restored to original relative path
    expect(cleanedExport).not.toContain('blob:');
    expect(cleanedExport).toContain('<img src="images/logo.png"');
    // Original comments preserved
    expect(cleanedExport).toContain('<!-- Brand Header Comment -->');
    expect(cleanedExport).toContain('<h2>Welcome</h2>');
    // User's visual edits cleanly in place
    expect(cleanedExport).toContain('width: 401px');
    expect(cleanedExport).toContain('background-color: #ff4757');

    // Clean ZIP packaging
    const zipBlob = await exportCleanProjectZip();
    expect(zipBlob.size).toBeGreaterThan(0);
  });
});
