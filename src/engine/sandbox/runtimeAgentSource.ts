/**
 * Sandboxed Runtime Agent Bootstrapper (Pinegrow-style Native Document Loader)
 * Injected into each artboard <iframe sandbox="allow-same-origin allow-scripts allow-forms">.
 *
 * Key Architecture (aligned with Pinegrow 10.1 Chromium Page View):
 * 1. Natively renders the full HTML document in `srcDoc` so that all `<script>` tags
 *    (Tailwind Play CDN, Lucide, Alpine, Bootstrap, inline scripts), `<link>` stylesheets,
 *    `<style>` blocks, Google Fonts, and `localStorage` execute 100% identically to Chrome/Edge.
 * 2. Injects the non-intrusive Visual DOM Studio runtime agent at the end of the document
 *    to handle 60 FPS geometry measurement (`rects`), hit-testing (`hitTest`), transient CSS
 *    scrubbing (`transient`), pseudo-state forcing (`forceState`), and inline text editing.
 */

import { localAssetRegistry } from './localAssetRegistry';

export const PROTOCOL_VERSION = 1;

export function buildRuntimeAgentScript(
  artboardId: string,
  initialSheets: Array<{ file: string; css: string }> = []
): string {
  return `
(function() {
  if (window.__VDS_AGENT_ACTIVE__) return;
  window.__VDS_AGENT_ACTIVE__ = true;

  const ARTBOARD_ID = ${JSON.stringify(artboardId)};
  const PROTOCOL_VERSION = ${PROTOCOL_VERSION};
  const INITIAL_SHEETS = ${JSON.stringify(initialSheets)};
  let port = null;
  let frameCounter = 0;
  let trackedIds = [];
  let rafScheduled = false;
  let activeInlineId = null;
  const sheetRawCss = new Map();
  const transientBackup = new Map();
  const forcedStates = new Map();

  function collectAllPageCss() {
    let combined = '';
    sheetRawCss.forEach(function(raw) {
      combined += '\\n' + raw;
    });
    document.querySelectorAll('style:not(#__vds_internal_style__):not([data-vds-sheet])').forEach(function(st) {
      combined += '\\n' + (st.textContent || '');
    });
    return combined;
  }

  function rebuildInternalStyleTag() {
    if (!document.head) return;
    let internalEl = document.getElementById('__vds_internal_style__');
    if (!internalEl) {
      internalEl = document.createElement('style');
      internalEl.id = '__vds_internal_style__';
      document.head.appendChild(internalEl);
    }

    let css =
      ':root{--vds-vh:9px;} ' +
      'svg:not([width]):not([height]){max-width:100%;} ' +
      '[data-vds-hidden]{display:none !important;} ' +
      '[data-vds-editing="true"]{outline:2px solid #38bdf8 !important; outline-offset:2px !important; cursor:text !important;}';

    const allCss = collectAllPageCss();
    const ruleRegex = /([^{}@]+)\\{([^{}]+)\\}/g;
    let match;
    while ((match = ruleRegex.exec(allCss)) !== null) {
      const sel = match[1].trim();
      const body = match[2];
      if (
        sel.indexOf(':hover') !== -1 ||
        sel.indexOf(':focus-visible') !== -1 ||
        sel.indexOf(':focus') !== -1 ||
        sel.indexOf(':active') !== -1
      ) {
        const rewritten = sel
          .replace(/:focus-visible/g, '[data-vds-force~="focus-visible"]')
          .replace(/:hover/g, '[data-vds-force~="hover"]')
          .replace(/:focus/g, '[data-vds-force~="focus"]')
          .replace(/:active/g, '[data-vds-force~="active"]');
        css += '\\n' + rewritten + '{' + body + '}';
      }
    }

    internalEl.textContent = css;
  }

  function upsertSheetTag(file, cssText) {
    if (!document.head) return;
    sheetRawCss.set(file, cssText);
    let styleEl = document.querySelector('style[data-vds-sheet="' + CSS.escape(file) + '"]');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.setAttribute('data-vds-sheet', file);
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = cssText;
    rebuildInternalStyleTag();
    scheduleRectsReport();
    setTimeout(scheduleRectsReport, 60);
  }

  function parsePx(val) {
    const n = parseFloat(val || '0');
    return Number.isFinite(n) ? n : 0;
  }

  function computeContentHeight() {
    const docEl = document.documentElement;
    const body = document.body;
    if (!docEl || !body) return 900;

    const bodyCs = window.getComputedStyle(body);
    const docCs = window.getComputedStyle(docEl);
    if (
      bodyCs.overflow === 'hidden' ||
      bodyCs.overflowY === 'hidden' ||
      docCs.overflow === 'hidden' ||
      docCs.overflowY === 'hidden'
    ) {
      return 900;
    }

    const bodyRect = body.getBoundingClientRect();
    let maxChildBottom = 0;
    const children = body.children;
    for (let i = 0; i < children.length; i++) {
      const ch = children[i];
      const tag = ch.tagName ? ch.tagName.toLowerCase() : '';
      if (tag === 'script' || tag === 'style' || tag === 'noscript') continue;
      const chCs = window.getComputedStyle(ch);
      if (chCs.display === 'none' || chCs.position === 'fixed') continue;
      const r = ch.getBoundingClientRect();
      const mb = parsePx(chCs.marginBottom);
      const bottom = r.bottom - bodyRect.top + mb;
      if (bottom > maxChildBottom) {
        maxChildBottom = bottom;
      }
    }

    const padBottom = parsePx(bodyCs.paddingBottom) + parsePx(bodyCs.marginBottom);
    const measured = Math.round(maxChildBottom + padBottom);
    if (measured > 120) {
      return Math.min(Math.max(measured, 600), 8000);
    }
    return 900;
  }

  function isElementVisible(el) {
    let cur = el;
    while (cur && cur !== document.documentElement) {
      if (cur.hasAttribute && cur.hasAttribute('data-vds-hidden')) return false;
      const cs = window.getComputedStyle(cur);
      if (
        cs.display === 'none' ||
        cs.visibility === 'hidden' ||
        parseFloat(cs.opacity || '1') === 0
      ) {
        return false;
      }
      if (
        cur.classList &&
        cur.classList.contains('modal-overlay') &&
        !cur.classList.contains('active')
      ) {
        return false;
      }
      cur = cur.parentElement;
    }
    return true;
  }

  function measureElement(el, id, rootFontSize) {
    const r = el.getBoundingClientRect();
    const cs = window.getComputedStyle(el);
    const parentEl = el.parentElement;
    const parentId = parentEl ? parentEl.getAttribute('data-vds-id') : null;
    const parentRect = parentEl ? parentEl.getBoundingClientRect() : r;
    const classes = el.className && typeof el.className === 'string'
      ? el.className.trim().split(/\\s+/).filter(Boolean)
      : [];

    return {
      id: id,
      tag: el.tagName.toLowerCase(),
      classes: classes,
      parentId: parentId || null,
      display: cs.display || 'block',
      flexDirection: cs.flexDirection || 'row',
      gap: parsePx(cs.gap) || parsePx(cs.columnGap) || parsePx(cs.rowGap) || 0,
      fontSize: parsePx(cs.fontSize) || 16,
      rootFontSize: rootFontSize,
      parentWidth: parentRect.width || window.innerWidth,
      border: { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height },
      margin: {
        top: parsePx(cs.marginTop),
        right: parsePx(cs.marginRight),
        bottom: parsePx(cs.marginBottom),
        left: parsePx(cs.marginLeft)
      },
      padding: {
        top: parsePx(cs.paddingTop),
        right: parsePx(cs.paddingRight),
        bottom: parsePx(cs.paddingBottom),
        left: parsePx(cs.paddingLeft)
      }
    };
  }

  let hydrateTimer = null;

  function scheduleHydratedDomReport() {
    if (ARTBOARD_ID !== 'ab_desktop') return;
    if (hydrateTimer) clearTimeout(hydrateTimer);
    hydrateTimer = setTimeout(function() {
      hydrateTimer = null;
      if (!port || !document.body) return;
      const clone = document.body.cloneNode(true);
      clone.querySelectorAll('script[data-vds-agent="true"]').forEach(function(sc) {
        sc.remove();
      });
      port.postMessage({
        t: 'domHydrated',
        bodyHtml: clone.innerHTML
      });
    }, 180);
  }

  function ensureEveryBodyElementHasId() {
    if (!document.body) return false;
    if (!document.body.getAttribute('data-vds-id')) {
      document.body.setAttribute('data-vds-id', 'n_body');
    }
    let autoIdx = 1;
    let mintedNewAuto = false;
    const allEls = document.body.querySelectorAll('*');
    for (let i = 0; i < allEls.length; i++) {
      const el = allEls[i];
      const tag = el.tagName ? el.tagName.toLowerCase() : '';
      if (tag === 'script' || tag === 'style' || tag === 'noscript') continue;
      if (!el.getAttribute('data-vds-id')) {
        while (document.querySelector('[data-vds-id="n_auto_' + autoIdx + '"]')) {
          autoIdx += 1;
        }
        el.setAttribute('data-vds-id', 'n_auto_' + autoIdx);
        autoIdx += 1;
        mintedNewAuto = true;
      }
    }
    if (mintedNewAuto) {
      scheduleHydratedDomReport();
    }
    return mintedNewAuto;
  }

  function scheduleRectsReport() {
    if (rafScheduled || !port) return;
    rafScheduled = true;
    requestAnimationFrame(function() {
      rafScheduled = false;
      if (!port || !document.body) return;
      frameCounter += 1;
      ensureEveryBodyElementHasId();
      const rootFontSize = parsePx(window.getComputedStyle(document.documentElement).fontSize) || 16;
      const items = [];
      const explicitSet = new Set(trackedIds);
      const targets = trackedIds.length > 0
        ? trackedIds
        : Array.from(document.querySelectorAll('[data-vds-id]')).map(function(n) { return n.getAttribute('data-vds-id'); }).filter(Boolean);

      for (let i = 0; i < targets.length; i++) {
        const id = targets[i];
        const el = document.querySelector('[data-vds-id="' + CSS.escape(id) + '"]');
        if (el) {
          if (id !== 'n_body' && !explicitSet.has(id) && !isElementVisible(el)) {
            continue;
          }
          const m = measureElement(el, id, rootFontSize);
          if (id !== 'n_body' && !explicitSet.has(id) && m.border.width <= 0 && m.border.height <= 0) {
            continue;
          }
          items.push(m);
        }
      }
      port.postMessage({
        t: 'rects',
        frame: frameCounter,
        contentHeight: computeContentHeight(),
        items: items
      });
    });
  }

  function loadDocument(msg) {
    // Synchronize both <head> styles/links and <body> when dynamically replaced via MessageChannel
    const parser = new DOMParser();
    const parsed = parser.parseFromString(msg.html || '', 'text/html');

    if (parsed.head && document.head) {
      document.head
        .querySelectorAll('style:not(#__vds_internal_style__):not([data-vds-sheet]), link[rel="stylesheet"]')
        .forEach(function(oldNode) {
          oldNode.remove();
        });

      parsed.head
        .querySelectorAll('style, link[rel="stylesheet"], link[rel="preconnect"], meta')
        .forEach(function(node) {
          if (node.tagName.toLowerCase() === 'link') {
            const href = (node.getAttribute('href') || '').trim();
            if (
              href &&
              !href.startsWith('http://') &&
              !href.startsWith('https://') &&
              !href.startsWith('//') &&
              !href.startsWith('data:')
            ) {
              return;
            }
          }
          document.head.appendChild(node.cloneNode(true));
        });
    }

    if (Array.isArray(msg.sheets)) {
      msg.sheets.forEach(function(entry) {
        if (entry.css && entry.css.trim()) {
          upsertSheetTag(entry.file, entry.css);
        } else {
          const old = document.querySelector('style[data-vds-sheet="' + CSS.escape(entry.file) + '"]');
          if (old) old.remove();
          sheetRawCss.delete(entry.file);
        }
      });
    }

    if (parsed.body && document.body) {
      document.body.innerHTML = parsed.body.innerHTML;
      Array.from(document.body.attributes).forEach(function(attr) {
        if (attr.name !== 'data-vds-id') {
          document.body.removeAttribute(attr.name);
        }
      });
      Array.from(parsed.body.attributes).forEach(function(attr) {
        document.body.setAttribute(attr.name, attr.value);
      });
    }
    ensureEveryBodyElementHasId();
    rebuildInternalStyleTag();
    scheduleRectsReport();
    setTimeout(scheduleRectsReport, 120);
    setTimeout(scheduleRectsReport, 450);
  }

  function applyPatchOp(op) {
    if (op.op === 'replaceSheet') {
      upsertSheetTag(op.file, op.cssText);
      scheduleRectsReport();
      setTimeout(scheduleRectsReport, 60);
      return;
    }
    if (op.op === 'setAttr') {
      const el = document.querySelector('[data-vds-id="' + CSS.escape(op.id) + '"]');
      if (!el) return;
      if (op.name === 'style') {
        transientBackup.delete(op.id);
      }
      if (op.value === null) el.removeAttribute(op.name);
      else el.setAttribute(op.name, op.value);
      scheduleRectsReport();
      setTimeout(scheduleRectsReport, 60);
      return;
    }
    if (op.op === 'setText') {
      const el = document.querySelector('[data-vds-id="' + CSS.escape(op.id) + '"]');
      if (el) el.textContent = op.text;
      scheduleRectsReport();
      setTimeout(scheduleRectsReport, 60);
      return;
    }
    if (op.op === 'setInnerHtml') {
      const el = document.querySelector('[data-vds-id="' + CSS.escape(op.id) + '"]');
      if (el) el.innerHTML = op.html;
      scheduleRectsReport();
      setTimeout(scheduleRectsReport, 60);
      return;
    }
    if (op.op === 'remove') {
      const el = document.querySelector('[data-vds-id="' + CSS.escape(op.id) + '"]');
      if (el) el.remove();
      scheduleRectsReport();
      setTimeout(scheduleRectsReport, 60);
      return;
    }
    if (op.op === 'move') {
      const el = document.querySelector('[data-vds-id="' + CSS.escape(op.id) + '"]');
      const parent = document.querySelector('[data-vds-id="' + CSS.escape(op.parentId) + '"]');
      if (!el || !parent) return;
      const before = op.beforeId
        ? document.querySelector('[data-vds-id="' + CSS.escape(op.beforeId) + '"]')
        : null;
      parent.insertBefore(el, before);
      scheduleRectsReport();
      setTimeout(scheduleRectsReport, 60);
      return;
    }
    if (op.op === 'insert') {
      const parent = document.querySelector('[data-vds-id="' + CSS.escape(op.parentId) + '"]');
      if (!parent) return;
      const tpl = document.createElement('template');
      tpl.innerHTML = op.html.trim();
      const node = tpl.content.firstElementChild;
      if (!node) return;
      const before = op.beforeId
        ? document.querySelector('[data-vds-id="' + CSS.escape(op.beforeId) + '"]')
        : null;
      parent.insertBefore(node, before);
      scheduleRectsReport();
      setTimeout(scheduleRectsReport, 60);
    }
  }

  function applyTransient(id, styleRecord) {
    const el = document.querySelector('[data-vds-id="' + CSS.escape(id) + '"]');
    if (!el) return;
    if (!transientBackup.has(id)) {
      transientBackup.set(id, el.getAttribute('style'));
    }
    Object.keys(styleRecord).forEach(function(prop) {
      el.style.setProperty(prop, styleRecord[prop], 'important');
    });
    scheduleRectsReport();
  }

  function clearTransient(id, revert) {
    if (id) {
      const el = document.querySelector('[data-vds-id="' + CSS.escape(id) + '"]');
      if (el && transientBackup.has(id)) {
        if (revert) {
          const prev = transientBackup.get(id);
          if (prev === null) el.removeAttribute('style');
          else el.setAttribute('style', prev);
        }
      }
      transientBackup.delete(id);
    } else {
      transientBackup.forEach(function(prev, nodeId) {
        if (revert) {
          const el = document.querySelector('[data-vds-id="' + CSS.escape(nodeId) + '"]');
          if (el) {
            if (prev === null) el.removeAttribute('style');
            else el.setAttribute('style', prev);
          }
        }
      });
      transientBackup.clear();
    }
    scheduleRectsReport();
  }

  function handleHitTest(x, y) {
    ensureEveryBodyElementHasId();
    const els = document.elementsFromPoint(x, y);
    const path = [];
    let topHit = null;
    let topEl = null;
    for (let i = 0; i < els.length; i++) {
      const candidate = els[i];
      if (!candidate || !candidate.getAttribute) continue;
      if (!isElementVisible(candidate)) continue;
      const id = candidate.getAttribute('data-vds-id');
      if (id && id !== 'n_body') {
        topHit = id;
        topEl = candidate;
        break;
      }
    }
    if (topEl) {
      let cur = topEl;
      while (cur && cur !== document.body && cur !== document.documentElement) {
        const cid = cur.getAttribute && cur.getAttribute('data-vds-id');
        if (cid && cid !== 'n_body') {
          path.push(cid);
        }
        cur = cur.parentElement;
      }
    }
    if (port) {
      port.postMessage({ t: 'hit', id: topHit, path: path, x: x, y: y });
    }
  }

  function startInlineEdit(id) {
    if (activeInlineId && activeInlineId !== id) {
      commitInlineEdit(activeInlineId);
    }
    const el = document.querySelector('[data-vds-id="' + CSS.escape(id) + '"]');
    if (!el) return;
    activeInlineId = id;
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('data-vds-editing', 'true');
    el.focus();

    const onKeyDown = function(ev) {
      if (ev.key === 'Escape' || (ev.key === 'Enter' && !ev.shiftKey)) {
        ev.preventDefault();
        el.blur();
      }
    };
    const onBlur = function() {
      el.removeEventListener('keydown', onKeyDown);
      el.removeEventListener('blur', onBlur);
      commitInlineEdit(id);
    };
    el.addEventListener('keydown', onKeyDown);
    el.addEventListener('blur', onBlur);
  }

  function execInlineFormat(id, command, value) {
    const el = document.querySelector('[data-vds-id="' + CSS.escape(id) + '"]');
    if (!el) return;
    el.focus();
    try {
      if (command === 'code') {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
          const range = sel.getRangeAt(0);
          const codeEl = document.createElement('code');
          codeEl.appendChild(range.extractContents());
          range.insertNode(codeEl);
        }
      } else if (command === 'createLink') {
        document.execCommand('createLink', false, value || '#');
      } else {
        document.execCommand(command, false, value || undefined);
      }
    } catch (_e) {
      // Ignore formatting errors in unsupported contexts
    }
    scheduleRectsReport();
  }

  function commitInlineEdit(id) {
    const el = document.querySelector('[data-vds-id="' + CSS.escape(id) + '"]');
    if (!el) return;
    el.removeAttribute('contenteditable');
    el.removeAttribute('data-vds-editing');
    if (activeInlineId === id) activeInlineId = null;
    if (port) {
      port.postMessage({
        t: 'inlineTextCommitted',
        id: id,
        text: el.textContent || '',
        innerHtml: el.innerHTML || ''
      });
    }
    scheduleRectsReport();
  }

  function onHostMessage(ev) {
    const msg = ev.data;
    if (!msg || typeof msg.t !== 'string') return;

    switch (msg.t) {
      case 'load':
        loadDocument(msg);
        break;
      case 'patch':
        if (Array.isArray(msg.ops)) {
          msg.ops.forEach(applyPatchOp);
        }
        if (port) {
          port.postMessage({ t: 'ack', seq: msg.seq, contentHeight: computeContentHeight() });
        }
        scheduleRectsReport();
        break;
      case 'transient':
        applyTransient(msg.id, msg.style || {});
        break;
      case 'clearTransient':
        clearTransient(msg.id, !!msg.revert);
        break;
      case 'measure':
        trackedIds = Array.isArray(msg.ids) ? msg.ids : [];
        scheduleRectsReport();
        break;
      case 'hitTest':
        handleHitTest(msg.x, msg.y);
        break;
      case 'forceState': {
        forcedStates.forEach(function(_, prevId) {
          const prevEl = document.querySelector('[data-vds-id="' + CSS.escape(prevId) + '"]');
          if (prevEl) prevEl.removeAttribute('data-vds-force');
        });
        forcedStates.clear();
        if (msg.id && Array.isArray(msg.states) && msg.states.length > 0) {
          const el = document.querySelector('[data-vds-id="' + CSS.escape(msg.id) + '"]');
          if (el) {
            const tokens = msg.states.map(function(st) { return st.replace(/^:+/, ''); }).join(' ');
            el.setAttribute('data-vds-force', tokens);
            forcedStates.set(msg.id, msg.states);
          }
        }
        scheduleRectsReport();
        break;
      }
      case 'startInlineEdit':
        startInlineEdit(msg.id);
        break;
      case 'commitInlineEdit':
        commitInlineEdit(msg.id);
        break;
      case 'execInlineFormat':
        execInlineFormat(msg.id, msg.command, msg.value);
        break;
    }
  }

  function initInitialSheets() {
    ensureEveryBodyElementHasId();
    if (Array.isArray(INITIAL_SHEETS)) {
      INITIAL_SHEETS.forEach(function(entry) {
        if (entry.css && entry.css.trim()) {
          upsertSheetTag(entry.file, entry.css);
        }
      });
    }
    rebuildInternalStyleTag();
    if (document.body) {
      document.body.addEventListener('click', function(ev) {
        const a = ev.target && ev.target.closest ? ev.target.closest('a') : null;
        if (a && a.getAttribute('href') && a.getAttribute('href').indexOf('#') !== 0) {
          ev.preventDefault();
        }
      }, true);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initInitialSheets);
  } else {
    initInitialSheets();
  }

  function sendHelloToParent() {
    window.parent.postMessage({ t: 'hello', v: PROTOCOL_VERSION, artboardId: ARTBOARD_ID }, '*');
  }

  window.addEventListener('message', function(ev) {
    if (!ev.data) return;
    if (ev.data.t === 'initPort' && ev.ports && ev.ports[0]) {
      if (port) {
        try { port.close(); } catch (e) {}
      }
      port = ev.ports[0];
      port.onmessage = onHostMessage;
      port.start();
      scheduleRectsReport();
      if (document.body && document.body.querySelector('[data-vds-id^="n_auto_"]')) {
        scheduleHydratedDomReport();
      }
      setTimeout(scheduleRectsReport, 150);
      setTimeout(scheduleRectsReport, 500);
    } else if (ev.data.t === 'requestHello') {
      sendHelloToParent();
    }
  });

  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(function() { scheduleRectsReport(); });
    ro.observe(document.documentElement);
  }
  if ('MutationObserver' in window) {
    const attachMo = function() {
      if (!document.body) return;
      const mo = new MutationObserver(function() {
        scheduleRectsReport();
      });
      mo.observe(document.body, { childList: true, subtree: true });
    };
    if (document.body) {
      attachMo();
    } else {
      window.addEventListener('DOMContentLoaded', attachMo);
    }
  }
  window.addEventListener('resize', scheduleRectsReport);
  window.addEventListener('load', function() {
    scheduleRectsReport();
    setTimeout(scheduleRectsReport, 250);
  });

  sendHelloToParent();
})();
`;
}

/**
 * Builds a complete, browser-native HTML document for `iframe.srcDoc`
 * (Pinegrow 10.1 Live Page View pattern):
 * - Preserves the user's exact `<!DOCTYPE html>`, `<html>`, `<head>`, `<style>`,
 *   external `<link>` CDNs, and `<script>` tags so the browser executes them natively.
 * - Replaces local relative `<link rel="stylesheet" href="css/styles.css">` with inline
 *   `<style data-vds-sheet="css/styles.css">` in the exact same DOM position so cascade
 *   order is 100% identical to opening the file directly in Chrome/Edge.
 * - Appends the lightweight Visual DOM Studio runtime agent script before `</body>`.
 */
export function buildSandboxSrcDoc(
  artboardId: string,
  rawHtml?: string,
  sheets: Array<{ file: string; css: string }> = []
): string {
  const html =
    rawHtml ??
    `<!doctype html><html><head><meta charset="utf-8"></head><body data-vds-id="n_body"></body></html>`;

  const sheetLookup = new Map<string, string>();
  const basenameLookup = new Map<string, { file: string; css: string }>();
  for (const s of sheets) {
    const cleanPath = s.file.replace(/^\.?\//, '');
    sheetLookup.set(cleanPath, s.css);
    const base = cleanPath.split('/').pop() ?? cleanPath;
    if (!basenameLookup.has(base) || s.css.trim().length > 0) {
      basenameLookup.set(base, { file: cleanPath, css: s.css });
    }
  }

  const injectedSheets = new Set<string>();

  // Mask inline <script> bodies (including <script type="text/babel">) before running
  // HTML tag regexes so HTML strings inside JS template literals (e.g. popup window.print()
  // templates containing `<style>...</style></body></html>`) are never corrupted!
  const inlineScriptContents: string[] = [];
  let processedHtml = html.replace(
    /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi,
    (fullMatch, openTag: string, innerJs: string, closeTag: string) => {
      if (!innerJs.trim()) return fullMatch;
      const token = `__VDS_INLINE_SCRIPT_${inlineScriptContents.length}__`;
      inlineScriptContents.push(innerJs);
      return `${openTag}${token}${closeTag}`;
    }
  );

  // Inject any registered offline binary Blob URLs (images, fonts, media)
  processedHtml = localAssetRegistry.injectBlobUrls(processedHtml);

  // Replace local <link rel="stylesheet" href="..."> in-place with <style data-vds-sheet="...">
  // so cascade order relative to Google Fonts, Tailwind, or inline <style> is 100% preserved!
  processedHtml = processedHtml.replace(
    /<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi,
    (fullLinkTag) => {
      const hrefMatch = fullLinkTag.match(/href=["']([^"']+)["']/i);
      if (!hrefMatch) return fullLinkTag;
      const rawHref = hrefMatch[1]!.trim();
      if (
        rawHref.startsWith('http://') ||
        rawHref.startsWith('https://') ||
        rawHref.startsWith('//') ||
        rawHref.startsWith('data:')
      ) {
        return fullLinkTag;
      }
      const normalizedHref = rawHref.replace(/^\.?\//, '').split('?')[0]!.split('#')[0]!;
      const matchedCss = sheetLookup.get(normalizedHref);
      if (matchedCss !== undefined) {
        injectedSheets.add(normalizedHref);
        if (!matchedCss.trim()) return '';
        return `<style data-vds-sheet="${normalizedHref}">\n${matchedCss}\n</style>`;
      }
      const base = normalizedHref.split('/').pop() ?? normalizedHref;
      const byBase = basenameLookup.get(base);
      if (byBase && byBase.css.trim().length > 0) {
        injectedSheets.add(byBase.file);
        return `<style data-vds-sheet="${byBase.file}">\n${byBase.css}\n</style>`;
      }
      if (normalizedHref === 'css/styles.css') {
        return '';
      }
      // Rewrite local relative stylesheet link to /__vds_local/<path> so Vite's local
      // project asset server resolves sibling/nested CSS & font files seamlessly!
      return fullLinkTag.replace(
        /href=["']([^"']+)["']/i,
        () => `href="/__vds_local/${normalizedHref}"`
      );
    }
  );

  // Also rewrite local relative <script src="..."> and <img src="..."> to /__vds_local/<path>
  // so multi-file HTML apps load their local JS, icons, and images seamlessly!
  processedHtml = processedHtml.replace(
    /<(script|img)\b([^>]*?)\bsrc=["']([^"']+)["']([^>]*)>/gi,
    (fullTag, tagName: string, beforeSrc: string, rawSrc: string, afterSrc: string) => {
      const trimmed = rawSrc.trim();
      if (
        trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('//') ||
        trimmed.startsWith('data:') ||
        trimmed.startsWith('blob:') ||
        trimmed.startsWith('/__vds_local/')
      ) {
        return fullTag;
      }
      const normalizedSrc = trimmed.replace(/^[./]+/, '');
      const localBlob = localAssetRegistry.resolveUrl(normalizedSrc);
      if (localBlob) {
        return `<${tagName}${beforeSrc}src="${localBlob}"${afterSrc}>`;
      }
      return `<${tagName}${beforeSrc}src="/__vds_local/${normalizedSrc}"${afterSrc}>`;
    }
  );

  // Inject <base href="http://localhost:5173/__vds_local/"> so all relative & root-relative
  // links, scripts, fonts, images, and fetch() calls inside about:srcdoc resolve against the host!
  // Also suppress window.alert() popups inside the design canvas iframe.
  const hostOrigin =
    typeof window !== 'undefined' &&
    window.location?.origin &&
    window.location.origin !== 'null'
      ? window.location.origin
      : 'http://localhost:5173';
  const safetyHeadInjection = `<base href="${hostOrigin}/__vds_local/">
  <script data-vds-safety="true">
    window.alert = function(msg) { console.warn('[Sandbox Alert Suppressed]:', msg); };
  </script>`;
  if (/<head\b[^>]*>/i.test(processedHtml)) {
    processedHtml = processedHtml.replace(
      /(<head\b[^>]*>)/i,
      (_m, headOpenTag: string) => `${headOpenTag}\n${safetyHeadInjection}`
    );
  } else {
    processedHtml = `${safetyHeadInjection}\n${processedHtml}`;
  }

  // Normalize vh/dvh/svh/lvh units inside <style> blocks to use var(--vds-vh, 9px)
  // so 100vh equals a real 900px desktop browser window instead of causing an infinite
  // height feedback loop when the artboard expands to full page height!
  processedHtml = processedHtml.replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_m, openTag: string, cssBody: string, closeTag: string) => {
      const normalizedCss = cssBody.replace(
        /(-?\d+(?:\.\d+)?)\s*(?:d|s|l)?vh\b/gi,
        'calc($1 * var(--vds-vh, 9px))'
      );
      return `${openTag}${normalizedCss}${closeTag}`;
    }
  );

  // Any remaining non-empty project stylesheets not referenced by a <link> tag
  const remainingSheets = sheets.filter(
    (s) =>
      !injectedSheets.has(s.file.replace(/^\.?\//, '')) &&
      s.css.trim().length > 0
  );

  const agentScript = buildRuntimeAgentScript(artboardId, remainingSheets);
  const agentTag = `<script data-vds-agent="true">${agentScript}</script>`;

  // Inject agentTag before the LAST </body> tag while inline scripts are still masked
  const lastBodyCloseIdx = processedHtml.toLowerCase().lastIndexOf('</body>');
  if (lastBodyCloseIdx !== -1) {
    processedHtml =
      processedHtml.slice(0, lastBodyCloseIdx) +
      `${agentTag}\n` +
      processedHtml.slice(lastBodyCloseIdx);
  } else {
    processedHtml += `\n${agentTag}`;
  }

  // Restore all masked inline <script> contents verbatim (using replacer fn to avoid $ patterns)
  if (inlineScriptContents.length > 0) {
    processedHtml = processedHtml.replace(
      /__VDS_INLINE_SCRIPT_(\d+)__/g,
      (_m, idxStr: string) => inlineScriptContents[Number(idxStr)] ?? ''
    );
  }

  return processedHtml;
}
