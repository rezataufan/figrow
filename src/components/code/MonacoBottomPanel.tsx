import React, { useEffect, useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import {
  Code2,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  ChevronDown,
  Zap,
  FileCode2,
  FileType2,
} from 'lucide-react';
import { projectDoc } from '../../engine/doc/projectDoc';
import {
  findNodeAtOffset,
  findNodeSourceLocation,
  lineColToOffset,
} from '../../engine/codeSync/diagnosticsAndFormat';
import { useCodeEditorStore } from '../../store/codeEditorStore';
import { useSelectionStore } from '../../store/selectionStore';
import { useLayersStore } from '../../store/layersStore';

/**
 * MonacoBottomPanel — Full Implementation of:
 * - SYNC-01_AST_TO_CANVAS.md (Multi-file Monaco editor, 2-way Y.Text <-> AST <-> Canvas sync,
 *   Cursor <-> Selection sync, Sync Mode: Live / On Save / Paused)
 * - SYNC-02_FORMAT_DIAGNOSTICS.md (Prettier v3 formatting, Problems tab with filter & Quick-Fixes,
 *   Status bar with AST parse latency)
 */

export function MonacoBottomPanel(): React.ReactElement | null {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const decorationCollectionRef =
    useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);
  const isApplyingExternalRef = useRef(false);
  const suppressCursorSelectRef = useRef(false);
  const debounceTimerRef = useRef<number | null>(null);

  const isOpen = useCodeEditorStore((s) => s.isOpen);
  const panelHeight = useCodeEditorStore((s) => s.panelHeight);
  const openFiles = useCodeEditorStore((s) => s.openFiles);
  const activeFile = useCodeEditorStore((s) => s.activeFile);
  const activeSubTab = useCodeEditorStore((s) => s.activeSubTab);
  const syncMode = useCodeEditorStore((s) => s.syncMode);
  const syncStatus = useCodeEditorStore((s) => s.syncStatus);
  const diagnostics = useCodeEditorStore((s) => s.diagnostics);
  const problemFilter = useCodeEditorStore((s) => s.problemFilter);
  const lastParseMs = useCodeEditorStore((s) => s.lastParseMs);
  const codeRevision = useCodeEditorStore((s) => s.codeRevision);

  const setPanelOpen = useCodeEditorStore((s) => s.setPanelOpen);
  const setPanelHeight = useCodeEditorStore((s) => s.setPanelHeight);
  const setActiveFile = useCodeEditorStore((s) => s.setActiveFile);
  const setActiveSubTab = useCodeEditorStore((s) => s.setActiveSubTab);
  const setSyncMode = useCodeEditorStore((s) => s.setSyncMode);
  const setProblemFilter = useCodeEditorStore((s) => s.setProblemFilter);
  const commitEditorText = useCodeEditorStore((s) => s.commitEditorText);
  const formatActiveFile = useCodeEditorStore((s) => s.formatActiveFile);
  const runQuickFix = useCodeEditorStore((s) => s.runQuickFix);

  const primaryKey = useSelectionStore((s) => s.primaryKey);
  const selectSingle = useSelectionStore((s) => s.selectSingle);
  const expandAncestorsOf = useLayersStore((s) => s.expandAncestorsOf);
  const docRevision = useLayersStore((s) => s.docRevision);

  const currentFileSource = projectDoc.getFileText(activeFile);

  // Sync visual mutations from Y.Text into Monaco Editor without resetting cursor
  useEffect(() => {
    void docRevision;
    void codeRevision;
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;
    const yTextVal = projectDoc.getFileText(activeFile);
    if (model.getValue() !== yTextVal) {
      isApplyingExternalRef.current = true;
      const pos = editor.getPosition();
      model.setValue(yTextVal);
      if (pos) {
        editor.setPosition(pos);
      }
      isApplyingExternalRef.current = false;
    }
  }, [activeFile, docRevision, codeRevision]);

  // Highlight selected canvas element in Monaco (F045 — Canvas -> Editor reveal)
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    if (!decorationCollectionRef.current) {
      decorationCollectionRef.current = editor.createDecorationsCollection([]);
    }

    if (!primaryKey || activeFile !== 'index.html') {
      decorationCollectionRef.current.set([]);
      return;
    }

    const loc = findNodeSourceLocation('index.html', primaryKey);
    if (!loc) {
      decorationCollectionRef.current.set([]);
      return;
    }

    const range = new monaco.Range(
      loc.startLine,
      loc.startCol,
      loc.endLine,
      loc.endCol
    );

    decorationCollectionRef.current.set([
      {
        range,
        options: {
          isWholeLine: true,
          className: 'vds-monaco-selected-node-line',
          linesDecorationsClassName: 'vds-monaco-selected-node-gutter',
        },
      },
    ]);

    if (!editor.hasTextFocus()) {
      suppressCursorSelectRef.current = true;
      editor.revealLineInCenterIfOutsideViewport(loc.startLine);
      window.setTimeout(() => {
        suppressCursorSelectRef.current = false;
      }, 60);
    }
  }, [primaryKey, activeFile, docRevision]);

  // Sync Diagnostics into Monaco Markers
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;

    const fileDiags = diagnostics.filter((d) => d.file === activeFile);
    const markers: Monaco.editor.IMarkerData[] = fileDiags.map((d) => ({
      severity:
        d.severity === 'error'
          ? monaco.MarkerSeverity.Error
          : d.severity === 'warning'
          ? monaco.MarkerSeverity.Warning
          : monaco.MarkerSeverity.Info,
      message: d.message,
      startLineNumber: d.line,
      startColumn: d.column,
      endLineNumber: d.line,
      endColumn: d.column + 12,
      code: d.code,
    }));

    monaco.editor.setModelMarkers(model, 'vds-diagnostics', markers);
  }, [diagnostics, activeFile]);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Cursor -> Canvas selection sync (F045 — 100ms debounce)
    let cursorTimer: number | null = null;
    editor.onDidChangeCursorPosition((ev) => {
      if (suppressCursorSelectRef.current) return;
      if (!editor.hasTextFocus()) return;
      const state = useCodeEditorStore.getState();
      if (state.activeFile !== 'index.html') return;

      if (cursorTimer) window.clearTimeout(cursorTimer);
      cursorTimer = window.setTimeout(() => {
        const html = projectDoc.getFileText('index.html');
        const offset = lineColToOffset(
          html,
          ev.position.lineNumber,
          ev.position.column
        );
        const hitKey = findNodeAtOffset('index.html', offset);
        if (hitKey && hitKey !== useSelectionStore.getState().primaryKey) {
          selectSingle(hitKey);
          expandAncestorsOf(hitKey);
        }
      }, 100);
    });

    // Keyboard shortcuts inside Monaco: Shift+Alt+F (Format), Ctrl+S (Force Sync)
    editor.addCommand(
      monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF,
      () => {
        void useCodeEditorStore.getState().formatActiveFile();
      }
    );

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const model = editor.getModel();
      if (model) {
        const st = useCodeEditorStore.getState();
        st.commitEditorText(st.activeFile, model.getValue(), true);
      }
    });
  };

  const handleEditorChange = (val: string | undefined): void => {
    if (isApplyingExternalRef.current || val === undefined) return;
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      commitEditorText(activeFile, val, false);
    }, 150);
  };

  const handleResizeDragStart = (
    e: React.PointerEvent<HTMLDivElement>
  ): void => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = panelHeight;

    const onMove = (moveEv: PointerEvent): void => {
      const dy = startY - moveEv.clientY;
      setPanelHeight(startH + dy);
    };
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  if (!isOpen) return null;

  const filteredDiagnostics = diagnostics.filter((d) => {
    if (problemFilter === 'all') return true;
    if (problemFilter === 'error') return d.severity === 'error';
    if (problemFilter === 'warning') return d.severity === 'warning';
    if (problemFilter === 'a11y')
      return d.source === 'a11y' || d.source === 'content-model';
    return true;
  });

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warnCount = diagnostics.filter((d) => d.severity !== 'error').length;

  return (
    <div
      className="vds-bottom-code-panel"
      style={{ height: `${panelHeight}px` }}
    >
      {/* RESIZE HANDLE */}
      <div
        className="vds-bottom-resize-handle"
        onPointerDown={handleResizeDragStart}
      />

      {/* TOP HEADER BAR: FILE TABS, PROBLEMS TAB, SYNC MODE, PRETTIER */}
      <div className="vds-code-header">
        <div className="vds-code-tabs">
          {openFiles.map((file) => {
            const isCss = file.endsWith('.css');
            const isActive =
              activeSubTab === 'editor' && activeFile === file;
            return (
              <button
                key={file}
                type="button"
                className={`vds-code-file-tab ${isActive ? 'active' : ''}`}
                onClick={() => setActiveFile(file)}
              >
                {isCss ? <FileType2 size={12} /> : <FileCode2 size={12} />}
                <span>{file}</span>
              </button>
            );
          })}

          <button
            type="button"
            className={`vds-code-file-tab ${
              activeSubTab === 'problems' ? 'active' : ''
            }`}
            onClick={() => setActiveSubTab('problems')}
          >
            <AlertTriangle size={12} />
            <span>
              Problems ({errorCount} E · {warnCount} W)
            </span>
          </button>
        </div>

        <div className="vds-code-actions">
          {/* SYNC STATUS BADGE */}
          <span className={`vds-sync-status-pill status-${syncStatus}`}>
            <span className="vds-sync-dot" />
            {syncStatus === 'inSync'
              ? 'In Sync'
              : syncStatus === 'lastGood'
              ? 'Canvas: Last Valid AST'
              : 'Sync Paused'}
          </span>

          {/* SYNC MODE SELECTOR */}
          <div className="vds-sync-mode-select">
            <RefreshCw size={11} />
            <select
              value={syncMode}
              onChange={(e) =>
                setSyncMode(e.target.value as 'live' | 'onSave' | 'paused')
              }
            >
              <option value="live">Sync: Live (150ms)</option>
              <option value="onSave">Sync: On Save (Ctrl+S)</option>
              <option value="paused">Sync: Paused</option>
            </select>
          </div>

          {/* PRETTIER FORMAT BUTTON */}
          <button
            type="button"
            className="vds-code-action-btn"
            title="Format Document with Prettier (Shift+Alt+F)"
            onClick={() => {
              void formatActiveFile();
            }}
          >
            <Sparkles size={12} />
            <span>Format</span>
          </button>

          {/* COLLAPSE BUTTON */}
          <button
            type="button"
            className="vds-code-action-btn"
            title="Hide Code Panel"
            onClick={() => setPanelOpen(false)}
          >
            <ChevronDown size={13} />
          </button>
        </div>
      </div>

      {/* BODY: MONACO LIVE EDITOR OR PROBLEMS DIAGNOSTICS */}
      <div className="vds-code-body">
        {activeSubTab === 'editor' ? (
          <Editor
            height="100%"
            theme="vs-dark"
            path={activeFile}
            language={activeFile.endsWith('.css') ? 'css' : 'html'}
            defaultValue={currentFileSource}
            onMount={handleEditorMount}
            onChange={handleEditorChange}
            options={{
              fontSize: 12,
              fontFamily:
                '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              minimap: { enabled: false },
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              tabSize: 2,
              automaticLayout: true,
              renderLineHighlight: 'all',
              padding: { top: 8, bottom: 8 },
            }}
          />
        ) : (
          <div className="vds-problems-container">
            <div className="vds-problems-toolbar">
              <span>Filter Diagnostics:</span>
              {(['all', 'error', 'warning', 'a11y'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`vds-mini-pill ${
                    problemFilter === f ? 'active' : ''
                  }`}
                  onClick={() => setProblemFilter(f)}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="vds-problems-list">
              {filteredDiagnostics.length === 0 ? (
                <div className="vds-problems-empty">
                  ✓ Zero issues detected. HTML5 Content Model, CSS syntax, and A11y checks passed.
                </div>
              ) : (
                filteredDiagnostics.map((d) => (
                  <div
                    key={d.id}
                    className={`vds-problem-row sev-${d.severity}`}
                  >
                    <span className="vds-problem-badge">{d.severity}</span>
                    <button
                      type="button"
                      className="vds-problem-loc"
                      onClick={() => {
                        setActiveFile(d.file);
                        if (d.nodeKey) {
                          selectSingle(d.nodeKey);
                        }
                      }}
                    >
                      {d.file}:{d.line}:{d.column}
                    </button>
                    <span className="vds-problem-msg">{d.message}</span>
                    {d.quickFix && (
                      <button
                        type="button"
                        className="vds-quickfix-btn"
                        onClick={() => runQuickFix(d.quickFix!)}
                      >
                        <Zap size={11} />
                        <span>{d.quickFix.label}</span>
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM STATUS BAR (SYNC-02_FORMAT_DIAGNOSTICS.md §1) */}
      <div className="vds-code-statusbar">
        <div className="vds-status-left">
          <span>
            <Code2 size={11} style={{ marginRight: 4, verticalAlign: -1 }} />
            AST Synced ({lastParseMs}ms)
          </span>
          <span>·</span>
          <span>Prettier: 2 spaces (htmlWhitespaceSensitivity: css)</span>
          <span>·</span>
          <span>Selected: {primaryKey ? `#${primaryKey}` : 'none'}</span>
        </div>
        <div className="vds-status-right">
          <span>UTF-8</span>
          <span>·</span>
          <span>{activeFile.endsWith('.css') ? 'CSS3 PostCSS' : 'HTML5 parse5'}</span>
        </div>
      </div>
    </div>
  );
}
