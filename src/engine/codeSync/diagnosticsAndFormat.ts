import * as parse5 from 'parse5';
import postcss from 'postcss';
import prettier from 'prettier/standalone';
import * as parserHtml from 'prettier/plugins/html';
import * as parserPostcss from 'prettier/plugins/postcss';
import { parseHtmlToVNodes, reloadArtboardsForFile } from '../ast/htmlAst';
import { canContain } from '../ast/contentModel';
import { projectDoc, LOCAL_USER_ORIGIN } from '../doc/projectDoc';
import { sandboxRegistry } from '../sandbox/iframeBridge';

/**
 * Diagnostics, Cursor<->AST Mapper, Quick-Fix & Prettier Formatter Engine
 * Aligned with:
 * - SYNC-01_AST_TO_CANVAS.md (Two-way AST <-> Monaco sync, Cursor <-> Selection sync)
 * - SYNC-02_FORMAT_DIAGNOSTICS.md (Prettier worker formatting, Minimal diff, Diagnostics & Quick-Fix)
 */

export interface CodeQuickFix {
  label: string;
  file: string;
  range: [number, number];
  insert: string;
}

export interface CodeDiagnostic {
  id: string;
  file: string;
  range: [number, number];
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info';
  source: 'html-parser' | 'css-parser' | 'content-model' | 'a11y';
  code: string;
  message: string;
  nodeKey?: string;
  quickFix?: CodeQuickFix;
}

export function offsetToLineCol(
  text: string,
  offset: number
): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(text.length, offset));
  let line = 1;
  let lastLineStart = 0;
  for (let i = 0; i < clamped; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lastLineStart = i + 1;
    }
  }
  return { line, column: clamped - lastLineStart + 1 };
}

export function lineColToOffset(
  text: string,
  line: number,
  column: number
): number {
  let curLine = 1;
  let i = 0;
  while (i < text.length && curLine < line) {
    if (text.charCodeAt(i) === 10) {
      curLine++;
    }
    i++;
  }
  return Math.min(text.length, Math.max(0, i + (column - 1)));
}

/**
 * Finds the deepest element VNode containing the character offset in an HTML file (F045).
 */
export function findNodeAtOffset(
  htmlFile: string,
  offset: number
): string | null {
  const html = projectDoc.getFileText(htmlFile);
  if (!html) return null;
  const parsed = parseHtmlToVNodes(htmlFile, html);

  let bestKey: string | null = null;
  let bestSpan = Infinity;

  for (const vnode of Object.values(parsed.nodes)) {
    if (vnode.type !== 'element' || vnode.key === 'n_body') continue;
    const [start, end] = vnode.range;
    if (offset >= start && offset <= end) {
      const span = end - start;
      if (span < bestSpan) {
        bestSpan = span;
        bestKey = vnode.key;
      }
    }
  }

  return bestKey;
}

/**
 * Returns the line/col and character range for a selected nodeKey in an HTML file (F045).
 */
export function findNodeSourceLocation(
  htmlFile: string,
  nodeKey: string
): {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
  range: [number, number];
} | null {
  const html = projectDoc.getFileText(htmlFile);
  if (!html) return null;
  const parsed = parseHtmlToVNodes(htmlFile, html);
  const vnode = parsed.nodes[nodeKey];
  if (!vnode) return null;

  const targetRange = vnode.startTagRange ?? vnode.range;
  const startPos = offsetToLineCol(html, targetRange[0]);
  const endPos = offsetToLineCol(html, targetRange[1]);

  return {
    startLine: startPos.line,
    startCol: startPos.column,
    endLine: endPos.line,
    endCol: endPos.column,
    range: targetRange,
  };
}

/**
 * Runs HTML5 parse5 error collection, Content Model validation, A11y checks, and PostCSS syntax checks (F046).
 */
export function analyzeProjectDiagnostics(): {
  diagnostics: CodeDiagnostic[];
  hasFatalError: boolean;
} {
  const diagnostics: CodeDiagnostic[] = [];
  let hasFatalError = false;

  // 1. Validate index.html
  const htmlFile = 'index.html';
  const html = projectDoc.getFileText(htmlFile);
  if (html) {
    parse5.parse(html, {
      sourceCodeLocationInfo: true,
      onParseError: (err) => {
        if (err.code === 'missing-doctype') return;
        hasFatalError = true;
        const startOffset = err.startOffset ?? 0;
        const endOffset = err.endOffset ?? startOffset + 1;
        diagnostics.push({
          id: `html-err-${startOffset}-${err.code}`,
          file: htmlFile,
          range: [startOffset, endOffset],
          line: err.startLine ?? 1,
          column: err.startCol ?? 1,
          severity: 'error',
          source: 'html-parser',
          code: err.code,
          message: `HTML Parse Error: ${err.code.replace(/-/g, ' ')}`,
        });
      },
    });

    // Content Model & Accessibility Audit on VNodes
    const parsed = parseHtmlToVNodes(htmlFile, html);
    for (const vnode of Object.values(parsed.nodes)) {
      if (vnode.type !== 'element' || !vnode.tag) continue;
      const pos = offsetToLineCol(html, vnode.range[0]);

      // Check parent-child HTML5 content model
      if (vnode.parent && vnode.parent !== 'n_root') {
        const parentNode = parsed.nodes[vnode.parent];
        if (parentNode?.tag) {
          const check = canContain(parentNode.tag, vnode.tag);
          if (!check.ok) {
            diagnostics.push({
              id: `cm-${vnode.key}`,
              file: htmlFile,
              range: vnode.startTagRange ?? vnode.range,
              line: pos.line,
              column: pos.column,
              severity: 'warning',
              source: 'content-model',
              code: 'invalid-nesting',
              message:
                check.reason ??
                `<${vnode.tag}> is not allowed inside <${parentNode.tag}>`,
              nodeKey: vnode.key,
            });
          }
        }
      }

      // A11y: <img> missing alt attribute
      if (vnode.tag === 'img') {
        const hasAlt = vnode.attrs.some((a) => a.name === 'alt');
        if (!hasAlt && vnode.startTagRange) {
          const insertPos = vnode.startTagRange[1] - 1;
          diagnostics.push({
            id: `a11y-img-alt-${vnode.key}`,
            file: htmlFile,
            range: vnode.startTagRange,
            line: pos.line,
            column: pos.column,
            severity: 'warning',
            source: 'a11y',
            code: 'img-alt',
            message: '<img> element is missing an "alt" attribute for screen readers.',
            nodeKey: vnode.key,
            quickFix: {
              label: 'Add alt="" attribute',
              file: htmlFile,
              range: [insertPos, insertPos],
              insert: ' alt="Descriptive image"',
            },
          });
        }
      }

      // Security/A11y: <a target="_blank"> without rel="noopener"
      if (vnode.tag === 'a') {
        const targetBlank = vnode.attrs.some(
          (a) => a.name === 'target' && a.value === '_blank'
        );
        const hasRel = vnode.attrs.some((a) => a.name === 'rel');
        if (targetBlank && !hasRel && vnode.startTagRange) {
          const insertPos = vnode.startTagRange[1] - 1;
          diagnostics.push({
            id: `sec-anchor-rel-${vnode.key}`,
            file: htmlFile,
            range: vnode.startTagRange,
            line: pos.line,
            column: pos.column,
            severity: 'info',
            source: 'a11y',
            code: 'target-blank-noopener',
            message: '<a target="_blank"> should include rel="noopener noreferrer".',
            nodeKey: vnode.key,
            quickFix: {
              label: 'Add rel="noopener noreferrer"',
              file: htmlFile,
              range: [insertPos, insertPos],
              insert: ' rel="noopener noreferrer"',
            },
          });
        }
      }
    }
  }

  // 2. Validate css/styles.css
  const cssFile = 'css/styles.css';
  const css = projectDoc.getFileText(cssFile);
  if (css) {
    try {
      postcss.parse(css, { from: cssFile });
    } catch (err: unknown) {
      hasFatalError = true;
      const cssErr = err as {
        line?: number;
        column?: number;
        reason?: string;
      };
      const line = cssErr.line ?? 1;
      const column = cssErr.column ?? 1;
      const offset = lineColToOffset(css, line, column);
      const reason = cssErr.reason ?? 'CSS Syntax Error';

      diagnostics.push({
        id: `css-err-${line}-${column}`,
        file: cssFile,
        range: [offset, Math.min(css.length, offset + 6)],
        line,
        column,
        severity: 'error',
        source: 'css-parser',
        code: 'css-syntax-error',
        message: `CSS Syntax Error: ${reason}`,
        quickFix: reason.toLowerCase().includes('unclosed')
          ? {
              label: 'Append closing }',
              file: cssFile,
              range: [css.length, css.length],
              insert: '\n}\n',
            }
          : undefined,
      });
    }
  }

  return { diagnostics, hasFatalError };
}

/**
 * Applies a minimal common-prefix/common-suffix diff to Y.Text so Yjs relative positions
 * and UndoManager history stay clean (SYNC-02 §2).
 */
export function applyMinimalTextDiff(
  file: string,
  nextText: string,
  syncCanvas = true
): boolean {
  const ytext = projectDoc.files.get(file);
  if (!ytext) return false;
  const prevText = ytext.toString();
  if (prevText === nextText) return false;

  let prefixLen = 0;
  const minLen = Math.min(prevText.length, nextText.length);
  while (
    prefixLen < minLen &&
    prevText.charCodeAt(prefixLen) === nextText.charCodeAt(prefixLen)
  ) {
    prefixLen++;
  }

  let prevSuffixIdx = prevText.length;
  let nextSuffixIdx = nextText.length;
  while (
    prevSuffixIdx > prefixLen &&
    nextSuffixIdx > prefixLen &&
    prevText.charCodeAt(prevSuffixIdx - 1) ===
      nextText.charCodeAt(nextSuffixIdx - 1)
  ) {
    prevSuffixIdx--;
    nextSuffixIdx--;
  }

  const deleteCount = prevSuffixIdx - prefixLen;
  const insertSlice = nextText.slice(prefixLen, nextSuffixIdx);

  projectDoc.ydoc.transact(() => {
    if (deleteCount > 0) {
      ytext.delete(prefixLen, deleteCount);
    }
    if (insertSlice.length > 0) {
      ytext.insert(prefixLen, insertSlice);
    }
  }, LOCAL_USER_ORIGIN);

  if (syncCanvas) {
    if (file.endsWith('.css')) {
      sandboxRegistry.broadcastPatch([
        { op: 'replaceSheet', file, cssText: nextText },
      ]);
    } else if (file.endsWith('.html')) {
      reloadArtboardsForFile(file);
    }
  }

  return true;
}

/**
 * Formats HTML or CSS with Prettier v3 standalone (`htmlWhitespaceSensitivity: 'css'`)
 * and commits minimal diff to Y.Text (F047 — SYNC-02_FORMAT_DIAGNOSTICS.md).
 */
export async function formatFileWithPrettier(file: string): Promise<boolean> {
  const raw = projectDoc.getFileText(file);
  if (!raw) return false;

  const isHtml = file.endsWith('.html');
  const formatted = await prettier.format(raw, {
    parser: isHtml ? 'html' : 'css',
    plugins: [parserHtml, parserPostcss],
    printWidth: 90,
    tabWidth: 2,
    useTabs: false,
    singleQuote: false,
    htmlWhitespaceSensitivity: 'css',
  });

  projectDoc.undoManager.stopCapturing();
  const changed = applyMinimalTextDiff(file, formatted, true);
  projectDoc.undoManager.stopCapturing();
  return changed;
}

/**
 * Applies a Quick-Fix edit from a diagnostic entry (SYNC-02 §1).
 */
export function applyDiagnosticQuickFix(fix: CodeQuickFix): void {
  const ytext = projectDoc.files.get(fix.file);
  if (!ytext) return;
  const [start, end] = fix.range;
  projectDoc.undoManager.stopCapturing();
  projectDoc.ydoc.transact(() => {
    if (end > start) {
      ytext.delete(start, end - start);
    }
    if (fix.insert) {
      ytext.insert(start, fix.insert);
    }
  }, LOCAL_USER_ORIGIN);
  projectDoc.undoManager.stopCapturing();

  if (fix.file.endsWith('.css')) {
    sandboxRegistry.broadcastPatch([
      { op: 'replaceSheet', file: fix.file, cssText: ytext.toString() },
    ]);
  } else {
    reloadArtboardsForFile(fix.file);
  }
}
