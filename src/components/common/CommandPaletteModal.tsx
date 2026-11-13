import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Command as CommandIcon, CornerDownLeft, Sparkles } from 'lucide-react';
import {
  getStudioCommands,
  type StudioCommandDef,
} from '../../engine/commands/commandRegistry';
import {
  COMPONENT_CATALOG,
  insertComponentIntoDocument,
} from '../../engine/components/componentCatalog';
import { useSelectionStore } from '../../store/selectionStore';
import { useCanvasStore } from '../../store/canvasStore';
import { useLayersStore } from '../../store/layersStore';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenExport: () => void;
  onToast: (msg: string) => void;
}

export function CommandPaletteModal({
  isOpen,
  onClose,
  onOpenExport,
  onToast,
}: CommandPaletteModalProps): React.ReactElement | null {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const commands = useMemo<StudioCommandDef[]>(() => {
    const base = getStudioCommands({ onOpenExport, onToast });
    const insertCommands: StudioCommandDef[] = COMPONENT_CATALOG.map((comp) => ({
      id: `insert:${comp.id}`,
      label: `Insert: ${comp.label}`,
      category: 'Symbol & Components',
      keywords: ['insert', 'add', comp.category, comp.label.toLowerCase(), comp.id],
      run: () => {
        const sel = useSelectionStore.getState();
        const cs = useCanvasStore.getState();
        const activeFile =
          cs.artboards[cs.activeArtboardId]?.file || cs.activeFile || 'index.html';
        const targetParent = sel.primaryKey || 'n_main';
        const res = insertComponentIntoDocument(comp, targetParent, 'inside', activeFile);
        if (res.ok && res.insertedNodeId) {
          sel.selectSingle(res.insertedNodeId, cs.activeArtboardId);
          useLayersStore.getState().bumpRevision();
          onToast(`Inserted ${comp.label}`);
        }
      },
    }));
    return [...base, ...insertCommands];
  }, [onOpenExport, onToast]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.keywords.some((k) => k.toLowerCase().includes(q))
    );
  }, [commands, query]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [isOpen]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!isOpen) return null;

  const executeCommand = (cmd: StudioCommandDef): void => {
    onClose();
    void cmd.run();
  };

  return (
    <div
      className="vds-modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(2, 6, 23, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '11vh',
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        className="vds-command-palette"
        style={{
          width: 'min(540px, 92vw)',
          background: '#0f172a',
          border: '1px solid rgba(148, 163, 184, 0.22)',
          borderRadius: 12,
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.65)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* SEARCH INPUT HEADER */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 14px',
            borderBottom: '1px solid rgba(148, 163, 184, 0.14)',
          }}
        >
          <Search size={16} style={{ color: '#38bdf8', flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command, action, or component to insert... (Esc to close)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#f8fafc',
              fontSize: 13.5,
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex((prev) =>
                  filtered.length > 0 ? (prev + 1) % filtered.length : 0
                );
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex((prev) =>
                  filtered.length > 0
                    ? (prev - 1 + filtered.length) % filtered.length
                    : 0
                );
              } else if (e.key === 'Enter' && filtered[activeIndex]) {
                e.preventDefault();
                executeCommand(filtered[activeIndex]);
              }
            }}
          />
          <kbd
            style={{
              fontSize: 10,
              padding: '2px 6px',
              borderRadius: 4,
              background: '#1e293b',
              color: '#94a3b8',
              border: '1px solid #334155',
            }}
          >
            ESC
          </kbd>
        </div>

        {/* COMMAND RESULTS LIST */}
        <div
          style={{
            maxHeight: '360px',
            overflowY: 'auto',
            padding: '6px',
          }}
        >
          {filtered.length === 0 ? (
            <div
              style={{
                padding: '28px 16px',
                textAlign: 'center',
                color: '#64748b',
                fontSize: 12.5,
              }}
            >
              No matching commands found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            filtered.map((cmd, idx) => {
              const isSelected = idx === activeIndex;
              return (
                <button
                  key={cmd.id}
                  type="button"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => executeCommand(cmd)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 7,
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    background: isSelected
                      ? 'rgba(56, 189, 248, 0.15)'
                      : 'transparent',
                    color: isSelected ? '#f8fafc' : '#cbd5e1',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <Sparkles
                      size={13}
                      style={{
                        color:
                          cmd.category === 'Symbol & Components'
                            ? '#a78bfa'
                            : '#38bdf8',
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 12.5,
                        fontWeight: isSelected ? 600 : 400,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {cmd.label}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 99,
                        background: 'rgba(148, 163, 184, 0.12)',
                        color: '#94a3b8',
                        flexShrink: 0,
                      }}
                    >
                      {cmd.category}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {cmd.shortcut && (
                      <kbd
                        style={{
                          fontSize: 10.5,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: '#1e293b',
                          color: '#94a3b8',
                          border: '1px solid #334155',
                        }}
                      >
                        {cmd.shortcut}
                      </kbd>
                    )}
                    {isSelected && <CornerDownLeft size={12} style={{ color: '#38bdf8' }} />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* FOOTER HINT */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '7px 14px',
            borderTop: '1px solid rgba(148, 163, 184, 0.12)',
            background: '#090e1a',
            fontSize: 10.5,
            color: '#64748b',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <CommandIcon size={11} />
            Figrow Command Palette &amp; WebMCP Bridge Active
          </span>
          <span>↑↓ Navigate · Enter Execute</span>
        </div>
      </div>
    </div>
  );
}
