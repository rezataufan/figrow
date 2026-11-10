import React, { useState } from 'react';
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Plus,
  Trash2,
  Sparkles,
  Type,
} from 'lucide-react';
import type { DesignTokenEntry } from '../../engine/css/cascadeEngine';
import {
  FONT_CATALOG,
  ensureGoogleFontInHtml,
  fluidClamp,
  parseShadowList,
  serializeShadowList,
} from '../../engine/css/styleValueParsers';
import { UnitScrubInput } from './UnitScrubInput';

interface TypographySectionProps {
  htmlFile: string;
  computedFontSizePx: number;
  tokens: DesignTokenEntry[];
  getVal: (prop: string) => string;
  getStatus: (prop: string) => 'declared' | 'overridden' | 'computed';
  onTransient: (props: Record<string, string>) => void;
  onCommit: (props: Record<string, string | null>) => void;
}

export function TypographySection({
  htmlFile,
  computedFontSizePx,
  tokens,
  getVal,
  getStatus,
  onTransient,
  onCommit,
}: TypographySectionProps): React.ReactElement {
  const [showFluidGen, setShowFluidGen] = useState(false);
  const [fluidMinRem, setFluidMinRem] = useState(1.25);
  const [fluidMaxRem, setFluidMaxRem] = useState(2.75);
  const [fluidMinVw, setFluidMinVw] = useState(375);
  const [fluidMaxVw, setFluidMaxVw] = useState(1440);

  const fontFamilyVal = getVal('font-family');
  const fontWeightVal = getVal('font-weight') || '400';
  const fontStyleVal = getVal('font-style') || 'normal';
  const textAlignVal = getVal('text-align') || 'left';
  const textTransformVal = getVal('text-transform') || 'none';
  const textDecorationVal = getVal('text-decoration') || 'none';
  const textWrapVal = getVal('text-wrap') || 'wrap';
  const colorVal = getVal('color');

  const textShadows = parseShadowList(getVal('text-shadow'), false);
  const colorTokens = tokens.filter((t) => t.group === 'color');

  const handleSelectCatalogFont = (family: string): void => {
    const entry = FONT_CATALOG.find((f) => f.family === family);
    if (!entry) return;
    if (entry.source === 'google') {
      ensureGoogleFontInHtml(htmlFile, entry.family, entry.weights);
    }
    onCommit({ 'font-family': entry.stack });
  };

  const currentCatalogFamily =
    FONT_CATALOG.find((f) =>
      fontFamilyVal.toLowerCase().includes(f.family.toLowerCase())
    )?.family ?? '';

  return (
    <section className="vds-insp-section">
      <div className="vds-insp-section-header">
        <span>
          <Type size={12} style={{ marginRight: 5, verticalAlign: -1 }} />
          Typography
        </span>
        <span className="vds-badge-pill">
          = {Math.round(computedFontSizePx || 16)}px
        </span>
      </div>

      {/* FONT FAMILY PICKER (F027 — CSS-03_TYPOGRAPHY.md) */}
      <div className="vds-field-full">
        <label>Font Family (Google &amp; System)</label>
        <select
          className="vds-target-select"
          value={currentCatalogFamily}
          onChange={(e) => handleSelectCatalogFont(e.target.value)}
        >
          <option value="">-- Custom / Inherited --</option>
          <optgroup label="Google Fonts (Auto-Injects <link>)">
            {FONT_CATALOG.filter((f) => f.source === 'google').map((f) => (
              <option key={f.family} value={f.family}>
                {f.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="System Font Stacks">
            {FONT_CATALOG.filter((f) => f.source === 'system').map((f) => (
              <option key={f.family} value={f.family}>
                {f.label}
              </option>
            ))}
          </optgroup>
        </select>
      </div>

      {/* WEIGHT, STYLE, SIZE, LINE-HEIGHT, LETTER-SPACING (F028) */}
      <div className="vds-size-grid" style={{ marginTop: 6 }}>
        <div className="vds-select-field">
          <span>Weight</span>
          <select
            value={fontWeightVal}
            onChange={(e) => onCommit({ 'font-weight': e.target.value })}
          >
            <option value="300">300 Light</option>
            <option value="400">400 Regular</option>
            <option value="500">500 Medium</option>
            <option value="600">600 SemiBold</option>
            <option value="700">700 Bold</option>
            <option value="800">800 ExtraBold</option>
          </select>
        </div>

        <div className="vds-select-field">
          <span>Style</span>
          <select
            value={fontStyleVal}
            onChange={(e) => onCommit({ 'font-style': e.target.value })}
          >
            <option value="normal">normal</option>
            <option value="italic">italic</option>
          </select>
        </div>

        <UnitScrubInput
          label="Size"
          allowAuto={false}
          value={getVal('font-size')}
          computedPlaceholder={`${Math.round(computedFontSizePx || 16)}px`}
          status={getStatus('font-size')}
          onTransientChange={(v) => onTransient({ 'font-size': v })}
          onCommit={(v) => onCommit({ 'font-size': v })}
        />

        <UnitScrubInput
          label="Line H"
          allowAuto={false}
          step={0.05}
          value={getVal('line-height')}
          computedPlaceholder="1.5"
          status={getStatus('line-height')}
          onTransientChange={(v) => onTransient({ 'line-height': v })}
          onCommit={(v) => onCommit({ 'line-height': v })}
        />

        <UnitScrubInput
          label="Letter"
          allowAuto={false}
          step={0.01}
          value={getVal('letter-spacing')}
          computedPlaceholder="0em"
          status={getStatus('letter-spacing')}
          onTransientChange={(v) => onTransient({ 'letter-spacing': v })}
          onCommit={(v) => onCommit({ 'letter-spacing': v })}
        />

        <UnitScrubInput
          label="Para"
          allowAuto={false}
          value={getVal('margin-bottom')}
          computedPlaceholder="0px"
          status={getStatus('margin-bottom')}
          onTransientChange={(v) => onTransient({ 'margin-bottom': v })}
          onCommit={(v) => onCommit({ 'margin-bottom': v })}
        />

        <div className="vds-select-field">
          <span>Wrap</span>
          <select
            value={textWrapVal}
            onChange={(e) =>
              onCommit({
                'text-wrap': e.target.value === 'wrap' ? null : e.target.value,
              })
            }
          >
            <option value="wrap">wrap</option>
            <option value="balance">balance</option>
            <option value="pretty">pretty</option>
            <option value="nowrap">nowrap</option>
          </select>
        </div>
      </div>

      {/* TEXT COLOR + TOKEN PICKER */}
      <div className="vds-color-token-row">
        <label>Color</label>
        <input
          type="color"
          className="vds-color-swatch-input"
          value={colorVal.startsWith('#') ? colorVal.slice(0, 7) : '#f8fafc'}
          onInput={(e) => onTransient({ color: e.currentTarget.value })}
          onChange={(e) => onCommit({ color: e.currentTarget.value })}
        />
        <input
          type="text"
          className="vds-color-text-input"
          placeholder="inherit or var(--text)"
          value={colorVal}
          onChange={(e) => {
            const val = e.target.value;
            if (val) onTransient({ color: val });
            onCommit({ color: val || null });
          }}
        />
        <select
          className="vds-token-quick-select"
          value={colorVal.startsWith('var(') ? colorVal : ''}
          onChange={(e) => {
            if (e.target.value) onCommit({ color: e.target.value });
          }}
        >
          <option value="">⛓ Token</option>
          {colorTokens.map((t) => (
            <option key={t.name} value={`var(${t.name})`}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {/* ALIGN, TRANSFORM, DECORATION */}
      <div className="vds-typo-icon-row">
        <div className="vds-btn-group" title="text-align">
          {[
            { val: 'left', icon: <AlignLeft size={12} /> },
            { val: 'center', icon: <AlignCenter size={12} /> },
            { val: 'right', icon: <AlignRight size={12} /> },
            { val: 'justify', icon: <AlignJustify size={12} /> },
          ].map((b) => (
            <button
              key={b.val}
              type="button"
              className={`vds-icon-toggle ${
                textAlignVal === b.val ? 'active' : ''
              }`}
              onClick={() => onCommit({ 'text-align': b.val })}
            >
              {b.icon}
            </button>
          ))}
        </div>

        <div className="vds-btn-group" title="text-transform">
          {[
            { val: 'none', label: ' − ' },
            { val: 'uppercase', label: 'AA' },
            { val: 'capitalize', label: 'Aa' },
            { val: 'lowercase', label: 'aa' },
          ].map((b) => (
            <button
              key={b.val}
              type="button"
              className={`vds-icon-toggle ${
                textTransformVal === b.val ? 'active' : ''
              }`}
              onClick={() =>
                onCommit({
                  'text-transform': b.val === 'none' ? null : b.val,
                })
              }
            >
              <span>{b.label}</span>
            </button>
          ))}
        </div>

        <div className="vds-btn-group" title="text-decoration">
          {[
            { val: 'none', label: 'None' },
            { val: 'underline', label: 'U' },
            { val: 'line-through', label: 'S' },
          ].map((b) => (
            <button
              key={b.val}
              type="button"
              className={`vds-icon-toggle ${
                textDecorationVal.includes(b.val) && b.val !== 'none'
                  ? 'active'
                  : ''
              }`}
              onClick={() =>
                onCommit({
                  'text-decoration': b.val === 'none' ? null : b.val,
                })
              }
            >
              <span>{b.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* FLUID TYPE CLAMP() GENERATOR (F030 — CSS-03_TYPOGRAPHY.md) */}
      <div className="vds-sub-accordion">
        <div className="vds-sub-accordion-head">
          <button
            type="button"
            className="vds-mini-pill"
            onClick={() => setShowFluidGen((v) => !v)}
          >
            <Sparkles size={11} />
            <span>Fluid clamp() Generator</span>
          </button>
          {getVal('font-size').startsWith('clamp(') && (
            <span className="vds-badge-pill">clamp active</span>
          )}
        </div>

        {showFluidGen && (
          <div className="vds-fluid-box">
            <div className="vds-size-grid">
              <div className="vds-select-field">
                <span>Min rem</span>
                <input
                  type="number"
                  step={0.125}
                  className="vds-inline-text-input"
                  value={fluidMinRem}
                  onChange={(e) =>
                    setFluidMinRem(parseFloat(e.target.value) || 1)
                  }
                />
              </div>
              <div className="vds-select-field">
                <span>Max rem</span>
                <input
                  type="number"
                  step={0.125}
                  className="vds-inline-text-input"
                  value={fluidMaxRem}
                  onChange={(e) =>
                    setFluidMaxRem(parseFloat(e.target.value) || 2)
                  }
                />
              </div>
              <div className="vds-select-field">
                <span>@Min px</span>
                <input
                  type="number"
                  step={10}
                  className="vds-inline-text-input"
                  value={fluidMinVw}
                  onChange={(e) =>
                    setFluidMinVw(parseInt(e.target.value, 10) || 375)
                  }
                />
              </div>
              <div className="vds-select-field">
                <span>@Max px</span>
                <input
                  type="number"
                  step={10}
                  className="vds-inline-text-input"
                  value={fluidMaxVw}
                  onChange={(e) =>
                    setFluidMaxVw(parseInt(e.target.value, 10) || 1440)
                  }
                />
              </div>
            </div>
            <div className="vds-fluid-preview">
              <code>
                {fluidClamp(fluidMinRem, fluidMaxRem, fluidMinVw, fluidMaxVw)}
              </code>
              <button
                type="button"
                className="vds-btn-small"
                onClick={() =>
                  onCommit({
                    'font-size': fluidClamp(
                      fluidMinRem,
                      fluidMaxRem,
                      fluidMinVw,
                      fluidMaxVw
                    ),
                  })
                }
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MULTI-LAYER TEXT SHADOW EDITOR (F029 — CSS-03_TYPOGRAPHY.md) */}
      <div className="vds-layer-list-section">
        <div className="vds-track-chips-header">
          <span>Text Shadows ({textShadows.length})</span>
          <button
            type="button"
            className="vds-mini-pill"
            onClick={() => {
              const next = [
                ...textShadows,
                {
                  id: `ts_${Date.now()}`,
                  inset: false,
                  x: '0px',
                  y: '2px',
                  blur: '8px',
                  spread: '0px',
                  color: 'rgb(0 0 0 / 0.35)',
                },
              ];
              onCommit({ 'text-shadow': serializeShadowList(next, false) });
            }}
          >
            <Plus size={10} /> Add
          </button>
        </div>

        {textShadows.map((layer, idx) => (
          <div key={layer.id} className="vds-shadow-layer-row">
            <input
              type="text"
              title="Offset X"
              value={layer.x}
              onChange={(e) => {
                const next = [...textShadows];
                next[idx] = { ...layer, x: e.target.value };
                onCommit({ 'text-shadow': serializeShadowList(next, false) });
              }}
            />
            <input
              type="text"
              title="Offset Y"
              value={layer.y}
              onChange={(e) => {
                const next = [...textShadows];
                next[idx] = { ...layer, y: e.target.value };
                onCommit({ 'text-shadow': serializeShadowList(next, false) });
              }}
            />
            <input
              type="text"
              title="Blur Radius"
              value={layer.blur}
              onChange={(e) => {
                const next = [...textShadows];
                next[idx] = { ...layer, blur: e.target.value };
                onCommit({ 'text-shadow': serializeShadowList(next, false) });
              }}
            />
            <input
              type="text"
              title="Shadow Color"
              value={layer.color}
              onChange={(e) => {
                const next = [...textShadows];
                next[idx] = { ...layer, color: e.target.value };
                onCommit({ 'text-shadow': serializeShadowList(next, false) });
              }}
            />
            <button
              type="button"
              className="vds-layer-del-btn"
              title="Remove shadow layer"
              onClick={() => {
                const next = textShadows.filter((_, i) => i !== idx);
                onCommit({ 'text-shadow': serializeShadowList(next, false) });
              }}
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
