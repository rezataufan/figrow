import React, { useState } from 'react';
import {
  ArrowRight,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CornerDownLeft,
  Plus,
  X,
  Grid,
  SlidersHorizontal,
  ArrowLeftRight,
} from 'lucide-react';
import {
  matrixToProps,
  propsToMatrixCell,
  parseGridTrackTokens,
  serializeGridTrackTokens,
} from '../../engine/css/styleValueParsers';
import { UnitScrubInput } from './UnitScrubInput';

interface LayoutSectionProps {
  computedDisplay: string;
  parentDisplay: string | null;
  getVal: (prop: string) => string;
  getStatus: (prop: string) => 'declared' | 'overridden' | 'computed';
  onTransient: (props: Record<string, string>) => void;
  onCommit: (props: Record<string, string | null>) => void;
}

const DISPLAY_MODES = [
  { label: 'Block', value: 'block' },
  { label: 'Flex', value: 'flex' },
  { label: 'Grid', value: 'grid' },
  { label: 'In-Flex', value: 'inline-flex' },
  { label: 'Inline', value: 'inline-block' },
  { label: 'None', value: 'none' },
];

export function LayoutSection({
  computedDisplay,
  parentDisplay,
  getVal,
  getStatus,
  onTransient,
  onCommit,
}: LayoutSectionProps): React.ReactElement {
  const activeDisplay = getVal('display') || computedDisplay || 'block';
  const isFlex = activeDisplay === 'flex' || activeDisplay === 'inline-flex';
  const isGrid = activeDisplay === 'grid' || activeDisplay === 'inline-grid';

  const flexDirRaw = getVal('flex-direction') || 'row';
  const primaryAxis: 'row' | 'column' = flexDirRaw.startsWith('column')
    ? 'column'
    : 'row';
  const justifyVal = getVal('justify-content') || 'flex-start';
  const alignVal = getVal('align-items') || 'stretch';
  const activeMatrixCell = propsToMatrixCell(justifyVal, alignVal, primaryAxis);

  const [expandPadding, setExpandPadding] = useState(false);
  const isRow = flexDirRaw.startsWith('row');
  const isColumn = flexDirRaw.startsWith('column');
  const isReverse = flexDirRaw.endsWith('-reverse');
  const isWrap = getVal('flex-wrap') === 'wrap';

  const rawGridCols = getVal('grid-template-columns');
  const gridTrackList = parseGridTrackTokens(
    rawGridCols || 'repeat(3, minmax(0, 1fr))'
  );

  const isParentFlex =
    parentDisplay === 'flex' || parentDisplay === 'inline-flex';
  const isParentGrid =
    parentDisplay === 'grid' || parentDisplay === 'inline-grid';

  return (
    <>
      <section className="vds-insp-section">
        <div className="vds-insp-section-header">
          <span>Layout (Auto Layout · Grid)</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {!isFlex && (
              <button
                type="button"
                className="vds-mini-pill"
                style={{
                  fontSize: 10,
                  padding: '1px 5px',
                  background: 'rgba(99, 102, 241, 0.15)',
                  color: '#818cf8',
                }}
                onClick={() => onCommit({ display: 'flex' })}
              >
                + Auto Layout
              </button>
            )}
            <span className="vds-badge-pill">{activeDisplay}</span>
          </div>
        </div>

        {/* DISPLAY MODE SEGMENTED BAR */}
        <div className="vds-segmented-bar">
          {DISPLAY_MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              className={`vds-seg-btn ${
                activeDisplay === m.value ? 'active' : ''
              }`}
              onClick={() => onCommit({ display: m.value })}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* FLEXBOX CONTAINER CONTROLS (F024 — CSS-02_FLEXBOX_GRID.md) */}
        {isFlex && (
          <div className="vds-layout-subpanel">
            <div className="vds-flex-top-row">
              <div className="vds-btn-group" title="Auto Layout Direction">
                <button
                  type="button"
                  className={`vds-icon-toggle ${
                    isRow && !isWrap ? 'active' : ''
                  }`}
                  title="Horizontal (row)"
                  onClick={() =>
                    onCommit({
                      'flex-direction': isReverse ? 'row-reverse' : 'row',
                      'flex-wrap': 'nowrap',
                    })
                  }
                >
                  <ArrowRight size={13} />
                </button>
                <button
                  type="button"
                  className={`vds-icon-toggle ${isColumn ? 'active' : ''}`}
                  title="Vertical (column)"
                  onClick={() =>
                    onCommit({
                      'flex-direction': isReverse ? 'column-reverse' : 'column',
                      'flex-wrap': 'nowrap',
                    })
                  }
                >
                  <ArrowDown size={13} />
                </button>
                <button
                  type="button"
                  className={`vds-icon-toggle ${isWrap ? 'active' : ''}`}
                  title="Wrap (flex-wrap: wrap)"
                  onClick={() =>
                    onCommit({
                      'flex-wrap': isWrap ? 'nowrap' : 'wrap',
                    })
                  }
                >
                  <CornerDownLeft size={12} />
                  <span>Wrap</span>
                </button>
                <button
                  type="button"
                  className={`vds-icon-toggle ${isReverse ? 'active' : ''}`}
                  title={isReverse ? 'Reverse (Active)' : 'Reverse direction'}
                  onClick={() => {
                    const nextDir = isRow
                      ? isReverse
                        ? 'row'
                        : 'row-reverse'
                      : isReverse
                      ? 'column'
                      : 'column-reverse';
                    onCommit({ 'flex-direction': nextDir });
                  }}
                >
                  <ArrowLeftRight size={12} />
                </button>
              </div>
            </div>

            {/* 3x3 ALIGNMENT MATRIX + SELECTORS */}
            <div className="vds-flex-matrix-row">
              <div
                className="vds-align-matrix"
                title="3×3 Alignment Matrix (Click cell to set justify-content & align-items)"
              >
                {([0, 1, 2] as const).map((r) =>
                  ([0, 1, 2] as const).map((c) => {
                    const isCellActive =
                      activeMatrixCell?.row === r &&
                      activeMatrixCell?.col === c;
                    return (
                      <button
                        key={`${r}-${c}`}
                        type="button"
                        className={`vds-matrix-cell ${
                          isCellActive ? 'active' : ''
                        }`}
                        onClick={() => {
                          const nextProps = matrixToProps(
                            { row: r, col: c },
                            primaryAxis
                          );
                          onCommit(nextProps);
                        }}
                      >
                        <span className="vds-matrix-dot" />
                      </button>
                    );
                  })
                )}
              </div>

              <div className="vds-flex-select-col">
                <div className="vds-select-field">
                  <span>Justify</span>
                  <select
                    value={justifyVal}
                    onChange={(e) =>
                      onCommit({ 'justify-content': e.target.value })
                    }
                  >
                    <option value="flex-start">flex-start</option>
                    <option value="center">center</option>
                    <option value="flex-end">flex-end</option>
                    <option value="space-between">space-between</option>
                    <option value="space-around">space-around</option>
                    <option value="space-evenly">space-evenly</option>
                  </select>
                </div>

                <div className="vds-select-field">
                  <span>Align</span>
                  <select
                    value={alignVal}
                    onChange={(e) =>
                      onCommit({ 'align-items': e.target.value })
                    }
                  >
                    <option value="stretch">stretch</option>
                    <option value="flex-start">flex-start</option>
                    <option value="center">center</option>
                    <option value="flex-end">flex-end</option>
                    <option value="baseline">baseline</option>
                  </select>
                </div>
              </div>
            </div>

            {/* FIGMA-STYLE GAP & PADDING */}
            <div className="vds-size-grid" style={{ marginTop: 6 }}>
              <UnitScrubInput
                label="Gap"
                allowAuto={false}
                value={getVal('gap')}
                computedPlaceholder="0px"
                status={getStatus('gap')}
                onTransientChange={(v) => onTransient({ gap: v })}
                onCommit={(v) => onCommit({ gap: v })}
              />
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                }}
              >
                <button
                  type="button"
                  className={`vds-corner-expand-btn ${
                    expandPadding ? 'active' : ''
                  }`}
                  title={
                    expandPadding
                      ? 'Collapse to H/V Padding'
                      : 'Expand 4-side Padding'
                  }
                  onClick={() => setExpandPadding(!expandPadding)}
                  style={{ height: 24, padding: '0 6px', fontSize: 11 }}
                >
                  <SlidersHorizontal size={11} style={{ marginRight: 3 }} />
                  {expandPadding ? '4-Side' : 'H/V'}
                </button>
              </div>
            </div>

            {!expandPadding ? (
              <div className="vds-size-grid">
                <UnitScrubInput
                  label="H-Pad"
                  allowAuto={false}
                  value={getVal('padding-left') || getVal('padding-right')}
                  computedPlaceholder="0px"
                  status={getStatus('padding-left')}
                  onTransientChange={(v) =>
                    onTransient({
                      'padding-left': v,
                      'padding-right': v,
                    })
                  }
                  onCommit={(v) =>
                    onCommit({
                      'padding-left': v,
                      'padding-right': v,
                    })
                  }
                />
                <UnitScrubInput
                  label="V-Pad"
                  allowAuto={false}
                  value={getVal('padding-top') || getVal('padding-bottom')}
                  computedPlaceholder="0px"
                  status={getStatus('padding-top')}
                  onTransientChange={(v) =>
                    onTransient({
                      'padding-top': v,
                      'padding-bottom': v,
                    })
                  }
                  onCommit={(v) =>
                    onCommit({
                      'padding-top': v,
                      'padding-bottom': v,
                    })
                  }
                />
              </div>
            ) : (
              <div className="vds-corners-quad" style={{ marginTop: 4 }}>
                <UnitScrubInput
                  label="Top"
                  compact
                  value={getVal('padding-top')}
                  computedPlaceholder="0px"
                  status={getStatus('padding-top')}
                  onTransientChange={(v) => onTransient({ 'padding-top': v })}
                  onCommit={(v) => onCommit({ 'padding-top': v })}
                />
                <UnitScrubInput
                  label="Right"
                  compact
                  value={getVal('padding-right')}
                  computedPlaceholder="0px"
                  status={getStatus('padding-right')}
                  onTransientChange={(v) => onTransient({ 'padding-right': v })}
                  onCommit={(v) => onCommit({ 'padding-right': v })}
                />
                <UnitScrubInput
                  label="Bottom"
                  compact
                  value={getVal('padding-bottom')}
                  computedPlaceholder="0px"
                  status={getStatus('padding-bottom')}
                  onTransientChange={(v) =>
                    onTransient({ 'padding-bottom': v })
                  }
                  onCommit={(v) => onCommit({ 'padding-bottom': v })}
                />
                <UnitScrubInput
                  label="Left"
                  compact
                  value={getVal('padding-left')}
                  computedPlaceholder="0px"
                  status={getStatus('padding-left')}
                  onTransientChange={(v) => onTransient({ 'padding-left': v })}
                  onCommit={(v) => onCommit({ 'padding-left': v })}
                />
              </div>
            )}
          </div>
        )}

        {/* CSS GRID CONTAINER CONTROLS (F025 — CSS-02_FLEXBOX_GRID.md) */}
        {isGrid && (
          <div className="vds-layout-subpanel">
            <div className="vds-grid-preset-row">
              <span className="vds-sub-label">
                <Grid size={11} /> Columns Presets:
              </span>
              <div className="vds-grid-preset-btns">
                {[
                  { label: '2 Col', val: 'repeat(2, minmax(0, 1fr))' },
                  { label: '3 Col', val: 'repeat(3, minmax(0, 1fr))' },
                  { label: '4 Col', val: 'repeat(4, minmax(0, 1fr))' },
                  { label: 'Auto-Fit', val: 'repeat(auto-fit, minmax(240px, 1fr))' },
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className="vds-mini-pill"
                    onClick={() =>
                      onCommit({ 'grid-template-columns': p.val })
                    }
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* INTERACTIVE TRACK CHIPS */}
            <div className="vds-track-chips-header">
              <span>Column Tracks ({gridTrackList.length})</span>
              <button
                type="button"
                className="vds-mini-pill"
                onClick={() => {
                  const next = [...gridTrackList, '1fr'];
                  onCommit({
                    'grid-template-columns': serializeGridTrackTokens(next),
                  });
                }}
              >
                <Plus size={10} /> Track
              </button>
            </div>

            <div className="vds-track-chips-list">
              {gridTrackList.map((track, idx) => (
                <div key={idx} className="vds-track-chip">
                  <input
                    type="text"
                    value={track}
                    onChange={(e) => {
                      const next = [...gridTrackList];
                      next[idx] = e.target.value;
                      onCommit({
                        'grid-template-columns': serializeGridTrackTokens(next),
                      });
                    }}
                  />
                  {gridTrackList.length > 1 && (
                    <button
                      type="button"
                      title="Remove track"
                      onClick={() => {
                        const next = gridTrackList.filter((_, i) => i !== idx);
                        onCommit({
                          'grid-template-columns':
                            serializeGridTrackTokens(next),
                        });
                      }}
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="vds-field-full">
              <label>Template Columns CSS</label>
              <input
                type="text"
                className="vds-raw-input"
                placeholder="repeat(3, minmax(0, 1fr))"
                value={rawGridCols}
                onChange={(e) =>
                  onCommit({
                    'grid-template-columns': e.target.value || null,
                  })
                }
              />
            </div>

            <div className="vds-size-grid">
              <div className="vds-select-field">
                <span>Rows</span>
                <input
                  type="text"
                  className="vds-inline-text-input"
                  placeholder="auto"
                  value={getVal('grid-template-rows')}
                  onChange={(e) =>
                    onCommit({
                      'grid-template-rows': e.target.value || null,
                    })
                  }
                />
              </div>
              <div className="vds-select-field">
                <span>Flow</span>
                <select
                  value={getVal('grid-auto-flow') || 'row'}
                  onChange={(e) =>
                    onCommit({ 'grid-auto-flow': e.target.value })
                  }
                >
                  <option value="row">row</option>
                  <option value="column">column</option>
                  <option value="row dense">row dense</option>
                  <option value="column dense">column dense</option>
                </select>
              </div>
              <UnitScrubInput
                label="Gap"
                allowAuto={false}
                value={getVal('gap')}
                computedPlaceholder="24px"
                status={getStatus('gap')}
                onTransientChange={(v) => onTransient({ gap: v })}
                onCommit={(v) => onCommit({ gap: v })}
              />
              <div className="vds-select-field">
                <span>Align</span>
                <select
                  value={alignVal}
                  onChange={(e) => onCommit({ 'align-items': e.target.value })}
                >
                  <option value="stretch">stretch</option>
                  <option value="start">start</option>
                  <option value="center">center</option>
                  <option value="end">end</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* CHILD ITEM CONTROLS WHEN PARENT IS FLEX OR GRID (F026 — CSS-02_FLEXBOX_GRID.md) */}
      {(isParentFlex || isParentGrid) && (
        <section className="vds-insp-section">
          <div className="vds-insp-section-header">
            <span>
              Layout Item ({isParentFlex ? 'Flex Child' : 'Grid Child'})
            </span>
          </div>

          {isParentFlex && (
            <div className="vds-size-grid">
              <div className="vds-select-field">
                <span>Grow</span>
                <input
                  type="number"
                  min={0}
                  max={12}
                  className="vds-inline-text-input"
                  placeholder="0"
                  value={getVal('flex-grow')}
                  onChange={(e) =>
                    onCommit({ 'flex-grow': e.target.value || null })
                  }
                />
              </div>
              <div className="vds-select-field">
                <span>Shrink</span>
                <input
                  type="number"
                  min={0}
                  max={12}
                  className="vds-inline-text-input"
                  placeholder="1"
                  value={getVal('flex-shrink')}
                  onChange={(e) =>
                    onCommit({ 'flex-shrink': e.target.value || null })
                  }
                />
              </div>
              <UnitScrubInput
                label="Basis"
                value={getVal('flex-basis')}
                computedPlaceholder="auto"
                status={getStatus('flex-basis')}
                onTransientChange={(v) => onTransient({ 'flex-basis': v })}
                onCommit={(v) => onCommit({ 'flex-basis': v })}
              />
              <div className="vds-select-field">
                <span>Self</span>
                <select
                  value={getVal('align-self') || 'auto'}
                  onChange={(e) =>
                    onCommit({
                      'align-self':
                        e.target.value === 'auto' ? null : e.target.value,
                    })
                  }
                >
                  <option value="auto">auto</option>
                  <option value="flex-start">flex-start</option>
                  <option value="center">center</option>
                  <option value="flex-end">flex-end</option>
                  <option value="stretch">stretch</option>
                </select>
              </div>
            </div>
          )}

          {isParentGrid && (
            <div className="vds-size-grid">
              <div className="vds-select-field">
                <span>Col Span</span>
                <select
                  value={getVal('grid-column') || 'auto'}
                  onChange={(e) =>
                    onCommit({
                      'grid-column':
                        e.target.value === 'auto' ? null : e.target.value,
                    })
                  }
                >
                  <option value="auto">auto</option>
                  <option value="span 2">span 2</option>
                  <option value="span 3">span 3</option>
                  <option value="1 / -1">1 / -1 (Full Row)</option>
                  <option value="1 / span 2">1 / span 2</option>
                </select>
              </div>
              <div className="vds-select-field">
                <span>Row Span</span>
                <select
                  value={getVal('grid-row') || 'auto'}
                  onChange={(e) =>
                    onCommit({
                      'grid-row':
                        e.target.value === 'auto' ? null : e.target.value,
                    })
                  }
                >
                  <option value="auto">auto</option>
                  <option value="span 2">span 2</option>
                  <option value="span 3">span 3</option>
                </select>
              </div>
              <div className="vds-select-field">
                <span>Justify</span>
                <select
                  value={getVal('justify-self') || 'auto'}
                  onChange={(e) =>
                    onCommit({
                      'justify-self':
                        e.target.value === 'auto' ? null : e.target.value,
                    })
                  }
                >
                  <option value="auto">auto</option>
                  <option value="start">start</option>
                  <option value="center">center</option>
                  <option value="end">end</option>
                  <option value="stretch">stretch</option>
                </select>
              </div>
              <div className="vds-select-field">
                <span>Align</span>
                <select
                  value={getVal('align-self') || 'auto'}
                  onChange={(e) =>
                    onCommit({
                      'align-self':
                        e.target.value === 'auto' ? null : e.target.value,
                    })
                  }
                >
                  <option value="auto">auto</option>
                  <option value="start">start</option>
                  <option value="center">center</option>
                  <option value="end">end</option>
                  <option value="stretch">stretch</option>
                </select>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
