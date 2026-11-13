import { describe, expect, it, beforeEach } from 'vitest';
import {
  computeSpecificity,
  doesBaseSelectorMatchNode,
} from '../css/cascadeEngine';
import {
  commitElementAttributeMutation,
  commitElementInnerHtmlMutation,
  parseHtmlToVNodes,
} from '../ast/htmlAst';
import {
  makeElementSymbol,
  syncSymbolAcrossProject,
  detachElementSymbol,
  listProjectSymbols,
} from '../components/symbolSyncEngine';
import { createFigrowWebMcpTools } from '../commands/commandRegistry';
import { projectDoc, INITIAL_INDEX_HTML, INITIAL_STYLES_CSS } from '../doc/projectDoc';

describe('GrapesJS-Inspired Engine & UI Upgrades', () => {
  beforeEach(() => {
    projectDoc.registerFile('index.html', INITIAL_INDEX_HTML);
    projectDoc.registerFile('css/styles.css', INITIAL_STYLES_CSS);
  });

  it('computes W3C Level 4 specificity accurately using @bramus/specificity', () => {
    expect(computeSpecificity('.card')).toEqual([0, 1, 0]);
    expect(computeSpecificity('#hero .btn:hover')).toEqual([1, 2, 0]);
    // :where() has zero specificity per W3C Selectors Level 4
    expect(computeSpecificity(':where(.hero) .btn')).toEqual([0, 1, 0]);
    // :is() takes the most specific argument
    expect(computeSpecificity(':is(.card, #featured) p')).toEqual([1, 0, 1]);
  });

  it('matches complex CSS selectors via postcss-selector-parser', () => {
    const html = projectDoc.getFileText('index.html');
    const tree = parseHtmlToVNodes('index.html', html);
    const ctaBtn = tree.nodes['n_cta_top'];
    expect(ctaBtn).toBeDefined();

    if (!ctaBtn) return;

    // Comma-separated list
    expect(doesBaseSelectorMatchNode('.nonexistent, .btn--primary', ctaBtn, tree.nodes)).toBe(true);
    // Attribute selector [type="button"]
    expect(doesBaseSelectorMatchNode('button[type="button"]', ctaBtn, tree.nodes)).toBe(true);
    expect(doesBaseSelectorMatchNode('button[type="submit"]', ctaBtn, tree.nodes)).toBe(false);
    // Direct child combinator >
    expect(
      doesBaseSelectorMatchNode('.site-header > .site-header__inner > .btn', ctaBtn, tree.nodes)
    ).toBe(true);
    // :not() pseudo-class
    expect(doesBaseSelectorMatchNode('.btn:not(.btn--ghost)', ctaBtn, tree.nodes)).toBe(true);
    expect(doesBaseSelectorMatchNode('.btn:not(.btn--primary)', ctaBtn, tree.nodes)).toBe(false);
  });

  it('mutates HTML attributes/traits and rich innerHTML via AST byte offsets', () => {
    // Update href and target on <a data-vds-id="n_brand">
    expect(
      commitElementAttributeMutation('index.html', 'n_brand', 'href', 'https://figrow.dev')
    ).toBe(true);
    expect(
      commitElementAttributeMutation('index.html', 'n_brand', 'target', '_blank')
    ).toBe(true);

    let tree = parseHtmlToVNodes('index.html', projectDoc.getFileText('index.html'));
    const brandNode = tree.nodes['n_brand'];
    expect(brandNode?.attrs.find((a) => a.name === 'href')?.value).toBe('https://figrow.dev');
    expect(brandNode?.attrs.find((a) => a.name === 'target')?.value).toBe('_blank');

    // Remove target attribute
    expect(commitElementAttributeMutation('index.html', 'n_brand', 'target', null)).toBe(true);
    tree = parseHtmlToVNodes('index.html', projectDoc.getFileText('index.html'));
    expect(tree.nodes['n_brand']?.attrs.find((a) => a.name === 'target')).toBeUndefined();

    // Rich inline HTML formatting mutation
    expect(
      commitElementInnerHtmlMutation(
        'index.html',
        'n_hero_title',
        'Design <strong>visually</strong> with <code>AST</code>.'
      )
    ).toBe(true);
    expect(projectDoc.getFileText('index.html')).toContain(
      'Design <strong>visually</strong> with <code>AST</code>.'
    );
  });

  it('promotes, synchronizes, lists, and detaches Reusable Symbols across pages', () => {
    const aboutHtml = `<!doctype html>
<html>
<body>
  <header class="site-header" data-vds-id="n_about_header" data-vds-symbol="site-header">
    <a class="brand" href="#">OldBrand</a>
  </header>
  <article class="feature-card" data-vds-id="n_about_card" data-vds-symbol="feature-card">
    <h3>Old Card</h3>
  </article>
</body>
</html>`;
    projectDoc.registerFile('about.html', aboutHtml);

    // Promote feature-card in index.html to a Master Symbol and sync across pages
    commitElementInnerHtmlMutation('index.html', 'n_feat_1_t', 'Synced Master Card Title');
    const res = makeElementSymbol('index.html', 'n_feat_1', 'feature-card');
    expect(res.ok).toBe(true);
    expect(res.symbolId).toBe('feature-card');
    expect(res.syncedCount).toBe(1);
    expect(res.targetFiles).toContain('about.html');

    const updatedAbout = projectDoc.getFileText('about.html');
    expect(updatedAbout).toContain('Synced Master Card Title');

    const symbols = listProjectSymbols();
    const featSym = symbols.find((s) => s.symbolId === 'feature-card');
    expect(featSym).toBeDefined();
    expect(featSym?.instancesCount).toBe(2);

    // Detach symbol in index.html
    expect(detachElementSymbol('index.html', 'n_feat_1')).toBe(true);
    const tree = parseHtmlToVNodes('index.html', projectDoc.getFileText('index.html'));
    expect(
      tree.nodes['n_feat_1']?.attrs.find((a) => a.name === 'data-vds-symbol')
    ).toBeUndefined();

    // Re-sync test
    makeElementSymbol('index.html', 'n_header', 'site-header');
    const syncHeaderRes = syncSymbolAcrossProject('index.html', 'site-header');
    expect(syncHeaderRes.ok).toBe(true);
    expect(projectDoc.getFileText('about.html')).toContain('AcmeCloud');
  });

  it('exposes working WebMCP tools for AI agents', () => {
    const tools = createFigrowWebMcpTools();
    const getState = tools.find((t) => t.name === 'figrow_get_editor_state');
    const updateTraits = tools.find((t) => t.name === 'figrow_update_component_traits');

    expect(getState).toBeDefined();
    expect(updateTraits).toBeDefined();

    const stateOut = getState?.execute() as { activeFile: string; htmlFiles: string[] };
    expect(stateOut.activeFile).toBe('index.html');
    expect(stateOut.htmlFiles).toContain('index.html');

    const traitOut = updateTraits?.execute({
      file: 'index.html',
      id: 'n_cta_top',
      textContent: 'Get Started Now',
      attributes: { 'aria-label': 'Start Free Trial', 'data-track': 'hero-cta' },
    }) as { ok: boolean };
    expect(traitOut.ok).toBe(true);

    const html = projectDoc.getFileText('index.html');
    expect(html).toContain('Get Started Now');
    expect(html).toContain('aria-label="Start Free Trial"');
    expect(html).toContain('data-track="hero-cta"');
  });

  it('6. Sandbox SrcDoc preserves inline <script type="text/babel"> containing HTML/body strings', async () => {
    const { instrumentUploadedHtml } = await import('../import/htmlImporter');
    const { buildSandboxSrcDoc } = await import('../sandbox/runtimeAgentSource');

    const rawBabelHtml = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Inventory Dashboard</title>
</head>
<body>
  <div id="navbar-container"></div>
  <div id="root"><div class="loader"></div></div>
  <script type="text/babel">
    const cetakSpList = (itemName) => {
      let html = \`<html><head><style>body { height: 100vh; }</style></head><body>\`;
      html += \`<p>Item: \${itemName}</p>\`;
      html += \`<script>setTimeout(() => { window.print(); }, 600);<\\/script></body></html>\`;
      w.document.write(html);
      w.document.close();
    };
    const App = () => {
      return (
        <div className="subnav-bar">
          <h1>Pusat Stok & Kedaluwarsa</h1>
        </div>
      );
    };
  </script>
  <script src="navbar.js"></script>
</body>
</html>`;

    const instrumented = instrumentUploadedHtml(rawBabelHtml);
    const srcDoc = buildSandboxSrcDoc('ab_desktop', instrumented.html, []);

    // 1. The agent script must NOT be injected inside the <script type="text/babel"> template string
    const babelMatch = srcDoc.match(/<script type="text\/babel">([\s\S]*?)<\/script>/);
    expect(babelMatch).not.toBeNull();
    expect(babelMatch![1]).toContain('w.document.write(html);');
    expect(babelMatch![1]).toContain('<h1>Pusat Stok & Kedaluwarsa</h1>');
    expect(babelMatch![1]).toContain('body { height: 100vh; }');
    expect(babelMatch![1]).toContain('${itemName}');
    expect(babelMatch![1]).not.toContain('data-vds-agent');

    // 2. The agent script must be injected right before the final closing </body>
    expect(srcDoc).toMatch(/<script data-vds-agent="true">[\s\S]*?<\/script>\s*<\/body>\s*<\/html>\s*$/i);
  });
});
