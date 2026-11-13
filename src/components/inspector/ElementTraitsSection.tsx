import React, { useState } from 'react';
import {
  Sliders,
  Plus,
  Trash2,
  Component as SymbolIcon,
  RefreshCw,
  Unlink,
  Link as LinkIcon,
  Image as ImageIcon,
} from 'lucide-react';
import type { VNode } from '../../engine/types';
import { commitElementAttributeMutation } from '../../engine/ast/htmlAst';
import {
  makeElementSymbol,
  detachElementSymbol,
  syncSymbolAcrossProject,
} from '../../engine/components/symbolSyncEngine';
import { projectDoc } from '../../engine/doc/projectDoc';
import { useLayersStore } from '../../store/layersStore';
import { useInspectorStore } from '../../store/inspectorStore';

interface ElementTraitsSectionProps {
  vnode: VNode;
  activeFile: string;
}

interface TraitFieldDef {
  name: string;
  label: string;
  type: 'text' | 'select' | 'boolean';
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
}

const INTERNAL_ATTRS = new Set([
  'data-vds-id',
  'data-vds-symbol',
  'data-vds-hidden',
  'data-vds-editing',
  'data-vds-force',
  'class',
  'style',
]);

function getContextualTraitDefs(tag: string): TraitFieldDef[] {
  const base: TraitFieldDef[] = [
    { name: 'id', label: 'ID (#)', type: 'text', placeholder: 'section-id' },
    { name: 'title', label: 'Title', type: 'text', placeholder: 'Tooltip text' },
    { name: 'aria-label', label: 'ARIA Label', type: 'text', placeholder: 'Accessible label' },
  ];

  switch (tag) {
    case 'a':
      return [
        { name: 'href', label: 'Link URL (href)', type: 'text', placeholder: 'https:// or #section' },
        {
          name: 'target',
          label: 'Target',
          type: 'select',
          options: [
            { label: 'Same Tab (_self)', value: '' },
            { label: 'New Tab (_blank)', value: '_blank' },
          ],
        },
        { name: 'rel', label: 'Rel', type: 'text', placeholder: 'noopener noreferrer' },
        ...base,
      ];
    case 'img':
      return [
        { name: 'src', label: 'Image Source (src)', type: 'text', placeholder: 'assets/hero.png' },
        { name: 'alt', label: 'Alt Text', type: 'text', placeholder: 'Describe image for a11y' },
        {
          name: 'loading',
          label: 'Loading',
          type: 'select',
          options: [
            { label: 'Default (eager)', value: '' },
            { label: 'Lazy (lazy)', value: 'lazy' },
            { label: 'Eager (eager)', value: 'eager' },
          ],
        },
        ...base,
      ];
    case 'button':
      return [
        {
          name: 'type',
          label: 'Button Type',
          type: 'select',
          options: [
            { label: 'Button (button)', value: 'button' },
            { label: 'Submit (submit)', value: 'submit' },
            { label: 'Reset (reset)', value: 'reset' },
          ],
        },
        { name: 'disabled', label: 'Disabled', type: 'boolean' },
        ...base,
      ];
    case 'input':
      return [
        {
          name: 'type',
          label: 'Input Type',
          type: 'select',
          options: [
            { label: 'Text', value: 'text' },
            { label: 'Email', value: 'email' },
            { label: 'Password', value: 'password' },
            { label: 'Number', value: 'number' },
            { label: 'Search', value: 'search' },
            { label: 'Checkbox', value: 'checkbox' },
            { label: 'Radio', value: 'radio' },
            { label: 'Date', value: 'date' },
          ],
        },
        { name: 'name', label: 'Name', type: 'text', placeholder: 'field_name' },
        { name: 'placeholder', label: 'Placeholder', type: 'text', placeholder: 'Enter value...' },
        { name: 'value', label: 'Default Value', type: 'text', placeholder: '' },
        { name: 'required', label: 'Required', type: 'boolean' },
        { name: 'disabled', label: 'Disabled', type: 'boolean' },
        ...base,
      ];
    case 'textarea':
      return [
        { name: 'name', label: 'Name', type: 'text', placeholder: 'message' },
        { name: 'placeholder', label: 'Placeholder', type: 'text', placeholder: 'Type message...' },
        { name: 'rows', label: 'Rows', type: 'text', placeholder: '4' },
        { name: 'required', label: 'Required', type: 'boolean' },
        ...base,
      ];
    case 'form':
      return [
        { name: 'action', label: 'Action URL', type: 'text', placeholder: '/api/submit' },
        {
          name: 'method',
          label: 'HTTP Method',
          type: 'select',
          options: [
            { label: 'GET', value: 'get' },
            { label: 'POST', value: 'post' },
          ],
        },
        ...base,
      ];
    case 'video':
    case 'audio':
      return [
        { name: 'src', label: 'Media URL (src)', type: 'text', placeholder: 'assets/demo.mp4' },
        { name: 'controls', label: 'Show Controls', type: 'boolean' },
        { name: 'autoplay', label: 'Autoplay', type: 'boolean' },
        { name: 'loop', label: 'Loop', type: 'boolean' },
        { name: 'muted', label: 'Muted', type: 'boolean' },
        ...base,
      ];
    case 'iframe':
      return [
        { name: 'src', label: 'Embed URL (src)', type: 'text', placeholder: 'https://...' },
        {
          name: 'loading',
          label: 'Loading',
          type: 'select',
          options: [
            { label: 'Eager', value: '' },
            { label: 'Lazy', value: 'lazy' },
          ],
        },
        ...base,
      ];
    default:
      return base;
  }
}

export function ElementTraitsSection({
  vnode,
  activeFile,
}: ElementTraitsSectionProps): React.ReactElement {
  const [newAttrName, setNewAttrName] = useState('');
  const [newAttrVal, setNewAttrVal] = useState('');
  const [symbolFeedback, setSymbolFeedback] = useState<string | null>(null);

  const bumpRevision = useLayersStore((s) => s.bumpRevision);
  const bumpInspector = useInspectorStore((s) => s.bumpInspector);

  const tag = (vnode.tag ?? 'div').toLowerCase();
  const traitDefs = getContextualTraitDefs(tag);
  const traitNamesSet = new Set(traitDefs.map((d) => d.name));

  const attrMap = new Map<string, string>();
  for (const a of vnode.attrs) {
    attrMap.set(a.name.toLowerCase(), a.value);
  }

  const symbolId = attrMap.get('data-vds-symbol') ?? null;

  const customAttrs = vnode.attrs.filter(
    (a) =>
      !INTERNAL_ATTRS.has(a.name.toLowerCase()) &&
      !traitNamesSet.has(a.name.toLowerCase())
  );

  const projectAssets = Array.from(projectDoc.assets.values());

  const handleSetAttr = (name: string, value: string | null): void => {
    const cleanVal = value === null || value === '' ? null : value;
    commitElementAttributeMutation(activeFile, vnode.id, name, cleanVal);
    bumpRevision();
    bumpInspector();
  };

  const handlePromoteOrSyncSymbol = (): void => {
    if (symbolId) {
      const res = syncSymbolAcrossProject(activeFile, symbolId);
      setSymbolFeedback(
        res.syncedCount > 0
          ? `Synced "${symbolId}" to ${res.syncedCount} page(s)`
          : `Symbol "${symbolId}" updated`
      );
    } else {
      const res = makeElementSymbol(activeFile, vnode.id);
      setSymbolFeedback(
        res.syncedCount > 0
          ? `Created symbol "${res.symbolId}" & synced ${res.syncedCount} page(s)`
          : `Created reusable symbol "${res.symbolId}"`
      );
    }
    bumpRevision();
    bumpInspector();
    window.setTimeout(() => setSymbolFeedback(null), 2800);
  };

  const handleDetachSymbol = (): void => {
    detachElementSymbol(activeFile, vnode.id);
    setSymbolFeedback('Detached from Master Symbol');
    bumpRevision();
    bumpInspector();
    window.setTimeout(() => setSymbolFeedback(null), 2200);
  };

  return (
    <section className="vds-insp-section">
      <div className="vds-insp-section-header">
        <span>
          <Sliders size={11} style={{ marginRight: 5, verticalAlign: -1 }} />
          Attributes &amp; Component Traits (<code>&lt;{tag}&gt;</code>)
        </span>
      </div>

      {/* REUSABLE SYMBOL / MASTER COMPONENT BAR (GrapesJS Symbols + Figma Component UX) */}
      {tag !== 'body' && tag !== 'html' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 6,
            padding: '6px 8px',
            marginBottom: 8,
            borderRadius: 6,
            background: symbolId ? 'rgba(139, 92, 246, 0.14)' : 'rgba(255, 255, 255, 0.03)',
            border: symbolId
              ? '1px solid rgba(139, 92, 246, 0.45)'
              : '1px solid rgba(255, 255, 255, 0.07)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <SymbolIcon
              size={13}
              style={{ color: symbolId ? '#a78bfa' : '#94a3b8', flexShrink: 0 }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: symbolId ? '#ddd6fe' : '#94a3b8',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={symbolId ? `Master Symbol: ${symbolId}` : 'Convert element to reusable Symbol'}
            >
              {symbolId ? `Symbol: ${symbolId}` : 'Reusable Symbol'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <button
              type="button"
              className="vds-btn-small"
              style={{
                background: symbolId ? '#7c3aed' : 'rgba(139, 92, 246, 0.2)',
                color: '#f5f3ff',
                border: '1px solid rgba(167, 139, 250, 0.4)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 7px',
                fontSize: 10.5,
              }}
              onClick={handlePromoteOrSyncSymbol}
              title={
                symbolId
                  ? 'Propagate changes of this Symbol to all HTML pages in project'
                  : 'Promote this element into a Master Symbol (data-vds-symbol)'
              }
            >
              <RefreshCw size={10} />
              <span>{symbolId ? 'Sync Pages' : 'Create Symbol'}</span>
            </button>

            {symbolId && (
              <button
                type="button"
                className="vds-icon-btn"
                onClick={handleDetachSymbol}
                title="Detach instance from Master Symbol"
                style={{ color: '#c4b5fd', width: 22, height: 22 }}
              >
                <Unlink size={11} />
              </button>
            )}
          </div>
        </div>
      )}

      {symbolFeedback && (
        <div
          style={{
            fontSize: 10.5,
            color: '#c4b5fd',
            background: 'rgba(124, 58, 237, 0.18)',
            padding: '4px 8px',
            borderRadius: 4,
            marginBottom: 8,
          }}
        >
          ❖ {symbolFeedback}
        </div>
      )}

      {/* CONTEXTUAL TRAIT FIELDS */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {traitDefs.map((field) => {
          const currentVal = attrMap.get(field.name) ?? '';
          const hasAttr = attrMap.has(field.name);

          if (field.type === 'boolean') {
            return (
              <label
                key={field.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 11,
                  color: '#cbd5e1',
                  padding: '2px 0',
                  cursor: 'pointer',
                }}
              >
                <span>{field.label}</span>
                <input
                  type="checkbox"
                  checked={hasAttr}
                  onChange={(e) =>
                    handleSetAttr(field.name, e.target.checked ? field.name : null)
                  }
                />
              </label>
            );
          }

          if (field.type === 'select' && field.options) {
            return (
              <div
                key={field.name}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '92px 1fr',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{field.label}</span>
                <select
                  className="vds-select-compact"
                  value={currentVal}
                  onChange={(e) => handleSetAttr(field.name, e.target.value || null)}
                >
                  {field.options.map((opt) => (
                    <option key={opt.label} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          return (
            <div key={field.name} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '92px 1fr',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: '#94a3b8',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  {field.name === 'href' && <LinkIcon size={10} />}
                  {field.name === 'src' && <ImageIcon size={10} />}
                  {field.label}
                </span>
                <input
                  type="text"
                  className="vds-token-val-input"
                  placeholder={field.placeholder ?? ''}
                  value={currentVal}
                  onChange={(e) => handleSetAttr(field.name, e.target.value)}
                />
              </div>

              {/* Quick Project Asset Picker for <img src> */}
              {field.name === 'src' && projectAssets.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <select
                    className="vds-select-compact"
                    style={{ fontSize: 10, width: 'calc(100% - 98px)' }}
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleSetAttr('src', e.target.value);
                      }
                    }}
                  >
                    <option value="">Choose from Project Assets ({projectAssets.length})...</option>
                    {projectAssets.map((asset) => (
                      <option key={asset.hash} value={asset.path}>
                        {asset.path}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* CUSTOM HTML / DATA-* / ARIA-* ATTRIBUTES */}
      {customAttrs.length > 0 && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 6,
            borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>
            Custom Attributes
          </span>
          {customAttrs.map((attr) => (
            <div
              key={attr.name}
              style={{
                display: 'grid',
                gridTemplateColumns: '88px 1fr 22px',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <code
                style={{
                  fontSize: 10.5,
                  color: '#38bdf8',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={attr.name}
              >
                {attr.name}
              </code>
              <input
                type="text"
                className="vds-token-val-input"
                value={attr.value}
                onChange={(e) => handleSetAttr(attr.name, e.target.value)}
              />
              <button
                type="button"
                className="vds-icon-btn"
                title={`Remove ${attr.name}`}
                onClick={() => handleSetAttr(attr.name, null)}
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ADD CUSTOM ATTRIBUTE ROW */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '88px 1fr 26px',
          gap: 4,
          marginTop: 8,
          paddingTop: 6,
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <input
          type="text"
          className="vds-token-val-input"
          placeholder="data-attr"
          value={newAttrName}
          onChange={(e) => setNewAttrName(e.target.value)}
        />
        <input
          type="text"
          className="vds-token-val-input"
          placeholder="value"
          value={newAttrVal}
          onChange={(e) => setNewAttrVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newAttrName.trim()) {
              handleSetAttr(newAttrName.trim(), newAttrVal);
              setNewAttrName('');
              setNewAttrVal('');
            }
          }}
        />
        <button
          type="button"
          className="vds-btn-small"
          title="Add HTML Attribute"
          style={{ padding: '0 6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => {
            if (newAttrName.trim()) {
              handleSetAttr(newAttrName.trim(), newAttrVal);
              setNewAttrName('');
              setNewAttrVal('');
            }
          }}
        >
          <Plus size={12} />
        </button>
      </div>
    </section>
  );
}
