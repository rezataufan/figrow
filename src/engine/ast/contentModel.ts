import type { NodeId, VNode } from '../types';

/**
 * HTML5 Living Standard Content Model Validator (Shared by LAYER-01 & CANVAS-03)
 * Validates whether `parentTag` can legally contain `childTag` given `parentAncestors`,
 * and prevents circular drops into self or descendants.
 */

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

const INTERACTIVE_ELEMENTS = new Set([
  'a',
  'button',
  'details',
  'embed',
  'iframe',
  'label',
  'select',
  'textarea',
  'input',
]);

const BLOCK_OR_SECTIONING_ELEMENTS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'details',
  'dialog',
  'dd',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hgroup',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'ul',
]);

const HEADING_ELEMENTS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

const PHRASING_ONLY_PARENTS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'span',
  'strong',
  'em',
  'small',
  'b',
  'i',
  'u',
  'code',
  'label',
]);

export function isVoidElement(tag: string): boolean {
  return VOID_ELEMENTS.has(tag.toLowerCase());
}

export function canContain(
  parentTag: string,
  childTag: string,
  ctx: { parentAncestors?: string[]; force?: boolean } = {}
): { ok: true } | { ok: false; reason: string } {
  if (ctx.force) {
    return { ok: true };
  }

  const p = parentTag.toLowerCase();
  const c = childTag.toLowerCase();
  const ancestors = (ctx.parentAncestors ?? []).map((a) => a.toLowerCase());

  if (VOID_ELEMENTS.has(p)) {
    return { ok: false, reason: `<${p}> is a void element and cannot contain children.` };
  }

  // List item rules
  if (c === 'li' && p !== 'ul' && p !== 'ol' && p !== 'menu') {
    return { ok: false, reason: `<li> can only be placed inside <ul>, <ol>, or <menu>.` };
  }
  if ((p === 'ul' || p === 'ol' || p === 'menu') && c !== 'li' && c !== 'script' && c !== 'template') {
    return { ok: false, reason: `<${p}> only accepts <li> as direct children.` };
  }

  // Table hierarchy rules
  if (c === 'tr' && p !== 'table' && p !== 'thead' && p !== 'tbody' && p !== 'tfoot') {
    return { ok: false, reason: `<tr> must be inside <thead>, <tbody>, <tfoot>, or <table>.` };
  }
  if ((c === 'td' || c === 'th') && p !== 'tr') {
    return { ok: false, reason: `<${c}> must be placed directly inside a <tr>.` };
  }

  // Interactive nesting prohibition (e.g. <button> inside <a> or <a> inside <button>)
  if (
    INTERACTIVE_ELEMENTS.has(c) &&
    (p === 'a' || p === 'button' || ancestors.includes('a') || ancestors.includes('button'))
  ) {
    return {
      ok: false,
      reason: `Interactive <${c}> cannot be nested inside <a> or <button>.`,
    };
  }

  // Form nesting prohibition
  if (c === 'form' && (p === 'form' || ancestors.includes('form'))) {
    return { ok: false, reason: `<form> cannot be nested inside another <form>.` };
  }

  // Phrasing-only containers (<p>, <h1>..<h6>, <span>, etc.) cannot contain block elements
  if (PHRASING_ONLY_PARENTS.has(p) && BLOCK_OR_SECTIONING_ELEMENTS.has(c)) {
    return {
      ok: false,
      reason: `<${p}> only accepts phrasing/inline content, not <${c}>.`,
    };
  }

  // Heading nesting prohibition
  if (HEADING_ELEMENTS.has(c) && (HEADING_ELEMENTS.has(p) || ancestors.some((a) => HEADING_ELEMENTS.has(a)))) {
    return { ok: false, reason: `Heading <${c}> cannot be nested inside another heading.` };
  }

  return { ok: true };
}

export function isDescendantOrSelf(
  nodes: Record<NodeId, VNode>,
  sourceId: NodeId,
  candidateTargetId: NodeId
): boolean {
  let curr: NodeId | null = candidateTargetId;
  while (curr) {
    if (curr === sourceId) return true;
    curr = nodes[curr]?.parent ?? null;
  }
  return false;
}

export function getAncestorTags(
  nodes: Record<NodeId, VNode>,
  nodeId: NodeId
): string[] {
  const tags: string[] = [];
  let curr = nodes[nodeId]?.parent ?? null;
  while (curr && nodes[curr]) {
    if (nodes[curr].tag) {
      tags.push(nodes[curr].tag!);
    }
    curr = nodes[curr].parent;
  }
  return tags;
}
