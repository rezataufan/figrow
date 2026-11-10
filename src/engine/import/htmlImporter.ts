import * as parse5 from 'parse5';
import * as Y from 'yjs';
import { projectDoc, LOCAL_USER_ORIGIN } from '../doc/projectDoc';
import { reloadArtboardsForFile } from '../ast/htmlAst';
import { sandboxRegistry } from '../sandbox/iframeBridge';
import { useCanvasStore } from '../../store/canvasStore';
import { useSelectionStore } from '../../store/selectionStore';
import { useLayersStore } from '../../store/layersStore';

/**
 * HTML & CSS Importer Engine (Pinegrow 10.1 Native Fidelity Mode)
 *
 * Ensures that any uploaded .html / .htm file renders 100% identically to opening
 * it directly in Chrome / Edge:
 * 1. Keeps all original `<style>`, `<link>`, `<meta>`, and `<script>` tags in their
 *    exact original positions in the HTML document (zero style stripping or reordering).
 * 2. Clears the studio's starter `css/styles.css` (unless the user also uploads `.css`
 *    files) so starter styles never leak into the uploaded page, while keeping
 *    `<link rel="stylesheet" href="css/styles.css">` right before `</head>` for any
 *    future edits made in the Visual CSS Inspector.
 * 3. Injects deterministic `data-vds-id="n_..."` attributes onto body elements so
 *    every element is selectable, draggable, and resizable on the canvas.
 */

export interface InstrumentedHtmlResult {
  html: string;
  elementCount: number;
}

export function instrumentUploadedHtml(rawHtml: string): InstrumentedHtmlResult {
  let cleanedHtml = rawHtml;

  // Ensure standard HTML document wrapper only if user uploaded a partial HTML snippet
  if (!/<html[\s>]/i.test(cleanedHtml) || !/<body[\s>]/i.test(cleanedHtml)) {
    cleanedHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Imported Page — Figrow Studio</title>
  <link rel="stylesheet" href="css/styles.css">
</head>
<body>
  <main data-vds-id="n_main">
${cleanedHtml.trim()}
  </main>
</body>
</html>`;
  } else if (!/href=["'](?:\.\/)?css\/styles\.css["']/i.test(cleanedHtml)) {
    if (/<\/head>/i.test(cleanedHtml)) {
      cleanedHtml = cleanedHtml.replace(
        /<\/head>/i,
        '  <link rel="stylesheet" href="css/styles.css">\n</head>'
      );
    }
  }

  // Parse with sourceCodeLocationInfo to inject data-vds-id attributes cleanly
  const doc = parse5.parse(cleanedHtml, { sourceCodeLocationInfo: true });
  const insertions: Array<{ offset: number; text: string }> = [];
  let counter = 0;
  let elementCount = 0;
  const usedIds = new Set<string>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function collectExistingIds(node: any): void {
    if (!node) return;
    if (Array.isArray(node.attrs)) {
      const existing = node.attrs.find(
        (a: { name: string; value: string }) => a.name === 'data-vds-id'
      );
      if (existing?.value) {
        usedIds.add(existing.value);
      }
    }
    if (Array.isArray(node.childNodes)) {
      for (const ch of node.childNodes) {
        collectExistingIds(ch);
      }
    }
  }
  collectExistingIds(doc);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function walkBody(node: any, insideBody: boolean): void {
    if (!node) return;
    const tag =
      typeof node.tagName === 'string' ? node.tagName.toLowerCase() : null;
    const nowInBody = insideBody || tag === 'body';

    if (
      tag &&
      nowInBody &&
      tag !== 'script' &&
      tag !== 'style' &&
      tag !== 'noscript'
    ) {
      elementCount += 1;
      const attrs: Array<{ name: string; value: string }> = Array.isArray(
        node.attrs
      )
        ? node.attrs
        : [];
      const hasVdsId = attrs.some((a) => a.name === 'data-vds-id');

      if (!hasVdsId && node.sourceCodeLocation?.startTag) {
        const startTagLoc = node.sourceCodeLocation.startTag;
        const startTagRaw = cleanedHtml.slice(
          startTagLoc.startOffset,
          startTagLoc.endOffset
        );
        const isSelfClosing = startTagRaw.endsWith('/>');
        const insertPos = isSelfClosing
          ? startTagLoc.endOffset - 2
          : startTagLoc.endOffset - 1;

        let newId: string;
        if (tag === 'body' && !usedIds.has('n_body')) {
          newId = 'n_body';
        } else if (tag === 'main' && !usedIds.has('n_main')) {
          newId = 'n_main';
        } else {
          do {
            counter += 1;
            newId = `n_${tag}_${counter}`;
          } while (usedIds.has(newId));
        }
        usedIds.add(newId);

        insertions.push({
          offset: insertPos,
          text: ` data-vds-id="${newId}"`,
        });
      }
    }

    if (Array.isArray(node.childNodes)) {
      for (const ch of node.childNodes) {
        walkBody(ch, nowInBody);
      }
    }
  }

  walkBody(doc, false);

  // Apply attribute insertions from back to front so character offsets stay exact
  insertions.sort((a, b) => b.offset - a.offset);
  let instrumentedHtml = cleanedHtml;
  for (const ins of insertions) {
    instrumentedHtml =
      instrumentedHtml.slice(0, ins.offset) +
      ins.text +
      instrumentedHtml.slice(ins.offset);
  }

  return {
    html: instrumentedHtml,
    elementCount,
  };
}

export async function importHtmlAndCssFiles(
  fileList: FileList | File[]
): Promise<{ ok: boolean; message: string }> {
  const files = Array.from(fileList);
  if (files.length === 0) {
    return { ok: false, message: 'No files selected.' };
  }

  let uploadedHtmlText: string | null = null;
  let uploadedHtmlName = 'index.html';
  const uploadedCssChunks: string[] = [];
  const uploadedCssByFilename = new Map<string, string>();

  for (const file of files) {
    const lower = file.name.toLowerCase();
    const text = await file.text();
    if (lower.endsWith('.html') || lower.endsWith('.htm')) {
      uploadedHtmlText = text;
      uploadedHtmlName = file.name;
    } else if (lower.endsWith('.css')) {
      uploadedCssChunks.push(`/* Imported from ${file.name} */\n${text.trim()}`);
      uploadedCssByFilename.set(file.name, text);
    }
  }

  if (uploadedHtmlText === null && uploadedCssChunks.length === 0) {
    return {
      ok: false,
      message: 'Please select a valid .html, .htm, or .css file.',
    };
  }

  // Detect any local relative <link rel="stylesheet" href="..."> and <script src="..."> in the uploaded HTML
  const linkedLocalAssets: string[] = [];
  if (uploadedHtmlText !== null) {
    const linkMatches = uploadedHtmlText.matchAll(
      /<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi
    );
    for (const m of linkMatches) {
      const tag = m[0] ?? '';
      const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
      if (!hrefMatch) continue;
      const rawHref = hrefMatch[1]!.trim();
      if (
        rawHref.startsWith('http://') ||
        rawHref.startsWith('https://') ||
        rawHref.startsWith('//') ||
        rawHref.startsWith('data:')
      ) {
        continue;
      }
      const cleanHref = rawHref.replace(/^\.?\//, '').split('?')[0]!.split('#')[0]!;
      if (cleanHref === 'css/styles.css') continue;
      linkedLocalAssets.push(cleanHref);
    }

    const scriptMatches = uploadedHtmlText.matchAll(
      /<script\b[^>]*src=["']([^"']+)["'][^>]*>/gi
    );
    for (const m of scriptMatches) {
      const rawSrc = (m[1] ?? '').trim();
      if (
        rawSrc &&
        !rawSrc.startsWith('http://') &&
        !rawSrc.startsWith('https://') &&
        !rawSrc.startsWith('//') &&
        !rawSrc.startsWith('data:')
      ) {
        linkedLocalAssets.push(rawSrc.replace(/^\.?\//, '').split('?')[0]!.split('#')[0]!);
      }
    }

    // Notify Vite's local project asset server so /__vds_local/<path> resolves from the matching project root
    // and auto-load any linked local .css files into projectDoc so the Visual Inspector has all CSS rules!
    if (linkedLocalAssets.length > 0 && typeof fetch === 'function') {
      try {
        const res = await fetch('/__vds_set_base', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            htmlName: uploadedHtmlName,
            linkedAssets: linkedLocalAssets,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            resolvedCssFiles?: Array<{ file: string; css: string }>;
          };
          if (Array.isArray(data.resolvedCssFiles)) {
            for (const entry of data.resolvedCssFiles) {
              if (entry.css && entry.css.trim()) {
                uploadedCssChunks.push(
                  `/* Auto-loaded from ${entry.file} */\n${entry.css.trim()}`
                );
                uploadedCssByFilename.set(entry.file, entry.css);
              }
            }
          }
        }
      } catch {
        // Ignore if running in static production preview without middleware
      }
    }
  }

  let totalElements = 0;

  projectDoc.undoManager.stopCapturing();
  projectDoc.ydoc.transact(() => {
    if (uploadedHtmlText !== null) {
      const instrumented = instrumentUploadedHtml(uploadedHtmlText);
      uploadedHtmlText = instrumented.html;
      totalElements = instrumented.elementCount;

      let yHtml = projectDoc.files.get('index.html');
      if (!yHtml) {
        yHtml = new Y.Text();
        projectDoc.files.set('index.html', yHtml);
      }
      yHtml.delete(0, yHtml.length);
      yHtml.insert(0, uploadedHtmlText);
      projectDoc.designMeta.clear();

      // Always reset css/styles.css when importing a new HTML page so the studio's
      // starter dark-theme CSS never leaks into the uploaded page!
      let yCss = projectDoc.files.get('css/styles.css');
      if (!yCss) {
        yCss = new Y.Text();
        projectDoc.files.set('css/styles.css', yCss);
      }
      yCss.delete(0, yCss.length);
      if (uploadedCssChunks.length > 0) {
        yCss.insert(0, `${uploadedCssChunks.join('\n\n')}\n`);
      } else {
        yCss.insert(0, `/* Visual Inspector overrides for ${uploadedHtmlName} */\n`);
      }

      // Also store any individually uploaded or auto-resolved .css files under their own filename
      for (const [cssName, cssContent] of uploadedCssByFilename.entries()) {
        if (cssName === 'css/styles.css') continue;
        let yExtra = projectDoc.files.get(cssName);
        if (!yExtra) {
          yExtra = new Y.Text();
          projectDoc.files.set(cssName, yExtra);
        }
        yExtra.delete(0, yExtra.length);
        yExtra.insert(0, cssContent);
      }
    } else if (uploadedCssChunks.length > 0) {
      let yCss = projectDoc.files.get('css/styles.css');
      if (!yCss) {
        yCss = new Y.Text();
        projectDoc.files.set('css/styles.css', yCss);
      }
      const existingCss = yCss.toString().trim();
      const nextCss = existingCss
        ? `${existingCss}\n\n${uploadedCssChunks.join('\n\n')}\n`
        : `${uploadedCssChunks.join('\n\n')}\n`;
      yCss.delete(0, yCss.length);
      yCss.insert(0, nextCss);

      for (const [cssName, cssContent] of uploadedCssByFilename.entries()) {
        if (cssName === 'css/styles.css') continue;
        let yExtra = projectDoc.files.get(cssName);
        if (!yExtra) {
          yExtra = new Y.Text();
          projectDoc.files.set(cssName, yExtra);
        }
        yExtra.delete(0, yExtra.length);
        yExtra.insert(0, cssContent);
      }
    }
  }, LOCAL_USER_ORIGIN);
  projectDoc.undoManager.stopCapturing();

  // Clear stale selection and reset artboards to standard browser viewport aspect ratios (1440×900, 768×1024, 375×812)
  useSelectionStore.getState().clearSelection();
  useLayersStore.getState().bumpRevision();
  useCanvasStore.getState().resetAllArtboardHeights();

  // Broadcast live full-document reload to all artboards
  const sheets = projectDoc.getStyleSheets();
  for (const s of sheets) {
    sandboxRegistry.broadcastPatch([
      { op: 'replaceSheet', file: s.file, cssText: s.css },
    ]);
  }
  reloadArtboardsForFile('index.html');

  if (uploadedHtmlText !== null) {
    return {
      ok: true,
      message: `Imported ${uploadedHtmlName}${uploadedCssChunks.length > 0 ? ` + ${uploadedCssChunks.length} CSS file(s)` : ''} (${totalElements} elements ready for visual editing)`,
    };
  }
  return {
    ok: true,
    message: `Imported ${uploadedCssChunks.length} CSS stylesheet(s) and applied to canvas!`,
  };
}
