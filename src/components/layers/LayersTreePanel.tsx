import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Search,
  Box,
  Type,
  LayoutGrid,
  Image as ImageIcon,
  FolderPlus,
  FolderMinus,
  ArrowUp,
  ArrowDown,
  Plus,
} from 'lucide-react';
import { useLayersStore, type FlatLayerRow } from '../../store/layersStore';
import { useSelectionStore } from '../../store/selectionStore';
import { useCanvasStore } from '../../store/canvasStore';

/**
 * LayersTreePanel — Full implementation of LAYER-01_TREE_REORDER.md
 * - F015: Virtualized DOM Tree (`@tanstack/react-virtual`, 24px rows, overscan 10)
 * - F016: Drag-and-drop reorder/reparent (before / inside / after) with live HTML5 Content-Model validation
 * - F017: Sidecar layer rename (`designMeta.layerName` — double-click or F2, zero HTML pollution)
 * - F018: Hide in Design (`Eye` / `Ctrl+Shift+H`) & Lock (`Lock` / `Ctrl+Shift+L`)
 * - F019: Expand/collapse, Alt+click recursive toggle, two-way hover & selection sync with Canvas
 * - F020: Wrap (`Ctrl+G`), Unwrap (`Ctrl+Shift+G`), Semantic Tag Switcher (`div` -> `section`/`article`/`header`/`nav`)
 */

import {
  duplicateElementNode,
  deleteElementNode,
} from '../../engine/ast/htmlAst';

const SEMANTIC_TAGS = [
  'div',
  'section',
  'article',
  'header',
  'footer',
  'nav',
  'aside',
  'main',
  'figure',
  'h1',
  'h2',
  'h3',
  'p',
  'span',
  'button',
  'a',
];

function getTagIcon(row: FlatLayerRow): React.ReactNode {
  if (row.isComponent) {
    return (
      <span title="Component" style={{ color: '#10b981', fontWeight: 'bold', fontSize: 11, width: 14, textAlign: 'center', display: 'inline-block' }}>
        ❖
      </span>
    );
  }
  const tag = row.tag;
  if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6' || tag === 'p' || tag === 'span' || tag === 'a') {
    return (
      <span title="Text" style={{ color: '#0d99ff', fontWeight: 'bold', fontSize: 11, width: 14, textAlign: 'center', display: 'inline-block' }}>
        T
      </span>
    );
  }
  if (tag === 'img' || tag === 'svg' || tag === 'video' || tag === 'figure') {
    return <ImageIcon size={12} className="vds-layer-type-icon is-media" />;
  }
  if (tag === 'section' || tag === 'header' || tag === 'footer' || tag === 'main' || tag === 'nav' || tag === 'article') {
    return (
      <span title="Frame" style={{ color: '#0d99ff', fontWeight: 'bold', fontSize: 11, width: 14, textAlign: 'center', display: 'inline-block' }}>
        #
      </span>
    );
  }
  if (row.hasChildren) {
    return (
      <span title="Frame" style={{ color: '#8c8c8c', fontWeight: 'bold', fontSize: 11, width: 14, textAlign: 'center', display: 'inline-block' }}>
        #
      </span>
    );
  }
  return (
    <span title="Shape" style={{ color: '#8c8c8c', fontSize: 10, width: 14, textAlign: 'center', display: 'inline-block' }}>
      ▭
    </span>
  );
}

export function LayersTreePanel(): React.ReactElement {
  const scrollParentRef = useRef<HTMLDivElement | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [pagesExpanded, setPagesExpanded] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: FlatLayerRow } | null>(null);

  useEffect(() => {
    const handleDismiss = (): void => setContextMenu(null);
    window.addEventListener('click', handleDismiss);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setContextMenu(null);
    });
    return () => {
      window.removeEventListener('click', handleDismiss);
    };
  }, []);

  // Subscribe to store states
  const docRevision = useLayersStore((s) => s.docRevision);
  const expandedKeys = useLayersStore((s) => s.expandedKeys);
  const filterQuery = useLayersStore((s) => s.filterQuery);
  const showHead = useLayersStore((s) => s.showHead);
  const renamingKey = useLayersStore((s) => s.renamingKey);
  const treeDrag = useLayersStore((s) => s.treeDrag);
  const designMetaSnapshot = useLayersStore((s) => s.designMetaSnapshot);

  const toggleExpand = useLayersStore((s) => s.toggleExpand);
  const setFilterQuery = useLayersStore((s) => s.setFilterQuery);
  const startRenaming = useLayersStore((s) => s.startRenaming);
  const commitRename = useLayersStore((s) => s.commitRename);
  const toggleLock = useLayersStore((s) => s.toggleLock);
  const toggleHiddenInDesign = useLayersStore((s) => s.toggleHiddenInDesign);
  const startTreeDrag = useLayersStore((s) => s.startTreeDrag);
  const hoverTreeRow = useLayersStore((s) => s.hoverTreeRow);
  const commitTreeDrop = useLayersStore((s) => s.commitTreeDrop);
  const cancelTreeDrag = useLayersStore((s) => s.cancelTreeDrag);
  const moveSiblingByDelta = useLayersStore((s) => s.moveSiblingByDelta);
  const wrapNode = useLayersStore((s) => s.wrapNode);
  const unwrapNode = useLayersStore((s) => s.unwrapNode);
  const changeTag = useLayersStore((s) => s.changeTag);
  const computeFlatRows = useLayersStore((s) => s.computeFlatRows);

  const selectedKeys = useSelectionStore((s) => s.selectedKeys);
  const primaryKey = useSelectionStore((s) => s.primaryKey);
  const hoverKey = useSelectionStore((s) => s.hoverKey);
  const selectSingle = useSelectionStore((s) => s.selectSingle);
  const toggleMultiSelect = useSelectionStore((s) => s.toggleMultiSelect);
  const setHoverKey = useSelectionStore((s) => s.setHoverKey);

  const activeArtboardId = useCanvasStore((s) => s.activeArtboardId);
  const activeFile = useCanvasStore((s) => s.activeFile);
  const pageFiles = useCanvasStore((s) => s.pageFiles);
  const setActiveFile = useCanvasStore((s) => s.setActiveFile);
  const addNewPage = useCanvasStore((s) => s.addNewPage);

  const rows: FlatLayerRow[] = useMemo(() => {
    void docRevision;
    void expandedKeys;
    void filterQuery;
    void showHead;
    void designMetaSnapshot;
    return computeFlatRows(activeFile || 'index.html');
  }, [computeFlatRows, activeFile, docRevision, expandedKeys, filterQuery, showHead, designMetaSnapshot]);

  // Virtualizer: 24px row height, overscan 10 (per LAYER-01 §4 performance spec)
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 24,
    overscan: 10,
  });

  const primaryRow = rows.find((r) => r.key === primaryKey);

  const handleRowClick = (row: FlatLayerRow, e: React.MouseEvent): void => {
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      toggleMultiSelect(row.key, activeArtboardId);
    } else {
      selectSingle(row.key, activeArtboardId);
    }
  };

  const handleRowDoubleClick = (row: FlatLayerRow): void => {
    if (row.readOnly) return;
    setRenameDraft(row.customName ?? row.label);
    startRenaming(row.key);
  };

  const handleDragStart = (row: FlatLayerRow, e: React.DragEvent<HTMLDivElement>): void => {
    if (row.readOnly || row.locked) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', row.key);
    startTreeDrag(row.key);
  };

  const handleDragOver = (row: FlatLayerRow, e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const relY = e.clientY - rect.top;
    const ratio = relY / rect.height;

    let position: 'before' | 'inside' | 'after';
    if (row.tag === 'body') {
      position = 'inside';
    } else if (ratio < 0.28) {
      position = 'before';
    } else if (ratio > 0.72) {
      position = 'after';
    } else {
      position = 'inside';
    }

    hoverTreeRow(row.key, position, e.shiftKey);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    const movedKey = commitTreeDrop(activeFile || 'index.html', e.shiftKey);
    if (movedKey) {
      selectSingle(movedKey, activeArtboardId);
    }
  };

  return (
    <div className="vds-layers-panel">
      {/* PAGES ACCORDION (FIGMA STYLE) */}
      <div className="vds-pages-accordion">
        <div
          className="vds-pages-header"
          onClick={() => setPagesExpanded(!pagesExpanded)}
        >
          <div className="vds-pages-title">
            {pagesExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            <span>Pages</span>
          </div>
          <button
            type="button"
            className="vds-page-add-btn"
            title="Add Page (+)"
            onClick={(e) => {
              e.stopPropagation();
              const name = window.prompt('Enter new page name (e.g. about.html):');
              if (name && name.trim()) {
                addNewPage(name.trim());
              }
            }}
          >
            <Plus size={11} />
          </button>
        </div>
        {pagesExpanded && (
          <div className="vds-pages-list">
            {pageFiles.map((page) => (
              <div
                key={page}
                className={`vds-page-item ${activeFile === page ? 'is-active' : ''}`}
                onClick={() => setActiveFile(page)}
              >
                <span className="vds-page-check">{activeFile === page ? '✓' : ''}</span>
                <span className="vds-page-name">{page}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SEARCH FILTER & STRUCTURAL QUICK ACTIONS */}
      <div className="vds-layers-toolbar">
        <div className="vds-layers-search">
          <Search size={12} />
          <input
            type="text"
            placeholder="Filter tag, .class, text..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
          />
        </div>

        <div className="vds-layers-actions">
          <button
            type="button"
            className="vds-layer-action-btn"
            title="Wrap in <div> (Ctrl+G)"
            disabled={!primaryKey || primaryKey === 'n_body'}
            onClick={() => {
              if (!primaryKey) return;
              const wrappedId = wrapNode(primaryKey, 'div');
              if (wrappedId) selectSingle(wrappedId, activeArtboardId);
            }}
          >
            <FolderPlus size={13} />
            <span>Wrap</span>
          </button>

          <button
            type="button"
            className="vds-layer-action-btn"
            title="Unwrap Container (Ctrl+Shift+G)"
            disabled={!primaryRow || !primaryRow.hasChildren || primaryRow.readOnly}
            onClick={() => {
              if (!primaryKey) return;
              const firstChild = unwrapNode(primaryKey);
              if (firstChild) selectSingle(firstChild, activeArtboardId);
            }}
          >
            <FolderMinus size={13} />
            <span>Unwrap</span>
          </button>

          <button
            type="button"
            className="vds-layer-action-btn"
            title="Move Up Before Previous Sibling (Alt+↑)"
            disabled={!primaryKey || primaryKey === 'n_body'}
            onClick={() => {
              if (primaryKey) moveSiblingByDelta(primaryKey, -1);
            }}
          >
            <ArrowUp size={13} />
          </button>

          <button
            type="button"
            className="vds-layer-action-btn"
            title="Move Down After Next Sibling (Alt+↓)"
            disabled={!primaryKey || primaryKey === 'n_body'}
            onClick={() => {
              if (primaryKey) moveSiblingByDelta(primaryKey, 1);
            }}
          >
            <ArrowDown size={13} />
          </button>

          {primaryRow && !primaryRow.readOnly && (
            <select
              className="vds-tag-select"
              title="Change Semantic HTML Tag"
              value={primaryRow.tag}
              onChange={(e) => changeTag(primaryRow.key, e.target.value)}
            >
              {SEMANTIC_TAGS.map((t) => (
                <option key={t} value={t}>
                  {`<${t}>`}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* TREE VALIDATION FEEDBACK BANNER DURING DRAG */}
      {treeDrag && treeDrag.target && (
        <div
          className={`vds-tree-drag-banner ${treeDrag.valid ? 'is-valid' : 'is-invalid'}`}
        >
          {treeDrag.valid
            ? `Move ${treeDrag.target.position} <${
                rows.find((r) => r.key === treeDrag.target?.targetRowKey)?.tag ?? 'element'
              }>`
            : `⛔ ${treeDrag.reason}`}
        </div>
      )}

      {/* VIRTUALIZED ROWS CONTAINER */}
      <div
        ref={scrollParentRef}
        className="vds-layers-scroll"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            if (!row) return null;

            const isSelected = selectedKeys.includes(row.key);
            const isHovered = hoverKey === row.key;
            const isRenaming = renamingKey === row.key;

            const isDropTarget = treeDrag?.target?.targetRowKey === row.key;
            const dropPos = isDropTarget ? treeDrag?.target?.position : null;
            const dropValid = treeDrag?.valid ?? true;

            return (
              <div
                key={row.key}
                draggable={!row.readOnly && !row.locked && !isRenaming}
                onDragStart={(e) => handleDragStart(row, e)}
                onDragOver={(e) => handleDragOver(row, e)}
                onDragEnd={cancelTreeDrag}
                onClick={(e) => handleRowClick(row, e)}
                onDoubleClick={() => handleRowDoubleClick(row)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({ x: e.clientX, y: e.clientY, row });
                  selectSingle(row.key, activeArtboardId);
                }}
                onMouseEnter={() => setHoverKey(row.key)}
                onMouseLeave={() => {
                  if (hoverKey === row.key) setHoverKey(null);
                }}
                className={[
                  'vds-layer-row',
                  isSelected ? 'is-selected' : '',
                  isHovered ? 'is-hovered' : '',
                  row.hidden ? 'is-hidden' : '',
                  row.locked ? 'is-locked' : '',
                  dropPos ? `drop-${dropPos}` : '',
                  isDropTarget && !dropValid ? 'drop-invalid' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                  paddingLeft: `${8 + row.depth * 14}px`,
                }}
              >
                {/* EXPAND / COLLAPSE CARET */}
                {row.hasChildren ? (
                  <button
                    type="button"
                    className="vds-layer-caret"
                    title="Click to Expand/Collapse (Alt+Click for Recursive)"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(row.key, e.altKey);
                    }}
                  >
                    {row.expanded ? (
                      <ChevronDown size={12} />
                    ) : (
                      <ChevronRight size={12} />
                    )}
                  </button>
                ) : (
                  <span className="vds-layer-caret-spacer" />
                )}

                {/* ELEMENT TYPE ICON */}
                {getTagIcon(row)}

                {/* LAYER LABEL OR INLINE RENAME INPUT */}
                {isRenaming ? (
                  <input
                    className="vds-layer-rename-input"
                    type="text"
                    value={renameDraft}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={() => commitRename(row.key, renameDraft)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(row.key, renameDraft);
                      if (e.key === 'Escape') startRenaming(null);
                    }}
                  />
                ) : (
                  <span className="vds-layer-label">
                    {row.customName ? (
                      <>
                        <em className="vds-layer-custom-name">{row.customName}</em>
                        <span className="vds-layer-subtag">{row.tag}</span>
                      </>
                    ) : row.previewText ? (
                      <>
                        <span className="vds-layer-preview">"{row.previewText}"</span>
                        <span className="vds-layer-subtag">{row.tag}</span>
                      </>
                    ) : (
                      <>
                        <span className="vds-layer-tag">{row.tag}</span>
                        {row.classSummary && (
                          <span className="vds-layer-classes">{row.classSummary}</span>
                        )}
                      </>
                    )}
                    {!row.expanded && row.childCount > 0 && (
                      <span className="vds-layer-count">({row.childCount})</span>
                    )}
                  </span>
                )}

                {/* RIGHT CONTROLS: HIDE (👁) & LOCK (🔒) */}
                {!row.readOnly && (
                  <div
                    className="vds-layer-row-btns"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className={`vds-layer-icon-btn ${row.selfHidden ? 'is-active' : ''}`}
                      title="Hide in Design (Ctrl+Shift+H) — Does not export display:none"
                      onClick={() => toggleHiddenInDesign(row.key)}
                    >
                      {row.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                    <button
                      type="button"
                      className={`vds-layer-icon-btn ${row.selfLocked ? 'is-active' : ''}`}
                      title="Lock Layer (Ctrl+Shift+L)"
                      onClick={() => toggleLock(row.key)}
                    >
                      {row.locked ? <Lock size={12} /> : <Unlock size={12} />}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* FLOATING CONTEXT MENU (FIGMA RIGHT-CLICK) */}
      {contextMenu && (
        <div
          className="vds-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="vds-context-item"
            onClick={() => {
              setRenameDraft(contextMenu.row.customName ?? contextMenu.row.label);
              startRenaming(contextMenu.row.key);
              setContextMenu(null);
            }}
          >
            <span>Rename Layer</span>
            <span className="vds-shortcut">F2</span>
          </div>
          <div
            className="vds-context-item"
            onClick={() => {
              duplicateElementNode(activeFile || 'index.html', contextMenu.row.key);
              setContextMenu(null);
            }}
          >
            <span>Duplicate</span>
            <span className="vds-shortcut">Ctrl+D</span>
          </div>
          <div
            className="vds-context-item"
            onClick={() => {
              wrapNode(contextMenu.row.key);
              setContextMenu(null);
            }}
          >
            <span>Group / Wrap in Frame</span>
            <span className="vds-shortcut">Ctrl+G</span>
          </div>
          {contextMenu.row.hasChildren && (
            <div
              className="vds-context-item"
              onClick={() => {
                unwrapNode(contextMenu.row.key);
                setContextMenu(null);
              }}
            >
              <span>Ungroup</span>
              <span className="vds-shortcut">Ctrl+Shift+G</span>
            </div>
          )}
          <div className="vds-context-sep" />
          <div
            className="vds-context-item is-danger"
            onClick={() => {
              deleteElementNode(activeFile || 'index.html', contextMenu.row.key);
              setContextMenu(null);
            }}
          >
            <span>Delete</span>
            <span className="vds-shortcut">Del</span>
          </div>
        </div>
      )}
    </div>
  );
}
