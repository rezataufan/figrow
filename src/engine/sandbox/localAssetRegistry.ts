/**
 * Local Asset Registry (Binary Asset Bridge)
 *
 * Enables 100% offline, native-fidelity rendering of local assets
 * (images, SVGs, web fonts, videos) inside sandboxed iframe artboards
 * by creating standard Blob Object URLs (`blob:...`).
 *
 * When exporting or saving to disk, `restoreOriginalPaths()` seamlessly
 * converts Blob URLs back to clean relative paths (e.g. `images/hero.jpg`),
 * ensuring non-destructive roundtrips.
 */

export interface LocalAssetEntry {
  path: string;
  blob: Blob;
  objectUrl: string;
}

function normalizePath(rawPath: string): string {
  return rawPath
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .trim();
}

class LocalAssetRegistry {
  private entries = new Map<string, LocalAssetEntry>();
  private urlToPath = new Map<string, string>();

  /**
   * Register a local binary file / blob under its project-relative path.
   */
  register(relPath: string, blob: Blob | File): string {
    const norm = normalizePath(relPath);

    // If already registered, revoke old URL
    const existing = this.entries.get(norm);
    if (existing) {
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        try {
          URL.revokeObjectURL(existing.objectUrl);
        } catch {
          // ignore
        }
      }
      this.urlToPath.delete(existing.objectUrl);
    }

    let objectUrl = '';
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      try {
        objectUrl = URL.createObjectURL(blob);
      } catch {
        objectUrl = `blob:figrow-asset/${norm}`;
      }
    } else {
      objectUrl = `blob:figrow-asset/${norm}`;
    }

    const entry: LocalAssetEntry = {
      path: norm,
      blob,
      objectUrl,
    };

    this.entries.set(norm, entry);
    this.urlToPath.set(objectUrl, norm);
    return objectUrl;
  }

  /**
   * Resolve a relative path to its registered Blob Object URL.
   */
  resolveUrl(relPath: string): string | null {
    const norm = normalizePath(relPath);
    const entry = this.entries.get(norm);
    return entry ? entry.objectUrl : null;
  }

  /**
   * Replaces local relative asset references (e.g. `src="images/hero.png"`, `url('fonts/custom.woff2')`)
   * with their live Blob Object URLs for rendering inside iframe artboards.
   */
  injectBlobUrls(content: string): string {
    if (this.entries.size === 0) return content;

    let result = content;
    for (const [normPath, entry] of this.entries.entries()) {
      // 1. Match HTML attributes: src="...", href="..."
      // Supports relative variants: 'path', './path', '/path'
      const escaped = normPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const attrRegex = new RegExp(`(src|href)=["'](?:\\.?\\/)?${escaped}(["'])`, 'gi');
      result = result.replace(attrRegex, `$1="${entry.objectUrl}$2`);

      // 2. Match CSS url(...)
      const cssRegex = new RegExp(`url\\(\\s*["']?(?:\\.?\\/)?${escaped}["']?\\s*\\)`, 'gi');
      result = result.replace(cssRegex, `url("${entry.objectUrl}")`);
    }

    return result;
  }

  /**
   * Replaces live Blob Object URLs back with their original relative paths
   * for saving to disk or exporting clean vanilla HTML.
   */
  restoreOriginalPaths(content: string): string {
    let result = content;
    for (const [objectUrl, originalPath] of this.urlToPath.entries()) {
      const escaped = objectUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'g');
      result = result.replace(regex, originalPath);
    }
    return result;
  }

  /**
   * Get all registered asset entries.
   */
  getEntries(): Map<string, LocalAssetEntry> {
    return new Map(this.entries);
  }

  /**
   * Clear all registered assets and revoke object URLs to free memory.
   */
  clear(): void {
    if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      for (const entry of this.entries.values()) {
        try {
          URL.revokeObjectURL(entry.objectUrl);
        } catch {
          // ignore
        }
      }
    }
    this.entries.clear();
    this.urlToPath.clear();
  }
}

export const localAssetRegistry = new LocalAssetRegistry();
