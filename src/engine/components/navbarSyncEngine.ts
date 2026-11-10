import * as parse5 from 'parse5';
import { projectDoc, LOCAL_USER_ORIGIN } from '../doc/projectDoc';

export interface DetectedNavbar {
  tag: string;
  outerHtml: string;
  startOffset: number;
  endOffset: number;
}

export interface SyncSummary {
  syncedCount: number;
  targetFiles: string[];
}

let autoSyncEnabled = true;

export function isNavbarAutoSyncEnabled(): boolean {
  return autoSyncEnabled;
}

export function setNavbarAutoSync(enabled: boolean): void {
  autoSyncEnabled = enabled;
}

/**
 * Searches an HTML string for the primary navigation component
 * (<nav>, <header>, or container with .navbar, id="navbar", or role="navigation").
 */
export function detectNavbarInHtml(html: string): DetectedNavbar | null {
  if (!html || !html.trim()) return null;

  try {
    const doc = parse5.parse(html, { sourceCodeLocationInfo: true });
    let found: DetectedNavbar | null = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function walk(node: any): boolean {
      if (!node) return false;
      const tag = typeof node.tagName === 'string' ? node.tagName.toLowerCase() : null;

      if (tag && node.sourceCodeLocation) {
        const attrs: Array<{ name: string; value: string }> = Array.isArray(node.attrs) ? node.attrs : [];
        const classAttr = attrs.find((a) => a.name === 'class')?.value?.toLowerCase() ?? '';
        const idAttr = attrs.find((a) => a.name === 'id')?.value?.toLowerCase() ?? '';
        const roleAttr = attrs.find((a) => a.name === 'role')?.value?.toLowerCase() ?? '';

        const isNav =
          tag === 'nav' ||
          tag === 'header' ||
          classAttr.includes('navbar') ||
          classAttr.includes('nav-bar') ||
          classAttr.includes('main-nav') ||
          idAttr === 'navbar' ||
          idAttr === 'main-nav' ||
          roleAttr === 'navigation';

        if (isNav && node.sourceCodeLocation.startOffset !== undefined && node.sourceCodeLocation.endOffset !== undefined) {
          const start = node.sourceCodeLocation.startOffset;
          const end = node.sourceCodeLocation.endOffset;
          const snippet = html.slice(start, end);
          found = {
            tag,
            outerHtml: snippet,
            startOffset: start,
            endOffset: end,
          };
          return true; // Stop after first match
        }
      }

      if (Array.isArray(node.childNodes)) {
        for (const ch of node.childNodes) {
          if (walk(ch)) return true;
        }
      }
      return false;
    }

    walk(doc);
    return found;
  } catch {
    return null;
  }
}

/**
 * Reconciles navbar active links (.active, aria-current="page")
 * to match the target page URL.
 */
export function reconcileNavbarForPage(navbarHtml: string, targetPagePath: string): string {
  const normTarget = targetPagePath.replace(/\\/g, '/');
  const targetBaseName = normTarget.split('/').pop() ?? normTarget;

  // Process <a> tags
  return navbarHtml.replace(/<a\b([^>]*)>/gi, (fullTag, attrsStr: string) => {
    const hrefMatch = attrsStr.match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) return fullTag;

    const rawHref = hrefMatch[1]!.trim();
    const cleanHref = rawHref.replace(/^\.?\//, '').split('?')[0]!.split('#')[0]!;
    const hrefBaseName = cleanHref.split('/').pop() ?? cleanHref;

    const isMatch = hrefBaseName === targetBaseName;

    let updatedAttrs = attrsStr;

    // Handle class="... active ..."
    const classMatch = updatedAttrs.match(/class=["']([^"']+)["']/i);
    if (classMatch) {
      const classes = classMatch[1]!.split(/\s+/).filter(Boolean);
      const filtered = classes.filter((c) => c !== 'active');
      if (isMatch) {
        filtered.push('active');
      }
      updatedAttrs = updatedAttrs.replace(
        /class=["'][^"']+["']/i,
        `class="${filtered.join(' ')}"`
      );
    } else if (isMatch) {
      updatedAttrs += ' class="active"';
    }

    // Handle aria-current="page"
    updatedAttrs = updatedAttrs.replace(/\s*aria-current=["']page["']/gi, '');
    if (isMatch) {
      updatedAttrs += ' aria-current="page"';
    }

    return `<a${updatedAttrs}>`;
  });
}

/**
 * Synchronizes the navbar from a source HTML page across all other
 * HTML pages in the project.
 */
export function syncNavbarAcrossProject(sourceFile: string): SyncSummary {
  const sourceHtml = projectDoc.getFileText(sourceFile);
  if (!sourceHtml) {
    return { syncedCount: 0, targetFiles: [] };
  }

  const sourceNav = detectNavbarInHtml(sourceHtml);
  if (!sourceNav) {
    return { syncedCount: 0, targetFiles: [] };
  }

  const allHtmlFiles = projectDoc.getHtmlFiles();
  const targetFiles: string[] = [];

  projectDoc.undoManager.stopCapturing();
  projectDoc.ydoc.transact(() => {
    for (const targetFile of allHtmlFiles) {
      if (targetFile === sourceFile) continue;

      const targetHtml = projectDoc.getFileText(targetFile);
      if (!targetHtml) continue;

      const targetNav = detectNavbarInHtml(targetHtml);
      if (!targetNav) continue;

      const reconciledNav = reconcileNavbarForPage(sourceNav.outerHtml, targetFile);

      const updatedTargetHtml =
        targetHtml.slice(0, targetNav.startOffset) +
        reconciledNav +
        targetHtml.slice(targetNav.endOffset);

      projectDoc.registerFile(targetFile, updatedTargetHtml);
      targetFiles.push(targetFile);
    }
  }, LOCAL_USER_ORIGIN);

  return {
    syncedCount: targetFiles.length,
    targetFiles,
  };
}
