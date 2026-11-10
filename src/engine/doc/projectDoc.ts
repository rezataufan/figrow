import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import type { FileMeta, NodeDesignMeta, AssetRef } from '../types';

/**
 * Y.Doc Project Document — Single Source of Truth (01_SYSTEM_ARCHITECTURE.md §4)
 * Stores raw HTML and CSS text inside Y.Text instances so both visual tools
 * and the Monaco code editor operate on the exact same CRDT state.
 */

export const INITIAL_INDEX_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Acme Cloud — Visual DOM & CSS Studio</title>
  <link rel="stylesheet" href="css/styles.css">
</head>
<body>
  <header class="site-header" data-vds-id="n_header">
    <div class="site-header__inner" data-vds-id="n_header_inner">
      <a class="brand" href="#" data-vds-id="n_brand">AcmeCloud</a>
      <nav class="site-nav" data-vds-id="n_nav">
        <a class="site-nav__link" href="#features" data-vds-id="n_nav_1">Features</a>
        <a class="site-nav__link" href="#pricing" data-vds-id="n_nav_2">Pricing</a>
        <a class="site-nav__link" href="#docs" data-vds-id="n_nav_3">Docs</a>
      </nav>
      <button class="btn btn--primary" type="button" data-vds-id="n_cta_top">Start Free</button>
    </div>
  </header>

  <main data-vds-id="n_main">
    <section class="hero" data-vds-id="n_hero">
      <div class="hero__copy" data-vds-id="n_hero_copy">
        <span class="hero__badge" data-vds-id="n_hero_badge">Figma UX × Pinegrow Engine</span>
        <h1 class="hero__title" data-vds-id="n_hero_title">Design visually. Ship pure HTML5 &amp; CSS3.</h1>
        <p class="hero__lead" data-vds-id="n_hero_lead">
          Every drag, resize, and scrub compiles directly into clean, human-readable stylesheet rules with zero proprietary lock-in.
        </p>
        <div class="hero__actions" data-vds-id="n_hero_actions">
          <button class="btn btn--primary" type="button" data-vds-id="n_btn_launch">Launch Workspace</button>
          <button class="btn btn--ghost" type="button" data-vds-id="n_btn_spec">Inspect CSS Output</button>
        </div>
      </div>

      <div class="hero__preview" data-vds-id="n_hero_preview">
        <div class="metric-card" data-vds-id="n_card_1">
          <span class="metric-card__label" data-vds-id="n_card_1_lbl">Frame Budget</span>
          <strong class="metric-card__value" data-vds-id="n_card_1_val">60 FPS</strong>
          <span class="metric-card__meta" data-vds-id="n_card_1_meta">Transient CSSOM layer</span>
        </div>
        <div class="metric-card" data-vds-id="n_card_2">
          <span class="metric-card__label" data-vds-id="n_card_2_lbl">Generated Output</span>
          <strong class="metric-card__value" data-vds-id="n_card_2_val">100% Pure</strong>
          <span class="metric-card__meta" data-vds-id="n_card_2_meta">Zero runtime overhead</span>
        </div>
      </div>
    </section>

    <section class="features" id="features" data-vds-id="n_features">
      <article class="feature-card" data-vds-id="n_feat_1">
        <h3 class="feature-card__title" data-vds-id="n_feat_1_t">Live Multi-Artboard</h3>
        <p class="feature-card__text" data-vds-id="n_feat_1_p">
          Preview Desktop, Tablet, and Mobile viewports side-by-side powered by real browser media queries.
        </p>
      </article>
      <article class="feature-card" data-vds-id="n_feat_2">
        <h3 class="feature-card__title" data-vds-id="n_feat_2_t">Bi-Directional AST</h3>
        <p class="feature-card__text" data-vds-id="n_feat_2_p">
          Edit visual sliders or type in Monaco—range-splice printing preserves your exact code formatting.
        </p>
      </article>
      <article class="feature-card" data-vds-id="n_feat_3">
        <h3 class="feature-card__title" data-vds-id="n_feat_3_t">Cascade Aware</h3>
        <p class="feature-card__text" data-vds-id="n_feat_3_p">
          Target classes, pseudo-states, and @media blocks with full specificity and inheritance visibility.
        </p>
      </article>
    </section>
  </main>
</body>
</html>
`;

export const INITIAL_STYLES_CSS = `:root {
  --bg-page: #0f172a;
  --surface-1: #1e293b;
  --surface-2: #334155;
  --text-1: #f8fafc;
  --text-2: #cbd5e1;
  --brand-500: #6366f1;
  --brand-600: #4f46e5;
  --radius-md: 12px;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Inter, system-ui, -apple-system, sans-serif;
  background-color: var(--bg-page);
  color: var(--text-1);
  line-height: 1.5;
}

.site-header {
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(10px);
}

.site-header__inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 18px 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.brand {
  font-weight: 700;
  font-size: 1.125rem;
  color: var(--text-1);
  text-decoration: none;
  letter-spacing: -0.02em;
}

.site-nav {
  display: flex;
  align-items: center;
  gap: 28px;
}

.site-nav__link {
  color: var(--text-2);
  text-decoration: none;
  font-size: 0.9375rem;
}

.site-nav__link:hover {
  color: var(--text-1);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 18px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.875rem;
  border: 1px solid transparent;
  cursor: pointer;
}

.btn--primary {
  background-color: var(--brand-500);
  color: #ffffff;
}

.btn--primary:hover {
  background-color: var(--brand-600);
}

.btn--ghost {
  background-color: rgba(255, 255, 255, 0.06);
  border-color: rgba(148, 163, 184, 0.25);
  color: var(--text-1);
}

.hero {
  max-width: 1200px;
  margin: 0 auto;
  padding: 72px 48px;
  display: grid;
  grid-template-columns: 1.25fr 0.75fr;
  gap: 40px;
  align-items: center;
}

.hero__badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.18);
  color: #a5b4fc;
  font-size: 0.75rem;
  font-weight: 600;
  margin-bottom: 16px;
}

.hero__title {
  margin: 0 0 16px;
  font-size: 2.75rem;
  line-height: 1.12;
  letter-spacing: -0.03em;
}

.hero__lead {
  margin: 0 0 28px;
  color: var(--text-2);
  font-size: 1.0625rem;
}

.hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.hero__preview {
  display: grid;
  gap: 16px;
}

.metric-card {
  padding: 22px 24px;
  border-radius: var(--radius-md);
  background: var(--surface-1);
  border: 1px solid rgba(148, 163, 184, 0.16);
  display: grid;
  gap: 4px;
}

.metric-card__label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-2);
}

.metric-card__value {
  font-size: 1.75rem;
  color: #a5b4fc;
}

.metric-card__meta {
  font-size: 0.8125rem;
  color: var(--text-2);
}

.features {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 48px 80px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
}

.feature-card {
  padding: 24px;
  border-radius: var(--radius-md);
  background: rgba(30, 41, 59, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.14);
}

.feature-card__title {
  margin: 0 0 8px;
  font-size: 1.0625rem;
}

.feature-card__text {
  margin: 0;
  color: var(--text-2);
  font-size: 0.9rem;
}

@media (max-width: 1023.98px) {
  .site-header__inner {
    padding: 16px 28px;
  }
  .hero {
    grid-template-columns: 1fr;
    padding: 48px 28px;
  }
  .hero__title {
    font-size: 2.25rem;
  }
  .features {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding: 16px 28px 64px;
  }
}

@media (max-width: 767.98px) {
  .site-header__inner {
    padding: 14px 16px;
  }
  .site-nav {
    display: none;
  }
  .hero {
    padding: 32px 16px;
    gap: 24px;
  }
  .hero__title {
    font-size: 1.75rem;
  }
  .features {
    grid-template-columns: 1fr;
    padding: 12px 16px 48px;
    gap: 16px;
  }
}
`;

export const LOCAL_USER_ORIGIN = Symbol('vds-local-user');

export class ProjectDocManager {
  public readonly ydoc: Y.Doc;
  public readonly files: Y.Map<Y.Text>;
  public readonly meta: Y.Map<FileMeta>;
  public readonly designMeta: Y.Map<NodeDesignMeta>;
  public readonly assets: Y.Map<AssetRef>;
  public readonly settings: Y.Map<unknown>;
  public readonly undoManager: Y.UndoManager;

  private listeners = new Set<() => void>();

  constructor() {
    this.ydoc = new Y.Doc();
    this.files = this.ydoc.getMap<Y.Text>('files');
    this.meta = this.ydoc.getMap<FileMeta>('meta');
    this.designMeta = this.ydoc.getMap<NodeDesignMeta>('designMeta');
    this.assets = this.ydoc.getMap<AssetRef>('assets');
    this.settings = this.ydoc.getMap<unknown>('settings');

    this.seedDefaultProject();

    this.undoManager = new Y.UndoManager([this.files, this.designMeta], {
      captureTimeout: 400,
      trackedOrigins: new Set([LOCAL_USER_ORIGIN]),
    });

    if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
      try {
        const provider = new IndexeddbPersistence('figrow-studio-doc', this.ydoc);
        provider.on('synced', () => {
          if (!this.files.has('index.html')) {
            this.seedDefaultProject();
          }
          for (const listener of this.listeners) {
            listener();
          }
        });
      } catch (err) {
        console.warn('IndexedDB persistence unavailable:', err);
      }
    }

    this.ydoc.on('afterTransaction', () => {
      for (const listener of this.listeners) {
        listener();
      }
    });
  }

  private seedDefaultProject(): void {
    this.ydoc.transact(() => {
      if (!this.files.has('index.html')) {
        const htmlText = new Y.Text(INITIAL_INDEX_HTML);
        this.files.set('index.html', htmlText);
        this.meta.set('index.html', { mime: 'text/html', encoding: 'utf-8' });
      }
      if (!this.files.has('css/styles.css')) {
        const cssText = new Y.Text(INITIAL_STYLES_CSS);
        this.files.set('css/styles.css', cssText);
        this.meta.set('css/styles.css', { mime: 'text/css', encoding: 'utf-8' });
      }
    });
  }

  public resetProject(): void {
    this.ydoc.transact(() => {
      const htmlText = this.files.get('index.html');
      if (htmlText) {
        htmlText.delete(0, htmlText.length);
        htmlText.insert(0, INITIAL_INDEX_HTML);
      } else {
        this.files.set('index.html', new Y.Text(INITIAL_INDEX_HTML));
      }

      const cssText = this.files.get('css/styles.css');
      if (cssText) {
        cssText.delete(0, cssText.length);
        cssText.insert(0, INITIAL_STYLES_CSS);
      } else {
        this.files.set('css/styles.css', new Y.Text(INITIAL_STYLES_CSS));
      }

      this.designMeta.clear();
    }, LOCAL_USER_ORIGIN);
    this.undoManager.clear();
  }

  public registerFile(path: string, content: string): void {
    const cleanPath = path.replace(/^[./]+/, '');
    this.ydoc.transact(() => {
      let ytext = this.files.get(cleanPath);
      if (ytext) {
        ytext.delete(0, ytext.length);
        ytext.insert(0, content);
      } else {
        ytext = new Y.Text(content);
        this.files.set(cleanPath, ytext);
      }
      const isHtml = cleanPath.endsWith('.html') || cleanPath.endsWith('.htm');
      this.meta.set(cleanPath, { mime: isHtml ? 'text/html' : 'text/css', encoding: 'utf-8' });
    }, LOCAL_USER_ORIGIN);
  }

  public getHtmlFiles(): string[] {
    const list: string[] = [];
    this.files.forEach((_, key) => {
      if (key.endsWith('.html') || key.endsWith('.htm')) {
        list.push(key);
      }
    });
    return list.sort((a, b) => {
      if (a === 'index.html') return -1;
      if (b === 'index.html') return 1;
      return a.localeCompare(b);
    });
  }

  public getFileText(path: string): string {
    const ytext = this.files.get(path);
    return ytext ? ytext.toString() : '';
  }

  public createFile(path: string, content: string): void {
    this.ydoc.transact(() => {
      const ytext = new Y.Text(content);
      this.files.set(path, ytext);
      const isHtml = path.endsWith('.html');
      this.meta.set(path, { mime: isHtml ? 'text/html' : 'text/css', encoding: 'utf-8' });
    }, LOCAL_USER_ORIGIN);
  }

  public getStyleSheets(): Array<{ file: string; css: string }> {
    const result: Array<{ file: string; css: string }> = [];
    this.files.forEach((ytext, file) => {
      if (file.endsWith('.css')) {
        result.push({ file, css: ytext.toString() });
      }
    });
    return result;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const projectDoc = new ProjectDocManager();
