import { describe, it, expect, beforeEach, vi } from 'vitest';
import { localAssetRegistry } from '../sandbox/localAssetRegistry';

describe('Local Asset Registry (Binary Asset Bridge)', () => {
  beforeEach(() => {
    localAssetRegistry.clear();
  });

  it('registers a binary asset and resolves its blob URL', () => {
    // Mock URL.createObjectURL and URL.revokeObjectURL for vitest / jsdom
    const mockBlob = new Blob(['fake image data'], { type: 'image/png' });
    const url = localAssetRegistry.register('images/logo.png', mockBlob);

    expect(url).toMatch(/^blob:/);
    expect(localAssetRegistry.resolveUrl('images/logo.png')).toBe(url);
    expect(localAssetRegistry.resolveUrl('./images/logo.png')).toBe(url);
    expect(localAssetRegistry.resolveUrl('/images/logo.png')).toBe(url);
  });

  it('transforms asset paths in HTML to blob URLs for iframe rendering', () => {
    const mockBlob = new Blob(['svg data'], { type: 'image/svg+xml' });
    const blobUrl = localAssetRegistry.register('assets/icon.svg', mockBlob);

    const originalHtml = '<img src="assets/icon.svg" alt="icon"><img src="https://example.com/ext.png">';
    const injectedHtml = localAssetRegistry.injectBlobUrls(originalHtml);

    expect(injectedHtml).toContain(`src="${blobUrl}"`);
    expect(injectedHtml).toContain('src="https://example.com/ext.png"');
  });

  it('restores original relative paths from blob URLs for clean non-destructive export', () => {
    const mockBlob = new Blob(['png data'], { type: 'image/png' });
    const blobUrl = localAssetRegistry.register('img/banner.jpg', mockBlob);

    const iframeHtml = `<div class="hero"><img src="${blobUrl}" alt="Hero Banner"></div>`;
    const restored = localAssetRegistry.restoreOriginalPaths(iframeHtml);

    expect(restored).not.toContain('blob:');
    expect(restored).toContain('<img src="img/banner.jpg" alt="Hero Banner">');
  });

  it('clears registry and revokes all object URLs', () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    const mockBlob = new Blob(['data'], { type: 'image/png' });
    localAssetRegistry.register('test.png', mockBlob);

    expect(localAssetRegistry.getEntries().size).toBe(1);
    localAssetRegistry.clear();
    expect(localAssetRegistry.getEntries().size).toBe(0);
    expect(revokeSpy).toHaveBeenCalled();
  });
});
