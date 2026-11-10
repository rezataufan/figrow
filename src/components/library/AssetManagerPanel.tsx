import React, { useRef } from 'react';
import {
  Upload,
  Search,
  Image as ImageIcon,
  Code2,
  Layers,
  Trash2,
} from 'lucide-react';
import {
  useAssetManagerStore,
  countAssetReferences,
} from '../../engine/assets/assetManager';
import { useSelectionStore } from '../../store/selectionStore';
import { useCanvasStore } from '../../store/canvasStore';
import { useInspectorStore } from '../../store/inspectorStore';

export function AssetManagerPanel(): React.ReactElement {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const assets = useAssetManagerStore((s) => s.assets);
  const selectedHash = useAssetManagerStore((s) => s.selectedHash);
  const filterKind = useAssetManagerStore((s) => s.filterKind);
  const searchQuery = useAssetManagerStore((s) => s.searchQuery);

  const setSelectedHash = useAssetManagerStore((s) => s.setSelectedHash);
  const setFilterKind = useAssetManagerStore((s) => s.setFilterKind);
  const setSearchQuery = useAssetManagerStore((s) => s.setSearchQuery);
  const uploadFiles = useAssetManagerStore((s) => s.uploadFiles);
  const deleteAsset = useAssetManagerStore((s) => s.deleteAsset);
  const insertAssetToCanvas = useAssetManagerStore(
    (s) => s.insertAssetToCanvas
  );

  const primaryKey = useSelectionStore((s) => s.primaryKey);
  const activeArtboardId = useCanvasStore((s) => s.activeArtboardId);
  const activeArtboard = useCanvasStore((s) => s.artboards[s.activeArtboardId]);
  const commitStyleProps = useInspectorStore((s) => s.commitStyleProps);

  const q = searchQuery.trim().toLowerCase();
  const filtered = assets.filter((a) => {
    if (filterKind !== 'all' && a.kind !== filterKind) return false;
    if (q && !a.name.toLowerCase().includes(q)) return false;
    return true;
  });

  const selectedAsset =
    assets.find((a) => a.hash === selectedHash) ?? filtered[0] ?? null;

  return (
    <div className="vds-assets-panel">
      {/* TOP BAR: UPLOAD + FILTER */}
      <div className="vds-insert-header">
        <div className="vds-assets-top-row">
          <div className="vds-search-box" style={{ flex: 1 }}>
            <Search size={12} />
            <input
              type="text"
              placeholder="Search assets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.svg"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                void uploadFiles(e.target.files);
                e.target.value = '';
              }
            }}
          />
          <button
            type="button"
            className="vds-btn-small"
            onClick={() => fileInputRef.current?.click()}
            title="Upload Images or SVGs (SHA-256 Deduplicated)"
          >
            <Upload size={11} />
            <span>Upload</span>
          </button>
        </div>

        <div className="vds-assets-filter-row">
          {(['all', 'image', 'svg'] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={`vds-mini-pill ${filterKind === k ? 'active' : ''}`}
              onClick={() => setFilterKind(k)}
            >
              {k.toUpperCase()}
            </button>
          ))}
          <span className="vds-assets-count">{filtered.length} items</span>
        </div>
      </div>

      {/* ASSET THUMBNAIL GRID */}
      <div className="vds-assets-grid-scroll">
        <div className="vds-assets-grid">
          {filtered.map((asset) => {
            const isSelected = selectedAsset?.hash === asset.hash;
            const kb = Math.max(0.1, Math.round((asset.bytes / 1024) * 10) / 10);
            const isOversized = asset.bytes > 500 * 1024;
            return (
              <div
                key={asset.hash}
                className={`vds-asset-card ${isSelected ? 'selected' : ''}`}
                onClick={() => setSelectedHash(asset.hash)}
              >
                <div className="vds-asset-thumb">
                  <img src={asset.dataUrl} alt={asset.altDefault} />
                </div>
                <div className="vds-asset-card-meta">
                  <strong className="vds-asset-name">{asset.name}</strong>
                  <span className="vds-asset-dims">
                    {asset.width}×{asset.height} · {kb} KB{' '}
                    {isOversized ? '⚠' : '✓'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SELECTED ASSET INSPECTOR & QUICK ACTIONS (COMP-02 §1) */}
      {selectedAsset && (
        <div className="vds-asset-detail-box">
          <div className="vds-asset-detail-head">
            <div>
              <strong>{selectedAsset.name}</strong>
              <span className="vds-asset-path">{selectedAsset.path}</span>
            </div>
            <span className="vds-badge-pill">
              {countAssetReferences(selectedAsset)} uses
            </span>
          </div>

          <div className="vds-asset-actions-grid">
            <button
              type="button"
              className="vds-mini-pill"
              onClick={() =>
                insertAssetToCanvas(selectedAsset, primaryKey, 'img')
              }
            >
              <ImageIcon size={11} />
              <span>Insert &lt;img&gt;</span>
            </button>

            {selectedAsset.svgMarkup && (
              <button
                type="button"
                className="vds-mini-pill"
                onClick={() =>
                  insertAssetToCanvas(selectedAsset, primaryKey, 'inline-svg')
                }
              >
                <Code2 size={11} />
                <span>Inline &lt;svg&gt;</span>
              </button>
            )}

            {primaryKey && (
              <button
                type="button"
                className="vds-mini-pill"
                onClick={() =>
                  commitStyleProps(
                    activeArtboardId,
                    activeArtboard?.width ?? 1440,
                    primaryKey,
                    {
                      'background-image': `url("${selectedAsset.dataUrl}")`,
                      'background-size': 'cover',
                      'background-position': 'center',
                    }
                  )
                }
              >
                <Layers size={11} />
                <span>Set BG Image</span>
              </button>
            )}

            <button
              type="button"
              className="vds-mini-pill"
              onClick={() => deleteAsset(selectedAsset.hash)}
            >
              <Trash2 size={11} />
              <span>Delete</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
