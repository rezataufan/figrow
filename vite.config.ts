import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

function localProjectAssetServer() {
  let activeBaseDir = '';
  const envDirs = (process.env.FIGROW_ASSET_DIRS ?? '')
    .split(path.delimiter)
    .map((s) => s.trim())
    .filter(Boolean);
  const candidateRoots: string[] = [...envDirs];

  const findProjectRootForAssets = (linkedAssets: string[]): string | null => {
    const cleanRels = linkedAssets.map((r) => r.replace(/^\.?\//, '').replace(/\//g, path.sep));
    for (const root of candidateRoots) {
      if (cleanRels.some((rel) => fs.existsSync(path.join(root, rel)))) {
        return root;
      }
    }
    const homeDir = os.homedir();
    const parentWorkspaceDir = path.resolve(__dirname, '..');
    const searchBases = [
      ...envDirs,
      parentWorkspaceDir,
      path.join(homeDir, 'AppData', 'Local', 'Programs'),
      path.join(homeDir, 'Downloads'),
      path.join(homeDir, 'Documents'),
      path.join(homeDir, 'Desktop'),
    ];
    for (const base of searchBases) {
      if (!fs.existsSync(base)) continue;
      const queue: Array<{ dir: string; depth: number }> = [{ dir: base, depth: 0 }];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        if (cleanRels.some((rel) => fs.existsSync(path.join(cur.dir, rel)))) {
          candidateRoots.unshift(cur.dir);
          return cur.dir;
        }
        if (cur.depth >= 3) continue;
        try {
          const entries = fs.readdirSync(cur.dir, { withFileTypes: true });
          for (const ent of entries) {
            if (
              ent.isDirectory() &&
              ent.name !== 'node_modules' &&
              ent.name !== '.git' &&
              ent.name !== 'dist'
            ) {
              queue.push({ dir: path.join(cur.dir, ent.name), depth: cur.depth + 1 });
            }
          }
        } catch {
          // Skip unreadable directories
        }
      }
    }
    return null;
  };

  const getMimeType = (filePath: string): string => {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.css':
        return 'text/css; charset=utf-8';
      case '.js':
      case '.mjs':
        return 'application/javascript; charset=utf-8';
      case '.json':
        return 'application/json; charset=utf-8';
      case '.html':
      case '.htm':
        return 'text/html; charset=utf-8';
      case '.svg':
        return 'image/svg+xml';
      case '.png':
        return 'image/png';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.webp':
        return 'image/webp';
      case '.gif':
        return 'image/gif';
      case '.ico':
        return 'image/x-icon';
      case '.woff2':
        return 'font/woff2';
      case '.woff':
        return 'font/woff';
      case '.ttf':
        return 'font/ttf';
      default:
        return 'application/octet-stream';
    }
  };

  return {
    name: 'vds-local-project-asset-server',
    configureServer(server: {
      middlewares: {
        use: (
          fn: (
            req: { url?: string; method?: string; on?: (ev: string, cb: (chunk: Buffer) => void) => void },
            res: {
              statusCode: number;
              setHeader: (k: string, v: string) => void;
              end: (body?: string | Buffer) => void;
            },
            next: () => void
          ) => void
        ) => void;
      };
    }) {
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url ?? '';
        const cleanUrl = rawUrl.split('?')[0]!.split('#')[0]!;

        // Allow client to register the folder or HTML signature when importing
        if (cleanUrl === '/__vds_set_base' && req.method === 'POST') {
          const chunks: Buffer[] = [];
          req.on?.('data', (chunk: Buffer) => chunks.push(chunk));
          req.on?.('end', () => {
            const resolvedCssFiles: Array<{ file: string; css: string }> = [];
            try {
              const payload = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as {
                baseDir?: string;
                htmlName?: string;
                linkedAssets?: string[];
              };
              if (payload.baseDir && fs.existsSync(payload.baseDir)) {
                activeBaseDir = payload.baseDir;
              } else if (Array.isArray(payload.linkedAssets) && payload.linkedAssets.length > 0) {
                const discovered = findProjectRootForAssets(payload.linkedAssets);
                if (discovered) {
                  activeBaseDir = discovered;
                }
              }

              // Read linked local .css files so the client can load their rules into projectDoc
              if (activeBaseDir && Array.isArray(payload.linkedAssets)) {
                for (const assetRel of payload.linkedAssets) {
                  const cleanRel = assetRel.replace(/^\.?\//, '').replace(/\\/g, '/');
                  if (!cleanRel.toLowerCase().endsWith('.css')) continue;
                  const diskPath = path.join(
                    activeBaseDir,
                    cleanRel.replace(/\//g, path.sep)
                  );
                  if (fs.existsSync(diskPath) && fs.statSync(diskPath).isFile()) {
                    const rawCss = fs.readFileSync(diskPath, 'utf-8');
                    const cssDirPosix = path.posix.dirname(cleanRel);
                    // Rewrite relative url(...) inside CSS so fonts/images resolve via /__vds_local/
                    const rewrittenCss = rawCss.replace(
                      /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
                      (fullMatch, quote: string, urlTarget: string) => {
                        const trimmedUrl = urlTarget.trim();
                        if (
                          trimmedUrl.startsWith('http://') ||
                          trimmedUrl.startsWith('https://') ||
                          trimmedUrl.startsWith('//') ||
                          trimmedUrl.startsWith('data:') ||
                          trimmedUrl.startsWith('#') ||
                          trimmedUrl.startsWith('/__vds_local/')
                        ) {
                          return fullMatch;
                        }
                        const joinedPosix = path.posix.normalize(
                          path.posix.join(cssDirPosix, trimmedUrl)
                        );
                        return `url(${quote}/__vds_local/${joinedPosix}${quote})`;
                      }
                    );
                    resolvedCssFiles.push({ file: cleanRel, css: rewrittenCss });
                  }
                }
              }
            } catch {
              // Ignore malformed payload
            }
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, activeBaseDir, resolvedCssFiles }));
          });
          return;
        }

        // Mock /api/rpc for desktop/Electron hybrid web apps so RPC calls don't throw 404 popups in canvas preview
        if (cleanUrl === '/api/rpc') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ result: null }));
          return;
        }

        // Serve /__vds_local/<relativePath> or fallback for /assets/... from activeBaseDir or candidateRoots
        let relAssetPath: string | null = null;
        if (cleanUrl.startsWith('/__vds_local/')) {
          relAssetPath = decodeURIComponent(cleanUrl.slice('/__vds_local/'.length));
        } else if (
          cleanUrl.startsWith('/assets/') &&
          !cleanUrl.startsWith('/assets/index-')
        ) {
          relAssetPath = decodeURIComponent(cleanUrl.slice(1));
        }

        if (relAssetPath) {
          const searchRoots = activeBaseDir
            ? [activeBaseDir, ...candidateRoots]
            : candidateRoots;
          for (const root of searchRoots) {
            const fullPath = path.join(root, relAssetPath);
            if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
              res.statusCode = 200;
              res.setHeader('Content-Type', getMimeType(fullPath));
              res.setHeader('Cache-Control', 'no-cache');
              res.end(fs.readFileSync(fullPath));
              return;
            }
          }
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localProjectAssetServer()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
