import valueParser from 'postcss-value-parser';
import { projectDoc, LOCAL_USER_ORIGIN } from '../doc/projectDoc';
import { reloadArtboardsForFile } from '../ast/htmlAst';

/**
 * Style Value Parsers & Generators for Sprint 5:
 * - CSS-02_FLEXBOX_GRID.md (Alignment matrix mapping, Grid track AST parser/serializer)
 * - CSS-03_TYPOGRAPHY.md (Fluid clamp() generator, Google Fonts <head> injector, Text-shadow parser)
 * - CSS-05_BACKGROUNDS_EFFECTS.md (Box-shadow AST parser/serializer, Transform parser/serializer)
 */

// ---------------------------------------------------------------------------
// 1. FLEXBOX 3x3 ALIGNMENT MATRIX (CSS-02_FLEXBOX_GRID.md §2)
// ---------------------------------------------------------------------------

export function matrixToProps(
  cell: { row: 0 | 1 | 2; col: 0 | 1 | 2 },
  dir: 'row' | 'column'
): Record<string, string> {
  const pos = ['flex-start', 'center', 'flex-end'] as const;
  return dir === 'row'
    ? { 'justify-content': pos[cell.col], 'align-items': pos[cell.row] }
    : { 'justify-content': pos[cell.row], 'align-items': pos[cell.col] };
}

export function propsToMatrixCell(
  justifyContent: string,
  alignItems: string,
  dir: 'row' | 'column'
): { row: 0 | 1 | 2; col: 0 | 1 | 2 } | null {
  const mapVal = (val: string): 0 | 1 | 2 | null => {
    const v = val.trim();
    if (v === 'flex-start' || v === 'start' || v === '') return 0;
    if (v === 'center') return 1;
    if (v === 'flex-end' || v === 'end') return 2;
    return null;
  };
  const jIdx = mapVal(justifyContent);
  const aIdx = mapVal(alignItems);
  if (jIdx === null || aIdx === null) return null;
  return dir === 'row' ? { row: aIdx, col: jIdx } : { row: jIdx, col: aIdx };
}

// ---------------------------------------------------------------------------
// 2. GRID TRACK PARSER & COMPACT SERIALIZER (CSS-02_FLEXBOX_GRID.md §2 & §3)
// ---------------------------------------------------------------------------

export function parseGridTrackTokens(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'none') return [];

  // Check if top-level is repeat(N, <track>)
  const repeatMatch = /^repeat\(\s*(\d+)\s*,\s*(.+)\)$/i.exec(trimmed);
  if (repeatMatch) {
    const count = Math.min(12, Math.max(1, parseInt(repeatMatch[1], 10)));
    const inner = repeatMatch[2].trim();
    return Array.from({ length: count }, () => inner);
  }

  const parsed = valueParser(trimmed);
  const tracks: string[] = [];
  for (const node of parsed.nodes) {
    if (node.type === 'word' || node.type === 'function') {
      tracks.push(valueParser.stringify(node));
    }
  }
  return tracks;
}

export function serializeGridTrackTokens(tracks: string[]): string {
  if (tracks.length === 0) return 'none';
  if (tracks.length >= 2) {
    const first = tracks[0].trim();
    const allIdentical = tracks.every((t) => t.trim() === first);
    if (allIdentical) {
      return `repeat(${tracks.length}, ${first})`;
    }
  }
  return tracks.join(' ');
}

// ---------------------------------------------------------------------------
// 3. FLUID TYPOGRAPHY CLAMP() GENERATOR (CSS-03_TYPOGRAPHY.md §2)
// ---------------------------------------------------------------------------

function roundTo(val: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(val * f) / f;
}

export function fluidClamp(
  minRem: number,
  maxRem: number,
  minVwPx: number,
  maxVwPx: number,
  root = 16
): string {
  const spanVw = Math.max(1, maxVwPx - minVwPx);
  const slope = ((maxRem - minRem) * root) / spanVw; // px per px
  const interceptRem = minRem - (slope * minVwPx) / root;
  const sign = slope >= 0 ? '+' : '-';
  return `clamp(${roundTo(minRem, 3)}rem, ${roundTo(
    interceptRem,
    4
  )}rem ${sign} ${roundTo(Math.abs(slope * 100), 4)}vw, ${roundTo(maxRem, 3)}rem)`;
}

export const FONT_CATALOG: Array<{
  label: string;
  family: string;
  stack: string;
  source: 'system' | 'google';
  weights: number[];
}> = [
  {
    label: 'Inter (Google)',
    family: 'Inter',
    stack: '"Inter", system-ui, -apple-system, sans-serif',
    source: 'google',
    weights: [400, 500, 600, 700, 800],
  },
  {
    label: 'Plus Jakarta Sans (Google)',
    family: 'Plus Jakarta Sans',
    stack: '"Plus Jakarta Sans", system-ui, sans-serif',
    source: 'google',
    weights: [400, 500, 600, 700, 800],
  },
  {
    label: 'Space Grotesk (Google)',
    family: 'Space Grotesk',
    stack: '"Space Grotesk", system-ui, sans-serif',
    source: 'google',
    weights: [400, 500, 600, 700],
  },
  {
    label: 'Playfair Display (Google)',
    family: 'Playfair Display',
    stack: '"Playfair Display", Georgia, serif',
    source: 'google',
    weights: [400, 600, 700],
  },
  {
    label: 'JetBrains Mono (Google)',
    family: 'JetBrains Mono',
    stack: '"JetBrains Mono", ui-monospace, monospace',
    source: 'google',
    weights: [400, 500, 700],
  },
  {
    label: 'System UI Sans',
    family: 'system-ui',
    stack: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    source: 'system',
    weights: [300, 400, 500, 600, 700, 800],
  },
  {
    label: 'System Serif',
    family: 'Georgia',
    stack: 'Georgia, Cambria, "Times New Roman", Times, serif',
    source: 'system',
    weights: [400, 700],
  },
  {
    label: 'System Monospace',
    family: 'ui-monospace',
    stack: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    source: 'system',
    weights: [400, 600, 700],
  },
];

/**
 * Ensures a Google Fonts stylesheet link is present in <head> of the HTML document (CSS-03 §2).
 */
export function ensureGoogleFontInHtml(
  htmlFile: string,
  family: string,
  weights: number[] = [400, 500, 600, 700]
): void {
  const html = projectDoc.getFileText(htmlFile);
  if (!html) return;

  const encodedFamily = family.trim().replace(/\s+/g, '+');
  const weightSpec = weights.join(';');
  const fontHref = `https://fonts.googleapis.com/css2?family=${encodedFamily}:wght@${weightSpec}&display=swap`;

  if (html.includes(`family=${encodedFamily}`)) {
    return; // Already present
  }

  const headCloseIdx = html.toLowerCase().indexOf('</head>');
  if (headCloseIdx === -1) return;

  const snippet = `  <link rel="stylesheet" href="${fontHref}" />\n`;
  const ytext = projectDoc.files.get(htmlFile);
  if (!ytext) return;

  projectDoc.ydoc.transact(() => {
    ytext.insert(headCloseIdx, snippet);
  }, LOCAL_USER_ORIGIN);
  reloadArtboardsForFile(htmlFile);
}

// ---------------------------------------------------------------------------
// 4. SHADOW LAYERS PARSER & SERIALIZER (CSS-03 Text Shadow & CSS-05 Box Shadow)
// ---------------------------------------------------------------------------

export interface ParsedShadowLayer {
  id: string;
  inset: boolean;
  x: string;
  y: string;
  blur: string;
  spread: string;
  color: string;
}

export function splitCommaSeparatedCssValue(raw: string): string[] {
  if (!raw || raw.trim() === 'none') return [];
  const parsed = valueParser(raw);
  const parts: string[] = [];
  let current = '';
  for (const node of parsed.nodes) {
    if (node.type === 'div' && node.value === ',') {
      if (current.trim()) parts.push(current.trim());
      current = '';
    } else {
      current += valueParser.stringify(node);
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

export function parseShadowList(
  raw: string,
  isBoxShadow: boolean
): ParsedShadowLayer[] {
  const chunks = splitCommaSeparatedCssValue(raw);
  return chunks.map((chunk, idx) => {
    const parsed = valueParser(chunk);
    const tokens: string[] = [];
    for (const node of parsed.nodes) {
      if (node.type === 'word' || node.type === 'function') {
        tokens.push(valueParser.stringify(node));
      }
    }

    let inset = false;
    const lengths: string[] = [];
    let color = 'rgb(15 23 42 / 0.18)';

    for (const tok of tokens) {
      if (tok.toLowerCase() === 'inset') {
        inset = true;
      } else if (/^-?\d/.test(tok)) {
        lengths.push(tok);
      } else {
        color = tok;
      }
    }

    return {
      id: `sh_${idx}`,
      inset: isBoxShadow ? inset : false,
      x: lengths[0] ?? '0px',
      y: lengths[1] ?? (isBoxShadow ? '8px' : '2px'),
      blur: lengths[2] ?? (isBoxShadow ? '20px' : '4px'),
      spread: isBoxShadow ? lengths[3] ?? '0px' : '0px',
      color,
    };
  });
}

export function serializeShadowList(
  layers: ParsedShadowLayer[],
  isBoxShadow: boolean
): string | null {
  if (layers.length === 0) return null;
  return layers
    .map((l) => {
      if (isBoxShadow) {
        return `${l.inset ? 'inset ' : ''}${l.x || '0px'} ${l.y || '0px'} ${
          l.blur || '0px'
        } ${l.spread || '0px'} ${l.color || '#000000'}`;
      }
      return `${l.x || '0px'} ${l.y || '0px'} ${l.blur || '0px'} ${
        l.color || '#000000'
      }`;
    })
    .join(', ');
}

// ---------------------------------------------------------------------------
// 5. 2D TRANSFORM PARSER & SERIALIZER (CSS-05_BACKGROUNDS_EFFECTS.md §2 & §3)
// ---------------------------------------------------------------------------

export interface TransformState {
  translateX: string;
  translateY: string;
  scale: string;
  rotate: string;
}

export function parseTransformValue(raw: string): TransformState {
  const state: TransformState = {
    translateX: '0px',
    translateY: '0px',
    scale: '1',
    rotate: '0deg',
  };
  if (!raw || raw.trim() === 'none') return state;

  const txMatch = /translateX\(\s*([^)]+)\)/i.exec(raw);
  const tyMatch = /translateY\(\s*([^)]+)\)/i.exec(raw);
  const t2dMatch = /translate\(\s*([^,)]+)(?:,\s*([^)]+))?\)/i.exec(raw);
  const scaleMatch = /scale\(\s*([^,)]+)\)/i.exec(raw);
  const rotMatch = /rotate\(\s*([^)]+)\)/i.exec(raw);

  if (t2dMatch) {
    state.translateX = t2dMatch[1].trim();
    if (t2dMatch[2]) state.translateY = t2dMatch[2].trim();
  }
  if (txMatch) state.translateX = txMatch[1].trim();
  if (tyMatch) state.translateY = tyMatch[1].trim();
  if (scaleMatch) state.scale = scaleMatch[1].trim();
  if (rotMatch) state.rotate = rotMatch[1].trim();

  return state;
}

export function serializeTransformValue(state: TransformState): string | null {
  const parts: string[] = [];
  const tx = state.translateX.trim();
  const ty = state.translateY.trim();
  const sc = state.scale.trim();
  const rot = state.rotate.trim();

  if (tx && tx !== '0' && tx !== '0px') {
    parts.push(`translateX(${tx})`);
  }
  if (ty && ty !== '0' && ty !== '0px') {
    parts.push(`translateY(${ty})`);
  }
  if (sc && sc !== '1') {
    parts.push(`scale(${sc})`);
  }
  if (rot && rot !== '0' && rot !== '0deg') {
    parts.push(`rotate(${rot})`);
  }

  return parts.length > 0 ? parts.join(' ') : null;
}
