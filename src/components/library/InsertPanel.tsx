import React, { useState } from 'react';
import {
  Search,
  Plus,
  Layout,
  Type,
  Image,
  Blocks,
  Cpu,
  CheckCircle2,
} from 'lucide-react';
import {
  COMPONENT_CATALOG,
  insertComponentIntoDocument,
  type ComponentCategory,
  type ComponentDef,
} from '../../engine/components/componentCatalog';
import { useSelectionStore } from '../../store/selectionStore';

const CATEGORIES: Array<{ label: ComponentCategory; icon: React.ReactNode }> = [
  { label: 'Layout', icon: <Layout size={12} /> },
  { label: 'Typography', icon: <Type size={12} /> },
  { label: 'Media & Form', icon: <Image size={12} /> },
  { label: 'Prebuilt Blocks', icon: <Blocks size={12} /> },
  { label: 'Web Components', icon: <Cpu size={12} /> },
];

export function InsertPanel(): React.ReactElement {
  const [query, setQuery] = useState('');
  const [placement, setPlacement] = useState<'inside' | 'after'>('inside');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const primaryKey = useSelectionStore((s) => s.primaryKey);
  const selectSingle = useSelectionStore((s) => s.selectSingle);

  const handleInsert = (def: ComponentDef): void => {
    const res = insertComponentIntoDocument(def, primaryKey, placement);
    if (res.ok && res.insertedNodeId) {
      selectSingle(res.insertedNodeId);
    }
    setToastMsg(res.message);
    window.setTimeout(() => {
      setToastMsg(null);
    }, 2400);
  };

  const q = query.trim().toLowerCase();
  const filtered = q
    ? COMPONENT_CATALOG.filter(
        (c) =>
          c.label.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.rootTag.toLowerCase().includes(q)
      )
    : COMPONENT_CATALOG;

  return (
    <div className="vds-insert-panel">
      {/* SEARCH & PLACEMENT HEADER */}
      <div className="vds-insert-header">
        <div className="vds-search-box">
          <Search size={12} />
          <input
            type="text"
            placeholder="Search primitives, blocks, tags..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="vds-insert-placement-bar">
          <span>Target: {primaryKey ? `#${primaryKey}` : '<main>'}</span>
          <div className="vds-btn-group">
            <button
              type="button"
              className={`vds-icon-toggle ${
                placement === 'inside' ? 'active' : ''
              }`}
              onClick={() => setPlacement('inside')}
            >
              Inside
            </button>
            <button
              type="button"
              className={`vds-icon-toggle ${
                placement === 'after' ? 'active' : ''
              }`}
              onClick={() => setPlacement('after')}
            >
              After
            </button>
          </div>
        </div>
      </div>

      {toastMsg && (
        <div className="vds-insert-toast">
          <CheckCircle2 size={12} />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* COMPONENT CATALOG GROUPS */}
      <div className="vds-insert-scroll">
        {CATEGORIES.map((cat) => {
          const items = filtered.filter((i) => i.category === cat.label);
          if (items.length === 0) return null;
          return (
            <div key={cat.label} className="vds-insert-group">
              <div className="vds-insert-group-title">
                {cat.icon}
                <span>{cat.label}</span>
              </div>
              <div className="vds-insert-grid">
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`vds-comp-card kind-${item.kind}`}
                    title={`${item.description}\n\nHTML:\n${item.html}`}
                    onClick={() => handleInsert(item)}
                  >
                    <div className="vds-comp-card-top">
                      <code className="vds-comp-tag">{`<${item.rootTag}>`}</code>
                      <Plus size={12} className="vds-comp-plus" />
                    </div>
                    <strong className="vds-comp-label">{item.label}</strong>
                    <span className="vds-comp-desc">{item.description}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
