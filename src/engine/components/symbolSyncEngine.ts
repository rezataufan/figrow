import * as parse5 from 'parse5';
import type { NodeId } from '../types';
import { projectDoc, LOCAL_USER_ORIGIN } from '../doc/projectDoc';
import {
  commitElementAttributeMutation,
  parseHtmlToVNodes,
  reloadArtboardsForFile,
} from '../ast/htmlAst';
import { reconcileNavbarForPage } from './navbarSyncEngine';

/**
 * Universal Reusable Symbols / Master Components Engine
 * Inspired by GrapesJS `Symbols.ts` + Figma Master Components.
 * Allows any element (<header>, <footer>, <nav>, .card, .cta-banner, etc.)
 * to be promoted to a Master Symbol (`data-vds-symbol="symbol-id"`),
 * synchronized across all project HTML pages, or detached into an independent instance.
 */

export interface SymbolDescriptor {
  symbolId: string;
  tag: string;
  sourceFile: string;
  nodeId: NodeId;
  outerHtml: string;
  instancesCount: number;
  instanceFiles: string[];
}

export interface SymbolSyncResult {
  ok: boolean;
  symbolId: string;
  syncedCount: number;
  targetFiles: string[];
}

function slugifySymbolId(raw: string): string {
  return (
    raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || `sym-${Date.now().toString(36).slice(-4)}`
  );
}

interface LocatedSymbolNode {
  tag: string;
  symbolId: string;
  nodeId: string;
  outerHtml: string;
  startOffset: number;
  endOffset: number;
}

function findSymbolInHtml(
  html: string,
  matchSymbolId: string,
  fallbackSemanticTag?: string
): LocatedSymbolNode | null {
  if (!html || !html.trim()) return null;

  try {
    const doc = parse5.parse(html, { sourceCodeLocationInfo: true });
    let exactMatch: LocatedSymbolNode | null = null;
    let semanticMatch: LocatedSymbolNode | null = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function walk(node: any): void {
      if (!node || exactMatch) return;
      const tag = typeof node.tagName === 'string' ? node.tagName.toLowerCase() : null;

      if (tag && node.sourceCodeLocation) {
        const attrs: Array<{ name: string; value: string }> = Array.isArray(node.attrs)
          ? node.attrs
          : [];
        const symAttr = attrs.find((a) => a.name === 'data-vds-symbol')?.value?.trim();
        const idAttr = attrs.find((a) => a.name === 'data-vds-id')?.value?.trim() ?? '';
        const start = node.sourceCodeLocation.startOffset;
        const end = node.sourceCodeLocation.endOffset;

        if (typeof start === 'number' && typeof end === 'number') {
          if (symAttr === matchSymbolId) {
            exactMatch = {
              tag,
              symbolId: symAttr,
              nodeId: idAttr,
              outerHtml: html.slice(start, end),
              startOffset: start,
              endOffset: end,
            };
            return;
          }

          if (
            !semanticMatch &&
            fallbackSemanticTag &&
            tag === fallbackSemanticTag &&
            (tag === 'header' || tag === 'footer' || tag === 'nav')
          ) {
            semanticMatch = {
              tag,
              symbolId: matchSymbolId,
              nodeId: idAttr,
              outerHtml: html.slice(start, end),
              startOffset: start,
              endOffset: end,
            };
          }
        }
      }

      if (Array.isArray(node.childNodes)) {
        for (const ch of node.childNodes) {
          walk(ch);
        }
      }
    }

    walk(doc);
    return exactMatch ?? semanticMatch;
  } catch {
    return null;
  }
}

/**
 * Promote an element into a Master Symbol (`data-vds-symbol="<symbolId>"`)
 * and optionally synchronize it across all matching elements in the project.
 */
export function makeElementSymbol(
  file: string,
  nodeId: NodeId,
  customSymbolName?: string
): SymbolSyncResult {
  const html = projectDoc.getFileText(file);
  if (!html) {
    return { ok: false, symbolId: '', syncedCount: 0, targetFiles: [] };
  }

  const tree = parseHtmlToVNodes(file, html);
  const vnode = tree.nodes[nodeId];
  if (!vnode || !vnode.tag || vnode.tag === 'body' || vnode.tag === 'html') {
    return { ok: false, symbolId: '', syncedCount: 0, targetFiles: [] };
  }

  const existingSymbol = vnode.attrs.find((a) => a.name === 'data-vds-symbol')?.value;
  const firstClass = (vnode.attrs.find((a) => a.name === 'class')?.value ?? '')
    .split(/\s+/)
    .filter(Boolean)[0];

  const symbolId = slugifySymbolId(
    customSymbolName || existingSymbol || firstClass || `${vnode.tag}-symbol`
  );

  commitElementAttributeMutation(file, nodeId, 'data-vds-symbol', symbolId);

  const syncRes = syncSymbolAcrossProject(file, symbolId);
  return {
    ok: true,
    symbolId,
    syncedCount: syncRes.syncedCount,
    targetFiles: syncRes.targetFiles,
  };
}

/**
 * Detach an element from its Master Symbol (GrapesJS `detachSymbolInstance` equivalent)
 */
export function detachElementSymbol(file: string, nodeId: NodeId): boolean {
  return commitElementAttributeMutation(file, nodeId, 'data-vds-symbol', null);
}

/**
 * Synchronize a Symbol from `sourceFile` across all other HTML pages in the project.
 */
export function syncSymbolAcrossProject(
  sourceFile: string,
  symbolIdOrNodeId: string
): SymbolSyncResult {
  const sourceHtml = projectDoc.getFileText(sourceFile);
  if (!sourceHtml) {
    return { ok: false, symbolId: '', syncedCount: 0, targetFiles: [] };
  }

  const tree = parseHtmlToVNodes(sourceFile, sourceHtml);
  let targetSymbolId = symbolIdOrNodeId;
  let semanticTagFallback: string | undefined;

  // Check if caller passed a nodeId instead of a symbolId
  const byNodeId = tree.nodes[symbolIdOrNodeId];
  if (byNodeId) {
    const attrSym = byNodeId.attrs.find((a) => a.name === 'data-vds-symbol')?.value;
    if (attrSym) {
      targetSymbolId = attrSym;
    } else {
      const firstCls = (byNodeId.attrs.find((a) => a.name === 'class')?.value ?? '')
        .split(/\s+/)
        .filter(Boolean)[0];
      targetSymbolId = slugifySymbolId(firstCls || `${byNodeId.tag ?? 'block'}-symbol`);
      commitElementAttributeMutation(sourceFile, symbolIdOrNodeId, 'data-vds-symbol', targetSymbolId);
    }
    semanticTagFallback = byNodeId.tag;
  }

  const freshSourceHtml = projectDoc.getFileText(sourceFile);
  const sourceSymbol = findSymbolInHtml(freshSourceHtml, targetSymbolId, semanticTagFallback);
  if (!sourceSymbol) {
    return { ok: false, symbolId: targetSymbolId, syncedCount: 0, targetFiles: [] };
  }

  const allHtmlFiles = projectDoc.getHtmlFiles();
  const targetFiles: string[] = [];

  projectDoc.undoManager.stopCapturing();
  projectDoc.ydoc.transact(() => {
    for (const targetFile of allHtmlFiles) {
      if (targetFile === sourceFile) continue;

      const targetHtml = projectDoc.getFileText(targetFile);
      if (!targetHtml) continue;

      const targetMatch = findSymbolInHtml(
        targetHtml,
        sourceSymbol.symbolId,
        sourceSymbol.tag
      );
      if (!targetMatch) continue;

      let syncedMarkup = sourceSymbol.outerHtml;
      if (
        sourceSymbol.tag === 'nav' ||
        sourceSymbol.tag === 'header' ||
        sourceSymbol.symbolId.includes('nav')
      ) {
        syncedMarkup = reconcileNavbarForPage(syncedMarkup, targetFile);
      }

      const updatedTargetHtml =
        targetHtml.slice(0, targetMatch.startOffset) +
        syncedMarkup +
        targetHtml.slice(targetMatch.endOffset);

      projectDoc.registerFile(targetFile, updatedTargetHtml);
      targetFiles.push(targetFile);
    }
  }, LOCAL_USER_ORIGIN);
  projectDoc.undoManager.stopCapturing();

  for (const tf of targetFiles) {
    reloadArtboardsForFile(tf);
  }

  return {
    ok: true,
    symbolId: sourceSymbol.symbolId,
    syncedCount: targetFiles.length,
    targetFiles,
  };
}

/**
 * List all Master Symbols across all HTML files in the project
 */
export function listProjectSymbols(): SymbolDescriptor[] {
  const map = new Map<string, SymbolDescriptor>();
  const htmlFiles = projectDoc.getHtmlFiles();

  for (const file of htmlFiles) {
    const html = projectDoc.getFileText(file);
    if (!html) continue;
    const tree = parseHtmlToVNodes(file, html);

    for (const vnode of Object.values(tree.nodes)) {
      const symId = vnode.attrs.find((a) => a.name === 'data-vds-symbol')?.value?.trim();
      if (!symId) continue;

      const existing = map.get(symId);
      if (existing) {
        existing.instancesCount += 1;
        if (!existing.instanceFiles.includes(file)) {
          existing.instanceFiles.push(file);
        }
      } else {
        const [s, e] = vnode.range;
        map.set(symId, {
          symbolId: symId,
          tag: vnode.tag ?? 'div',
          sourceFile: file,
          nodeId: vnode.id,
          outerHtml: e > s ? html.slice(s, e) : '',
          instancesCount: 1,
          instanceFiles: [file],
        });
      }
    }
  }

  return Array.from(map.values());
}
