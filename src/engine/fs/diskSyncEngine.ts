import { zipSync, strToU8 } from 'fflate';
import { projectDoc } from '../doc/projectDoc';
import { localAssetRegistry } from '../sandbox/localAssetRegistry';
import { getActiveDirectoryHandle } from './folderWorkspace';

export interface SaveResult {
  ok: boolean;
  message: string;
  filesSaved?: number;
}

/**
 * Strips all Visual DOM Studio runtime markers without altering
 * original formatting, indentation, comments, or scripts.
 */
export function stripRuntimeStudioMarkers(html: string): string {
  if (!html) return '';

  let cleaned = html;

  // 1. Remove runtime agent and safety scripts
  cleaned = cleaned.replace(
    /\s*<script\b[^>]*data-vds-agent=["']true["'][^>]*>[\s\S]*?<\/script>/gi,
    ''
  );
  cleaned = cleaned.replace(
    /\s*<script\b[^>]*data-vds-safety=["']true["'][^>]*>[\s\S]*?<\/script>/gi,
    ''
  );

  // 2. Remove runtime base tag and internal style block
  cleaned = cleaned.replace(
    /\s*<base\b[^>]*href=["'][^"']*\/__vds_local\/["'][^>]*>/gi,
    ''
  );
  cleaned = cleaned.replace(
    /\s*<style\b[^>]*id=["']__vds_internal_style__['"][^>]*>[\s\S]*?<\/style>/gi,
    ''
  );

  // 3. Remove data-vds-* attributes from elements
  cleaned = cleaned.replace(/\s+data-vds-id=["'][^"']*["']/gi, '');
  cleaned = cleaned.replace(/\s+data-vds-hidden=["'][^"']*["']/gi, '');
  cleaned = cleaned.replace(/\s+data-vds-force=["'][^"']*["']/gi, '');
  cleaned = cleaned.replace(/\s+data-vds-editing=["'][^"']*["']/gi, '');

  // 4. Restore original asset paths from Blob Object URLs
  cleaned = localAssetRegistry.restoreOriginalPaths(cleaned);

  return cleaned;
}

/**
 * Resolves or creates a file handle nested in subdirectories.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getFileHandleForPath(dirHandle: any, relativePath: string): Promise<any> {
  const parts = relativePath.split('/').filter(Boolean);
  const fileName = parts.pop()!;
  let currentDir = dirHandle;

  for (const dirName of parts) {
    currentDir = await currentDir.getDirectoryHandle(dirName, { create: true });
  }

  return await currentDir.getFileHandle(fileName, { create: true });
}

/**
 * Saves all project files in-place directly back to disk using the File System Access API.
 */
export async function saveProjectToDisk(
  dirHandle?: FileSystemDirectoryHandle | null
): Promise<SaveResult> {
  const handle = dirHandle ?? getActiveDirectoryHandle();
  if (!handle) {
    return {
      ok: false,
      message: 'No project folder connected. Use "Export Project ZIP" or open a folder with "Open Folder".',
    };
  }

  try {
    let count = 0;

    // 1. Save text files (HTML, CSS, JS)
    for (const [filePath, yText] of projectDoc.files.entries()) {
      let content = yText.toString();
      if (filePath.endsWith('.html') || filePath.endsWith('.htm')) {
        content = stripRuntimeStudioMarkers(content);
      }
      const fileHandle = await getFileHandleForPath(handle, filePath);
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      count++;
    }

    // 2. Save binary assets
    for (const [assetPath, entry] of localAssetRegistry.getEntries().entries()) {
      const fileHandle = await getFileHandleForPath(handle, assetPath);
      const writable = await fileHandle.createWritable();
      await writable.write(entry.blob);
      await writable.close();
      count++;
    }

    return {
      ok: true,
      message: `Successfully saved ${count} file(s) directly to disk in-place!`,
      filesSaved: count,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      message: `Error writing to disk: ${errorMsg}`,
    };
  }
}

/**
 * Packages the entire clean project into a downloadable zip Blob.
 */
export async function exportCleanProjectZip(): Promise<Blob> {
  const zipData: Record<string, Uint8Array> = {};

  // 1. Pack projectDoc files
  for (const [filePath, yText] of projectDoc.files.entries()) {
    let content = yText.toString();
    if (filePath.endsWith('.html') || filePath.endsWith('.htm')) {
      content = stripRuntimeStudioMarkers(content);
    }
    zipData[filePath] = strToU8(content);
  }

  // 2. Pack local binary assets
  for (const [assetPath, entry] of localAssetRegistry.getEntries().entries()) {
    const arrayBuffer = await entry.blob.arrayBuffer();
    zipData[assetPath] = new Uint8Array(arrayBuffer);
  }

  const zipped = zipSync(zipData);
  return new Blob([zipped], { type: 'application/zip' });
}

/**
 * Triggers a browser file download for a Blob.
 */
export function triggerZipDownload(blob: Blob, fileName = 'project.zip'): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
