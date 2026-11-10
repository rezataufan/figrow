import React, { useMemo, useState } from 'react';
import {
  X,
  Download,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Sparkles,
  FileArchive,
  ShieldCheck,
} from 'lucide-react';
import { projectDoc } from '../../engine/doc/projectDoc';
import { useAssetManagerStore } from '../../engine/assets/assetManager';
import {
  createPresetConfig,
  runExportPipeline,
  triggerBlobDownload,
  type ExportConfig,
  type ExportPreset,
  type ExportResult,
  type ExportStage,
} from '../../engine/export/exportPipeline';
import { runPreExportAudit } from '../../engine/export/tailwindMapper';
import { applyDiagnosticQuickFix } from '../../engine/codeSync/diagnosticsAndFormat';
import { useSelectionStore } from '../../store/selectionStore';
import { useLayersStore } from '../../store/layersStore';

interface ExportModalProps {
  onClose: () => void;
  initialTab?: 'settings' | 'auditor';
}

export function ExportModal({
  onClose,
  initialTab = 'settings',
}: ExportModalProps): React.ReactElement {
  const [config, setConfig] = useState<ExportConfig>(() =>
    createPresetConfig('production', ['index.html'])
  );
  const [activeTab, setActiveTab] = useState<'settings' | 'auditor'>(initialTab);
  const [stage, setStage] = useState<ExportStage>('idle');
  const [progress, setProgress] = useState(0);
  const [lastResult, setLastResult] = useState<ExportResult | null>(null);

  const assets = useAssetManagerStore((s) => s.assets);
  const selectSingle = useSelectionStore((s) => s.selectSingle);
  const docRevision = useLayersStore((s) => s.docRevision);
  const bumpRevision = useLayersStore((s) => s.bumpRevision);

  const auditReport = useMemo(() => {
    void docRevision;
    const html = projectDoc.getFileText('index.html');
    const css = projectDoc.getFileText('css/styles.css');
    return runPreExportAudit('index.html', html, 'css/styles.css', css);
  }, [docRevision]);

  const handlePresetChange = (preset: ExportPreset): void => {
    setConfig(createPresetConfig(preset, ['index.html']));
    setLastResult(null);
  };

  const handleRunExport = async (): Promise<void> => {
    const res = await runExportPipeline(config, assets, (st, prog) => {
      setStage(st);
      setProgress(prog);
    });
    setLastResult(res);
    triggerBlobDownload(res.blob, res.fileName);
  };

  return (
    <div className="vds-modal-backdrop" onClick={onClose}>
      <div
        className="vds-export-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Export Project & Pre-Export Auditor"
      >
        {/* MODAL HEADER */}
        <div className="vds-export-header">
          <div className="vds-export-title">
            <FileArchive size={16} />
            <strong>Export Project &amp; Build Pipeline</strong>
            <span className="vds-badge-pill">
              Audit Score: {auditReport.overall}/100
            </span>
          </div>
          <button
            type="button"
            className="vds-code-action-btn"
            onClick={onClose}
          >
            <X size={13} />
          </button>
        </div>

        {/* SUB-TABS: EXPORT SETTINGS vs PRE-EXPORT AUDITOR */}
        <div className="vds-export-tabs">
          <button
            type="button"
            className={`vds-insp-tab ${
              activeTab === 'settings' ? 'active' : ''
            }`}
            onClick={() => setActiveTab('settings')}
          >
            <Download size={13} />
            <span>Build Configuration (EXP-01)</span>
          </button>
          <button
            type="button"
            className={`vds-insp-tab ${
              activeTab === 'auditor' ? 'active' : ''
            }`}
            onClick={() => setActiveTab('auditor')}
          >
            <ShieldCheck size={13} />
            <span>
              Pre-Export Auditor ({auditReport.findings.length} checks)
            </span>
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="vds-export-body">
          {activeTab === 'settings' ? (
            <>
              {/* PRESET SELECTOR */}
              <div className="vds-export-section">
                <label className="vds-export-sec-title">
                  1. Build Preset
                </label>
                <div className="vds-preset-cards">
                  {(
                    [
                      {
                        id: 'production',
                        title: 'Production Bundle',
                        desc: 'Minified HTML5 & CSS3, duplicate rules merged, content-hashed CSS filenames.',
                      },
                      {
                        id: 'readable',
                        title: 'Clean Readable Source',
                        desc: 'Human-readable HTML5 & CSS3 with zero design-time attributes.',
                      },
                      {
                        id: 'tailwind',
                        title: 'Tailwind CSS v4 Mode',
                        desc: 'Converts CSS rules into Tailwind v4 utility classes + @theme tokens.',
                      },
                    ] as const
                  ).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`vds-preset-card ${
                        config.preset === p.id ? 'active' : ''
                      }`}
                      onClick={() => handlePresetChange(p.id)}
                    >
                      <strong>{p.title}</strong>
                      <span>{p.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* HTML & CSS OPTIONS */}
              <div className="vds-export-grid-2">
                <div className="vds-export-section">
                  <label className="vds-export-sec-title">
                    2. HTML5 Output Options
                  </label>
                  <label className="vds-check-row">
                    <input type="checkbox" checked disabled />
                    <span>Strip design-time data-vds-* attributes</span>
                  </label>
                  <label className="vds-check-row">
                    <input
                      type="checkbox"
                      checked={config.html.minify}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          html: { ...config.html, minify: e.target.checked },
                        })
                      }
                    />
                    <span>Minify HTML whitespace</span>
                  </label>
                  <label className="vds-check-row">
                    <input
                      type="checkbox"
                      checked={config.html.keepComments}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          html: {
                            ...config.html,
                            keepComments: e.target.checked,
                          },
                        })
                      }
                    />
                    <span>Preserve user HTML comments</span>
                  </label>
                </div>

                <div className="vds-export-section">
                  <label className="vds-export-sec-title">
                    3. CSS3 &amp; Design Tokens
                  </label>
                  <label className="vds-check-row">
                    <input
                      type="checkbox"
                      checked={config.css.mergeDuplicates}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          css: {
                            ...config.css,
                            mergeDuplicates: e.target.checked,
                          },
                        })
                      }
                    />
                    <span>Cascade-safe duplicate rule merge</span>
                  </label>
                  <label className="vds-check-row">
                    <input
                      type="checkbox"
                      checked={config.css.minify}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          css: { ...config.css, minify: e.target.checked },
                        })
                      }
                    />
                    <span>Minify CSS stylesheet</span>
                  </label>
                  <label className="vds-check-row">
                    <input
                      type="checkbox"
                      checked={config.css.exportTokensJson}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          css: {
                            ...config.css,
                            exportTokensJson: e.target.checked,
                          },
                        })
                      }
                    />
                    <span>Include W3C tokens.json (:root variables)</span>
                  </label>
                  <label className="vds-check-row">
                    <input
                      type="checkbox"
                      checked={config.css.contentHash}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          css: {
                            ...config.css,
                            contentHash: e.target.checked,
                          },
                        })
                      }
                    />
                    <span>Cache-busting content hash (styles.xxxxxx.css)</span>
                  </label>
                </div>
              </div>

              {/* BUILD PROGRESS & SUMMARY */}
              {stage !== 'idle' && (
                <div className="vds-export-progress-box">
                  <div className="vds-export-progress-head">
                    <span>Stage: {stage.toUpperCase()}</span>
                    <span>{Math.round(progress * 100)}%</span>
                  </div>
                  <div className="vds-export-progress-bar">
                    <div
                      className="vds-export-progress-fill"
                      style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {lastResult && (
                <div className="vds-export-result-box">
                  <div className="vds-export-result-head">
                    <CheckCircle2 size={14} color="#10b981" />
                    <strong>
                      Built {lastResult.fileName} (
                      {Math.round((lastResult.totalBytes / 1024) * 10) / 10} KB)
                    </strong>
                  </div>
                  <div className="vds-export-file-list">
                    {lastResult.files.map((f) => (
                      <div key={f.path} className="vds-export-file-item">
                        <code>{f.path}</code>
                        <span>{f.bytes} B</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* PRE-EXPORT AUDITOR TAB (EXP-02_TAILWIND_VALIDATION.md) */
            <div className="vds-auditor-panel">
              <div className="vds-audit-scores-grid">
                {(
                  [
                    { key: 'semantics', label: 'HTML5 Semantics' },
                    { key: 'a11y', label: 'Accessibility (WCAG)' },
                    { key: 'performance', label: 'CWV Performance' },
                    { key: 'seo', label: 'SEO & Metadata' },
                  ] as const
                ).map((cat) => {
                  const score = auditReport.scores[cat.key];
                  return (
                    <div key={cat.key} className="vds-audit-score-card">
                      <span className="vds-audit-score-num">{score}</span>
                      <span className="vds-audit-score-lbl">{cat.label}</span>
                    </div>
                  );
                })}
              </div>

              <div className="vds-audit-findings-list">
                {auditReport.findings.length === 0 ? (
                  <div className="vds-problems-empty">
                    ✓ All Pre-Export Semantic, Accessibility, Performance &amp; SEO checks passed (100/100)!
                  </div>
                ) : (
                  auditReport.findings.map((f) => (
                    <div
                      key={f.id}
                      className={`vds-problem-row sev-${f.severity}`}
                    >
                      <span className="vds-problem-badge">{f.category}</span>
                      <span className="vds-problem-msg">{f.message}</span>
                      {f.nodeKey && (
                        <button
                          type="button"
                          className="vds-mini-pill"
                          onClick={() => {
                            selectSingle(f.nodeKey!);
                            onClose();
                          }}
                        >
                          Locate
                        </button>
                      )}
                      {f.fix && (
                        <button
                          type="button"
                          className="vds-quickfix-btn"
                          onClick={() => {
                            applyDiagnosticQuickFix(f.fix!);
                            bumpRevision();
                          }}
                        >
                          <Zap size={11} />
                          <span>{f.fix.label}</span>
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="vds-export-footer">
          <div className="vds-export-footer-meta">
            <AlertTriangle size={12} />
            <span>
              3 Breakpoints Active (Base 1440px · Tablet ≤1023px · Mobile ≤767px)
            </span>
          </div>
          <div className="vds-export-footer-btns">
            <button
              type="button"
              className="vds-code-action-btn"
              onClick={onClose}
            >
              Close
            </button>
            <button
              type="button"
              className="vds-btn-small"
              onClick={() => {
                void handleRunExport();
              }}
            >
              <Sparkles size={12} />
              <span>Export &amp; Download ZIP</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
