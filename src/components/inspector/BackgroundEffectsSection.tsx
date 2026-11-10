import React from 'react';
import { Plus, Trash2, Sparkles, Layers, Move, Pipette, Eye, EyeOff } from 'lucide-react';
import type { DesignTokenEntry } from '../../engine/css/cascadeEngine';
import {
  parseShadowList,
  serializeShadowList,
  parseTransformValue,
  serializeTransformValue,
  splitCommaSeparatedCssValue,
} from '../../engine/css/styleValueParsers';
import { UnitScrubInput } from './UnitScrubInput';

interface BackgroundEffectsSectionProps {
  tokens: DesignTokenEntry[];
  getVal: (prop: string) => string;
  getStatus: (prop: string) => 'declared' | 'overridden' | 'computed';
  onTransient: (props: Record<string, string>) => void;
  onCommit: (props: Record<string, string | null>) => void;
}

const GRADIENT_PRESETS = [
  {
    label: 'Indigo → Violet',
    val: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
  },
  {
    label: 'Cyan → Indigo',
    val: 'linear-gradient(135deg, #38bdf8 0%, #6366f1 100%)',
  },
  {
    label: 'Glass Surface',
    val: 'linear-gradient(135deg, rgb(255 255 255 / 0.08) 0%, rgb(255 255 255 / 0.02) 100%)',
  },
  {
    label: 'Radial Glow',
    val: 'radial-gradient(circle at 50% 0%, rgb(99 102 241 / 0.25), transparent 70%)',
  },
];

const SHADOW_PRESETS = [
  {
    label: 'Soft Card',
    val: '0px 10px 25px -5px rgb(15 23 42 / 0.35)',
  },
  {
    label: 'Hover Lift',
    val: '0px 20px 32px -8px rgb(15 23 42 / 0.5), inset 0px 1px 0px 0px rgb(255 255 255 / 0.15)',
  },
  {
    label: 'Indigo Glow',
    val: '0px 10px 28px -6px rgb(99 102 241 / 0.55)',
  },
];

export function BackgroundEffectsSection({
  tokens,
  getVal,
  getStatus,
  onTransient,
  onCommit,
}: BackgroundEffectsSectionProps): React.ReactElement {
  const bgColorVal = getVal('background-color');
  const bgImageRaw = getVal('background-image');
  const bgLayers = splitCommaSeparatedCssValue(bgImageRaw);
  const boxShadows = parseShadowList(getVal('box-shadow'), true);
  const transformState = parseTransformValue(getVal('transform'));
  const colorTokens = tokens.filter((t) => t.group === 'color');

  const updateTransformField = (
    field: keyof typeof transformState,
    val: string,
    isCommit: boolean
  ): void => {
    const nextState = { ...transformState, [field]: val };
    const serialized = serializeTransformValue(nextState);
    if (isCommit) {
      onCommit({ transform: serialized });
    } else if (serialized) {
      onTransient({ transform: serialized });
    }
  };

  return (
    <>
      {/* 1. BACKGROUNDS & BORDERS (CSS-05_BACKGROUNDS_EFFECTS.md §1) */}
      <section className="vds-insp-section">
        <div className="vds-insp-section-header">
          <span>
            <Layers size={12} style={{ marginRight: 5, verticalAlign: -1 }} />
            Backgrounds &amp; Border
          </span>
        </div>

        {/* FIGMA-STYLE FILL ROW */}
        <div style={{ marginBottom: 6 }}>
          <div className="vds-figma-color-row">
            <div className="vds-swatch-wrapper" title="Click to pick fill color">
              <input
                type="color"
                className="vds-color-swatch-input"
                value={
                  bgColorVal.startsWith('#')
                    ? bgColorVal.slice(0, 7)
                    : '#111827'
                }
                onInput={(e) =>
                  onTransient({ 'background-color': e.currentTarget.value })
                }
                onChange={(e) =>
                  onCommit({ 'background-color': e.currentTarget.value })
                }
              />
            </div>
            <input
              type="text"
              className="vds-figma-hex-input"
              placeholder="Hex or var()"
              value={bgColorVal.replace(/^#/, '')}
              onChange={(e) => {
                const val = e.target.value.trim();
                if (!val) {
                  onCommit({ 'background-color': null });
                } else if (
                  val.startsWith('var(') ||
                  val.startsWith('rgba') ||
                  val.startsWith('rgb')
                ) {
                  onTransient({ 'background-color': val });
                  onCommit({ 'background-color': val });
                } else {
                  const hex = `#${val.replace(/^#/, '')}`;
                  onTransient({ 'background-color': hex });
                  onCommit({ 'background-color': hex });
                }
              }}
            />
            <button
              type="button"
              className="vds-icon-toggle"
              title="Pick Color from Screen (Eyedropper)"
              onClick={async () => {
                if (typeof window !== 'undefined' && 'EyeDropper' in window) {
                  try {
                    const eyeDropper = new (window as any).EyeDropper();
                    const res = await eyeDropper.open();
                    if (res?.sRGBHex) {
                      onCommit({ 'background-color': res.sRGBHex });
                    }
                  } catch {}
                }
              }}
            >
              <Pipette size={12} />
            </button>
            <button
              type="button"
              className={`vds-icon-toggle ${
                bgColorVal === 'transparent' ? 'active' : ''
              }`}
              title={
                bgColorVal === 'transparent' ? 'Unhide Fill' : 'Hide Fill'
              }
              onClick={() => {
                if (bgColorVal === 'transparent') {
                  onCommit({ 'background-color': '#ffffff' });
                } else {
                  onCommit({ 'background-color': 'transparent' });
                }
              }}
            >
              {bgColorVal === 'transparent' ? (
                <EyeOff size={12} />
              ) : (
                <Eye size={12} />
              )}
            </button>
            <select
              className="vds-token-quick-select"
              style={{ maxWidth: 80 }}
              value={bgColorVal.startsWith('var(') ? bgColorVal : ''}
              onChange={(e) => {
                if (e.target.value) {
                  onCommit({ 'background-color': e.target.value });
                }
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
        </div>

        {/* MULTI-LAYER BACKGROUND-IMAGE / GRADIENT LAYERS */}
        <div className="vds-layer-list-section">
          <div className="vds-track-chips-header">
            <span>Background Layers ({bgLayers.length})</span>
            <button
              type="button"
              className="vds-mini-pill"
              onClick={() => {
                const next = [
                  ...bgLayers,
                  'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                ];
                onCommit({ 'background-image': next.join(', ') });
              }}
            >
              <Plus size={10} /> Layer
            </button>
          </div>

          <div className="vds-grid-preset-btns" style={{ marginBottom: 6 }}>
            {GRADIENT_PRESETS.map((g) => (
              <button
                key={g.label}
                type="button"
                className="vds-mini-pill"
                onClick={() => onCommit({ 'background-image': g.val })}
              >
                {g.label}
              </button>
            ))}
          </div>

          {bgLayers.map((layerStr, idx) => (
            <div key={idx} className="vds-bg-layer-row">
              <input
                type="text"
                className="vds-raw-input"
                value={layerStr}
                onChange={(e) => {
                  const next = [...bgLayers];
                  next[idx] = e.target.value;
                  onCommit({
                    'background-image':
                      next.filter(Boolean).join(', ') || null,
                  });
                }}
              />
              <button
                type="button"
                className="vds-layer-del-btn"
                title="Remove background layer"
                onClick={() => {
                  const next = bgLayers.filter((_, i) => i !== idx);
                  onCommit({
                    'background-image':
                      next.length > 0 ? next.join(', ') : null,
                  });
                }}
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>

        {/* BORDER CONTROLS */}
        <div className="vds-size-grid" style={{ marginTop: 8 }}>
          <UnitScrubInput
            label="Bdr W"
            allowAuto={false}
            value={getVal('border-width')}
            computedPlaceholder="0px"
            status={getStatus('border-width')}
            onTransientChange={(v) => onTransient({ 'border-width': v })}
            onCommit={(v) =>
              onCommit({
                'border-width': v,
                'border-style': getVal('border-style') || 'solid',
              })
            }
          />
          <div className="vds-select-field">
            <span>Style</span>
            <select
              value={getVal('border-style') || 'none'}
              onChange={(e) =>
                onCommit({
                  'border-style':
                    e.target.value === 'none' ? null : e.target.value,
                })
              }
            >
              <option value="none">none</option>
              <option value="solid">solid</option>
              <option value="dashed">dashed</option>
              <option value="dotted">dotted</option>
            </select>
          </div>
          <div className="vds-select-field">
            <span>Position</span>
            <select
              value={
                getVal('box-sizing') === 'content-box' ? 'outside' : 'inside'
              }
              onChange={(e) =>
                onCommit({
                  'box-sizing':
                    e.target.value === 'outside' ? 'content-box' : 'border-box',
                })
              }
            >
              <option value="inside">Inside</option>
              <option value="center">Center</option>
              <option value="outside">Outside</option>
            </select>
          </div>
        </div>

        <div className="vds-color-token-row" style={{ marginTop: 6 }}>
          <label>Border</label>
          <input
            type="color"
            className="vds-color-swatch-input"
            value={
              getVal('border-color').startsWith('#')
                ? getVal('border-color').slice(0, 7)
                : '#334155'
            }
            onInput={(e) => onTransient({ 'border-color': e.currentTarget.value })}
            onChange={(e) => onCommit({ 'border-color': e.currentTarget.value })}
          />
          <input
            type="text"
            className="vds-color-text-input"
            placeholder="var(--border) or rgba(...)"
            value={getVal('border-color') || getVal('border')}
            onChange={(e) => {
              const val = e.target.value.trim();
              if (val.includes(' ')) {
                onCommit({ border: val || null });
              } else {
                onCommit({ 'border-color': val || null });
              }
            }}
          />
        </div>
      </section>

      {/* 2. EFFECTS, BOX SHADOW & FILTERS (CSS-05_BACKGROUNDS_EFFECTS.md §1 & §2) */}
      <section className="vds-insp-section">
        <div className="vds-insp-section-header">
          <span>
            <Sparkles size={12} style={{ marginRight: 5, verticalAlign: -1 }} />
            Effects · Box Shadow · Blur
          </span>
        </div>

        <div className="vds-size-grid">
          <UnitScrubInput
            label="Opacity"
            allowAuto={false}
            step={0.05}
            value={getVal('opacity')}
            computedPlaceholder="1"
            status={getStatus('opacity')}
            onTransientChange={(v) => onTransient({ opacity: v })}
            onCommit={(v) => onCommit({ opacity: v })}
          />
          <div className="vds-select-field">
            <span>Blend</span>
            <select
              value={getVal('mix-blend-mode') || 'normal'}
              onChange={(e) =>
                onCommit({
                  'mix-blend-mode':
                    e.target.value === 'normal' ? null : e.target.value,
                })
              }
            >
              <option value="normal">normal</option>
              <option value="multiply">multiply</option>
              <option value="screen">screen</option>
              <option value="overlay">overlay</option>
              <option value="plus-lighter">plus-lighter</option>
            </select>
          </div>
        </div>

        {/* BACKDROP FILTER & FILTER */}
        <div className="vds-size-grid" style={{ marginTop: 6 }}>
          <div className="vds-select-field">
            <span>Backdrop</span>
            <select
              value={getVal('backdrop-filter') || 'none'}
              onChange={(e) =>
                onCommit({
                  'backdrop-filter':
                    e.target.value === 'none' ? null : e.target.value,
                })
              }
            >
              <option value="none">none</option>
              <option value="blur(8px)">blur(8px)</option>
              <option value="blur(12px) saturate(180%)">
                Glass (12px + 180%)
              </option>
              <option value="blur(24px)">Heavy Blur (24px)</option>
            </select>
          </div>
          <div className="vds-select-field">
            <span>Filter</span>
            <select
              value={getVal('filter') || 'none'}
              onChange={(e) =>
                onCommit({
                  filter: e.target.value === 'none' ? null : e.target.value,
                })
              }
            >
              <option value="none">none</option>
              <option value="blur(4px)">blur(4px)</option>
              <option value="grayscale(100%)">grayscale(100%)</option>
              <option value="brightness(110%)">brightness(110%)</option>
            </select>
          </div>
        </div>

        {/* MULTI-LAYER BOX SHADOW EDITOR */}
        <div className="vds-layer-list-section">
          <div className="vds-track-chips-header">
            <span>Box Shadows ({boxShadows.length})</span>
            <button
              type="button"
              className="vds-mini-pill"
              onClick={() => {
                const next = [
                  ...boxShadows,
                  {
                    id: `bs_${Date.now()}`,
                    inset: false,
                    x: '0px',
                    y: '10px',
                    blur: '25px',
                    spread: '-5px',
                    color: 'rgb(15 23 42 / 0.35)',
                  },
                ];
                onCommit({ 'box-shadow': serializeShadowList(next, true) });
              }}
            >
              <Plus size={10} /> Shadow
            </button>
          </div>

          <div className="vds-grid-preset-btns" style={{ marginBottom: 6 }}>
            {SHADOW_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                className="vds-mini-pill"
                onClick={() => onCommit({ 'box-shadow': p.val })}
              >
                {p.label}
              </button>
            ))}
          </div>

          {boxShadows.map((layer, idx) => (
            <div key={layer.id} className="vds-shadow-layer-row is-box">
              <button
                type="button"
                className={`vds-mini-pill ${layer.inset ? 'active' : ''}`}
                title="Toggle Inset / Outset"
                onClick={() => {
                  const next = [...boxShadows];
                  next[idx] = { ...layer, inset: !layer.inset };
                  onCommit({ 'box-shadow': serializeShadowList(next, true) });
                }}
              >
                {layer.inset ? 'In' : 'Out'}
              </button>
              <input
                type="text"
                title="X Offset"
                value={layer.x}
                onChange={(e) => {
                  const next = [...boxShadows];
                  next[idx] = { ...layer, x: e.target.value };
                  onCommit({ 'box-shadow': serializeShadowList(next, true) });
                }}
              />
              <input
                type="text"
                title="Y Offset"
                value={layer.y}
                onChange={(e) => {
                  const next = [...boxShadows];
                  next[idx] = { ...layer, y: e.target.value };
                  onCommit({ 'box-shadow': serializeShadowList(next, true) });
                }}
              />
              <input
                type="text"
                title="Blur"
                value={layer.blur}
                onChange={(e) => {
                  const next = [...boxShadows];
                  next[idx] = { ...layer, blur: e.target.value };
                  onCommit({ 'box-shadow': serializeShadowList(next, true) });
                }}
              />
              <input
                type="text"
                title="Color"
                value={layer.color}
                onChange={(e) => {
                  const next = [...boxShadows];
                  next[idx] = { ...layer, color: e.target.value };
                  onCommit({ 'box-shadow': serializeShadowList(next, true) });
                }}
              />
              <button
                type="button"
                className="vds-layer-del-btn"
                title="Remove box-shadow layer"
                onClick={() => {
                  const next = boxShadows.filter((_, i) => i !== idx);
                  onCommit({ 'box-shadow': serializeShadowList(next, true) });
                }}
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* 3. 2D TRANSFORMS & TRANSITIONS (CSS-05_BACKGROUNDS_EFFECTS.md §1 & §3) */}
      <section className="vds-insp-section">
        <div className="vds-insp-section-header">
          <span>
            <Move size={12} style={{ marginRight: 5, verticalAlign: -1 }} />
            Transforms &amp; Transition
          </span>
        </div>

        <div className="vds-size-grid">
          <UnitScrubInput
            label="Move X"
            allowAuto={false}
            value={transformState.translateX}
            computedPlaceholder="0px"
            onTransientChange={(v) => updateTransformField('translateX', v, false)}
            onCommit={(v) => updateTransformField('translateX', v || '0px', true)}
          />
          <UnitScrubInput
            label="Move Y"
            allowAuto={false}
            value={transformState.translateY}
            computedPlaceholder="0px"
            onTransientChange={(v) => updateTransformField('translateY', v, false)}
            onCommit={(v) => updateTransformField('translateY', v || '0px', true)}
          />
          <UnitScrubInput
            label="Scale"
            allowAuto={false}
            step={0.02}
            value={transformState.scale}
            computedPlaceholder="1"
            onTransientChange={(v) => updateTransformField('scale', v, false)}
            onCommit={(v) => updateTransformField('scale', v || '1', true)}
          />
          <div className="vds-select-field">
            <span>Rotate</span>
            <input
              type="text"
              className="vds-inline-text-input"
              placeholder="0deg"
              value={transformState.rotate}
              onChange={(e) =>
                updateTransformField('rotate', e.target.value, true)
              }
            />
          </div>
        </div>

        <div className="vds-field-full" style={{ marginTop: 6 }}>
          <label>Transition Preset / CSS</label>
          <select
            className="vds-target-select"
            value={getVal('transition') || ''}
            onChange={(e) =>
              onCommit({ transition: e.target.value || null })
            }
          >
            <option value="">None</option>
            <option value="all 200ms ease">all 200ms ease</option>
            <option value="transform 150ms ease, box-shadow 150ms ease">
              transform &amp; box-shadow (150ms ease)
            </option>
            <option value="transform 250ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 250ms ease">
              Spring Smooth (250ms cubic-bezier)
            </option>
          </select>
        </div>
      </section>
    </>
  );
}
