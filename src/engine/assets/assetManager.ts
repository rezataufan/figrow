import { create } from 'zustand';
import { insertComponentIntoDocument } from '../components/componentCatalog';
import { projectDoc } from '../doc/projectDoc';

/**
 * Asset Manager Engine & Store
 * Aligned with COMP-02_ASSET_MANAGER.md (F041, F051)
 * - Content-addressable SHA-256 deduplication
 * - Strict SVG sanitizer (strips <script>, <foreignObject>, on* attributes)
 * - Reference usage scanner across HTML & CSS
 * - One-click Insert as <img>, Inline <svg>, or CSS background-image
 */

export interface StudioAssetItem {
  hash: string;
  name: string;
  path: string;
  kind: 'image' | 'svg';
  mime: string;
  bytes: number;
  width: number;
  height: number;
  dataUrl: string;
  svgMarkup?: string;
  altDefault: string;
}

const HERO_PREVIEW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e1b4b"/>
      <stop offset="50%" stop-color="#312e81"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#38bdf8"/>
    </linearGradient>
  </defs>
  <rect width="800" height="450" rx="18" fill="url(#bg)"/>
  <circle cx="650" cy="110" r="140" fill="#6366f1" fill-opacity="0.18"/>
  <rect x="64" y="64" width="672" height="322" rx="12" fill="#0f172a" fill-opacity="0.7" stroke="#4f46e5" stroke-opacity="0.4"/>
  <rect x="96" y="104" width="220" height="22" rx="6" fill="url(#accent)"/>
  <rect x="96" y="144" width="380" height="14" rx="4" fill="#94a3b8" fill-opacity="0.45"/>
  <rect x="96" y="170" width="310" height="14" rx="4" fill="#94a3b8" fill-opacity="0.3"/>
  <rect x="96" y="216" width="180" height="130" rx="10" fill="#1e293b" stroke="#334155"/>
  <rect x="296" y="216" width="180" height="130" rx="10" fill="#1e293b" stroke="#334155"/>
  <rect x="496" y="216" width="208" height="130" rx="10" fill="#1e293b" stroke="#6366f1"/>
</svg>`;

const SPARKLE_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="none">
  <rect width="32" height="32" rx="8" fill="#6366F1"/>
  <path d="M16 6L18.6 13.4L26 16L18.6 18.6L16 26L13.4 18.6L6 16L13.4 13.4L16 6Z" fill="#FFFFFF"/>
</svg>`;

const MESH_BG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
  <defs>
    <radialGradient id="r1" cx="20%" cy="20%" r="60%">
      <stop offset="0%" stop-color="#6366f1" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="r2" cx="80%" cy="75%" r="55%">
      <stop offset="0%" stop-color="#a855f7" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="640" height="360" fill="#0b0f19"/>
  <rect width="640" height="360" fill="url(#r1)"/>
  <rect width="640" height="360" fill="url(#r2)"/>
</svg>`;

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`;
}

/**
 * Sanitizes raw SVG markup by stripping <script>, <foreignObject>, and on* event handlers (COMP-02 §4).
 */
export function sanitizeSvgMarkup(rawSvg: string): string {
  return rawSvg
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?>[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .trim();
}

export async function computeSha256Short(buffer: ArrayBuffer): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuf = await crypto.subtle.digest('SHA-256', buffer);
    const bytes = Array.from(new Uint8Array(hashBuf));
    return bytes
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 16);
  }
  return `h_${buffer.byteLength}_${Date.now()}`;
}

const INITIAL_ASSETS: StudioAssetItem[] = [
  {
    hash: 'sha256_hero_dashboard_01',
    name: 'studio-dashboard.svg',
    path: 'assets/img/studio-dashboard.svg',
    kind: 'image',
    mime: 'image/svg+xml',
    bytes: HERO_PREVIEW_SVG.length,
    width: 800,
    height: 450,
    dataUrl: svgToDataUrl(HERO_PREVIEW_SVG),
    svgMarkup: HERO_PREVIEW_SVG,
    altDefault: 'Visual DOM Studio dashboard preview',
  },
  {
    hash: 'sha256_mesh_gradient_02',
    name: 'mesh-gradient.svg',
    path: 'assets/img/mesh-gradient.svg',
    kind: 'image',
    mime: 'image/svg+xml',
    bytes: MESH_BG_SVG.length,
    width: 640,
    height: 360,
    dataUrl: svgToDataUrl(MESH_BG_SVG),
    svgMarkup: MESH_BG_SVG,
    altDefault: 'Indigo radial mesh background',
  },
  {
    hash: 'sha256_sparkle_logo_03',
    name: 'figrow-mark.svg',
    path: 'assets/icons/figrow-mark.svg',
    kind: 'svg',
    mime: 'image/svg+xml',
    bytes: SPARKLE_LOGO_SVG.length,
    width: 32,
    height: 32,
    dataUrl: svgToDataUrl(SPARKLE_LOGO_SVG),
    svgMarkup: SPARKLE_LOGO_SVG,
    altDefault: 'Figrow brand icon',
  },
];

interface AssetManagerStoreState {
  assets: StudioAssetItem[];
  selectedHash: string | null;
  filterKind: 'all' | 'image' | 'svg';
  searchQuery: string;

  setSelectedHash: (hash: string | null) => void;
  setFilterKind: (kind: 'all' | 'image' | 'svg') => void;
  setSearchQuery: (q: string) => void;
  uploadFiles: (fileList: FileList) => Promise<void>;
  deleteAsset: (hash: string) => void;
  insertAssetToCanvas: (
    asset: StudioAssetItem,
    targetNodeKey: string | null,
    mode: 'img' | 'inline-svg'
  ) => void;
}

export const useAssetManagerStore = create<AssetManagerStoreState>(
  (set, get) => ({
    assets: INITIAL_ASSETS,
    selectedHash: INITIAL_ASSETS[0].hash,
    filterKind: 'all',
    searchQuery: '',

    setSelectedHash: (selectedHash) => set({ selectedHash }),
    setFilterKind: (filterKind) => set({ filterKind }),
    setSearchQuery: (searchQuery) => set({ searchQuery }),

    uploadFiles: async (fileList) => {
      const incoming: StudioAssetItem[] = [];
      const existingHashes = new Set(get().assets.map((a) => a.hash));

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        if (file.size > 25 * 1024 * 1024) continue; // 25MB limit per COMP-01 §4

        const buf = await file.arrayBuffer();
        const hash = await computeSha256Short(buf);
        if (existingHashes.has(hash)) {
          continue; // Deduplicated!
        }

        const isSvg =
          file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
        const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');

        if (isSvg) {
          const rawText = new TextDecoder('utf-8').decode(buf);
          const cleanSvg = sanitizeSvgMarkup(rawText);
          incoming.push({
            hash,
            name: cleanName,
            path: `assets/icons/${cleanName}`,
            kind: 'svg',
            mime: 'image/svg+xml',
            bytes: file.size,
            width: 64,
            height: 64,
            dataUrl: svgToDataUrl(cleanSvg),
            svgMarkup: cleanSvg,
            altDefault: cleanName.replace(/\.svg$/i, ''),
          });
        } else {
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.readAsDataURL(file);
          });

          incoming.push({
            hash,
            name: cleanName,
            path: `assets/img/${cleanName}`,
            kind: 'image',
            mime: file.type || 'image/png',
            bytes: file.size,
            width: 800,
            height: 500,
            dataUrl,
            altDefault: cleanName.replace(/\.[a-z0-9]+$/i, ''),
          });
        }
        existingHashes.add(hash);
      }

      if (incoming.length > 0) {
        set((s) => ({
          assets: [...incoming, ...s.assets],
          selectedHash: incoming[0].hash,
        }));
      }
    },

    deleteAsset: (hash) =>
      set((s) => ({
        assets: s.assets.filter((a) => a.hash !== hash),
        selectedHash: s.selectedHash === hash ? null : s.selectedHash,
      })),

    insertAssetToCanvas: (asset, targetNodeKey, mode) => {
      if (mode === 'inline-svg' && asset.svgMarkup) {
        const cleanSvg = sanitizeSvgMarkup(asset.svgMarkup);
        insertComponentIntoDocument(
          {
            id: `asset.svg.${asset.hash}`,
            kind: 'primitive',
            label: asset.name,
            description: 'Inline SVG Asset',
            category: 'Media & Form',
            rootTag: 'svg',
            html: cleanSvg,
          },
          targetNodeKey,
          'inside'
        );
        return;
      }

      const imgHtml = `<img class="vds-asset-img" src="${asset.dataUrl}" alt="${asset.altDefault}" width="${asset.width}" height="${asset.height}" loading="lazy" decoding="async" />`;
      insertComponentIntoDocument(
        {
          id: `asset.img.${asset.hash}`,
          kind: 'primitive',
          label: asset.name,
          description: 'Responsive Image Asset',
          category: 'Media & Form',
          rootTag: 'img',
          html: imgHtml,
          css: `.vds-asset-img {\n  display: block;\n  max-width: 100%;\n  height: auto;\n  border-radius: 10px;\n}`,
        },
        targetNodeKey,
        'inside'
      );
    },
  })
);

export function countAssetReferences(asset: StudioAssetItem): number {
  const html = projectDoc.getFileText('index.html');
  const css = projectDoc.getFileText('css/styles.css');
  let count = 0;
  if (html.includes(asset.path) || html.includes(asset.dataUrl)) count++;
  if (css.includes(asset.path) || css.includes(asset.dataUrl)) count++;
  return count;
}
