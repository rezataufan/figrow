import React, { useEffect, useState } from 'react';
import type { CssUnit } from '../../engine/ast/htmlAst';

/**
 * UnitScrubInput (F023 — CSS-01_BOX_MODEL.md)
 * - Horizontal drag scrubbing on label or value (1 unit per 2px; Shift ×10; Alt ×0.1)
 * - Arithmetic expression evaluation (`24*2` -> `48`)
 * - Unit selector dropdown (`px`, `rem`, `em`, `%`, `vw`, `vh`, `auto`)
 * - Expression / CSS Variable (`var(--...)`, `calc(...)`) support
 * - Visual color indicator: Blue (`active` declared on target), Amber (`overridden`), Gray (`computed`)
 */

const UNITS: CssUnit[] = ['px', 'rem', 'em', '%', 'vw', 'vh', 'auto'];

interface UnitScrubInputProps {
  label?: string;
  value: string;
  computedPlaceholder?: string;
  status?: 'declared' | 'overridden' | 'computed';
  tooltip?: string;
  compact?: boolean;
  allowAuto?: boolean;
  step?: number;
  onTransientChange?: (val: string) => void;
  onCommit: (val: string | null) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

function parseNumericAndUnit(raw: string): {
  num: number | null;
  unit: CssUnit;
  isExpression: boolean;
} {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'auto') {
    return { num: null, unit: 'auto', isExpression: false };
  }
  if (trimmed.startsWith('var(') || trimmed.startsWith('calc(') || trimmed.startsWith('clamp(')) {
    return { num: null, unit: 'px', isExpression: true };
  }
  const m = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*(px|rem|em|%|vw|vh)?$/i);
  if (m) {
    const num = parseFloat(m[1]);
    const unit = ((m[2]?.toLowerCase() as CssUnit) || 'px');
    return { num, unit, isExpression: false };
  }
  return { num: null, unit: 'px', isExpression: true };
}

function evaluateSimpleMath(input: string): number | null {
  const clean = input.replace(/[^0-9.+\-*/() ]/g, '').trim();
  if (!clean) return null;
  const simpleMatch = clean.match(/^(-?\d+(?:\.\d+)?)\s*([+\-*/])\s*(-?\d+(?:\.\d+)?)$/);
  if (simpleMatch) {
    const a = parseFloat(simpleMatch[1]);
    const op = simpleMatch[2];
    const b = parseFloat(simpleMatch[3]);
    if (op === '+') return a + b;
    if (op === '-') return a - b;
    if (op === '*') return a * b;
    if (op === '/' && b !== 0) return a / b;
  }
  const single = parseFloat(clean);
  return Number.isFinite(single) ? single : null;
}

export function UnitScrubInput({
  label,
  value,
  computedPlaceholder = '0',
  status = 'computed',
  tooltip,
  compact = false,
  allowAuto = true,
  step = 1,
  onTransientChange,
  onCommit,
  onMouseEnter,
  onMouseLeave,
}: UnitScrubInputProps): React.ReactElement {
  const parsed = parseNumericAndUnit(value || computedPlaceholder);
  const [draft, setDraft] = useState<string>(value);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setDraft(value);
    }
  }, [value, isFocused]);

  const handleScrubPointerDown = (e: React.PointerEvent<HTMLElement>): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const baseNum =
      parsed.num !== null
        ? parsed.num
        : parseFloat(computedPlaceholder) || 0;
    const activeUnit: CssUnit = parsed.unit === 'auto' ? 'px' : parsed.unit;

    let latestFormatted: string | null = null;

    const onPointerMove = (moveEv: PointerEvent): void => {
      const dx = moveEv.clientX - startX;
      const stepFactor = (moveEv.shiftKey ? 10 : moveEv.altKey ? 0.1 : 1) * step;
      const rawStep = Math.round(dx / 2) * stepFactor;
      const nextNum = Math.round((baseNum + rawStep) * 100) / 100;
      const formatted = step < 1 && !value.match(/[a-z%]/i) ? `${nextNum}` : `${nextNum}${activeUnit}`;
      latestFormatted = formatted;
      setDraft(formatted);
      onTransientChange?.(formatted);
    };

    const onPointerUp = (): void => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      if (latestFormatted !== null) {
        onCommit(latestFormatted);
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const commitDraftValue = (): void => {
    setIsFocused(false);
    const trimmed = draft.trim();
    if (!trimmed) {
      onCommit(null);
      return;
    }
    if (
      trimmed === 'auto' ||
      trimmed.startsWith('var(') ||
      trimmed.startsWith('calc(') ||
      trimmed.startsWith('clamp(')
    ) {
      onCommit(trimmed);
      return;
    }
    // Check if unit is explicitly typed
    const explicitMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*(px|rem|em|%|vw|vh)$/i);
    if (explicitMatch) {
      onCommit(`${explicitMatch[1]}${explicitMatch[2].toLowerCase()}`);
      return;
    }
    const evaluated = evaluateSimpleMath(trimmed);
    if (evaluated !== null) {
      const u = parsed.unit === 'auto' ? 'px' : parsed.unit;
      const rounded = Math.round(evaluated * 100) / 100;
      onCommit(`${rounded}${u}`);
      return;
    }
    onCommit(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
      return;
    }
    if (e.key === 'Escape') {
      setDraft(value);
      setIsFocused(false);
      e.currentTarget.blur();
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const base =
        parsed.num !== null ? parsed.num : parseFloat(computedPlaceholder) || 0;
      const delta = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1);
      const u = parsed.unit === 'auto' ? 'px' : parsed.unit;
      const next = `${Math.round((base + delta) * 100) / 100}${u}`;
      setDraft(next);
      onCommit(next);
    }
  };

  const handleUnitChange = (nextUnit: CssUnit): void => {
    if (nextUnit === 'auto') {
      onCommit('auto');
      return;
    }
    const num = parsed.num ?? (parseFloat(computedPlaceholder) || 0);
    onCommit(`${num}${nextUnit}`);
  };

  return (
    <div
      className={`vds-scrub-field status-${status} ${compact ? 'is-compact' : ''}`}
      title={tooltip}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onContextMenu={(e) => {
        if (value) {
          e.preventDefault();
          onCommit(null); // Right-click resets/removes declaration per CSS-01 §1
        }
      }}
    >
      {label && (
        <span
          className="vds-scrub-label"
          title="Drag horizontally to scrub (Shift ×10, Alt ×0.1, Right-click Reset)"
          onPointerDown={handleScrubPointerDown}
        >
          {label}
        </span>
      )}
      <input
        type="text"
        className="vds-scrub-input"
        value={isFocused ? draft : value}
        placeholder={computedPlaceholder}
        onFocus={() => {
          setDraft(value || computedPlaceholder);
          setIsFocused(true);
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitDraftValue}
        onKeyDown={handleKeyDown}
        onDoubleClick={(e) => e.currentTarget.select()}
      />
      {!compact && !parsed.isExpression && (
        <select
          className="vds-scrub-unit"
          value={parsed.unit}
          onChange={(e) => handleUnitChange(e.target.value as CssUnit)}
        >
          {UNITS.filter((u) => allowAuto || u !== 'auto').map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
