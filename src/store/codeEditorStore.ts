import { create } from 'zustand';
import {
  analyzeProjectDiagnostics,
  applyDiagnosticQuickFix,
  applyMinimalTextDiff,
  formatFileWithPrettier,
  type CodeDiagnostic,
  type CodeQuickFix,
} from '../engine/codeSync/diagnosticsAndFormat';
import { projectDoc } from '../engine/doc/projectDoc';

/**
 * Code Editor & Sync Engine Zustand Store
 * Aligned with SYNC-01_AST_TO_CANVAS.md & SYNC-02_FORMAT_DIAGNOSTICS.md
 */

export type SyncMode = 'live' | 'onSave' | 'paused';
export type SyncStatus = 'inSync' | 'lastGood' | 'paused';
export type BottomPanelTab = 'editor' | 'problems';
export type ProblemFilter = 'all' | 'error' | 'warning' | 'a11y';

interface CodeEditorStoreState {
  isOpen: boolean;
  panelHeight: number;
  openFiles: string[];
  activeFile: string;
  activeSubTab: BottomPanelTab;
  syncMode: SyncMode;
  syncStatus: SyncStatus;
  diagnostics: CodeDiagnostic[];
  problemFilter: ProblemFilter;
  lastParseMs: number;
  codeRevision: number;

  togglePanel: () => void;
  setPanelOpen: (open: boolean) => void;
  setPanelHeight: (h: number) => void;
  setActiveFile: (file: string) => void;
  setActiveSubTab: (tab: BottomPanelTab) => void;
  setSyncMode: (mode: SyncMode) => void;
  setProblemFilter: (filter: ProblemFilter) => void;

  commitEditorText: (file: string, nextText: string, forceSync?: boolean) => void;
  formatActiveFile: () => Promise<void>;
  runQuickFix: (fix: CodeQuickFix) => void;
  refreshDiagnostics: () => void;
}

const initialAudit = analyzeProjectDiagnostics();

export const useCodeEditorStore = create<CodeEditorStoreState>((set, get) => ({
  isOpen: true,
  panelHeight: 260,
  openFiles: ['index.html', 'css/styles.css'],
  activeFile: 'index.html',
  activeSubTab: 'editor',
  syncMode: 'live',
  syncStatus: initialAudit.hasFatalError ? 'lastGood' : 'inSync',
  diagnostics: initialAudit.diagnostics,
  problemFilter: 'all',
  lastParseMs: 2.4,
  codeRevision: 1,

  togglePanel: () => set((s) => ({ isOpen: !s.isOpen })),
  setPanelOpen: (isOpen) => set({ isOpen }),
  setPanelHeight: (h) =>
    set({ panelHeight: Math.max(150, Math.min(560, Math.round(h))) }),
  setActiveFile: (activeFile) => set({ activeFile, activeSubTab: 'editor' }),
  setActiveSubTab: (activeSubTab) => set({ activeSubTab }),
  setSyncMode: (syncMode) =>
    set({
      syncMode,
      syncStatus: syncMode === 'paused' ? 'paused' : 'inSync',
    }),
  setProblemFilter: (problemFilter) => set({ problemFilter }),

  commitEditorText: (file, nextText, forceSync = false) => {
    const t0 = performance.now();
    const { syncMode } = get();
    if (syncMode === 'paused' && !forceSync) {
      return;
    }

    const auditBefore = analyzeProjectDiagnostics();
    const shouldSyncCanvas =
      syncMode === 'live' || forceSync;

    applyMinimalTextDiff(file, nextText, shouldSyncCanvas);

    const audit = analyzeProjectDiagnostics();
    const elapsed = Math.round((performance.now() - t0) * 10) / 10;

    set((s) => ({
      diagnostics: audit.diagnostics,
      syncStatus: audit.hasFatalError
        ? 'lastGood'
        : syncMode === 'paused'
        ? 'paused'
        : 'inSync',
      lastParseMs: Math.max(0.8, elapsed),
      codeRevision: s.codeRevision + 1,
    }));
    void auditBefore;
  },

  formatActiveFile: async () => {
    const { activeFile } = get();
    const t0 = performance.now();
    await formatFileWithPrettier(activeFile);
    const audit = analyzeProjectDiagnostics();
    const elapsed = Math.round((performance.now() - t0) * 10) / 10;
    set((s) => ({
      diagnostics: audit.diagnostics,
      syncStatus: audit.hasFatalError ? 'lastGood' : 'inSync',
      lastParseMs: elapsed,
      codeRevision: s.codeRevision + 1,
    }));
  },

  runQuickFix: (fix) => {
    applyDiagnosticQuickFix(fix);
    const audit = analyzeProjectDiagnostics();
    set((s) => ({
      diagnostics: audit.diagnostics,
      syncStatus: audit.hasFatalError ? 'lastGood' : 'inSync',
      codeRevision: s.codeRevision + 1,
    }));
  },

  refreshDiagnostics: () => {
    const t0 = performance.now();
    const audit = analyzeProjectDiagnostics();
    const elapsed = Math.round((performance.now() - t0) * 10) / 10;
    set((s) => ({
      diagnostics: audit.diagnostics,
      syncStatus:
        s.syncMode === 'paused'
          ? 'paused'
          : audit.hasFatalError
          ? 'lastGood'
          : 'inSync',
      lastParseMs: Math.max(0.6, elapsed),
      codeRevision: s.codeRevision + 1,
    }));
  },
}));

// Automatically refresh diagnostics and Monaco buffer whenever Y.Doc mutates from visual tools
projectDoc.subscribe(() => {
  useCodeEditorStore.getState().refreshDiagnostics();
});
