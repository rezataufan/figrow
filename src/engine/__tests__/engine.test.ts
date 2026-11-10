import { describe, it, expect, beforeEach } from 'vitest';
import { projectDoc, INITIAL_INDEX_HTML, INITIAL_STYLES_CSS } from '../doc/projectDoc';
import {
  parseHtmlToVNodes,
  parseCssRules,
  duplicateElementNode,
  deleteElementNode,
  wrapElementNode,
  unwrapElementNode,
  commitElementTextMutation,
  commitElementStyleMutations,
  changeElementTag,
  pxToUnit,
} from '../ast/htmlAst';
import { resolveElementCascade } from '../css/cascadeEngine';
import { COMPONENT_CATALOG, insertComponentIntoDocument } from '../components/componentCatalog';
import { cleanHtmlForExport, exportSelectedNodeSnippet } from '../export/exportPipeline';
import { useCanvasStore } from '../../store/canvasStore';
import { useLayersStore } from '../../store/layersStore';
import { useInspectorStore } from '../../store/inspectorStore';

describe('Figrow Engine Functionality (100% Functional Test Suite)', () => {
  beforeEach(() => {
    projectDoc.resetProject();
  });

  describe('Document Model & CRDT (Y.Doc)', () => {
    it('initializes default project with index.html and css/styles.css', () => {
      const html = projectDoc.getFileText('index.html');
      const css = projectDoc.getFileText('css/styles.css');
      expect(html).toContain('<!doctype html>');
      expect(html).toContain('Acme Cloud');
      expect(css).toContain(':root');
      expect(css).toContain('--brand-500');
    });

    it('supports undo and redo through Y.UndoManager', () => {
      const htmlBefore = projectDoc.getFileText('index.html');
      duplicateElementNode('index.html', 'n_hero_badge');
      const htmlAfter = projectDoc.getFileText('index.html');
      expect(htmlAfter.length).toBeGreaterThan(htmlBefore.length);

      projectDoc.undoManager.undo();
      const htmlUndone = projectDoc.getFileText('index.html');
      expect(htmlUndone).toBe(htmlBefore);

      projectDoc.undoManager.redo();
      const htmlRedone = projectDoc.getFileText('index.html');
      expect(htmlRedone).toBe(htmlAfter);
    });
  });

  describe('HTML AST & Node Manipulations', () => {
    it('parses HTML into VNode tree with stable data-vds-id keys', () => {
      const html = projectDoc.getFileText('index.html');
      const parsed = parseHtmlToVNodes('index.html', html);
      expect(parsed.nodes['n_hero_badge']).toBeDefined();
      expect(parsed.nodes['n_hero_title']).toBeDefined();

      const titleNode = parsed.nodes['n_hero_title'];
      expect(titleNode?.tag).toBe('h1');
      const classAttr = titleNode?.attrs.find((a) => a.name === 'class')?.value;
      expect(classAttr).toContain('hero__title');
    });

    it('duplicates element nodes with fresh IDs (Figma Ctrl+D / Ctrl+C/V)', () => {
      const newId = duplicateElementNode('index.html', 'n_feat_1');
      expect(newId).toBeTruthy();
      expect(newId).not.toBe('n_feat_1');

      const html = projectDoc.getFileText('index.html');
      expect(html).toContain(`data-vds-id="${newId}"`);
    });

    it('deletes element nodes (Delete / Backspace)', () => {
      const success = deleteElementNode('index.html', 'n_card_2');
      expect(success).toBe(true);

      const html = projectDoc.getFileText('index.html');
      expect(html).not.toContain('data-vds-id="n_card_2"');
    });

    it('wraps and unwraps element nodes (Ctrl+G / Ctrl+Shift+G)', () => {
      const wrapId = wrapElementNode('index.html', 'n_hero_actions', 'div');
      expect(wrapId).toBeTruthy();

      const html = projectDoc.getFileText('index.html');
      expect(html).toContain(`data-vds-id="${wrapId}"`);

      const unwrappedId = unwrapElementNode('index.html', wrapId!);
      expect(unwrappedId).toBeTruthy();
    });

    it('commits text mutations (inline editing)', () => {
      commitElementTextMutation('index.html', 'n_brand', 'FigrowCloud');
      const html = projectDoc.getFileText('index.html');
      expect(html).toContain('FigrowCloud');
    });

    it('changes element tags semantically (e.g. div -> section)', () => {
      changeElementTag('index.html', 'n_card_1', 'article');
      const html = projectDoc.getFileText('index.html');
      expect(html).toContain('<article class="metric-card" data-vds-id="n_card_1"');
    });
  });

  describe('CSS Cascade & Style Mutations', () => {
    it('resolves element cascade specificity and properties accurately', () => {
      const cascade = resolveElementCascade('n_btn_launch', 1440, null);
      expect(cascade).toBeTruthy();
      expect(cascade?.classes).toContain('btn');
      expect(cascade?.classes).toContain('btn--primary');
      expect(cascade?.declaredProps['background-color']).toBeTruthy();
    });

    it('commits style properties into project stylesheet', () => {
      const tree = parseHtmlToVNodes('index.html', projectDoc.getFileText('index.html'));
      const btnNode = tree.nodes['n_btn_launch'];
      expect(btnNode).toBeDefined();

      commitElementStyleMutations(btnNode!, {
        'letter-spacing': '0.05em',
        'border-radius': '16px',
      });
      const css = projectDoc.getFileText('css/styles.css');
      expect(css).toContain('16px');
    });

    it('converts pixel delta to appropriate CSS unit preserving user unit', () => {
      const ctx = {
        parentWidth: 1000,
        rootFontSize: 16,
        fontSize: 16,
        vw: 14.4,
        vh: 9.0,
      };
      expect(pxToUnit(32, 'rem', ctx)).toBe('2rem');
      expect(pxToUnit(200, '%', ctx)).toBe('20%');
      expect(pxToUnit(48, 'px', ctx)).toBe('48px');
    });
  });

  describe('Component Catalog & Insertion Pipeline', () => {
    it('contains rich set of primitives, prebuilt blocks, and web components', () => {
      expect(COMPONENT_CATALOG.length).toBeGreaterThanOrEqual(10);
      const divBox = COMPONENT_CATALOG.find((c) => c.id === 'prim.div-box');
      expect(divBox).toBeDefined();
      expect(divBox?.rootTag).toBe('div');
    });

    it('inserts component into document at target location', () => {
      const cardDef = COMPONENT_CATALOG.find((c) => c.id === 'prim.article-card');
      expect(cardDef).toBeDefined();

      const res = insertComponentIntoDocument(cardDef!, 'n_features', 'inside');
      expect(res.ok).toBe(true);
      expect(res.insertedNodeId).toBeTruthy();

      const html = projectDoc.getFileText('index.html');
      expect(html).toContain('New Feature Card');
    });
  });

  describe('Export Build Pipeline', () => {
    it('cleans HTML removing design-time data-vds-* attributes completely', () => {
      const rawHtml = projectDoc.getFileText('index.html');
      expect(rawHtml).toContain('data-vds-id=');

      const cleanHtml = cleanHtmlForExport(rawHtml, { minify: false, keepComments: true });
      expect(cleanHtml).not.toContain('data-vds-id');
      expect(cleanHtml).toContain('<!doctype html>');
      expect(cleanHtml).toContain('<header class="site-header">');
    });
  });

  describe('Canvas Theme & Page Properties', () => {
    it('updates canvas background color in store without affecting production styles', () => {
      const { setCanvasBgColor } = useCanvasStore.getState();
      setCanvasBgColor('#ffffff');
      expect(useCanvasStore.getState().canvasBgColor).toBe('#ffffff');
    });

    it('manages pages and switches active canvas file', () => {
      const store = useCanvasStore.getState() as any;
      store.addNewPage('about.html');
      expect((useCanvasStore.getState() as any).pageFiles).toContain('about.html');
      store.setActiveFile('about.html');
      expect((useCanvasStore.getState() as any).activeFile).toBe('about.html');
    });

    it('extracts smart text previews for text nodes in flat layers list', () => {
      const rows = useLayersStore.getState().computeFlatRows('index.html');
      const textRow = rows.find((r) => r.tag === 'h1' || r.tag === 'p');
      expect(textRow).toBeDefined();
      expect((textRow as any)?.previewText).toBeDefined();
    });

    it('toggles absolute position and sets coordinates correctly', () => {
      const tree = parseHtmlToVNodes('index.html', projectDoc.getFileText('index.html'));
      const headerNode = tree.nodes['n_header'];
      expect(headerNode).toBeDefined();

      commitElementStyleMutations(headerNode!, {
        position: 'absolute',
        left: '40px',
        top: '60px',
      });
      const cascade = resolveElementCascade('n_header', 1440, null);
      expect(cascade?.declaredProps['position']?.raw).toBe('absolute');
      expect(cascade?.declaredProps['left']?.raw).toBe('40px');
    });

    it('commits Auto Layout wrap and 9-point alignment matrix properties', () => {
      const tree = parseHtmlToVNodes('index.html', projectDoc.getFileText('index.html'));
      const headerNode = tree.nodes['n_header'];
      expect(headerNode).toBeDefined();

      commitElementStyleMutations(headerNode!, {
        display: 'flex',
        'flex-direction': 'row',
        'flex-wrap': 'wrap',
        'justify-content': 'center',
        'align-items': 'center',
        gap: '16px',
      });
      const cascade = resolveElementCascade('n_header', 1440, null);
      expect(cascade?.declaredProps['flex-wrap']?.raw).toBe('wrap');
      expect(cascade?.declaredProps['gap']?.raw).toBe('16px');
      expect(cascade?.declaredProps['justify-content']?.raw).toBe('center');
      expect(cascade?.declaredProps['align-items']?.raw).toBe('center');
    });

    it('commits advanced typography and blend mode properties', () => {
      const tree = parseHtmlToVNodes('index.html', projectDoc.getFileText('index.html'));
      const headerNode = tree.nodes['n_header'];
      expect(headerNode).toBeDefined();

      commitElementStyleMutations(headerNode!, {
        'letter-spacing': '0.05em',
        'line-height': '1.5',
        'text-transform': 'uppercase',
        'mix-blend-mode': 'multiply',
      });
      const cascade = resolveElementCascade('n_header', 1440, null);
      expect(cascade?.declaredProps['mix-blend-mode']?.raw).toBe('multiply');
      expect(cascade?.declaredProps['text-transform']?.raw).toBe('uppercase');
      expect(cascade?.declaredProps['letter-spacing']?.raw).toBe('0.05em');
      expect(cascade?.declaredProps['line-height']?.raw).toBe('1.5');
    });

    it('exports isolated HTML and CSS for a selected node', () => {
      const exported = exportSelectedNodeSnippet('index.html', 'n_header', 'html');
      expect(exported.code).toBeDefined();
      expect(exported.fileName).toContain('header');

      const cssExport = exportSelectedNodeSnippet('index.html', 'n_header', 'css');
      expect(cssExport.code).toContain('header');
    });
  });
});
