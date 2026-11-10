import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MousePointer,
  Hand,
  Frame,
  Type,
  PlusSquare,
  Monitor,
  Tablet,
  Smartphone,
  Play,
  Code2,
  Download,
  Upload,
  Layers,
  FileCode,
  Package,
  Image as ImageIcon,
  Ruler,
  Undo2,
  Redo2,
  BoxSelect,
  Check,
  Sparkles,
  Square,
  Circle,
  FolderOpen,
  RefreshCw,
  Save,
} from 'lucide-react';
import { InfiniteCanvas } from './components/canvas/InfiniteCanvas';
import { LayersTreePanel } from './components/layers/LayersTreePanel';
import { CssVisualInspector } from './components/inspector/CssVisualInspector';
import { MonacoBottomPanel } from './components/code/MonacoBottomPanel';
import { InsertPanel } from './components/library/InsertPanel';
import { AssetManagerPanel } from './components/library/AssetManagerPanel';
import { ExportModal } from './components/export/ExportModal';
import { projectDoc } from './engine/doc/projectDoc';
import {
  deleteElementNode,
  duplicateElementNode,
  reloadArtboardsForFile,
} from './engine/ast/htmlAst';
import {
  COMPONENT_CATALOG,
  insertComponentIntoDocument,
} from './engine/components/componentCatalog';
import { importHtmlAndCssFiles } from './engine/import/htmlImporter';
import { loadFolderFromFiles, openFolderWorkspace } from './engine/fs/folderWorkspace';
import { syncNavbarAcrossProject } from './engine/components/navbarSyncEngine';
import {
  saveProjectToDisk,
  exportCleanProjectZip,
  triggerZipDownload,
} from './engine/fs/diskSyncEngine';
import { sandboxRegistry } from './engine/sandbox/iframeBridge';
import { useCanvasStore } from './store/canvasStore';
import { useSelectionStore } from './store/selectionStore';
import { useLayersStore } from './store/layersStore';
import { useInspectorStore } from './store/inspectorStore';
import { useCodeEditorStore } from './store/codeEditorStore';

type MenuId =
  | 'file'
  | 'edit'
  | 'view'
  | 'insert'
  | 'element'
  | 'style'
  | 'code'
  | 'export';

interface MenuItemDef {
  label: string;
  shortcut?: string;
  checked?: boolean;
  disabled?: boolean;
  dividerAfter?: boolean;
  action: () => void;
}

const TEXT_EDITABLE_TAGS = new Set([
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'span',
  'a',
  'button',
  'label',
  'li',
  'strong',
  'em',
]);

export function App(): React.ReactElement {
  const camera = useCanvasStore((s) => s.camera);
  const activeTool = useCanvasStore((s) => s.activeTool);
  const interactMode = useCanvasStore((s) => s.interactMode);
  const rulersVisible = useCanvasStore((s) => s.rulersVisible);
  const boxModelOverlayVisible = useCanvasStore((s) => s.boxModelOverlayVisible);
  const artboards = useCanvasStore((s) => s.artboards);
  const artboardOrder = useCanvasStore((s) => s.artboardOrder);
  const activeArtboardId = useCanvasStore((s) => s.activeArtboardId);
  const guidesCount = useCanvasStore((s) => s.guides.length);
  const canvasViewMode = useCanvasStore((s) => s.canvasViewMode);
  const setCanvasViewMode = useCanvasStore((s) => s.setCanvasViewMode);

  const setActiveTool = useCanvasStore((s) => s.setActiveTool);
  const toggleInteractMode = useCanvasStore((s) => s.toggleInteractMode);
  const toggleRulers = useCanvasStore((s) => s.toggleRulers);
  const toggleBoxModelOverlay = useCanvasStore((s) => s.toggleBoxModelOverlay);
  const clearGuides = useCanvasStore((s) => s.clearGuides);
  const activateOrSpawnBreakpoint = useCanvasStore(
    (s) => s.activateOrSpawnBreakpoint
  );
  const addCustomArtboard = useCanvasStore((s) => s.addCustomArtboard);
  const focusArtboard = useCanvasStore((s) => s.focusArtboard);
  const zoomAt = useCanvasStore((s) => s.zoomAt);
  const zoomTo100 = useCanvasStore((s) => s.zoomTo100);
  const zoomToFitAll = useCanvasStore((s) => s.zoomToFitAll);

  const primaryKey = useSelectionStore((s) => s.primaryKey);
  const selectSingle = useSelectionStore((s) => s.selectSingle);
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const selectParent = useSelectionStore((s) => s.selectParent);
  const selectFirstChild = useSelectionStore((s) => s.selectFirstChild);
  const startTextEditing = useSelectionStore((s) => s.startTextEditing);
  const getPrimaryVNode = useSelectionStore((s) => s.getPrimaryVNode);

  const wrapNode = useLayersStore((s) => s.wrapNode);
  const unwrapNode = useLayersStore((s) => s.unwrapNode);
  const moveSiblingByDelta = useLayersStore((s) => s.moveSiblingByDelta);
  const toggleHiddenInDesign = useLayersStore((s) => s.toggleHiddenInDesign);
  const toggleLock = useLayersStore((s) => s.toggleLock);
  const startRenaming = useLayersStore((s) => s.startRenaming);
  const bumpRevision = useLayersStore((s) => s.bumpRevision);

  const inspectorTab = useInspectorStore((s) => s.activeTab);
  const targetKind = useInspectorStore((s) => s.targetKind);
  const activeState = useInspectorStore((s) => s.activeState);
  const setInspectorTab = useInspectorStore((s) => s.setActiveTab);
  const setTargetSelector = useInspectorStore((s) => s.setTargetSelector);
  const setActiveState = useInspectorStore((s) => s.setActiveState);
  const commitStyleProps = useInspectorStore((s) => s.commitStyleProps);

  const codePanelOpen = useCodeEditorStore((s) => s.isOpen);
  const syncMode = useCodeEditorStore((s) => s.syncMode);
  const toggleCodePanel = useCodeEditorStore((s) => s.togglePanel);
  const setCodePanelOpen = useCodeEditorStore((s) => s.setPanelOpen);
  const setActiveCodeFile = useCodeEditorStore((s) => s.setActiveFile);
  const setActiveSubTab = useCodeEditorStore((s) => s.setActiveSubTab);
  const setSyncMode = useCodeEditorStore((s) => s.setSyncMode);
  const formatActiveFile = useCodeEditorStore((s) => s.formatActiveFile);
  const codeRevision = useCodeEditorStore((s) => s.codeRevision);

  const [leftTab, setLeftTab] = useState<
    'pages' | 'layers' | 'insert' | 'assets'
  >('layers');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportInitialTab, setExportInitialTab] = useState<
    'settings' | 'auditor'
  >('settings');
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  const [statusToast, setStatusToast] = useState<string | null>(null);

  const menuBarRef = useRef<HTMLElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const htmlFileInputRef = useRef<HTMLInputElement | null>(null);
  const folderFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleOpenFolder = async (): Promise<void> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof window !== 'undefined' && typeof (window as any).showDirectoryPicker === 'function') {
      try {
        const res = await openFolderWorkspace();
        if (res.ok) {
          showToast(res.message);
        }
        return;
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        // Fallback to input
      }
    }
    folderFileInputRef.current?.click();
  };

  const handleSaveProject = async (): Promise<void> => {
    const res = await saveProjectToDisk();
    if (res.ok) {
      showToast(res.message);
    } else {
      // Fallback to downloading a clean zip of the project
      const zipBlob = await exportCleanProjectZip();
      triggerZipDownload(zipBlob, 'figrow-project.zip');
      showToast('Exported clean non-destructive project ZIP (figrow-project.zip)!');
    }
  };

  const showToast = (msg: string): void => {
    setStatusToast(msg);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setStatusToast(null);
    }, 5200);
  };

  const projectFiles = useMemo(() => {
    void codeRevision;
    return Array.from(projectDoc.files.keys()).sort();
  }, [codeRevision]);

  const activeArtboard = artboards[activeArtboardId];

  const getStageSize = (): { w: number; h: number } => {
    const el = document.getElementById('vds-canvas-stage');
    if (!el) return { w: 1200, h: 800 };
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height };
  };

  // Close menu dropdown when clicking outside
  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (e: PointerEvent): void => {
      if (
        menuBarRef.current &&
        e.target instanceof Node &&
        !menuBarRef.current.contains(e.target)
      ) {
        setOpenMenu(null);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [openMenu]);

  // Action Helpers for Toolbar & Menu Bar
  const handleUndo = (): void => {
    projectDoc.undoManager.undo();
    reloadArtboardsForFile('index.html');
    bumpRevision();
    showToast('Undo applied (Ctrl+Z)');
  };

  const handleRedo = (): void => {
    projectDoc.undoManager.redo();
    reloadArtboardsForFile('index.html');
    bumpRevision();
    showToast('Redo applied (Ctrl+Shift+Z)');
  };

  const handleQuickInsertById = (compId: string): void => {
    const def = COMPONENT_CATALOG.find((c) => c.id === compId);
    if (!def) return;
    const res = insertComponentIntoDocument(def, primaryKey, 'inside');
    if (res.ok && res.insertedNodeId) {
      selectSingle(res.insertedNodeId, activeArtboardId);
    }
    showToast(res.message);
  };

  const handleTextToolAction = (): void => {
    const vnode = getPrimaryVNode('index.html');
    if (primaryKey && vnode?.tag && TEXT_EDITABLE_TAGS.has(vnode.tag)) {
      startTextEditing(primaryKey);
      sandboxRegistry.send(activeArtboardId, {
        t: 'startInlineEdit',
        id: primaryKey,
      });
      showToast(
        `Inline Text Editing active on <${vnode.tag}> — type directly on the canvas (Esc or click outside to commit)`
      );
      return;
    }
    handleQuickInsertById('prim.paragraph');
  };

  const handleAddCustomFrame = (): void => {
    const presets = [
      { w: 1280, label: 'Laptop 1280' },
      { w: 1024, label: 'Tablet Landscape 1024' },
      { w: 430, label: 'Mobile XL 430' },
      { w: 1920, label: 'Full HD 1920' },
    ];
    const pick = presets[artboardOrder.length % presets.length] ?? presets[0]!;
    const newId = addCustomArtboard(pick.w, pick.label);
    const { w, h } = getStageSize();
    focusArtboard(newId, w, h);
    showToast(`Added & focused artboard: ${pick.label} (${pick.w}px)`);
  };

  const handleInsertRectangle = (): void => {
    const boxDef = COMPONENT_CATALOG.find((c) => c.id === 'prim.div-box');
    if (boxDef) {
      const res = insertComponentIntoDocument(boxDef, primaryKey, 'inside');
      if (res.ok && res.insertedNodeId) {
        selectSingle(res.insertedNodeId);
        showToast('Inserted Rectangle (R)');
      }
    }
  };

  const handleInsertCircle = (): void => {
    const circleDef = {
      id: 'prim.circle',
      kind: 'primitive' as const,
      label: 'Ellipse',
      description: 'Circular container box',
      category: 'Layout' as const,
      rootTag: 'div',
      html: `<div class="vds-circle" style="width: 80px; height: 80px; border-radius: 50%; background: #0d99ff;"></div>`,
    };
    const res = insertComponentIntoDocument(circleDef, primaryKey, 'inside');
    if (res.ok && res.insertedNodeId) {
      selectSingle(res.insertedNodeId);
      showToast('Inserted Ellipse (O)');
    }
  };

  // Global App Keyboard Shortcuts (Ctrl+E, Ctrl+`, T, I)
  useEffect(() => {
    const isInputFocused = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || target.isContentEditable;
    };

    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        handleOpenFolder();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        const res = syncNavbarAcrossProject(useCanvasStore.getState().activeFile || 'index.html');
        if (res.syncedCount > 0) {
          showToast(`Synchronized navbar across ${res.syncedCount} page(s): ${res.targetFiles.join(', ')}`);
        } else {
          showToast('No common navbar detected to synchronize.');
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveProject();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        htmlFileInputRef.current?.click();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setExportInitialTab('settings');
        setExportOpen(true);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        toggleCodePanel();
        return;
      }

      if (isInputFocused(e.target)) return;
      if (useSelectionStore.getState().mode === 'textEditing') return;

      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === 't' || e.key === 'T') {
          e.preventDefault();
          handleTextToolAction();
        } else if (e.key === 'i' || e.key === 'I') {
          e.preventDefault();
          setLeftTab('insert');
          showToast('Opened Insert Component Library (I)');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Top Menu Bar Definitions
  const menuDefinitions: Record<MenuId, MenuItemDef[]> = {
    file: [
      {
        label: 'Save Project (In-Place / Clean Export)',
        shortcut: 'Ctrl+S',
        action: handleSaveProject,
      },
      {
        label: 'Open Project Folder...',
        shortcut: 'Ctrl+Shift+O',
        action: handleOpenFolder,
      },
      {
        label: 'Import / Upload HTML & CSS Files...',
        shortcut: 'Ctrl+O',
        dividerAfter: true,
        action: () => {
          htmlFileInputRef.current?.click();
        },
      },
      {
        label: 'Open index.html in Code Editor',
        action: () => {
          setActiveCodeFile('index.html');
          setCodePanelOpen(true);
        },
      },
      {
        label: 'Open css/styles.css in Code Editor',
        dividerAfter: true,
        action: () => {
          setActiveCodeFile('css/styles.css');
          setCodePanelOpen(true);
        },
      },
      {
        label: 'Upload Image / SVG Assets...',
        action: () => {
          setLeftTab('assets');
          showToast('Switched to Asset Manager — click Upload to add files');
        },
      },
      {
        label: 'Format Active File (Prettier)',
        shortcut: 'Shift+Alt+F',
        dividerAfter: true,
        action: () => {
          void formatActiveFile();
          showToast('Formatted active document with Prettier');
        },
      },
      {
        label: 'Reset to Starter Template',
        dividerAfter: true,
        action: () => {
          projectDoc.resetProject();
          reloadArtboardsForFile('index.html');
          const sheets = projectDoc.getStyleSheets();
          for (const s of sheets) {
            sandboxRegistry.broadcastPatch([
              { op: 'replaceSheet', file: s.file, cssText: s.css },
            ]);
          }
          clearSelection();
          bumpRevision();
          showToast('Reset project to clean starter template');
        },
      },
      {
        label: 'Export Project ZIP...',
        shortcut: 'Ctrl+E',
        action: () => {
          setExportInitialTab('settings');
          setExportOpen(true);
        },
      },
    ],
    edit: [
      {
        label: 'Undo',
        shortcut: 'Ctrl+Z',
        action: handleUndo,
      },
      {
        label: 'Redo',
        shortcut: 'Ctrl+Shift+Z',
        dividerAfter: true,
        action: handleRedo,
      },
      {
        label: 'Duplicate Selected Element',
        shortcut: 'Ctrl+D',
        disabled: !primaryKey || primaryKey === 'n_body',
        action: () => {
          if (!primaryKey) return;
          const cloned = duplicateElementNode('index.html', primaryKey);
          if (cloned) {
            selectSingle(cloned, activeArtboardId);
            showToast(`Duplicated element #${primaryKey}`);
          }
        },
      },
      {
        label: 'Delete Selected Element',
        shortcut: 'Del',
        disabled: !primaryKey || primaryKey === 'n_body',
        dividerAfter: true,
        action: () => {
          if (!primaryKey) return;
          if (deleteElementNode('index.html', primaryKey)) {
            clearSelection();
            showToast('Deleted selected element');
          }
        },
      },
      {
        label: 'Rename Layer in Sidecar...',
        shortcut: 'F2',
        disabled: !primaryKey,
        action: () => {
          if (!primaryKey) return;
          setLeftTab('layers');
          startRenaming(primaryKey);
        },
      },
      {
        label: 'Clear Selection',
        shortcut: 'Esc',
        disabled: !primaryKey,
        action: () => {
          clearSelection();
          showToast('Selection cleared');
        },
      },
    ],
    view: [
      {
        label: 'Zoom In (125%)',
        shortcut: 'Ctrl++',
        action: () => {
          const { w, h } = getStageSize();
          zoomAt(w / 2, h / 2, 1.25);
        },
      },
      {
        label: 'Zoom Out (80%)',
        shortcut: 'Ctrl+-',
        action: () => {
          const { w, h } = getStageSize();
          zoomAt(w / 2, h / 2, 1 / 1.25);
        },
      },
      {
        label: 'Zoom to 100%',
        shortcut: 'Ctrl+0',
        action: () => {
          const { w, h } = getStageSize();
          zoomTo100(w, h);
        },
      },
      {
        label: 'Fit All Artboards',
        shortcut: 'Shift+1',
        dividerAfter: true,
        action: () => {
          const { w, h } = getStageSize();
          zoomToFitAll(w, h);
        },
      },
      {
        label: 'Show Canvas Rulers',
        checked: rulersVisible,
        action: () => {
          toggleRulers();
          showToast(`Canvas Rulers ${!rulersVisible ? 'enabled' : 'hidden'}`);
        },
      },
      {
        label: 'Show Box-Model Tint Overlay',
        checked: boxModelOverlayVisible,
        action: () => {
          toggleBoxModelOverlay();
          showToast(
            `Box-Model Overlay ${!boxModelOverlayVisible ? 'enabled' : 'hidden'}`
          );
        },
      },
      {
        label: `Clear All Ruler Guides (${guidesCount})`,
        disabled: guidesCount === 0,
        dividerAfter: true,
        action: () => {
          clearGuides();
          showToast('Cleared all ruler guides');
        },
      },
      {
        label: 'Interactive Preview Mode',
        checked: interactMode,
        action: () => {
          toggleInteractMode();
          showToast(
            !interactMode
              ? 'Preview Mode ON — interact with live links, buttons & scroll'
              : 'Design Mode ON — canvas selection & handles active'
          );
        },
      },
      {
        label: 'Show Live Code Editor Panel',
        shortcut: 'Ctrl+`',
        checked: codePanelOpen,
        action: toggleCodePanel,
      },
    ],
    insert: [
      {
        label: 'Open Component Library Panel',
        shortcut: 'I',
        dividerAfter: true,
        action: () => setLeftTab('insert'),
      },
      {
        label: 'Insert Section Block (<section>)',
        action: () => handleQuickInsertById('prim.section'),
      },
      {
        label: 'Insert Flex Row Container (<div>)',
        action: () => handleQuickInsertById('prim.flex-row'),
      },
      {
        label: 'Insert 3-Column CSS Grid (<div>)',
        dividerAfter: true,
        action: () => handleQuickInsertById('prim.grid-3col'),
      },
      {
        label: 'Insert Heading H2 (<h2>)',
        action: () => handleQuickInsertById('prim.h2'),
      },
      {
        label: 'Insert Paragraph (<p>)',
        shortcut: 'T',
        action: () => handleQuickInsertById('prim.paragraph'),
      },
      {
        label: 'Insert CTA Button (<button>)',
        action: () => handleQuickInsertById('prim.button-cta'),
      },
      {
        label: 'Insert Responsive Image (<img>)',
        dividerAfter: true,
        action: () => handleQuickInsertById('prim.image'),
      },
      {
        label: 'Insert Pricing Tier Block',
        action: () => handleQuickInsertById('block.pricing-card'),
      },
      {
        label: 'Insert Gradient CTA Banner',
        dividerAfter: true,
        action: () => handleQuickInsertById('block.cta-banner'),
      },
      {
        label: 'Add New Responsive Artboard Frame',
        action: handleAddCustomFrame,
      },
    ],
    element: [
      {
        label: 'Sync Navbar Across All Pages',
        shortcut: 'Ctrl+Shift+N',
        dividerAfter: true,
        action: () => {
          const res = syncNavbarAcrossProject(useCanvasStore.getState().activeFile || 'index.html');
          if (res.syncedCount > 0) {
            showToast(`Synchronized navbar across ${res.syncedCount} page(s): ${res.targetFiles.join(', ')}`);
          } else {
            showToast('No common navbar detected to synchronize.');
          }
        },
      },
      {
        label: 'Edit Inline Text on Canvas',
        shortcut: 'Double-Click',
        disabled: !primaryKey,
        dividerAfter: true,
        action: handleTextToolAction,
      },
      {
        label: 'Wrap in <div> Container',
        shortcut: 'Ctrl+G',
        disabled: !primaryKey || primaryKey === 'n_body',
        action: () => {
          if (!primaryKey) return;
          const wrapped = wrapNode(primaryKey, 'div');
          if (wrapped) {
            selectSingle(wrapped, activeArtboardId);
            showToast('Wrapped element in <div> container');
          }
        },
      },
      {
        label: 'Wrap in <section>',
        disabled: !primaryKey || primaryKey === 'n_body',
        action: () => {
          if (!primaryKey) return;
          const wrapped = wrapNode(primaryKey, 'section');
          if (wrapped) {
            selectSingle(wrapped, activeArtboardId);
            showToast('Wrapped element in <section>');
          }
        },
      },
      {
        label: 'Unwrap Container',
        shortcut: 'Ctrl+Shift+G',
        disabled: !primaryKey || primaryKey === 'n_body',
        dividerAfter: true,
        action: () => {
          if (!primaryKey) return;
          const child = unwrapNode(primaryKey);
          if (child) {
            selectSingle(child, activeArtboardId);
            showToast('Unwrapped parent container');
          }
        },
      },
      {
        label: 'Move Up Before Previous Sibling',
        shortcut: 'Alt+↑',
        disabled: !primaryKey || primaryKey === 'n_body',
        action: () => {
          if (!primaryKey) return;
          moveSiblingByDelta(primaryKey, -1);
          showToast('Moved element up');
        },
      },
      {
        label: 'Move Down After Next Sibling',
        shortcut: 'Alt+↓',
        disabled: !primaryKey || primaryKey === 'n_body',
        dividerAfter: true,
        action: () => {
          if (!primaryKey) return;
          moveSiblingByDelta(primaryKey, 1);
          showToast('Moved element down');
        },
      },
      {
        label: 'Select Parent Element',
        shortcut: 'Esc',
        disabled: !primaryKey,
        action: selectParent,
      },
      {
        label: 'Select First Child Element',
        shortcut: 'Enter',
        disabled: !primaryKey,
        dividerAfter: true,
        action: selectFirstChild,
      },
      {
        label: 'Toggle Hide in Design Canvas',
        shortcut: 'Ctrl+Shift+H',
        disabled: !primaryKey,
        action: () => {
          if (!primaryKey) return;
          toggleHiddenInDesign(primaryKey);
          showToast('Toggled design-only visibility');
        },
      },
      {
        label: 'Toggle Lock Element',
        shortcut: 'Ctrl+Shift+L',
        disabled: !primaryKey,
        action: () => {
          if (!primaryKey) return;
          toggleLock(primaryKey);
          showToast('Toggled element lock state');
        },
      },
    ],
    style: [
      {
        label: 'Open CSS Style Inspector',
        checked: inspectorTab === 'styles',
        action: () => setInspectorTab('styles'),
      },
      {
        label: 'Open Design Tokens (:root --*)',
        checked: inspectorTab === 'tokens',
        dividerAfter: true,
        action: () => setInspectorTab('tokens'),
      },
      {
        label: 'Write Target: CSS Stylesheet Rule',
        checked: targetKind === 'rule',
        action: () => {
          setTargetSelector('rule', null);
          showToast('Style Target set to external CSS rule');
        },
      },
      {
        label: 'Write Target: Inline style="..."',
        checked: targetKind === 'inline',
        dividerAfter: true,
        action: () => {
          setTargetSelector('inline', 'inline');
          showToast('Style Target set to inline style attribute');
        },
      },
      {
        label: 'Pseudo-State: Normal (none)',
        checked: activeState === null,
        action: () => setActiveState(null, primaryKey, activeArtboardId),
      },
      {
        label: 'Pseudo-State: :hover',
        checked: activeState === ':hover',
        action: () => setActiveState(':hover', primaryKey, activeArtboardId),
      },
      {
        label: 'Pseudo-State: :focus-visible',
        checked: activeState === ':focus-visible',
        action: () =>
          setActiveState(':focus-visible', primaryKey, activeArtboardId),
      },
      {
        label: 'Pseudo-State: :active',
        checked: activeState === ':active',
        dividerAfter: true,
        action: () => setActiveState(':active', primaryKey, activeArtboardId),
      },
      {
        label: 'Quick Apply: Flexbox Row (gap: 16px)',
        disabled: !primaryKey,
        action: () => {
          if (!primaryKey) return;
          commitStyleProps(
            activeArtboardId,
            activeArtboard?.width ?? 1440,
            primaryKey,
            {
              display: 'flex',
              'align-items': 'center',
              gap: '16px',
            }
          );
          showToast('Applied display: flex; align-items: center; gap: 16px;');
        },
      },
      {
        label: 'Quick Apply: 3-Column CSS Grid',
        disabled: !primaryKey,
        action: () => {
          if (!primaryKey) return;
          commitStyleProps(
            activeArtboardId,
            activeArtboard?.width ?? 1440,
            primaryKey,
            {
              display: 'grid',
              'grid-template-columns': 'repeat(3, minmax(0, 1fr))',
              gap: '24px',
            }
          );
          showToast('Applied 3-Column CSS Grid layout');
        },
      },
    ],
    code: [
      {
        label: codePanelOpen
          ? 'Hide Monaco Live Code Panel'
          : 'Show Monaco Live Code Panel',
        shortcut: 'Ctrl+`',
        checked: codePanelOpen,
        dividerAfter: true,
        action: toggleCodePanel,
      },
      {
        label: 'Edit index.html',
        action: () => {
          setActiveCodeFile('index.html');
          setCodePanelOpen(true);
        },
      },
      {
        label: 'Edit css/styles.css',
        action: () => {
          setActiveCodeFile('css/styles.css');
          setCodePanelOpen(true);
        },
      },
      {
        label: 'Open Problems & Diagnostics Tab',
        dividerAfter: true,
        action: () => {
          setActiveSubTab('problems');
          setCodePanelOpen(true);
        },
      },
      {
        label: 'Format Active File with Prettier',
        shortcut: 'Shift+Alt+F',
        dividerAfter: true,
        action: () => {
          setCodePanelOpen(true);
          void formatActiveFile();
          showToast('Formatted active file with Prettier');
        },
      },
      {
        label: 'Sync Mode: Live (150ms Debounce)',
        checked: syncMode === 'live',
        action: () => setSyncMode('live'),
      },
      {
        label: 'Sync Mode: On Save (Ctrl+S)',
        checked: syncMode === 'onSave',
        action: () => setSyncMode('onSave'),
      },
      {
        label: 'Sync Mode: Paused',
        checked: syncMode === 'paused',
        action: () => setSyncMode('paused'),
      },
    ],
    export: [
      {
        label: 'Export Project ZIP (Pure HTML/CSS or Tailwind v4)...',
        shortcut: 'Ctrl+E',
        action: () => {
          setExportInitialTab('settings');
          setExportOpen(true);
        },
      },
      {
        label: 'Run Pre-Export Quality, SEO & A11y Auditor...',
        action: () => {
          setExportInitialTab('auditor');
          setExportOpen(true);
        },
      },
    ],
  };

  const menuBarButtons: Array<{ id: MenuId; label: string }> = [
    { id: 'file', label: 'File' },
    { id: 'edit', label: 'Edit' },
    { id: 'view', label: 'View' },
    { id: 'insert', label: 'Insert' },
    { id: 'element', label: 'Element' },
    { id: 'style', label: 'Style' },
    { id: 'code', label: 'Code' },
    { id: 'export', label: 'Export' },
  ];

  return (
    <div className="vds-shell">
      {/* MENU BAR */}
      <header
        ref={menuBarRef}
        className="vds-menubar"
        role="menubar"
        aria-label="Studio Menu Bar"
      >
        <div className="vds-brand">
          <svg width="14" height="21" viewBox="0 0 38 57" fill="none" className="vds-figma-logo">
            <path d="M19 28.5C19 23.2533 23.2533 19 28.5 19C33.7467 19 38 23.2533 38 28.5C38 33.7467 33.7467 38 28.5 38H19V28.5Z" fill="#1ABCFE"/>
            <path d="M0 47.5C0 42.2533 4.25329 38 9.5 38H19V47.5C19 52.7467 14.7467 57 9.5 57C4.25329 57 0 52.7467 0 47.5Z" fill="#0ACF83"/>
            <path d="M19 0V19H28.5C33.7467 19 38 14.7467 38 9.5C38 4.25329 33.7467 0 28.5 0H19Z" fill="#FF7262"/>
            <path d="M0 9.5C0 14.7467 4.25329 19 9.5 19H19V0H9.5C4.25329 0 0 4.25329 0 9.5Z" fill="#F24E1E"/>
            <path d="M0 28.5C0 33.7467 4.25329 38 9.5 38H19V19H9.5C4.25329 19 0 23.2533 0 28.5Z" fill="#A259FF"/>
          </svg>
          <strong>Figrow Studio</strong>
        </div>

        <nav className="vds-menu-items">
          {menuBarButtons.map((m) => {
            const isMenuOpen = openMenu === m.id;
            const items = menuDefinitions[m.id];
            return (
              <div key={m.id} className="vds-menu-anchor">
                <button
                  type="button"
                  className={`vds-menu-btn ${isMenuOpen ? 'active' : ''}`}
                  aria-expanded={isMenuOpen}
                  onClick={() =>
                    setOpenMenu((prev) => (prev === m.id ? null : m.id))
                  }
                  onMouseEnter={() => {
                    if (openMenu !== null && openMenu !== m.id) {
                      setOpenMenu(m.id);
                    }
                  }}
                >
                  {m.label}
                </button>

                {isMenuOpen && (
                  <div className="vds-menu-dropdown" role="menu">
                    {items.map((item, idx) => (
                      <React.Fragment key={`${m.id}-${idx}`}>
                        <button
                          type="button"
                          role="menuitem"
                          disabled={item.disabled}
                          className="vds-menu-dropdown-item"
                          onClick={() => {
                            if (item.disabled) return;
                            setOpenMenu(null);
                            item.action();
                          }}
                        >
                          <span className="vds-menu-check-col">
                            {item.checked ? <Check size={12} /> : null}
                          </span>
                          <span className="vds-menu-item-label">
                            {item.label}
                          </span>
                          {item.shortcut && (
                            <kbd className="vds-menu-shortcut">
                              {item.shortcut}
                            </kbd>
                          )}
                        </button>
                        {item.dividerAfter && (
                          <div className="vds-menu-divider" />
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="vds-menubar-status">
          <span className="vds-status-pill">
            Active:{' '}
            {activeArtboard
              ? `${activeArtboard.label} (${activeArtboard.width}px)`
              : 'None'}
          </span>
          <span className="vds-status-pill">CRDT Y.Doc v1.0</span>
        </div>
      </header>

      {/* TOP TOOLBAR */}
      <div
        className="vds-toolbar"
        role="toolbar"
        aria-label="Studio Main Toolbar"
      >
        <div className="vds-tool-group">
          <button
            type="button"
            className={`vds-tool-btn ${activeTool === 'select' ? 'active' : ''}`}
            title="Select Tool (V)"
            onClick={() => setActiveTool('select')}
          >
            <MousePointer size={15} />
            <span>Select</span>
          </button>
          <button
            type="button"
            className={`vds-tool-btn ${activeTool === 'hand' ? 'active' : ''}`}
            title="Hand / Pan Tool (H or Hold Space)"
            onClick={() => setActiveTool('hand')}
          >
            <Hand size={15} />
            <span>Hand</span>
          </button>

          <div className="vds-tool-divider" />

          <button
            type="button"
            className="vds-tool-btn"
            title="Undo (Ctrl+Z)"
            onClick={handleUndo}
          >
            <Undo2 size={14} />
          </button>
          <button
            type="button"
            className="vds-tool-btn"
            title="Redo (Ctrl+Shift+Z)"
            onClick={handleRedo}
          >
            <Redo2 size={14} />
          </button>

          <div className="vds-tool-divider" />

          <button
            type="button"
            className="vds-tool-btn"
            title="Add New Artboard Frame (F)"
            onClick={handleAddCustomFrame}
          >
            <Frame size={15} />
            <span>Frame</span>
          </button>
          <button
            type="button"
            className="vds-tool-btn"
            title="Insert Rectangle Box (R)"
            onClick={handleInsertRectangle}
          >
            <Square size={14} />
            <span>Rect</span>
          </button>
          <button
            type="button"
            className="vds-tool-btn"
            title="Insert Ellipse / Circle (O)"
            onClick={handleInsertCircle}
          >
            <Circle size={14} />
            <span>Ellipse</span>
          </button>
          <button
            type="button"
            className="vds-tool-btn"
            title="Edit Inline Text on Selected Element or Insert Paragraph (T)"
            onClick={handleTextToolAction}
          >
            <Type size={15} />
            <span>Text</span>
          </button>
          <button
            type="button"
            className={`vds-tool-btn ${leftTab === 'insert' ? 'active' : ''}`}
            title="Open Component Insert Library (I)"
            onClick={() => {
              setLeftTab('insert');
              showToast('Component Library opened in Left Sidebar');
            }}
          >
            <PlusSquare size={15} />
            <span>Insert</span>
          </button>
          <button
            type="button"
            className={`vds-tool-btn ${rulersVisible ? 'active' : ''}`}
            title="Toggle Canvas Rulers"
            onClick={toggleRulers}
          >
            <Ruler size={15} />
            <span>Rulers</span>
          </button>
          <button
            type="button"
            className={`vds-tool-btn ${boxModelOverlayVisible ? 'active' : ''}`}
            title="Toggle Box-Model Margin/Padding Tint Overlay"
            onClick={toggleBoxModelOverlay}
          >
            <BoxSelect size={15} />
            <span>Box Overlay</span>
          </button>
        </div>

        <div className="vds-tool-divider" />

        {/* RESPONSIVE BREAKPOINT SWITCHER */}
        <div className="vds-tool-group" aria-label="Responsive Breakpoints">
          <button
            type="button"
            className={`vds-tool-btn ${
              activeArtboard?.breakpointId === 'desktop' ? 'active' : ''
            }`}
            title="Desktop 1440px (Base CSS)"
            onClick={() => {
              const { w, h } = getStageSize();
              activateOrSpawnBreakpoint('desktop', w, h);
            }}
          >
            <Monitor size={15} />
            <span>1440</span>
          </button>
          <button
            type="button"
            className={`vds-tool-btn ${
              activeArtboard?.breakpointId === 'tablet' ? 'active' : ''
            }`}
            title="Tablet 768px (@media max-width: 1023.98px)"
            onClick={() => {
              const { w, h } = getStageSize();
              activateOrSpawnBreakpoint('tablet', w, h);
            }}
          >
            <Tablet size={15} />
            <span>768</span>
          </button>
          <button
            type="button"
            className={`vds-tool-btn ${
              activeArtboard?.breakpointId === 'mobile' ? 'active' : ''
            }`}
            title="Mobile 375px (@media max-width: 767.98px)"
            onClick={() => {
              const { w, h } = getStageSize();
              activateOrSpawnBreakpoint('mobile', w, h);
            }}
          >
            <Smartphone size={15} />
            <span>375</span>
          </button>
          <button
            type="button"
            className={`vds-tool-btn ${canvasViewMode === 'single' ? 'active' : ''}`}
            title="Toggle between Single Frame (Figma Mode) and Multi-Breakpoint side-by-side"
            onClick={() => {
              const nextMode = canvasViewMode === 'single' ? 'all' : 'single';
              setCanvasViewMode(nextMode);
              showToast(
                nextMode === 'single'
                  ? 'Figma Mode: Focused on single artboard'
                  : 'Multi-Breakpoint View: All artboards side-by-side'
              );
            }}
          >
            <span>{canvasViewMode === 'single' ? '⏹ Single (Figma)' : '☷ Multi'}</span>
          </button>
        </div>

        <div className="vds-tool-divider" />

        <div className="vds-tool-group vds-toolbar-right">
          <button
            type="button"
            className="vds-zoom-readout"
            title="Click to reset zoom to 100% (Ctrl+0)"
            onClick={() => {
              const { w, h } = getStageSize();
              zoomTo100(w, h);
            }}
          >
            {Math.round(camera.zoom * 100)}%
          </button>
          <button
            type="button"
            className={`vds-tool-btn ${interactMode ? 'active' : ''}`}
            title="Toggle Interact / Preview Mode (Allow native scrolling & clicks inside iframe)"
            onClick={toggleInteractMode}
          >
            <Play size={15} />
            <span>{interactMode ? 'Interacting' : 'Preview'}</span>
          </button>
          <button
            type="button"
            className={`vds-tool-btn ${codePanelOpen ? 'active' : ''}`}
            title="Toggle Source Code Live Editor (Ctrl+`)"
            onClick={toggleCodePanel}
          >
            <Code2 size={15} />
            <span>Code</span>
          </button>
          <button
            type="button"
            className="vds-tool-btn"
            title="Open Project Folder with multiple HTML/CSS pages (Ctrl+Shift+O)"
            onClick={handleOpenFolder}
          >
            <FolderOpen size={15} />
            <span>Open Folder</span>
          </button>
          <button
            type="button"
            className="vds-tool-btn"
            title="Sync Navbar Across All Pages (Ctrl+Shift+N)"
            onClick={() => {
              const res = syncNavbarAcrossProject(useCanvasStore.getState().activeFile || 'index.html');
              if (res.syncedCount > 0) {
                showToast(`Synchronized navbar across ${res.syncedCount} page(s): ${res.targetFiles.join(', ')}`);
              } else {
                showToast('No common navbar detected to synchronize.');
              }
            }}
          >
            <RefreshCw size={14} />
            <span>Sync Nav</span>
          </button>
          <button
            type="button"
            className="vds-tool-btn"
            title="Upload / Import HTML & CSS Files from Computer (Ctrl+O)"
            onClick={() => htmlFileInputRef.current?.click()}
          >
            <Upload size={15} />
            <span>Upload HTML</span>
          </button>
          <button
            type="button"
            className="vds-tool-btn vds-btn-primary"
            title="Save Project Changes In-Place (Ctrl+S)"
            onClick={handleSaveProject}
          >
            <Save size={15} />
            <span>Save</span>
          </button>
          <button
            type="button"
            className="vds-tool-btn"
            title="Export Project (Ctrl+E)"
            onClick={() => {
              setExportInitialTab('settings');
              setExportOpen(true);
            }}
          >
            <Download size={15} />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* FLOATING STATUS TOAST FOR MENU & TOOLBAR ACTIONS */}
      {statusToast && (
        <div className="vds-action-toast" role="status">
          <Sparkles size={13} />
          <span>{statusToast}</span>
        </div>
      )}

      {/* MAIN WORKSPACE 3-COLUMN */}
      <div className="vds-workspace">
        {/* LEFT SIDEBAR */}
        <aside
          className="vds-sidebar-left"
          aria-label="Project & Layers Sidebar"
        >
          <div className="vds-sidebar-tabs">
            <button
              type="button"
              className={`vds-tab-btn ${leftTab === 'pages' ? 'active' : ''}`}
              onClick={() => setLeftTab('pages')}
            >
              <FileCode size={14} />
              <span>Pages</span>
            </button>
            <button
              type="button"
              className={`vds-tab-btn ${leftTab === 'layers' ? 'active' : ''}`}
              onClick={() => setLeftTab('layers')}
            >
              <Layers size={14} />
              <span>Layers</span>
            </button>
            <button
              type="button"
              className={`vds-tab-btn ${leftTab === 'insert' ? 'active' : ''}`}
              onClick={() => setLeftTab('insert')}
            >
              <Package size={14} />
              <span>Insert</span>
            </button>
            <button
              type="button"
              className={`vds-tab-btn ${leftTab === 'assets' ? 'active' : ''}`}
              onClick={() => setLeftTab('assets')}
            >
              <ImageIcon size={14} />
              <span>Assets</span>
            </button>
          </div>
          <div className="vds-sidebar-body vds-sidebar-body-flush">
            {leftTab === 'layers' && <LayersTreePanel />}
            {leftTab === 'insert' && <InsertPanel />}
            {leftTab === 'assets' && <AssetManagerPanel />}
            {leftTab === 'pages' && (
              <div className="vds-pages-list">
                <button
                  type="button"
                  className="vds-tool-btn vds-btn-primary"
                  style={{ width: '100%', justifyContent: 'center', marginBottom: 6 }}
                  onClick={handleOpenFolder}
                >
                  <FolderOpen size={13} />
                  <span>Open Project Folder</span>
                </button>
                <button
                  type="button"
                  className="vds-tool-btn"
                  style={{ width: '100%', justifyContent: 'center', marginBottom: 6 }}
                  onClick={() => htmlFileInputRef.current?.click()}
                >
                  <Upload size={13} />
                  <span>Upload .HTML / .CSS File</span>
                </button>
                <div className="vds-insert-group-title" style={{ padding: '4px 4px 2px' }}>
                  <span>Project Files (Y.Doc)</span>
                </div>
                {projectFiles.map((file) => (
                  <button
                    key={file}
                    type="button"
                    className="vds-page-row"
                    onClick={() => {
                      if (file.endsWith('.html')) {
                        useCanvasStore.getState().setActiveFile(file);
                        showToast(`Switched canvas page to ${file}`);
                      } else {
                        setActiveCodeFile(file);
                        setCodePanelOpen(true);
                        showToast(`Opened ${file} in Live Code Editor`);
                      }
                    }}
                  >
                    <FileCode size={12} />
                    <span>{file}</span>
                  </button>
                ))}

                <div
                  className="vds-insert-group-title"
                  style={{ padding: '12px 4px 2px' }}
                >
                  <span>Canvas Artboards ({artboardOrder.length})</span>
                </div>
                {artboardOrder.map((abId) => {
                  const ab = artboards[abId];
                  if (!ab) return null;
                  return (
                    <button
                      key={ab.id}
                      type="button"
                      className={`vds-page-row ${
                        ab.id === activeArtboardId ? 'active' : ''
                      }`}
                      onClick={() => {
                        const { w, h } = getStageSize();
                        focusArtboard(ab.id, w, h);
                      }}
                    >
                      <Monitor size={12} />
                      <span>
                        {ab.label} ({ab.width}px)
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* CENTER STAGE + BOTTOM MONACO LIVE CODE PANEL */}
        <div className="vds-center-column">
          <InfiniteCanvas />
          <MonacoBottomPanel />
        </div>

        {/* RIGHT INSPECTOR (CSS-01 & CSS-04) */}
        <aside className="vds-inspector-right" aria-label="CSS Visual Inspector">
          <CssVisualInspector />
        </aside>
      </div>

      {/* BOTTOM STATUS BAR */}
      <footer className="vds-statusbar">
        <span>
          🟢 Camera: ({Math.round(camera.x)}, {Math.round(camera.y)}) @{' '}
          {Math.round(camera.zoom * 100)}% · Tool: {activeTool.toUpperCase()}
          {primaryKey ? ` · Selected: #${primaryKey}` : ''}
        </span>
        <span>
          Shortcuts: V Select · H Hand · T Text · I Insert · Ctrl+Z Undo ·
          Ctrl+` Code · Ctrl+E Export
        </span>
      </footer>

        {/* HIDDEN FILE PICKER FOR HTML / CSS IMPORT */}
      <input
        ref={htmlFileInputRef}
        type="file"
        accept=".html,.htm,.css"
        multiple
        style={{ display: 'none' }}
        onChange={async (e) => {
          const files = e.target.files;
          if (!files || files.length === 0) return;
          const res = await importHtmlAndCssFiles(files);
          e.target.value = '';
          clearSelection();
          bumpRevision();
          const { w, h } = getStageSize();
          zoomToFitAll(w, h, 64);
          showToast(res.message);
        }}
      />

      {/* HIDDEN DIRECTORY PICKER FOR FOLDER WORKSPACE */}
      <input
        ref={folderFileInputRef}
        type="file"
        {...({ webkitdirectory: '', directory: '' } as unknown as React.InputHTMLAttributes<HTMLInputElement>)}
        multiple
        style={{ display: 'none' }}
        onChange={async (e) => {
          const files = e.target.files;
          if (!files || files.length === 0) return;
          const res = await loadFolderFromFiles(files);
          e.target.value = '';
          clearSelection();
          bumpRevision();
          const { w, h } = getStageSize();
          zoomToFitAll(w, h, 64);
          showToast(res.message);
        }}
      />

      {exportOpen && (
        <ExportModal
          initialTab={exportInitialTab}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
}
