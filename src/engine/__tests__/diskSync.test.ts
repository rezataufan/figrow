import { describe, it, expect, beforeEach } from 'vitest';
import { projectDoc } from '../doc/projectDoc';
import {
  stripRuntimeStudioMarkers,
  exportCleanProjectZip,
} from '../fs/diskSyncEngine';
import { localAssetRegistry } from '../sandbox/localAssetRegistry';

describe('Disk Sync & Non-Destructive Clean Export Engine', () => {
  beforeEach(() => {
    projectDoc.resetProject();
    localAssetRegistry.clear();
  });

  it('strips all data-vds-* attributes without destroying comments or original layout', () => {
    const rawWithMarkers = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <!-- Original User Comment Header -->
  <title>Clean Page</title>
</head>
<body data-vds-id="n_body">
  <!-- Sibling comment -->
  <header class="hero" data-vds-id="n_header_1" data-vds-hidden="false">
    <h1 data-vds-id="n_h1_2" data-vds-force="hover">Hello World</h1>
  </header>
  <script data-vds-agent="true">console.log('runtime');</script>
</body>
</html>`;

    const cleaned = stripRuntimeStudioMarkers(rawWithMarkers);

    // Assert all data-vds markers are stripped
    expect(cleaned).not.toContain('data-vds-id');
    expect(cleaned).not.toContain('data-vds-hidden');
    expect(cleaned).not.toContain('data-vds-force');
    expect(cleaned).not.toContain('data-vds-agent');

    // Assert original comments, doctype, structure are preserved 100% intact
    expect(cleaned).toContain('<!-- Original User Comment Header -->');
    expect(cleaned).toContain('<!-- Sibling comment -->');
    expect(cleaned).toContain('<header class="hero">');
    expect(cleaned).toContain('<h1>Hello World</h1>');
  });

  it('restores blob URLs back to original relative asset paths in output', () => {
    const mockBlob = new Blob(['img'], { type: 'image/png' });
    const blobUrl = localAssetRegistry.register('images/banner.png', mockBlob);

    const htmlWithBlob = `<div data-vds-id="n_div"><img src="${blobUrl}" alt="Banner" data-vds-id="n_img"></div>`;
    const cleaned = stripRuntimeStudioMarkers(htmlWithBlob);

    expect(cleaned).not.toContain('blob:');
    expect(cleaned).not.toContain('data-vds-id');
    expect(cleaned).toContain('<img src="images/banner.png" alt="Banner">');
  });

  it('packages all clean project files into a downloadable zip', async () => {
    projectDoc.registerFile('index.html', '<!doctype html><html><body><h1 data-vds-id="n_1">Home</h1></body></html>');
    projectDoc.registerFile('about.html', '<!doctype html><html><body><h1 data-vds-id="n_2">About</h1></body></html>');
    projectDoc.registerFile('css/style.css', 'body { color: blue; }');

    const zipBlob = await exportCleanProjectZip();

    expect(zipBlob).toBeInstanceOf(Blob);
    expect(zipBlob.size).toBeGreaterThan(0);
    expect(zipBlob.type).toBe('application/zip');
  });
});
