/**
 * Core Engine Contracts — Aligned with 01_SYSTEM_ARCHITECTURE.md
 * Single source of truth for Document Model, AST VNode, CSS RuleIndex,
 * Iframe Runtime Agent Protocol, and Command Bus.
 */

export type NodeId = string;
export type Range = [number, number];

export interface Box {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface FileMeta {
  mime: 'text/html' | 'text/css' | 'text/javascript';
  encoding: 'utf-8';
  lastFormattedHash?: string;
}

export interface NodeDesignMeta {
  nodeKey: string;
  layerName?: string;
  locked?: boolean;
  hiddenInDesign?: boolean;
}

export interface AssetRef {
  hash: string;
  path: string;
  mime: string;
  bytes: number;
  width?: number;
  height?: number;
  usedBy: string[];
}

export interface VNodeAttr {
  name: string;
  value: string;
  range: Range;
  valueRange?: Range;
}

export interface VNode {
  id: NodeId;
  key: string;
  type: 'element' | 'text' | 'comment' | 'doctype';
  tag?: string;
  textContent?: string;
  attrs: VNodeAttr[];
  children: NodeId[];
  parent: NodeId | null;
  range: Range;
  startTagRange?: Range;
  endTagRange?: Range | null;
  file: string;
}

export interface CssDeclRef {
  prop: string;
  value: string;
  important: boolean;
  range: Range;
  valueRange: Range;
}

export interface CssRuleRef {
  ruleId: string;
  file: string;
  selector: string;
  selectorRange: Range;
  media: string | null;
  layer: string | null;
  specificity: [number, number, number];
  order: number;
  decls: CssDeclRef[];
}

export type PatchOp =
  | { op: 'insert'; parentId: NodeId; beforeId: NodeId | null; html: string }
  | { op: 'remove'; id: NodeId }
  | { op: 'move'; id: NodeId; parentId: NodeId; beforeId: NodeId | null }
  | { op: 'setAttr'; id: NodeId; name: string; value: string | null }
  | { op: 'setText'; id: NodeId; text: string }
  | { op: 'setInnerHtml'; id: NodeId; html: string }
  | { op: 'replaceSheet'; file: string; cssText: string }
  | {
      op: 'setDecl';
      file: string;
      ruleIndexPath: number[];
      prop: string;
      value: string;
      important: boolean;
    }
  | { op: 'reload'; reason: 'script-changed' | 'head-changed' | 'parse-recovery' };

export type PseudoState =
  | ':hover'
  | ':focus'
  | ':focus-visible'
  | ':focus-within'
  | ':active'
  | ':visited'
  | ':disabled'
  | '::before'
  | '::after';

export type HostMsg =
  | {
      t: 'load';
      html: string;
      sheets: Array<{ file: string; css: string }>;
      mode: 'design' | 'preview';
    }
  | { t: 'patch'; seq: number; ops: PatchOp[] }
  | { t: 'transient'; id: NodeId; style: Record<string, string> }
  | { t: 'clearTransient'; id?: NodeId; revert?: boolean }
  | { t: 'forceState'; id: NodeId; states: PseudoState[] }
  | { t: 'measure'; ids: NodeId[] }
  | { t: 'hitTest'; x: number; y: number; deep: boolean }
  | { t: 'startInlineEdit'; id: NodeId }
  | { t: 'commitInlineEdit'; id: NodeId }
  | {
      t: 'execInlineFormat';
      id: NodeId;
      command: 'bold' | 'italic' | 'underline' | 'code' | 'createLink' | 'unlink' | 'removeFormat';
      value?: string;
    };

export interface MeasuredRectItem {
  id: NodeId;
  tag: string;
  classes: string[];
  parentId: NodeId | null;
  display: string;
  flexDirection?: string;
  gap?: number;
  fontSize: number;
  rootFontSize: number;
  parentWidth: number;
  border: DOMRectInit;
  margin: Box;
  padding: Box;
}

export type AgentMsg =
  | { t: 'hello'; v: number; artboardId: string }
  | { t: 'ack'; seq: number; contentHeight?: number }
  | { t: 'rects'; frame: number; contentHeight: number; items: MeasuredRectItem[] }
  | { t: 'hit'; id: NodeId | null; path: NodeId[]; x: number; y: number }
  | { t: 'inlineTextCommitted'; id: NodeId; text: string; innerHtml?: string }
  | { t: 'domHydrated'; bodyHtml: string }
  | {
      t: 'matchedRules';
      id: NodeId;
      rules: Array<{ sheet: string; index: number[]; selector: string }>;
    }
  | { t: 'error'; kind: 'script' | 'resource'; message: string; stack?: string };

export interface TextEdit {
  file: string;
  range: Range;
  insert: string;
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export interface BreakpointDef {
  id: string;
  label: string;
  minWidth: number | null;
  maxWidth: number | null;
  previewWidth: number;
}

export interface ArtboardDef {
  id: string;
  file: string;
  breakpointId: string;
  label: string;
  width: number;
  heightMode: 'content' | 'fixed';
  fixedHeight?: number;
  measuredHeight: number;
  worldX: number;
  worldY: number;
  lifecycle: 'live' | 'frozen' | 'unloaded';
}
