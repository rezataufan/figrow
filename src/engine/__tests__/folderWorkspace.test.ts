import { describe, it, expect, beforeEach } from 'vitest';
import { projectDoc } from '../doc/projectDoc';
import { loadFolderFromFiles } from '../fs/folderWorkspace';
import { localAssetRegistry } from '../sandbox/localAssetRegistry';
import { useCanvasStore } from '../../store/canvasStore';

describe('Multi-Page Folder Workspace', () => {
  beforeEach(() => {
    projectDoc.resetProject();
    localAssetRegistry.clear();
  });

  it('registers and retrieves multiple HTML pages in the project doc', () => {
    // Register second and third page
    projectDoc.registerFile('about.html', '<!doctype html><html><body><h1>About Us</h1></body></html>');
    projectDoc.registerFile('contact.html', '<!doctype html><html><body><h1>Contact</h1></body></html>');

    const htmlFiles = projectDoc.getHtmlFiles();
    expect(htmlFiles).toContain('index.html');
    expect(htmlFiles).toContain('about.html');
    expect(htmlFiles).toContain('contact.html');
    expect(projectDoc.getFileText('about.html')).toContain('<h1>About Us</h1>');
    expect(projectDoc.getFileText('contact.html')).toContain('<h1>Contact</h1>');
  });

  it('updates or replaces registered project files without losing other pages', () => {
    projectDoc.registerFile('pricing.html', '<!doctype html><html><body><h1>Pricing</h1></body></html>');
    expect(projectDoc.getHtmlFiles()).toContain('pricing.html');

    projectDoc.registerFile('pricing.html', '<!doctype html><html><body><h1>New Pricing</h1></body></html>');
    expect(projectDoc.getFileText('pricing.html')).toContain('<h1>New Pricing</h1>');
  });

  it('ingests multi-file folder structure, instruments HTML, and registers assets', async () => {
    // Create mock Files with webkitRelativePath
    const file1 = new File(['<!doctype html><html><body><header>Nav</header></body></html>'], 'index.html', { type: 'text/html' });
    Object.defineProperty(file1, 'webkitRelativePath', { value: 'my-site/index.html' });

    const file2 = new File(['<!doctype html><html><body><main>About</main></body></html>'], 'about.html', { type: 'text/html' });
    Object.defineProperty(file2, 'webkitRelativePath', { value: 'my-site/about.html' });

    const file3 = new File(['body { background: red; }'], 'styles.css', { type: 'text/css' });
    Object.defineProperty(file3, 'webkitRelativePath', { value: 'my-site/css/styles.css' });

    const file4 = new File(['binary-png-data'], 'logo.png', { type: 'image/png' });
    Object.defineProperty(file4, 'webkitRelativePath', { value: 'my-site/images/logo.png' });

    const res = await loadFolderFromFiles([file1, file2, file3, file4]);

    expect(res.ok).toBe(true);
    expect(res.htmlFiles).toContain('index.html');
    expect(res.htmlFiles).toContain('about.html');
    expect(res.cssFiles).toContain('css/styles.css');
    expect(res.assetCount).toBe(1);

    // Verify HTML was instrumented with data-vds-id
    const indexContent = projectDoc.getFileText('index.html');
    expect(indexContent).toContain('data-vds-id=');

    // Verify localAssetRegistry registered the image
    expect(localAssetRegistry.resolveUrl('images/logo.png')).toBeTruthy();

    // Verify canvas store updated pageFiles and activeFile
    expect(useCanvasStore.getState().pageFiles).toEqual(expect.arrayContaining(['index.html', 'about.html']));
    expect(useCanvasStore.getState().activeFile).toBe('index.html');
  });
});
