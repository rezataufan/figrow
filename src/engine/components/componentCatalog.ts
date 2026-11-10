import { parseCssRules, parseHtmlToVNodes, reloadArtboardsForFile } from '../ast/htmlAst';
import { canContain, isVoidElement } from '../ast/contentModel';
import { projectDoc, LOCAL_USER_ORIGIN } from '../doc/projectDoc';
import { sandboxRegistry } from '../sandbox/iframeBridge';

/**
 * Component Library & Insertion Pipeline Engine
 * Aligned with COMP-01_INSERTION_LOGIC.md (F036, F037, F038, F039)
 */

export type ComponentCategory =
  | 'Layout'
  | 'Typography'
  | 'Media & Form'
  | 'Prebuilt Blocks'
  | 'Web Components';

export interface ComponentDef {
  id: string;
  kind: 'primitive' | 'block' | 'webComponent';
  label: string;
  description: string;
  category: ComponentCategory;
  rootTag: string;
  html: string;
  css?: string;
}

export const COMPONENT_CATALOG: ComponentDef[] = [
  // -------------------------------------------------------------------------
  // 1. LAYOUT PRIMITIVES (F036)
  // -------------------------------------------------------------------------
  {
    id: 'prim.section',
    kind: 'primitive',
    label: 'Section Block',
    description: 'Semantic <section> container with comfortable vertical padding',
    category: 'Layout',
    rootTag: 'section',
    html: `<section class="vds-section">\n  <div class="vds-container">\n    <h2>Section Heading</h2>\n    <p>Add your section content here.</p>\n  </div>\n</section>`,
    css: `.vds-section {\n  padding: 56px 48px;\n}\n.vds-container {\n  max-width: 1120px;\n  margin: 0 auto;\n}`,
  },
  {
    id: 'prim.div-box',
    kind: 'primitive',
    label: 'Div Container',
    description: 'Flexible <div> box with surface background and rounded border',
    category: 'Layout',
    rootTag: 'div',
    html: `<div class="vds-box">\n  <p>Container Box</p>\n</div>`,
    css: `.vds-box {\n  padding: 24px;\n  border-radius: 12px;\n  background-color: rgba(30, 41, 59, 0.65);\n  border: 1px solid rgba(148, 163, 184, 0.16);\n}`,
  },
  {
    id: 'prim.flex-row',
    kind: 'primitive',
    label: 'Flex Row',
    description: 'Horizontal Flexbox container with 16px gap and center alignment',
    category: 'Layout',
    rootTag: 'div',
    html: `<div class="vds-flex-row">\n  <div class="vds-box">Item 1</div>\n  <div class="vds-box">Item 2</div>\n</div>`,
    css: `.vds-flex-row {\n  display: flex;\n  align-items: center;\n  gap: 16px;\n  flex-wrap: wrap;\n}`,
  },
  {
    id: 'prim.grid-3col',
    kind: 'primitive',
    label: 'Grid 3 Columns',
    description: 'Responsive 3-column CSS Grid (repeat(3, minmax(0, 1fr)))',
    category: 'Layout',
    rootTag: 'div',
    html: `<div class="vds-grid-3">\n  <div class="vds-box">Column 1</div>\n  <div class="vds-box">Column 2</div>\n  <div class="vds-box">Column 3</div>\n</div>`,
    css: `.vds-grid-3 {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: 24px;\n}`,
  },
  {
    id: 'prim.article-card',
    kind: 'primitive',
    label: 'Article Card',
    description: 'Semantic <article> card with title, body copy, and link',
    category: 'Layout',
    rootTag: 'article',
    html: `<article class="feature-card">\n  <h3 class="feature-card__title">New Feature Card</h3>\n  <p class="feature-card__text">Clean semantic HTML5 paired with external CSS rules.</p>\n</article>`,
  },

  // -------------------------------------------------------------------------
  // 2. TYPOGRAPHY PRIMITIVES (F036)
  // -------------------------------------------------------------------------
  {
    id: 'prim.h1',
    kind: 'primitive',
    label: 'Heading H1',
    description: 'Primary display heading <h1>',
    category: 'Typography',
    rootTag: 'h1',
    html: `<h1 class="vds-heading-xl">Display Headline Text</h1>`,
    css: `.vds-heading-xl {\n  font-size: 2.5rem;\n  font-weight: 800;\n  line-height: 1.15;\n  letter-spacing: -0.02em;\n  margin: 0 0 16px;\n}`,
  },
  {
    id: 'prim.h2',
    kind: 'primitive',
    label: 'Heading H2',
    description: 'Section heading <h2>',
    category: 'Typography',
    rootTag: 'h2',
    html: `<h2 class="vds-heading-lg">Section Title</h2>`,
    css: `.vds-heading-lg {\n  font-size: 1.75rem;\n  font-weight: 700;\n  line-height: 1.25;\n  margin: 0 0 12px;\n}`,
  },
  {
    id: 'prim.paragraph',
    kind: 'primitive',
    label: 'Paragraph',
    description: 'Body copy paragraph <p>',
    category: 'Typography',
    rootTag: 'p',
    html: `<p class="vds-prose">Design visually on an infinite multi-breakpoint canvas while authoring clean, semantic HTML5 and CSS3.</p>`,
    css: `.vds-prose {\n  font-size: 1rem;\n  line-height: 1.65;\n  color: var(--text-2);\n  margin: 0 0 16px;\n}`,
  },
  {
    id: 'prim.badge',
    kind: 'primitive',
    label: 'Badge Pill',
    description: 'Inline status badge <span>',
    category: 'Typography',
    rootTag: 'span',
    html: `<span class="hero__eyebrow">NEW RELEASE</span>`,
  },

  // -------------------------------------------------------------------------
  // 3. MEDIA & FORM PRIMITIVES (F036)
  // -------------------------------------------------------------------------
  {
    id: 'prim.button-cta',
    kind: 'primitive',
    label: 'CTA Button',
    description: 'Interactive <button> with hover state styling',
    category: 'Media & Form',
    rootTag: 'button',
    html: `<button type="button" class="btn btn--primary">Get Started Now</button>`,
  },
  {
    id: 'prim.image',
    kind: 'primitive',
    label: 'Responsive Image',
    description: '<img> with intrinsic width/height and lazy loading',
    category: 'Media & Form',
    rootTag: 'img',
    html: `<img class="vds-media-img" src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=960&q=80" alt="Abstract studio artwork" width="960" height="540" loading="lazy" />`,
    css: `.vds-media-img {\n  display: block;\n  max-width: 100%;\n  height: auto;\n  border-radius: 12px;\n  object-fit: cover;\n}`,
  },
  {
    id: 'prim.input-group',
    kind: 'primitive',
    label: 'Email Input Bar',
    description: 'Form input field with action button',
    category: 'Media & Form',
    rootTag: 'form',
    html: `<form class="vds-input-bar" onsubmit="return false;">\n  <input type="email" class="vds-input-field" placeholder="Enter your work email..." aria-label="Work email" />\n  <button type="submit" class="btn btn--primary">Subscribe</button>\n</form>`,
    css: `.vds-input-bar {\n  display: flex;\n  gap: 10px;\n  max-width: 440px;\n}\n.vds-input-field {\n  flex: 1;\n  padding: 10px 14px;\n  border-radius: 8px;\n  border: 1px solid rgba(148, 163, 184, 0.3);\n  background: rgba(15, 23, 42, 0.8);\n  color: #f8fafc;\n  font-size: 0.9375rem;\n}`,
  },

  // -------------------------------------------------------------------------
  // 4. PREBUILT BLOCKS (F037)
  // -------------------------------------------------------------------------
  {
    id: 'block.pricing-card',
    kind: 'block',
    label: 'Pricing Tier Block',
    description: 'Complete SaaS pricing card with feature checklist & CTA',
    category: 'Prebuilt Blocks',
    rootTag: 'section',
    html: `<section class="pricing-block">\n  <div class="pricing-card">\n    <span class="hero__eyebrow">PRO STUDIO</span>\n    <h3 class="pricing-card__price">$29<span>/mo</span></h3>\n    <p class="feature-card__text">Everything you need for visual DOM &amp; CSS production.</p>\n    <button type="button" class="btn btn--primary">Start Free Trial</button>\n  </div>\n</section>`,
    css: `.pricing-block {\n  max-width: 1200px;\n  margin: 0 auto;\n  padding: 32px 48px;\n}\n.pricing-card {\n  max-width: 380px;\n  padding: 32px;\n  border-radius: 16px;\n  background: linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95));\n  border: 1px solid rgba(99, 102, 241, 0.4);\n  box-shadow: 0 20px 32px -10px rgba(15, 23, 42, 0.6);\n  display: flex;\n  flex-direction: column;\n  gap: 14px;\n}\n.pricing-card__price {\n  font-size: 2.5rem;\n  font-weight: 800;\n  margin: 0;\n  color: #f8fafc;\n}\n.pricing-card__price span {\n  font-size: 1rem;\n  font-weight: 500;\n  color: #94a3b8;\n}`,
  },
  {
    id: 'block.cta-banner',
    kind: 'block',
    label: 'Gradient CTA Banner',
    description: 'Full-width call-to-action banner with dual buttons',
    category: 'Prebuilt Blocks',
    rootTag: 'section',
    html: `<section class="cta-banner">\n  <div class="cta-banner__inner">\n    <h2 class="cta-banner__title">Ready to ship pure HTML &amp; CSS?</h2>\n    <p class="cta-banner__sub">Zero proprietary runtime. Export clean code or Tailwind v4 utilities in one click.</p>\n    <div class="hero__actions">\n      <button type="button" class="btn btn--primary">Export Project ZIP</button>\n      <button type="button" class="btn btn--ghost">View Documentation</button>\n    </div>\n  </div>\n</section>`,
    css: `.cta-banner {\n  max-width: 1200px;\n  margin: 24px auto;\n  padding: 0 48px;\n}\n.cta-banner__inner {\n  padding: 48px;\n  border-radius: 18px;\n  background-image: linear-gradient(135deg, rgba(99, 102, 241, 0.22) 0%, rgba(168, 85, 247, 0.14) 100%);\n  border: 1px solid rgba(99, 102, 241, 0.35);\n  display: flex;\n  flex-direction: column;\n  align-items: flex-start;\n  gap: 14px;\n}\n.cta-banner__title {\n  margin: 0;\n  font-size: 2rem;\n  font-weight: 800;\n}\n.cta-banner__sub {\n  margin: 0;\n  color: var(--text-2);\n  max-width: 600px;\n}`,
  },
  {
    id: 'block.footer',
    kind: 'block',
    label: 'Site Footer',
    description: 'Clean responsive footer with brand & copyright links',
    category: 'Prebuilt Blocks',
    rootTag: 'footer',
    html: `<footer class="site-footer">\n  <div class="site-footer__inner">\n    <span class="brand">Figrow Studio</span>\n    <p class="feature-card__text">© 2026 Visual DOM &amp; CSS Studio. Pure HTML5 &amp; CSS3 output.</p>\n  </div>\n</footer>`,
    css: `.site-footer {\n  border-top: 1px solid rgba(148, 163, 184, 0.16);\n  margin-top: 48px;\n}\n.site-footer__inner {\n  max-width: 1200px;\n  margin: 0 auto;\n  padding: 28px 48px;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 16px;\n}`,
  },

  // -------------------------------------------------------------------------
  // 5. WEB COMPONENTS (F038)
  // -------------------------------------------------------------------------
  {
    id: 'wc.accordion',
    kind: 'webComponent',
    label: '<vds-accordion>',
    description: 'Custom Web Component / Disclosure widget with styled summary',
    category: 'Web Components',
    rootTag: 'details',
    html: `<details class="vds-accordion" open>\n  <summary class="vds-accordion__summary">How does Two-Way AST Sync work?</summary>\n  <div class="vds-accordion__content">\n    <p class="feature-card__text">Every visual drag or scrub performs a surgical range-splice on Y.Text, preserving your handwritten code formatting.</p>\n  </div>\n</details>`,
    css: `.vds-accordion {\n  border-radius: 10px;\n  background: rgba(30, 41, 59, 0.75);\n  border: 1px solid rgba(148, 163, 184, 0.2);\n  padding: 14px 18px;\n  margin: 12px 0;\n}\n.vds-accordion__summary {\n  font-weight: 600;\n  cursor: pointer;\n  color: #f8fafc;\n}\n.vds-accordion__content {\n  padding-top: 10px;\n}`,
  },
];

/**
 * Inserts a ComponentDef into `htmlFile` and merges its scoped CSS into `cssFile`
 * in a single atomic Y.Doc transaction (COMP-01 §2).
 */
export function insertComponentIntoDocument(
  def: ComponentDef,
  targetNodeKey: string | null,
  preferredPlacement: 'inside' | 'after' = 'after',
  htmlFile = 'index.html',
  cssFile = 'css/styles.css'
): { ok: boolean; message: string; insertedNodeId?: string } {
  const html = projectDoc.getFileText(htmlFile);
  const yHtml = projectDoc.files.get(htmlFile);
  if (!html || !yHtml) {
    return { ok: false, message: 'Target HTML file not found.' };
  }

  const parsed = parseHtmlToVNodes(htmlFile, html);

  // Resolve target container or sibling
  let targetVNode = targetNodeKey ? parsed.nodes[targetNodeKey] : null;
  if (!targetVNode) {
    // Find <main> or fallback to <body>
    const mainNode = Object.values(parsed.nodes).find((n) => n.tag === 'main');
    const bodyNode = Object.values(parsed.nodes).find((n) => n.tag === 'body');
    targetVNode = mainNode ?? bodyNode ?? null;
    preferredPlacement = 'inside';
  }

  if (!targetVNode || !targetVNode.tag) {
    return { ok: false, message: 'Could not resolve insertion target in HTML.' };
  }

  let insertOffset = targetVNode.range[1];
  let actualPlacement = preferredPlacement;

  if (actualPlacement === 'inside') {
    if (
      isVoidElement(targetVNode.tag) ||
      !canContain(targetVNode.tag, def.rootTag).ok
    ) {
      actualPlacement = 'after';
    }
  }

  if (actualPlacement === 'inside' && targetVNode.endTagRange) {
    insertOffset = targetVNode.endTagRange[0];
  } else {
    // Check parent content model when inserting after targetVNode
    const parentNode = targetVNode.parent
      ? parsed.nodes[targetVNode.parent]
      : null;
    if (parentNode?.tag && !canContain(parentNode.tag, def.rootTag).ok) {
      // Fallback to inserting inside <main> or <body>
      const mainNode = Object.values(parsed.nodes).find((n) => n.tag === 'main');
      const bodyNode = Object.values(parsed.nodes).find((n) => n.tag === 'body');
      const safeContainer = mainNode ?? bodyNode;
      if (safeContainer?.endTagRange) {
        insertOffset = safeContainer.endTagRange[0];
      }
    } else {
      insertOffset = targetVNode.range[1];
    }
  }

  const uidPrefix = `n_ins_${Date.now().toString(36)}`;
  let uidCounter = 0;
  const htmlWithIds = def.html.replace(
    /<([a-zA-Z][a-zA-Z0-9-]*)(\s|>|\/>)/g,
    (_m, tag: string, tail: string) => {
      uidCounter += 1;
      return `<${tag} data-vds-id="${uidPrefix}_${uidCounter}"${tail}`;
    }
  );
  const snippetToInsert = `\n  ${htmlWithIds.replace(/\n/g, '\n  ')}\n`;

  // Merge component CSS only when it introduces selectors absent from the stylesheet (COMP-01 §4)
  const yCss = projectDoc.files.get(cssFile);
  const currentCss = yCss ? yCss.toString() : '';
  let cssToAppend = '';

  if (def.css && yCss) {
    const existingSelectors = new Set(
      parseCssRules(cssFile, currentCss).map((r) => r.selector.trim())
    );
    const incomingRules = parseCssRules(cssFile, def.css);
    const hasNewSelector = incomingRules.some(
      (r) => !existingSelectors.has(r.selector.trim())
    );
    if (hasNewSelector) {
      cssToAppend = `\n\n/* Component: ${def.label} */\n${def.css.trim()}\n`;
    }
  }

  projectDoc.undoManager.stopCapturing();
  projectDoc.ydoc.transact(() => {
    yHtml.insert(insertOffset, snippetToInsert);
    if (cssToAppend && yCss) {
      yCss.insert(yCss.length, cssToAppend);
    }
  }, LOCAL_USER_ORIGIN);
  projectDoc.undoManager.stopCapturing();

  if (cssToAppend && yCss) {
    sandboxRegistry.broadcastPatch([
      { op: 'replaceSheet', file: cssFile, cssText: yCss.toString() },
    ]);
  }
  reloadArtboardsForFile(htmlFile);

  return {
    ok: true,
    message: `Inserted ${def.label} (${actualPlacement} <${targetVNode.tag}>)`,
    insertedNodeId: `${uidPrefix}_1`,
  };
}
