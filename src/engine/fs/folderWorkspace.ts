import { projectDoc, LOCAL_USER_ORIGIN } from '../doc/projectDoc';
import { instrumentUploadedHtml } from '../import/htmlImporter';
import { localAssetRegistry } from '../sandbox/localAssetRegistry';
import { useCanvasStore } from '../../store/canvasStore';
import { useSelectionStore } from '../../store/selectionStore';
import { useLayersStore } from '../../store/layersStore';
import { reloadArtboardsForFile } from '../ast/htmlAst';

export interface FolderLoadResult {
  ok: boolean;
  message: string;
  htmlFiles: string[];
  cssFiles: string[];
  assetCount: number;
}

// Stores active FileSystemDirectoryHandle for direct in-place disk writebacks (Task 6)
let activeDirectoryHandle: FileSystemDirectoryHandle | null = null;

export function getActiveDirectoryHandle(): FileSystemDirectoryHandle | null {
  return activeDirectoryHandle;
}

export function setActiveDirectoryHandle(handle: FileSystemDirectoryHandle | null): void {
  activeDirectoryHandle = handle;
}

const BINARY_ASSET_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'svg',
  'webp',
  'ico',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'mp4',
  'webm',
]);

/**
 * Normalizes relative paths by stripping any top-level folder prefix
 * commonly added by `webkitdirectory` (e.g. "my-project/index.html" -> "index.html").
 */
function cleanRelativePath(rawPath: string): string {
  const normalized = rawPath.replace(/\\/g, '/').replace(/^\.?\//, '');
  const slashIndex = normalized.indexOf('/');
  if (slashIndex !== -1) {
    return normalized.slice(slashIndex + 1);
  }
  return normalized;
}

/**
 * Ingests a collection of File objects (from webkitdirectory folder picker or multiple drag-and-drop).
 */
export async function loadFolderFromFiles(
  files: FileList | File[]
): Promise<FolderLoadResult> {
  const fileArray = Array.from(files);
  if (fileArray.length === 0) {
    return {
      ok: false,
      message: 'No files selected.',
      htmlFiles: [],
      cssFiles: [],
      assetCount: 0,
    };
  }

  // Determine whether files share a common folder prefix
  const paths = fileArray.map((f) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rel = (f as any).webkitRelativePath;
    return typeof rel === 'string' && rel.length > 0 ? rel : f.name;
  });

  const hasFolderPrefix = paths.every((p) => p.includes('/'));
  const normalizedFiles = fileArray.map((f, i) => {
    const raw = paths[i]!;
    const cleanPath = hasFolderPrefix ? cleanRelativePath(raw) : raw.replace(/\\/g, '/').replace(/^\.?\//, '');
    return { file: f, path: cleanPath };
  });

  const loadedHtml: string[] = [];
  const loadedCss: string[] = [];
  let assetCount = 0;

  projectDoc.undoManager.stopCapturing();
  projectDoc.ydoc.transact(() => {
    // Keep tracks of incoming updates
  }, LOCAL_USER_ORIGIN);

  for (const { file, path } of normalizedFiles) {
    const lower = path.toLowerCase();
    const ext = lower.split('.').pop() ?? '';

    if (lower.endsWith('.html') || lower.endsWith('.htm')) {
      const text = await file.text();
      const instrumented = instrumentUploadedHtml(text);
      projectDoc.registerFile(path, instrumented.html);
      loadedHtml.push(path);
    } else if (lower.endsWith('.css')) {
      const text = await file.text();
      projectDoc.registerFile(path, text);
      loadedCss.push(path);
    } else if (lower.endsWith('.js') || lower.endsWith('.json') || lower.endsWith('.txt')) {
      const text = await file.text();
      projectDoc.registerFile(path, text);
    } else if (BINARY_ASSET_EXTENSIONS.has(ext)) {
      localAssetRegistry.register(path, file);
      assetCount++;
    }
  }

  // Also verify css/styles.css is initialized
  if (!projectDoc.files.has('css/styles.css')) {
    projectDoc.registerFile('css/styles.css', '/* Figrow Studio Styles */\n');
  }

  const allHtml = projectDoc.getHtmlFiles();
  useCanvasStore.getState().setPageFiles(allHtml);

  // Switch to index.html if present, or first html file
  const preferredFile = allHtml.includes('index.html')
    ? 'index.html'
    : (allHtml[0] ?? 'index.html');

  useCanvasStore.getState().setActiveFile(preferredFile);
  useSelectionStore.getState().clearSelection();
  useLayersStore.getState().bumpRevision();
  useCanvasStore.getState().resetAllArtboardHeights();
  reloadArtboardsForFile(preferredFile);

  return {
    ok: true,
    message: `Loaded folder workspace: ${loadedHtml.length} HTML page(s), ${loadedCss.length} CSS file(s), ${assetCount} asset(s).`,
    htmlFiles: loadedHtml,
    cssFiles: loadedCss,
    assetCount,
  };
}

/**
 * Native File System Access API picker (`window.showDirectoryPicker`).
 */
export async function openFolderWorkspace(): Promise<FolderLoadResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof window !== 'undefined' && typeof (window as any).showDirectoryPicker === 'function') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dirHandle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
      });
      setActiveDirectoryHandle(dirHandle);

      // Recursively collect all files from directory handle
      const files: File[] = [];

      async function readDir(handle: FileSystemDirectoryHandle, prefix = ''): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for await (const entry of (handle as any).values()) {
          if (entry.kind === 'file') {
            const file: File = await entry.getFile();
            const relPath = prefix ? `${prefix}/${file.name}` : file.name;
            Object.defineProperty(file, 'webkitRelativePath', { value: relPath });
            files.push(file);
          } else if (entry.kind === 'directory') {
            // Skip common non-web directories
            if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.vscode') {
              continue;
            }
            await readDir(entry, prefix ? `${prefix}/${entry.name}` : entry.name);
          }
        }
      }

      await readDir(dirHandle);
      return await loadFolderFromFiles(files);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return {
          ok: false,
          message: 'Folder opening cancelled.',
          htmlFiles: [],
          cssFiles: [],
          assetCount: 0,
        };
      }
      throw err;
    }
  }

  return {
    ok: false,
    message: 'File System Access API not supported in this browser. Please use the folder file input fallback.',
    htmlFiles: [],
    cssFiles: [],
    assetCount: 0,
  };
}
