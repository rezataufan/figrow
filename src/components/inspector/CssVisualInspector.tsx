import React, { useMemo, useState } from 'react';
import {
  Link2,
  Unlink2,
  Plus,
  X,
  Monitor,
  Tablet,
  Smartphone,
  Sparkles,
  Layers as CascadeIcon,
  Palette,
  Sliders,
  Download,
} from 'lucide-react';
import type { PseudoState } from '../../engine/types';
import {
  resolveElementCascade,
  renameProjectClassGlobal,
} from '../../engine/css/cascadeEngine';
import { exportSelectedNodeSnippet, triggerBlobDownload } from '../../engine/export/exportPipeline';
import { useSelectionStore } from '../../store/selectionStore';
import { useCanvasStore } from '../../store/canvasStore';
import { useLayersStore } from '../../store/layersStore';
import { useInspectorStore, getMediaQueryForWidth } from '../../store/inspectorStore';
import { UnitScrubInput } from './UnitScrubInput';
import { LayoutSection } from './LayoutSection';
import { TypographySection } from './TypographySection';
import { BackgroundEffectsSection } from './BackgroundEffectsSection';
import { ElementTraitsSection } from './ElementTraitsSection';

/**
 * CssVisualInspector — Full Implementation of:
 * - CSS-04_CLASSES_STATES.md (Selector Bar, Class chips add/remove/rename, Style Target dropdown,
 *   Pseudo-State switcher `:hover/:focus/:focus-visible/:active/::before/::after`, Media Query buttons,
 *   Cascade specificity & override list, Design Tokens `--*` live editor)
 * - CSS-01_BOX_MODEL.md (Interactive 4-Margin / 4-Border / 4-Padding visual diagram, Link mode,
 *   Sizing W/H/MinW/MaxW/MinH/MaxH, Fill helper, Aspect-Ratio, Box-Sizing, Overflow, Border-Radius)
 */

const PSEUDO_STATES: Array<{ label: string; value: PseudoState | null }> = [
  { label: 'none', value: null },
  { label: ':hover', value: ':hover' },
  { label: ':focus', value: ':focus' },
  { label: ':focus-visible', value: ':focus-visible' },
  { label: ':active', value: ':active' },
  { label: '::before', value: '::before' },
  { label: '::after', value: '::after' },
];

export function CssVisualInspector(): React.ReactElement {
  const [newClassInput, setNewClassInput] = useState('');
  const [renamingClass, setRenamingClass] = useState<string | null>(null);
  const [renameClassDraft, setRenameClassDraft] = useState('');
  const [newTokenName, setNewTokenName] = useState('');
  const [newTokenVal, setNewTokenVal] = useState('');
  const [aspectRatioLocked, setAspectRatioLocked] = useState(false);
  const [expandCorners, setExpandCorners] = useState(false);
  const [exportScale, setExportScale] = useState('1x');
  const [exportFormat, setExportFormat] = useState<'html' | 'css' | 'tailwind'>('html');
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const primaryKey = useSelectionStore((s) => s.primaryKey);
  const activeArtboardId = useCanvasStore((s) => s.activeArtboardId);
  const activeArtboard = useCanvasStore((s) => s.artboards[s.activeArtboardId]);
  const canvasBgColor = useCanvasStore((s) => s.canvasBgColor);
  const setCanvasBgColor = useCanvasStore((s) => s.setCanvasBgColor);
  const activeFile = useCanvasStore((s) => s.activeFile);
  const artboards = useCanvasStore((s) => s.artboards);
  const measuredRect = useCanvasStore((s) =>
    primaryKey ? s.measuredRects[s.activeArtboardId]?.[primaryKey] : undefined
  );
  const parentMeasuredRect = useCanvasStore((s) => {
    if (!primaryKey) return undefined;
    const rect = s.measuredRects[s.activeArtboardId]?.[primaryKey];
    if (!rect || !rect.parentId) return undefined;
    return s.measuredRects[s.activeArtboardId]?.[rect.parentId];
  });
  const activateOrSpawnBreakpoint = useCanvasStore((s) => s.activateOrSpawnBreakpoint);
  const docRevision = useLayersStore((s) => s.docRevision);

  const activeTab = useInspectorStore((s) => s.activeTab);
  const targetKind = useInspectorStore((s) => s.targetKind);
  const selectedSelector = useInspectorStore((s) => s.selectedSelector);
  const activeState = useInspectorStore((s) => s.activeState);
  const linkMode = useInspectorStore((s) => s.linkMode);
  const inspectorRevision = useInspectorStore((s) => s.inspectorRevision);

  const setActiveTab = useInspectorStore((s) => s.setActiveTab);
  const setTargetSelector = useInspectorStore((s) => s.setTargetSelector);
  const setActiveState = useInspectorStore((s) => s.setActiveState);
  const cycleLinkMode = useInspectorStore((s) => s.cycleLinkMode);
  const previewTransientStyle = useInspectorStore((s) => s.previewTransientStyle);
  const commitStyleProps = useInspectorStore((s) => s.commitStyleProps);
  const addClassToSelected = useInspectorStore((s) => s.addClassToSelected);
  const removeClassFromSelected = useInspectorStore((s) => s.removeClassFromSelected);
  const resolveTargetForNode = useInspectorStore((s) => s.resolveTargetForNode);
  const updateToken = useInspectorStore((s) => s.updateToken);
  const getTokens = useInspectorStore((s) => s.getTokens);

  const artboardWidth = activeArtboard?.width ?? 1440;

  const cascade = useMemo(() => {
    void docRevision;
    void inspectorRevision;
    if (!primaryKey) {
      return null;
    }
    const targetFile = activeArtboard?.file || activeFile || 'index.html';
    return resolveElementCascade(primaryKey, artboardWidth, activeState, targetFile);
  }, [primaryKey, artboardWidth, activeState, activeArtboard?.file, activeFile, docRevision, inspectorRevision]);

  const tokens = useMemo(() => {
    void docRevision;
    void inspectorRevision;
    return getTokens();
  }, [getTokens, docRevision, inspectorRevision]);

  const getStageSize = (): { w: number; h: number } => {
    const el = document.getElementById('vds-canvas-stage');
    if (!el) return { w: 1200, h: 800 };
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height };
  };

  if (activeTab === 'tokens') {
    return (
      <div className="vds-inspector-container">
        <div className="vds-inspector-top-tabs">
          <button
            type="button"
            className="vds-insp-tab"
            onClick={() => setActiveTab('styles')}
          >
            <Sliders size={13} />
            <span>Style Inspector</span>
          </button>
          <button
            type="button"
            className="vds-insp-tab active"
            onClick={() => setActiveTab('tokens')}
          >
            <Palette size={13} />
            <span>Tokens (:root)</span>
          </button>
        </div>

        <div className="vds-inspector-scroll">
          <div className="vds-insp-section">
            <div className="vds-insp-section-header">
              <span>CSS Custom Properties (--*)</span>
            </div>
            <div className="vds-token-list">
              {tokens.map((tok) => (
                <div key={`${tok.scope}-${tok.name}`} className="vds-token-row">
                  <div className="vds-token-meta">
                    {tok.group === 'color' && (
                      <input
                        type="color"
                        className="vds-token-swatch"
                        value={tok.value.startsWith('#') ? tok.value : '#6366f1'}
                        onChange={(e) => updateToken(tok.name, e.target.value, tok.scope)}
                      />
                    )}
                    <code className="vds-token-name">{tok.name}</code>
                  </div>
                  <input
                    type="text"
                    className="vds-token-val-input"
                    value={tok.value}
                    onChange={(e) => updateToken(tok.name, e.target.value, tok.scope)}
                  />
                </div>
              ))}
            </div>

            <div className="vds-token-add-form">
              <input
                type="text"
                placeholder="--space-4"
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
              />
              <input
                type="text"
                placeholder="1rem or #38bdf8"
                value={newTokenVal}
                onChange={(e) => setNewTokenVal(e.target.value)}
              />
              <button
                type="button"
                className="vds-btn-small"
                onClick={() => {
                  const rawName = newTokenName.trim();
                  const cleanName = (
                    rawName.startsWith('--') ? rawName : `--${rawName}`
                  ) as `--${string}`;
                  if (cleanName.length > 2 && newTokenVal.trim()) {
                    updateToken(cleanName, newTokenVal.trim());
                    setNewTokenName('');
                    setNewTokenVal('');
                  }
                }}
              >
                <Plus size={12} /> Add
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!primaryKey || !cascade || !cascade.vnode) {
    return (
      <div className="vds-inspector-container">
        <div className="vds-inspector-top-tabs">
          <button type="button" className="vds-insp-tab active">
            <Sliders size={13} />
            <span>Page Properties</span>
          </button>
          <button
            type="button"
            className="vds-insp-tab"
            onClick={() => setActiveTab('tokens')}
          >
            <Palette size={13} />
            <span>Tokens (:root)</span>
          </button>
        </div>
        <div className="vds-inspector-scroll">
          {/* PAGE SECTION */}
          <section className="vds-insp-section">
            <div className="vds-insp-section-header">
              <span>Page</span>
              <span className="vds-badge-pill">{activeFile}</span>
            </div>

            {/* CANVAS BACKGROUND COLOR PICKER */}
            <div className="vds-page-props-card">
              <span
                className="vds-sub-label"
                style={{ marginBottom: 6, fontWeight: 600 }}
              >
                Canvas Background
              </span>
              <div className="vds-figma-color-row">
                <div className="vds-swatch-wrapper">
                  <input
                    type="color"
                    className="vds-color-swatch-input"
                    value={
                      canvasBgColor.startsWith('#')
                        ? canvasBgColor.slice(0, 7)
                        : '#f5f5f5'
                    }
                    onChange={(e) => setCanvasBgColor(e.target.value)}
                  />
                </div>
                <input
                  type="text"
                  className="vds-figma-hex-input"
                  value={canvasBgColor.replace(/^#/, '')}
                  onChange={(e) => {
                    const val = e.target.value.trim();
                    if (val) setCanvasBgColor(`#${val.replace(/^#/, '')}`);
                  }}
                />
              </div>

              {/* CANVAS PRESETS */}
              <div className="vds-grid-preset-btns" style={{ marginTop: 8 }}>
                {[
                  { label: 'Clean White', val: '#ffffff' },
                  { label: 'Soft Gray', val: '#f5f5f5' },
                  { label: 'Figma Dark', val: '#2c2c2c' },
                  { label: 'Deep Black', val: '#1e1e1e' },
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className={`vds-mini-pill ${
                      canvasBgColor.toLowerCase() === p.val.toLowerCase()
                        ? 'active'
                        : ''
                    }`}
                    onClick={() => setCanvasBgColor(p.val)}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 2,
                        background: p.val,
                        border: '1px solid rgba(0,0,0,0.2)',
                        marginRight: 3,
                        display: 'inline-block',
                      }}
                    />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ARTBOARDS LIST */}
            <div className="vds-page-props-card" style={{ marginTop: 12 }}>
              <span
                className="vds-sub-label"
                style={{ marginBottom: 6, fontWeight: 600 }}
              >
                Frames on Page ({Object.keys(artboards).length})
              </span>
              {Object.values(artboards).map((ab) => (
                <div key={ab.id} className="vds-frame-summary-row">
                  <span style={{ color: '#818cf8', fontWeight: 600 }}>
                    # {ab.label}
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {ab.width} × auto
                  </span>
                </div>
              ))}
            </div>
          </section>

          <div
            className="vds-panel-empty"
            style={{ margin: '16px 12px', fontSize: 11 }}
          >
            Select an element on canvas to inspect dimensions, Auto Layout,
            typography, fills, and export.
          </div>
        </div>
      </div>
    );
  }

  const activeTarget = resolveTargetForNode(primaryKey, artboardWidth);
  const declared = cascade.declaredProps;

  const getVal = (prop: string): string => {
    if (prop === 'background-color') {
      return declared['background-color']?.raw || declared['background']?.raw || '';
    }
    return declared[prop]?.raw ?? '';
  };
  const getStatus = (prop: string): 'declared' | 'overridden' | 'computed' => {
    const info = declared[prop];
    if (!info) return 'computed';
    if (
      targetKind !== 'inline' &&
      info.winnerRuleId === 'inline'
    ) {
      return 'overridden';
    }
    return 'declared';
  };

  const applyBoxSideCommit = (
    prefix: 'margin' | 'padding' | 'border',
    side: 'top' | 'right' | 'bottom' | 'left',
    val: string | null
  ): void => {
    const suffix = prefix === 'border' ? '-width' : '';
    const propName = `${prefix}-${side}${suffix}`;

    if (linkMode === 'all') {
      commitStyleProps(activeArtboardId, artboardWidth, primaryKey, {
        [`${prefix}-top${suffix}`]: val,
        [`${prefix}-right${suffix}`]: val,
        [`${prefix}-bottom${suffix}`]: val,
        [`${prefix}-left${suffix}`]: val,
      });
      return;
    }

    if (linkMode === 'axis') {
      if (side === 'top' || side === 'bottom') {
        commitStyleProps(activeArtboardId, artboardWidth, primaryKey, {
          [`${prefix}-top${suffix}`]: val,
          [`${prefix}-bottom${suffix}`]: val,
        });
      } else {
        commitStyleProps(activeArtboardId, artboardWidth, primaryKey, {
          [`${prefix}-left${suffix}`]: val,
          [`${prefix}-right${suffix}`]: val,
        });
      }
      return;
    }

    commitStyleProps(activeArtboardId, artboardWidth, primaryKey, {
      [propName]: val,
    });
  };

  const applyBoxSideTransient = (
    prefix: 'margin' | 'padding' | 'border',
    side: 'top' | 'right' | 'bottom' | 'left',
    val: string
  ): void => {
    const suffix = prefix === 'border' ? '-width' : '';
    const propName = `${prefix}-${side}${suffix}`;
    if (linkMode === 'all') {
      previewTransientStyle(activeArtboardId, primaryKey, {
        [`${prefix}-top${suffix}`]: val,
        [`${prefix}-right${suffix}`]: val,
        [`${prefix}-bottom${suffix}`]: val,
        [`${prefix}-left${suffix}`]: val,
      });
    } else if (linkMode === 'axis') {
      if (side === 'top' || side === 'bottom') {
        previewTransientStyle(activeArtboardId, primaryKey, {
          [`${prefix}-top${suffix}`]: val,
          [`${prefix}-bottom${suffix}`]: val,
        });
      } else {
        previewTransientStyle(activeArtboardId, primaryKey, {
          [`${prefix}-left${suffix}`]: val,
          [`${prefix}-right${suffix}`]: val,
        });
      }
    } else {
      previewTransientStyle(activeArtboardId, primaryKey, { [propName]: val });
    }
  };

  const mediaContextQuery = getMediaQueryForWidth(artboardWidth);

  return (
    <div className="vds-inspector-container">
      {/* TOP MODE TABS (Style Inspector vs Design Tokens) */}
      <div className="vds-inspector-top-tabs">
        <button
          type="button"
          className="vds-insp-tab active"
          onClick={() => setActiveTab('styles')}
        >
          <Sliders size={13} />
          <span>Style Inspector</span>
        </button>
        <button
          type="button"
          className="vds-insp-tab"
          onClick={() => setActiveTab('tokens')}
        >
          <Palette size={13} />
          <span>Tokens ({tokens.length})</span>
        </button>
      </div>

      <div className="vds-inspector-scroll">
        {/* FIGMA TOP ALIGNMENT BAR */}
        <div className="vds-align-bar">
          <button
            type="button"
            className="vds-align-btn"
            title="Align left (Alt+A)"
            onClick={() => {
              const isAbsolute = getVal('position') === 'absolute';
              if (isAbsolute) {
                commitStyleProps(activeArtboardId, artboardWidth, primaryKey, { left: '0px', right: null });
              } else {
                commitStyleProps(activeArtboardId, artboardWidth, primaryKey, { 'align-self': 'flex-start', 'margin-right': 'auto', 'margin-left': '0px' });
              }
            }}
          >
            |←
          </button>
          <button
            type="button"
            className="vds-align-btn"
            title="Align horizontal centers (Alt+H)"
            onClick={() => {
              const isAbsolute = getVal('position') === 'absolute';
              if (isAbsolute) {
                commitStyleProps(activeArtboardId, artboardWidth, primaryKey, { left: '50%', transform: 'translateX(-50%)' });
              } else {
                commitStyleProps(activeArtboardId, artboardWidth, primaryKey, { 'align-self': 'center', 'margin-left': 'auto', 'margin-right': 'auto' });
              }
            }}
          >
            ↔
          </button>
          <button
            type="button"
            className="vds-align-btn"
            title="Align right (Alt+D)"
            onClick={() => {
              const isAbsolute = getVal('position') === 'absolute';
              if (isAbsolute) {
                commitStyleProps(activeArtboardId, artboardWidth, primaryKey, { right: '0px', left: null });
              } else {
                commitStyleProps(activeArtboardId, artboardWidth, primaryKey, { 'align-self': 'flex-end', 'margin-left': 'auto', 'margin-right': '0px' });
              }
            }}
          >
            →|
          </button>
          <div className="vds-align-sep" />
          <button
            type="button"
            className="vds-align-btn"
            title="Align top (Alt+W)"
            onClick={() => {
              const isAbsolute = getVal('position') === 'absolute';
              if (isAbsolute) {
                commitStyleProps(activeArtboardId, artboardWidth, primaryKey, { top: '0px', bottom: null });
              } else {
                commitStyleProps(activeArtboardId, artboardWidth, primaryKey, { 'align-self': 'flex-start' });
              }
            }}
          >
            ↑
          </button>
          <button
            type="button"
            className="vds-align-btn"
            title="Align vertical centers (Alt+V)"
            onClick={() => {
              const isAbsolute = getVal('position') === 'absolute';
              if (isAbsolute) {
                commitStyleProps(activeArtboardId, artboardWidth, primaryKey, { top: '50%', transform: 'translateY(-50%)' });
              } else {
                commitStyleProps(activeArtboardId, artboardWidth, primaryKey, { 'align-self': 'center' });
              }
            }}
          >
            ↕
          </button>
          <button
            type="button"
            className="vds-align-btn"
            title="Align bottom (Alt+S)"
            onClick={() => {
              const isAbsolute = getVal('position') === 'absolute';
              if (isAbsolute) {
                commitStyleProps(activeArtboardId, artboardWidth, primaryKey, { bottom: '0px', top: null });
              } else {
                commitStyleProps(activeArtboardId, artboardWidth, primaryKey, { 'align-self': 'flex-end' });
              }
            }}
          >
            ↓
          </button>
          <div className="vds-align-sep" />
          <button
            type="button"
            className="vds-align-btn"
            title="Distribute horizontal spacing"
            onClick={() => {
              commitStyleProps(activeArtboardId, artboardWidth, primaryKey, { 'justify-content': 'space-between' });
            }}
          >
            |||
          </button>
          <button
            type="button"
            className="vds-align-btn"
            title="Distribute vertical spacing"
            onClick={() => {
              commitStyleProps(activeArtboardId, artboardWidth, primaryKey, { 'align-content': 'space-between' });
            }}
          >
            ≡
          </button>
        </div>

        {/* STICKY SELECTOR BAR (CSS-04_CLASSES_STATES.md §1) */}
        <div className="vds-selector-bar">
          <div className="vds-selector-head">
            <code className="vds-selector-tag">{`<${cascade.vnode.tag}>`}</code>
            <span className="vds-selector-nodeid">#{primaryKey}</span>
          </div>

          {/* CLASS MANAGER CHIPS (F031) */}
          <div className="vds-class-chips">
            {cascade.classes.map((cls) =>
              renamingClass === cls ? (
                <input
                  key={cls}
                  className="vds-class-rename-input"
                  type="text"
                  value={renameClassDraft}
                  autoFocus
                  onChange={(e) => setRenameClassDraft(e.target.value)}
                  onBlur={() => {
                    renameProjectClassGlobal(cls, renameClassDraft);
                    setRenamingClass(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      renameProjectClassGlobal(cls, renameClassDraft);
                      setRenamingClass(null);
                    }
                    if (e.key === 'Escape') setRenamingClass(null);
                  }}
                />
              ) : (
                <span
                  key={cls}
                  className={`vds-class-chip ${
                    activeTarget.selector === `.${cls}` ? 'is-target' : ''
                  }`}
                  title="Click to target this class · Double-click to rename globally"
                  onClick={() => setTargetSelector('rule', `.${cls}`)}
                  onDoubleClick={() => {
                    setRenameClassDraft(cls);
                    setRenamingClass(cls);
                  }}
                >
                  .{cls}
                  <button
                    type="button"
                    className="vds-class-chip-del"
                    title="Remove class from element"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeClassFromSelected(primaryKey, cls);
                    }}
                  >
                    <X size={10} />
                  </button>
                </span>
              )
            )}

            <div className="vds-class-add-inline">
              <input
                type="text"
                placeholder="+ class..."
                value={newClassInput}
                onChange={(e) => setNewClassInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newClassInput.trim()) {
                    addClassToSelected(primaryKey, newClassInput);
                    setNewClassInput('');
                  }
                }}
              />
            </div>
          </div>

          {/* STYLE TARGET DROPDOWN (F032) */}
          <div className="vds-target-row">
            <label>Target:</label>
            <select
              className="vds-target-select"
              value={
                targetKind === 'inline'
                  ? '__inline__'
                  : activeTarget.selector
              }
              onChange={(e) => {
                const v = e.target.value;
                if (v === '__inline__') {
                  setTargetSelector('inline', null);
                } else {
                  setTargetSelector('rule', v);
                }
              }}
            >
              {cascade.classes.map((cls) => {
                const matchInfo = cascade.matchedRules.find(
                  (r) => r.baseSelector === `.${cls}`
                );
                return (
                  <option key={cls} value={`.${cls}`}>
                    .{cls} {matchInfo ? `(affects ${matchInfo.affects})` : '(new rule)'}
                  </option>
                );
              })}
              {cascade.matchedRules
                .filter((r) => !cascade.classes.includes(r.baseSelector.replace(/^\./, '')))
                .map((r) => (
                  <option key={r.ruleId} value={r.baseSelector}>
                    {r.baseSelector} (affects {r.affects})
                  </option>
                ))}
              <option value={`[data-vds-id="${primaryKey}"]`}>
                [{primaryKey}] (element rule)
              </option>
              <option value="__inline__">This element only (inline style)</option>
            </select>
          </div>

          {/* PSEUDO-STATE FORCE BAR (F033) */}
          <div className="vds-state-bar">
            {PSEUDO_STATES.map((st) => {
              const hasDeclInState =
                st.value !== null &&
                cascade.matchedRules.some((r) => r.state === st.value);
              return (
                <button
                  key={st.label}
                  type="button"
                  className={`vds-state-pill ${
                    activeState === st.value ? 'active' : ''
                  }`}
                  onClick={() =>
                    setActiveState(st.value, primaryKey, activeArtboardId)
                  }
                >
                  <span>{st.label}</span>
                  {hasDeclInState && <span className="vds-state-dot" />}
                </button>
              );
            })}
          </div>

          {/* MEDIA QUERY CONTEXT BAR (F034) */}
          <div className="vds-media-bar">
            <button
              type="button"
              className={`vds-media-pill ${!mediaContextQuery ? 'active' : ''}`}
              onClick={() => {
                const { w, h } = getStageSize();
                activateOrSpawnBreakpoint('desktop', w, h);
              }}
            >
              <Monitor size={11} />
              <span>Base</span>
            </button>
            <button
              type="button"
              className={`vds-media-pill ${
                mediaContextQuery === '(max-width: 1023.98px)' ? 'active' : ''
              }`}
              onClick={() => {
                const { w, h } = getStageSize();
                activateOrSpawnBreakpoint('tablet', w, h);
              }}
            >
              <Tablet size={11} />
              <span>≤1023px</span>
            </button>
            <button
              type="button"
              className={`vds-media-pill ${
                mediaContextQuery === '(max-width: 767.98px)' ? 'active' : ''
              }`}
              onClick={() => {
                const { w, h } = getStageSize();
                activateOrSpawnBreakpoint('mobile', w, h);
              }}
            >
              <Smartphone size={11} />
              <span>≤767px</span>
            </button>
          </div>
        </div>

        {/* SECTION -1: HTML ATTRIBUTES, ELEMENT TRAITS & REUSABLE SYMBOLS */}
        <ElementTraitsSection
          vnode={cascade.vnode}
          activeFile={activeArtboard?.file || activeFile || 'index.html'}
        />

        {/* SECTION 0: LAYOUT — DISPLAY, FLEXBOX & GRID (F024–F026 — CSS-02_FLEXBOX_GRID.md) */}
        <LayoutSection
          computedDisplay={measuredRect?.display ?? 'block'}
          parentDisplay={parentMeasuredRect?.display ?? null}
          getVal={getVal}
          getStatus={getStatus}
          onTransient={(props) =>
            previewTransientStyle(activeArtboardId, primaryKey, props)
          }
          onCommit={(props) =>
            commitStyleProps(activeArtboardId, artboardWidth, primaryKey, props)
          }
        />

        {/* SECTION 1: VISUAL BOX MODEL (F021 — CSS-01_BOX_MODEL.md) */}
        <section className="vds-insp-section">
          <div className="vds-insp-section-header">
            <span>Box Model (Margin · Border · Padding)</span>
            <button
              type="button"
              className={`vds-link-btn ${linkMode !== 'none' ? 'is-linked' : ''}`}
              title={`Side Link Mode: ${linkMode.toUpperCase()} (Click to cycle None -> Axis -> All)`}
              onClick={cycleLinkMode}
            >
              {linkMode === 'none' ? <Unlink2 size={12} /> : <Link2 size={12} />}
              <span>{linkMode}</span>
            </button>
          </div>

          {/* INTERACTIVE NESTED BOX MODEL DIAGRAM */}
          <div className="vds-boxmodel-diagram">
            <span className="vds-box-caption">MARGIN</span>
            {/* Margin Top */}
            <div className="vds-box-pos pos-top">
              <UnitScrubInput
                compact
                value={getVal('margin-top')}
                computedPlaceholder={String(Math.round(measuredRect?.margin.top ?? 0))}
                status={getStatus('margin-top')}
                onTransientChange={(v) => applyBoxSideTransient('margin', 'top', v)}
                onCommit={(v) => applyBoxSideCommit('margin', 'top', v)}
              />
            </div>
            {/* Margin Right */}
            <div className="vds-box-pos pos-right">
              <UnitScrubInput
                compact
                value={getVal('margin-right')}
                computedPlaceholder={String(Math.round(measuredRect?.margin.right ?? 0))}
                status={getStatus('margin-right')}
                onTransientChange={(v) => applyBoxSideTransient('margin', 'right', v)}
                onCommit={(v) => applyBoxSideCommit('margin', 'right', v)}
              />
            </div>
            {/* Margin Bottom */}
            <div className="vds-box-pos pos-bottom">
              <UnitScrubInput
                compact
                value={getVal('margin-bottom')}
                computedPlaceholder={String(Math.round(measuredRect?.margin.bottom ?? 0))}
                status={getStatus('margin-bottom')}
                onTransientChange={(v) => applyBoxSideTransient('margin', 'bottom', v)}
                onCommit={(v) => applyBoxSideCommit('margin', 'bottom', v)}
              />
            </div>
            {/* Margin Left */}
            <div className="vds-box-pos pos-left">
              <UnitScrubInput
                compact
                value={getVal('margin-left')}
                computedPlaceholder={String(Math.round(measuredRect?.margin.left ?? 0))}
                status={getStatus('margin-left')}
                onTransientChange={(v) => applyBoxSideTransient('margin', 'left', v)}
                onCommit={(v) => applyBoxSideCommit('margin', 'left', v)}
              />
            </div>

            {/* INNER PADDING BOX */}
            <div className="vds-boxmodel-padding">
              <span className="vds-box-caption">PADDING</span>
              {/* Padding Top */}
              <div className="vds-box-pos pos-top">
                <UnitScrubInput
                  compact
                  allowAuto={false}
                  value={getVal('padding-top')}
                  computedPlaceholder={String(Math.round(measuredRect?.padding.top ?? 0))}
                  status={getStatus('padding-top')}
                  onTransientChange={(v) => applyBoxSideTransient('padding', 'top', v)}
                  onCommit={(v) => applyBoxSideCommit('padding', 'top', v)}
                />
              </div>
              {/* Padding Right */}
              <div className="vds-box-pos pos-right">
                <UnitScrubInput
                  compact
                  allowAuto={false}
                  value={getVal('padding-right')}
                  computedPlaceholder={String(Math.round(measuredRect?.padding.right ?? 0))}
                  status={getStatus('padding-right')}
                  onTransientChange={(v) => applyBoxSideTransient('padding', 'right', v)}
                  onCommit={(v) => applyBoxSideCommit('padding', 'right', v)}
                />
              </div>
              {/* Padding Bottom */}
              <div className="vds-box-pos pos-bottom">
                <UnitScrubInput
                  compact
                  allowAuto={false}
                  value={getVal('padding-bottom')}
                  computedPlaceholder={String(
                    Math.round(measuredRect?.padding.bottom ?? 0)
                  )}
                  status={getStatus('padding-bottom')}
                  onTransientChange={(v) =>
                    applyBoxSideTransient('padding', 'bottom', v)
                  }
                  onCommit={(v) => applyBoxSideCommit('padding', 'bottom', v)}
                />
              </div>
              {/* Padding Left */}
              <div className="vds-box-pos pos-left">
                <UnitScrubInput
                  compact
                  allowAuto={false}
                  value={getVal('padding-left')}
                  computedPlaceholder={String(Math.round(measuredRect?.padding.left ?? 0))}
                  status={getStatus('padding-left')}
                  onTransientChange={(v) => applyBoxSideTransient('padding', 'left', v)}
                  onCommit={(v) => applyBoxSideCommit('padding', 'left', v)}
                />
              </div>

              {/* CENTER CONTENT READOUT */}
              <div className="vds-boxmodel-content">
                {Math.round(measuredRect?.border.width ?? 0)} ×{' '}
                {Math.round(measuredRect?.border.height ?? 0)}
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: FIGMA FRAME / GEOMETRY & CONSTRAINTS */}
        <section className="vds-insp-section">
          <div className="vds-insp-section-header">
            <span>Frame / Geometry</span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <button
                type="button"
                className={`vds-link-btn ${getVal('position') === 'absolute' ? 'is-linked' : ''}`}
                title={
                  getVal('position') === 'absolute'
                    ? 'Position: Absolute (Click to switch to Normal Document Flow)'
                    : 'Position: Normal Flow (Click to toggle Absolute Position)'
                }
                onClick={() => {
                  const isAbs = getVal('position') === 'absolute';
                  if (isAbs) {
                    commitStyleProps(activeArtboardId, artboardWidth, primaryKey, {
                      position: null,
                      left: null,
                      top: null,
                    });
                  } else {
                    commitStyleProps(activeArtboardId, artboardWidth, primaryKey, {
                      position: 'absolute',
                      left: `${Math.round(measuredRect?.border.x ?? 0)}px`,
                      top: `${Math.round(measuredRect?.border.y ?? 0)}px`,
                    });
                  }
                }}
              >
                <span>{getVal('position') === 'absolute' ? '⬚ Abs' : '⬚ Flow'}</span>
              </button>
              <button
                type="button"
                className={`vds-link-btn ${aspectRatioLocked ? 'is-linked' : ''}`}
                title="Constrain Proportions (W/H ratio)"
                onClick={() => setAspectRatioLocked(!aspectRatioLocked)}
              >
                {aspectRatioLocked ? <Link2 size={11} /> : <Unlink2 size={11} />}
              </button>
            </div>
          </div>

          <div className="vds-size-grid">
            <UnitScrubInput
              label="X"
              value={getVal('left')}
              computedPlaceholder={`${Math.round(measuredRect?.border.x ?? 0)}px`}
              status={getStatus('left')}
              onTransientChange={(v) =>
                previewTransientStyle(activeArtboardId, primaryKey, { left: v })
              }
              onCommit={(v) =>
                commitStyleProps(activeArtboardId, artboardWidth, primaryKey, {
                  left: v,
                })
              }
            />
            <UnitScrubInput
              label="Y"
              value={getVal('top')}
              computedPlaceholder={`${Math.round(measuredRect?.border.y ?? 0)}px`}
              status={getStatus('top')}
              onTransientChange={(v) =>
                previewTransientStyle(activeArtboardId, primaryKey, { top: v })
              }
              onCommit={(v) =>
                commitStyleProps(activeArtboardId, artboardWidth, primaryKey, {
                  top: v,
                })
              }
            />
            <UnitScrubInput
              label="W"
              value={getVal('width')}
              computedPlaceholder={`${Math.round(measuredRect?.border.width ?? 0)}px`}
              status={getStatus('width')}
              onTransientChange={(v) =>
                previewTransientStyle(activeArtboardId, primaryKey, { width: v })
              }
              onCommit={(v) => {
                const nextProps: Record<string, string | null> = { width: v };
                if (aspectRatioLocked && v && measuredRect?.border.width && measuredRect?.border.height) {
                  const num = parseFloat(v);
                  if (!isNaN(num)) {
                    const ratio = measuredRect.border.height / measuredRect.border.width;
                    nextProps.height = `${Math.round(num * ratio)}px`;
                  }
                }
                commitStyleProps(activeArtboardId, artboardWidth, primaryKey, nextProps);
              }}
            />
            <UnitScrubInput
              label="H"
              value={getVal('height')}
              computedPlaceholder="auto"
              status={getStatus('height')}
              onTransientChange={(v) =>
                previewTransientStyle(activeArtboardId, primaryKey, { height: v })
              }
              onCommit={(v) => {
                const nextProps: Record<string, string | null> = { height: v };
                if (aspectRatioLocked && v && measuredRect?.border.width && measuredRect?.border.height) {
                  const num = parseFloat(v);
                  if (!isNaN(num)) {
                    const ratio = measuredRect.border.width / measuredRect.border.height;
                    nextProps.width = `${Math.round(num * ratio)}px`;
                  }
                }
                commitStyleProps(activeArtboardId, artboardWidth, primaryKey, nextProps);
              }}
            />
            <UnitScrubInput
              label="∠"
              value={getVal('rotate') || getVal('transform')}
              computedPlaceholder="0°"
              status={getStatus('rotate')}
              onTransientChange={(v) =>
                previewTransientStyle(activeArtboardId, primaryKey, { rotate: v })
              }
              onCommit={(v) =>
                commitStyleProps(activeArtboardId, artboardWidth, primaryKey, {
                  rotate: v ? (v.includes('deg') ? v : `${v}deg`) : null,
                })
              }
            />
            <div style={{ position: 'relative' }}>
              <UnitScrubInput
                label="⌒"
                value={getVal('border-radius')}
                computedPlaceholder="0px"
                status={getStatus('border-radius')}
                onTransientChange={(v) =>
                  previewTransientStyle(activeArtboardId, primaryKey, {
                    'border-radius': v,
                  })
                }
                onCommit={(v) =>
                  commitStyleProps(activeArtboardId, artboardWidth, primaryKey, {
                    'border-radius': v,
                  })
                }
              />
              <button
                type="button"
                className={`vds-corner-expand-btn ${expandCorners ? 'is-active' : ''}`}
                title="Independent 4 Corners"
                onClick={() => setExpandCorners(!expandCorners)}
              >
                ⊞
              </button>
            </div>
          </div>

          {/* INDEPENDENT 4 CORNERS EXPANDED */}
          {expandCorners && (
            <div className="vds-corners-quad">
              <UnitScrubInput
                compact
                label="TL"
                value={getVal('border-top-left-radius')}
                computedPlaceholder="0px"
                status={getStatus('border-top-left-radius')}
                onTransientChange={(v) =>
                  previewTransientStyle(activeArtboardId, primaryKey, { 'border-top-left-radius': v })
                }
                onCommit={(v) =>
                  commitStyleProps(activeArtboardId, artboardWidth, primaryKey, { 'border-top-left-radius': v })
                }
              />
              <UnitScrubInput
                compact
                label="TR"
                value={getVal('border-top-right-radius')}
                computedPlaceholder="0px"
                status={getStatus('border-top-right-radius')}
                onTransientChange={(v) =>
                  previewTransientStyle(activeArtboardId, primaryKey, { 'border-top-right-radius': v })
                }
                onCommit={(v) =>
                  commitStyleProps(activeArtboardId, artboardWidth, primaryKey, { 'border-top-right-radius': v })
                }
              />
              <UnitScrubInput
                compact
                label="BR"
                value={getVal('border-bottom-right-radius')}
                computedPlaceholder="0px"
                status={getStatus('border-bottom-right-radius')}
                onTransientChange={(v) =>
                  previewTransientStyle(activeArtboardId, primaryKey, { 'border-bottom-right-radius': v })
                }
                onCommit={(v) =>
                  commitStyleProps(activeArtboardId, artboardWidth, primaryKey, { 'border-bottom-right-radius': v })
                }
              />
              <UnitScrubInput
                compact
                label="BL"
                value={getVal('border-bottom-left-radius')}
                computedPlaceholder="0px"
                status={getStatus('border-bottom-left-radius')}
                onTransientChange={(v) =>
                  previewTransientStyle(activeArtboardId, primaryKey, { 'border-bottom-left-radius': v })
                }
                onCommit={(v) =>
                  commitStyleProps(activeArtboardId, artboardWidth, primaryKey, { 'border-bottom-left-radius': v })
                }
              />
            </div>
          )}

          {/* RESIZING DROPDOWNS & OVERFLOW */}
          <div className="vds-size-row-extra">
            <div className="vds-select-field">
              <span>W Resizing</span>
              <select
                value={
                  getVal('width') === '100%'
                    ? 'fill'
                    : getVal('width') === 'max-content' || getVal('width') === 'auto'
                      ? 'hug'
                      : 'fixed'
                }
                onChange={(e) => {
                  const m = e.target.value;
                  if (m === 'fill') commitStyleProps(activeArtboardId, artboardWidth, primaryKey, { width: '100%' });
                  else if (m === 'hug') commitStyleProps(activeArtboardId, artboardWidth, primaryKey, { width: 'max-content' });
                  else commitStyleProps(activeArtboardId, artboardWidth, primaryKey, { width: `${Math.round(measuredRect?.border.width ?? 320)}px` });
                }}
              >
                <option value="fixed">Fixed</option>
                <option value="hug">Hug contents</option>
                <option value="fill">Fill container</option>
              </select>
            </div>

            <div className="vds-select-field">
              <span>H Resizing</span>
              <select
                value={
                  getVal('height') === '100%'
                    ? 'fill'
                    : getVal('height') === 'auto' || !getVal('height')
                      ? 'hug'
                      : 'fixed'
                }
                onChange={(e) => {
                  const m = e.target.value;
                  if (m === 'fill') commitStyleProps(activeArtboardId, artboardWidth, primaryKey, { height: '100%' });
                  else if (m === 'hug') commitStyleProps(activeArtboardId, artboardWidth, primaryKey, { height: 'auto' });
                  else commitStyleProps(activeArtboardId, artboardWidth, primaryKey, { height: `${Math.round(measuredRect?.border.height ?? 200)}px` });
                }}
              >
                <option value="hug">Hug contents</option>
                <option value="fixed">Fixed</option>
                <option value="fill">Fill container</option>
              </select>
            </div>
          </div>

          {/* LAYER BLEND MODE & OPACITY */}
          <div className="vds-size-row-extra" style={{ marginTop: 6 }}>
            <div className="vds-select-field">
              <span>Blend</span>
              <select
                value={getVal('mix-blend-mode') || 'normal'}
                onChange={(e) =>
                  commitStyleProps(activeArtboardId, artboardWidth, primaryKey, {
                    'mix-blend-mode': e.target.value === 'normal' ? null : e.target.value,
                  })
                }
              >
                <option value="normal">Pass through (normal)</option>
                <option value="multiply">Multiply</option>
                <option value="screen">Screen</option>
                <option value="overlay">Overlay</option>
                <option value="darken">Darken</option>
                <option value="lighten">Lighten</option>
                <option value="color-dodge">Color Dodge</option>
              </select>
            </div>
            <div className="vds-select-field">
              <span>Opacity</span>
              <input
                type="text"
                className="vds-blend-opacity-input"
                value={getVal('opacity') || '1'}
                onChange={(e) =>
                  commitStyleProps(activeArtboardId, artboardWidth, primaryKey, {
                    opacity: e.target.value,
                  })
                }
              />
            </div>
          </div>

          <div className="vds-size-row-extra" style={{ marginTop: 6 }}>
            <div className="vds-select-field">
              <span>Clip content</span>
              <select
                value={getVal('overflow') === 'hidden' ? 'clip' : 'visible'}
                onChange={(e) =>
                  commitStyleProps(activeArtboardId, artboardWidth, primaryKey, {
                    overflow: e.target.value === 'clip' ? 'hidden' : 'visible',
                  })
                }
              >
                <option value="visible">Visible</option>
                <option value="clip">Clip content (hidden)</option>
              </select>
            </div>
          </div>

          <div className="vds-size-row-extra">
            <div className="vds-select-field">
              <span>Aspect</span>
              <select
                value={getVal('aspect-ratio') || 'auto'}
                onChange={(e) =>
                  commitStyleProps(activeArtboardId, artboardWidth, primaryKey, {
                    'aspect-ratio':
                      e.target.value === 'auto' ? null : e.target.value,
                  })
                }
              >
                <option value="auto">auto</option>
                <option value="16 / 9">16 / 9</option>
                <option value="4 / 3">4 / 3</option>
                <option value="1 / 1">1 / 1</option>
                <option value="3 / 2">3 / 2</option>
              </select>
            </div>

            <div className="vds-select-field">
              <span>Box</span>
              <select
                value={getVal('box-sizing') || 'border-box'}
                onChange={(e) =>
                  commitStyleProps(activeArtboardId, artboardWidth, primaryKey, {
                    'box-sizing': e.target.value,
                  })
                }
              >
                <option value="border-box">border-box</option>
                <option value="content-box">content-box</option>
              </select>
            </div>
          </div>
        </section>

        {/* SECTION 2.5: TYPOGRAPHY (F027–F030 — CSS-03_TYPOGRAPHY.md) */}
        <TypographySection
          htmlFile={activeArtboard?.file ?? 'index.html'}
          computedFontSizePx={measuredRect?.fontSize ?? 16}
          tokens={tokens}
          getVal={getVal}
          getStatus={getStatus}
          onTransient={(props) =>
            previewTransientStyle(activeArtboardId, primaryKey, props)
          }
          onCommit={(props) =>
            commitStyleProps(activeArtboardId, artboardWidth, primaryKey, props)
          }
        />

        {/* SECTION 2.8: BACKGROUNDS, BORDERS, SHADOWS, FILTERS & TRANSFORMS (CSS-05) */}
        <BackgroundEffectsSection
          tokens={tokens}
          getVal={getVal}
          getStatus={getStatus}
          onTransient={(props) =>
            previewTransientStyle(activeArtboardId, primaryKey, props)
          }
          onCommit={(props) =>
            commitStyleProps(activeArtboardId, artboardWidth, primaryKey, props)
          }
        />

        {/* SECTION 3: CASCADE & SPECIFICITY INSPECTOR (CSS-04 §1 & §3) */}
        <section className="vds-insp-section">
          <div className="vds-insp-section-header">
            <span>
              <CascadeIcon size={12} style={{ marginRight: 5 }} />
              Cascade &amp; Matched Rules ({cascade.matchedRules.length})
            </span>
          </div>

          <div className="vds-cascade-list">
            {cascade.matchedRules.map((mr) => (
              <div
                key={mr.ruleId}
                className={`vds-cascade-rule ${
                  !mr.mediaActive ? 'is-inactive-media' : ''
                }`}
              >
                <div className="vds-cascade-rule-head">
                  <code className="vds-cascade-sel">{mr.selector}</code>
                  {mr.media && (
                    <span className="vds-cascade-media">@{mr.media}</span>
                  )}
                  <span className="vds-cascade-spec" title="Specificity (ID, Class, Type)">
                    ({mr.specificity.join(',')})
                  </span>
                </div>
                <div className="vds-cascade-decls">
                  {Object.entries(mr.decls)
                    .filter(([p]) => !p.startsWith('padding-') && !p.startsWith('margin-'))
                    .map(([prop, val]) => {
                      const isWinner =
                        declared[prop]?.winnerRuleId === mr.ruleId && mr.mediaActive;
                      return (
                        <div
                          key={prop}
                          className={`vds-cascade-decl ${
                            isWinner ? 'is-winner' : 'is-overridden'
                          }`}
                        >
                          <span className="vds-cascade-mark">
                            {isWinner ? '✓' : '✗'}
                          </span>
                          <span className="vds-cascade-prop">{prop}:</span>
                          <span className="vds-cascade-val">{val};</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 4: FIGMA 1-CLICK EXPORT */}
        <section className="vds-insp-section">
          <div className="vds-insp-section-header">
            <span>
              <Download size={12} style={{ marginRight: 5 }} />
              Export Selection
            </span>
          </div>
          <div className="vds-export-selection-card">
            <div className="vds-size-grid">
              <div className="vds-select-field">
                <span>Scale</span>
                <select
                  value={exportScale}
                  onChange={(e) => setExportScale(e.target.value)}
                >
                  <option value="1x">1x</option>
                  <option value="2x">2x</option>
                  <option value="3x">3x</option>
                  <option value="0.5x">0.5x</option>
                </select>
              </div>
              <div className="vds-select-field">
                <span>Format</span>
                <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value as any)}
                >
                  <option value="html">HTML</option>
                  <option value="css">CSS</option>
                  <option value="tailwind">Tailwind</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button
                type="button"
                className="vds-btn-primary"
                style={{ flex: 1, height: 26, fontSize: 11 }}
                onClick={() => {
                  const result = exportSelectedNodeSnippet(
                    activeArtboard?.file || 'index.html',
                    primaryKey,
                    exportFormat
                  );
                  const mime =
                    exportFormat === 'html'
                      ? 'text/html'
                      : exportFormat === 'css'
                      ? 'text/css'
                      : 'text/plain';
                  const blob = new Blob([result.code], { type: mime });
                  triggerBlobDownload(blob, result.fileName);
                }}
              >
                <Download size={11} style={{ marginRight: 4 }} />
                Export {exportFormat.toUpperCase()}
              </button>
              <button
                type="button"
                className="vds-mini-pill"
                style={{ height: 26, padding: '0 8px' }}
                title="Copy snippet to clipboard"
                onClick={async () => {
                  const result = exportSelectedNodeSnippet(
                    activeArtboard?.file || 'index.html',
                    primaryKey,
                    exportFormat
                  );
                  await navigator.clipboard.writeText(result.code);
                  setCopiedSnippet(true);
                  setTimeout(() => setCopiedSnippet(false), 2000);
                }}
              >
                {copiedSnippet ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
