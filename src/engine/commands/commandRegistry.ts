import { projectDoc } from '../doc/projectDoc';
import {
  commitElementAttributeMutation,
  commitElementStyleMutations,
  commitElementTextMutation,
  deleteElementNode,
  duplicateElementNode,
  parseHtmlToVNodes,
} from '../ast/htmlAst';
import {
  COMPONENT_CATALOG,
  insertComponentIntoDocument,
} from '../components/componentCatalog';
import {
  detachElementSymbol,
  listProjectSymbols,
  makeElementSymbol,
  syncSymbolAcrossProject,
} from '../components/symbolSyncEngine';
import { syncNavbarAcrossProject } from '../components/navbarSyncEngine';
import { useCanvasStore } from '../../store/canvasStore';
import { useSelectionStore } from '../../store/selectionStore';
import { useLayersStore } from '../../store/layersStore';
import { useInspectorStore } from '../../store/inspectorStore';
import { useCodeEditorStore } from '../../store/codeEditorStore';

/**
 * Centralized Command Registry & WebMCP AI Agent Bridge
 * Inspired by GrapesJS `commands`, `keymaps`, and `@grapesjs/webmcp`.
 */

export type CommandCategory =
  | 'Edit'
  | 'Element'
  | 'Symbol & Components'
  | 'Canvas & View'
  | 'Breakpoints'
  | 'Code & Export';

export interface StudioCommandDef {
  id: string;
  label: string;
  category: CommandCategory;
  shortcut?: string;
  keywords: string[];
  run: () => void | Promise<void>;
}

export function getStudioCommands(callbacks?: {
  onOpenExport?: () => void;
  onToast?: (msg: string) => void;
}): StudioCommandDef[] {
  const getActiveFile = (): string => {
    const cs = useCanvasStore.getState();
    return cs.artboards[cs.activeArtboardId]?.file || cs.activeFile || 'index.html';
  };

  const getStageSize = (): { w: number; h: number } => {
    if (typeof document !== 'undefined') {
      const el = document.getElementById('vds-canvas-stage');
      if (el) {
        const r = el.getBoundingClientRect();
        return { w: r.width, h: r.height };
      }
    }
    return { w: 1200, h: 800 };
  };

  return [
    {
      id: 'core:undo',
      label: 'Undo Last Change',
      category: 'Edit',
      shortcut: 'Ctrl+Z',
      keywords: ['undo', 'revert', 'history'],
      run: () => {
        projectDoc.undoManager.undo();
      },
    },
    {
      id: 'core:redo',
      label: 'Redo Last Change',
      category: 'Edit',
      shortcut: 'Ctrl+Y',
      keywords: ['redo', 'forward', 'history'],
      run: () => {
        projectDoc.undoManager.redo();
      },
    },
    {
      id: 'element:duplicate',
      label: 'Duplicate Selected Element',
      category: 'Element',
      shortcut: 'Ctrl+D',
      keywords: ['duplicate', 'clone', 'copy', 'element'],
      run: () => {
        const sel = useSelectionStore.getState();
        const cs = useCanvasStore.getState();
        if (!sel.primaryKey) return;
        const cloned = duplicateElementNode(getActiveFile(), sel.primaryKey);
        if (cloned) {
          sel.selectSingle(cloned, cs.activeArtboardId);
          useLayersStore.getState().bumpRevision();
        }
      },
    },
    {
      id: 'element:delete',
      label: 'Delete Selected Element',
      category: 'Element',
      shortcut: 'Del',
      keywords: ['delete', 'remove', 'trash', 'element'],
      run: () => {
        const sel = useSelectionStore.getState();
        if (!sel.primaryKey) return;
        if (deleteElementNode(getActiveFile(), sel.primaryKey)) {
          sel.clearSelection();
          useLayersStore.getState().bumpRevision();
        }
      },
    },
    {
      id: 'element:wrap-div',
      label: 'Wrap Selected in Container <div> (Group)',
      category: 'Element',
      shortcut: 'Ctrl+G',
      keywords: ['wrap', 'group', 'container', 'div'],
      run: () => {
        const sel = useSelectionStore.getState();
        const cs = useCanvasStore.getState();
        if (!sel.primaryKey) return;
        const wrappedId = useLayersStore
          .getState()
          .wrapNode(sel.primaryKey, 'div', getActiveFile());
        if (wrappedId) {
          sel.selectSingle(wrappedId, cs.activeArtboardId);
        }
      },
    },
    {
      id: 'element:unwrap',
      label: 'Unwrap Container Element (Ungroup)',
      category: 'Element',
      shortcut: 'Ctrl+Shift+G',
      keywords: ['unwrap', 'ungroup', 'flatten'],
      run: () => {
        const sel = useSelectionStore.getState();
        const cs = useCanvasStore.getState();
        if (!sel.primaryKey) return;
        const childId = useLayersStore
          .getState()
          .unwrapNode(sel.primaryKey, getActiveFile());
        if (childId) {
          sel.selectSingle(childId, cs.activeArtboardId);
        }
      },
    },
    {
      id: 'element:select-parent',
      label: 'Select Parent Element',
      category: 'Element',
      shortcut: 'Shift+Enter',
      keywords: ['parent', 'up', 'hierarchy', 'tree'],
      run: () => {
        useSelectionStore.getState().selectParent();
      },
    },
    {
      id: 'element:toggle-lock',
      label: 'Lock / Unlock Selected Element',
      category: 'Element',
      shortcut: 'Ctrl+Shift+L',
      keywords: ['lock', 'unlock', 'freeze'],
      run: () => {
        const pk = useSelectionStore.getState().primaryKey;
        if (pk) useLayersStore.getState().toggleLock(pk);
      },
    },
    {
      id: 'element:toggle-visibility',
      label: 'Show / Hide Selected Element in Design',
      category: 'Element',
      shortcut: 'Ctrl+Shift+H',
      keywords: ['hide', 'show', 'visibility', 'eye'],
      run: () => {
        const pk = useSelectionStore.getState().primaryKey;
        if (pk) useLayersStore.getState().toggleHiddenInDesign(pk);
      },
    },
    {
      id: 'symbol:create-or-sync',
      label: 'Create / Sync Reusable Symbol Across Pages',
      category: 'Symbol & Components',
      keywords: ['symbol', 'component', 'master', 'sync', 'reusable'],
      run: () => {
        const pk = useSelectionStore.getState().primaryKey;
        if (!pk) {
          callbacks?.onToast?.('Select an element first to create or sync a Symbol');
          return;
        }
        const res = makeElementSymbol(getActiveFile(), pk);
        useLayersStore.getState().bumpRevision();
        useInspectorStore.getState().bumpInspector();
        callbacks?.onToast?.(
          res.syncedCount > 0
            ? `Synced Symbol "${res.symbolId}" across ${res.syncedCount} page(s)!`
            : `Promoted to Master Symbol "${res.symbolId}"`
        );
      },
    },
    {
      id: 'symbol:detach',
      label: 'Detach Instance from Master Symbol',
      category: 'Symbol & Components',
      keywords: ['detach', 'unlink', 'symbol', 'instance'],
      run: () => {
        const pk = useSelectionStore.getState().primaryKey;
        if (!pk) return;
        detachElementSymbol(getActiveFile(), pk);
        useLayersStore.getState().bumpRevision();
        useInspectorStore.getState().bumpInspector();
        callbacks?.onToast?.('Detached element from Master Symbol');
      },
    },
    {
      id: 'symbol:sync-navbar',
      label: 'Sync Navbar Across All Project Pages',
      category: 'Symbol & Components',
      keywords: ['navbar', 'header', 'navigation', 'sync', 'pages'],
      run: () => {
        const res = syncNavbarAcrossProject(getActiveFile());
        callbacks?.onToast?.(
          res.syncedCount > 0
            ? `Synced Navbar across ${res.syncedCount} page(s)!`
            : 'No other HTML pages with a matching navbar found.'
        );
      },
    },
    {
      id: 'view:zoom-fit',
      label: 'Zoom to Fit All Artboards',
      category: 'Canvas & View',
      shortcut: 'Shift+1',
      keywords: ['zoom', 'fit', 'all', 'camera', 'canvas'],
      run: () => {
        const { w, h } = getStageSize();
        useCanvasStore.getState().zoomToFitAll(w, h);
      },
    },
    {
      id: 'view:zoom-100',
      label: 'Zoom to 100%',
      category: 'Canvas & View',
      shortcut: 'Ctrl+0',
      keywords: ['zoom', '100%', 'reset', 'scale'],
      run: () => {
        const { w, h } = getStageSize();
        useCanvasStore.getState().zoomTo100(w, h);
      },
    },
    {
      id: 'view:toggle-rulers',
      label: 'Toggle Canvas Rulers & Guides',
      category: 'Canvas & View',
      shortcut: 'R',
      keywords: ['rulers', 'guides', 'measure'],
      run: () => {
        useCanvasStore.getState().toggleRulers();
      },
    },
    {
      id: 'view:toggle-box-model',
      label: 'Toggle Box-Model Margin/Padding Overlay',
      category: 'Canvas & View',
      shortcut: 'O',
      keywords: ['box model', 'padding', 'margin', 'overlay', 'tint'],
      run: () => {
        useCanvasStore.getState().toggleBoxModelOverlay();
      },
    },
    {
      id: 'view:toggle-interact',
      label: 'Toggle Live Preview / Interact Mode',
      category: 'Canvas & View',
      shortcut: 'I',
      keywords: ['preview', 'interact', 'play', 'live'],
      run: () => {
        useCanvasStore.getState().toggleInteractMode();
      },
    },
    {
      id: 'breakpoint:desktop',
      label: 'Switch to Desktop Artboard (1440px)',
      category: 'Breakpoints',
      keywords: ['desktop', '1440', 'breakpoint', 'screen'],
      run: () => {
        const { w, h } = getStageSize();
        useCanvasStore.getState().activateOrSpawnBreakpoint('desktop', w, h);
      },
    },
    {
      id: 'breakpoint:tablet',
      label: 'Switch to Tablet Artboard (768px)',
      category: 'Breakpoints',
      keywords: ['tablet', '768', 'breakpoint', 'ipad'],
      run: () => {
        const { w, h } = getStageSize();
        useCanvasStore.getState().activateOrSpawnBreakpoint('tablet', w, h);
      },
    },
    {
      id: 'breakpoint:mobile',
      label: 'Switch to Mobile Artboard (375px)',
      category: 'Breakpoints',
      keywords: ['mobile', '375', 'phone', 'breakpoint'],
      run: () => {
        const { w, h } = getStageSize();
        useCanvasStore.getState().activateOrSpawnBreakpoint('mobile', w, h);
      },
    },
    {
      id: 'code:toggle-panel',
      label: 'Toggle Monaco Live Code Editor',
      category: 'Code & Export',
      shortcut: 'Ctrl+`',
      keywords: ['code', 'monaco', 'editor', 'html', 'css'],
      run: () => {
        useCodeEditorStore.getState().togglePanel();
      },
    },
    {
      id: 'code:format',
      label: 'Format Code with Prettier',
      category: 'Code & Export',
      shortcut: 'Shift+Alt+F',
      keywords: ['format', 'prettier', 'indent', 'clean'],
      run: () => {
        void useCodeEditorStore.getState().formatActiveFile();
      },
    },
    {
      id: 'code:export-modal',
      label: 'Open Export & CSS Auditor Modal',
      category: 'Code & Export',
      shortcut: 'Ctrl+Shift+E',
      keywords: ['export', 'zip', 'download', 'tailwind', 'audit'],
      run: () => {
        callbacks?.onOpenExport?.();
      },
    },
  ];
}

/**
 * WebMCP Tooling Interface (inspired by `@grapesjs/webmcp`)
 * Exposes structured, undo-safe inspection and mutation tools to in-browser AI agents.
 */
export interface FigrowWebMcpTool {
  name: string;
  description: string;
  annotations?: {
    readOnlyHint?: boolean;
    consequentialHint?: boolean;
  };
  execute: (args?: Record<string, unknown>) => unknown;
}

export function createFigrowWebMcpTools(): FigrowWebMcpTool[] {
  return [
    {
      name: 'figrow_get_editor_state',
      description:
        'Get current Figrow Studio state: active HTML file, active artboard, breakpoint width, selected node ID, files list, and reusable symbols.',
      annotations: { readOnlyHint: true },
      execute: () => {
        const cs = useCanvasStore.getState();
        const sel = useSelectionStore.getState();
        const activeAb = cs.artboards[cs.activeArtboardId];
        return {
          activeFile: activeAb?.file || cs.activeFile || 'index.html',
          activeArtboardId: cs.activeArtboardId,
          artboardWidth: activeAb?.width ?? 1440,
          selectedNodeId: sel.primaryKey,
          htmlFiles: projectDoc.getHtmlFiles(),
          styleSheets: projectDoc.getStyleSheets().map((s) => s.file),
          symbols: listProjectSymbols().map((s) => ({
            symbolId: s.symbolId,
            tag: s.tag,
            instancesCount: s.instancesCount,
          })),
        };
      },
    },
    {
      name: 'figrow_get_components',
      description: 'Get the parsed HTML DOM VNode tree for a project file.',
      annotations: { readOnlyHint: true },
      execute: (args = {}) => {
        const file = typeof args.file === 'string' ? args.file : 'index.html';
        const html = projectDoc.getFileText(file);
        if (!html) {
          return { error: { code: 'not_found', message: `File ${file} not found` } };
        }
        const tree = parseHtmlToVNodes(file, html);
        return {
          file,
          rootIds: tree.rootIds,
          totalNodes: tree.order.length,
          nodes: Object.values(tree.nodes).map((n) => ({
            id: n.id,
            tag: n.tag,
            parent: n.parent,
            children: n.children,
            textContent: n.textContent,
            attrs: n.attrs.map((a) => ({ name: a.name, value: a.value })),
          })),
        };
      },
    },
    {
      name: 'figrow_select_component',
      description: 'Select an element on the canvas by its data-vds-id.',
      annotations: { readOnlyHint: false },
      execute: (args = {}) => {
        const id = typeof args.id === 'string' ? args.id : '';
        if (!id) return { error: { code: 'invalid_input', message: 'Missing id' } };
        const cs = useCanvasStore.getState();
        useSelectionStore.getState().selectSingle(id, cs.activeArtboardId);
        return { ok: true, selectedId: id };
      },
    },
    {
      name: 'figrow_update_component_traits',
      description:
        'Update HTML attributes/traits (href, src, alt, id, placeholder, data-*, etc.) or textContent on an element.',
      annotations: { readOnlyHint: false },
      execute: (args = {}) => {
        const file = typeof args.file === 'string' ? args.file : 'index.html';
        const id = typeof args.id === 'string' ? args.id : '';
        if (!id) return { error: { code: 'invalid_input', message: 'Missing id' } };

        if (typeof args.textContent === 'string') {
          commitElementTextMutation(file, id, args.textContent);
        }
        if (args.attributes && typeof args.attributes === 'object') {
          for (const [k, v] of Object.entries(args.attributes as Record<string, string | null>)) {
            commitElementAttributeMutation(file, id, k, v);
          }
        }
        useLayersStore.getState().bumpRevision();
        useInspectorStore.getState().bumpInspector();
        return { ok: true, id };
      },
    },
    {
      name: 'figrow_set_css_rules',
      description: 'Apply CSS declarations to an element by its data-vds-id.',
      annotations: { readOnlyHint: false },
      execute: (args = {}) => {
        const file = typeof args.file === 'string' ? args.file : 'index.html';
        const id = typeof args.id === 'string' ? args.id : '';
        const styles = (args.styles ?? {}) as Record<string, string>;
        const media = typeof args.media === 'string' ? args.media : null;
        const tree = parseHtmlToVNodes(file, projectDoc.getFileText(file));
        const vnode = tree.nodes[id];
        if (!vnode) {
          return { error: { code: 'not_found', message: `Element ${id} not found` } };
        }
        const res = commitElementStyleMutations(vnode, styles, media);
        useInspectorStore.getState().bumpInspector();
        return { ok: true, selector: res.selector };
      },
    },
    {
      name: 'figrow_insert_block',
      description: 'Insert a prebuilt component block from the catalog into a container.',
      annotations: { readOnlyHint: false },
      execute: (args = {}) => {
        const blockId = typeof args.blockId === 'string' ? args.blockId : '';
        const parentId = typeof args.parentId === 'string' ? args.parentId : 'n_main';
        const item = COMPONENT_CATALOG.find((c) => c.id === blockId);
        if (!item) {
          return {
            error: {
              code: 'not_found',
              message: `Block ${blockId} not found. Available: ${COMPONENT_CATALOG.map((c) => c.id).join(', ')}`,
            },
          };
        }
        const res = insertComponentIntoDocument(item, parentId, 'inside');
        return res;
      },
    },
    {
      name: 'figrow_sync_symbol',
      description:
        'Promote an element to a reusable Master Symbol and synchronize it across all project HTML pages.',
      annotations: { readOnlyHint: false },
      execute: (args = {}) => {
        const file = typeof args.file === 'string' ? args.file : 'index.html';
        const id = typeof args.id === 'string' ? args.id : '';
        if (!id) return { error: { code: 'invalid_input', message: 'Missing id' } };
        return syncSymbolAcrossProject(file, id);
      },
    },
    {
      name: 'figrow_undo',
      description: 'Undo the last document or stylesheet mutation.',
      annotations: { readOnlyHint: false },
      execute: () => {
        projectDoc.undoManager.undo();
        return { ok: true };
      },
    },
    {
      name: 'figrow_redo',
      description: 'Redo the last undone document or stylesheet mutation.',
      annotations: { readOnlyHint: false },
      execute: () => {
        projectDoc.undoManager.redo();
        return { ok: true };
      },
    },
  ];
}

export function registerFigrowWebMcp(): void {
  if (typeof window === 'undefined') return;
  const tools = createFigrowWebMcpTools();
  const toolMap: Record<string, FigrowWebMcpTool> = {};
  for (const t of tools) {
    toolMap[t.name] = t;
  }

  // Expose on window for developer console / browser automation / WebMCP agents
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__FIGROW_WEBMCP__ = {
    tools,
    callTool: (name: string, args?: Record<string, unknown>) => {
      const found = toolMap[name];
      if (!found) {
        return { error: { code: 'tool_not_found', message: `Unknown tool: ${name}` } };
      }
      return found.execute(args);
    },
  };

  // Also register with W3C WebMCP draft API (`navigator.modelContext` / `document.modelContext`) if supported
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modelCtx = (navigator as any)?.modelContext || (document as any)?.modelContext;
  if (modelCtx && typeof modelCtx.registerTool === 'function') {
    for (const tool of tools) {
      try {
        modelCtx.registerTool({
          name: tool.name,
          description: tool.description,
          annotations: tool.annotations,
          execute: tool.execute,
        });
      } catch {
        // Ignore duplicate tool registrations
      }
    }
  }
}
