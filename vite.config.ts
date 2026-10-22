import { copyFileSync, cpSync, existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { apiDriftResolution } from './build/api-drift';

const root = fileURLToPath(new URL('.', import.meta.url));

/** GitHub Pages serves the site from /<repo>/. Forks set BASE_PATH in the workflow. */
const base = process.env.BASE_PATH ?? '/driftwatch/';

/**
 * api-drift is imported from source while both projects live side by side
 * (../api-drift); otherwise from node_modules. See build/api-drift.ts and DEPLOY.md.
 */
const apiDrift = apiDriftResolution(root);

const MIME: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.jsonl': 'application/x-ndjson; charset=utf-8',
  '.xml': 'application/atom+xml; charset=utf-8',
  '.svg': 'image/svg+xml',
};

/**
 * Serves ./data during development and copies it into the Pages artifact at
 * build time, plus a 404.html copy of index.html so deep links work on Pages.
 */
function driftwatchData(): Plugin {
  const dataDir = resolve(root, 'data');
  let outDir = resolve(root, 'dist');
  return {
    name: 'driftwatch-data',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        const prefix = `${base}data/`;
        if (!url.startsWith(prefix)) return next();
        const file = resolve(dataDir, decodeURIComponent(url.slice(prefix.length)));
        if (!file.startsWith(dataDir + sep) || !existsSync(file) || !statSync(file).isFile()) return next();
        const ext = file.slice(file.lastIndexOf('.'));
        res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(readFileSync(file));
      });
    },
    closeBundle() {
      if (existsSync(dataDir)) cpSync(dataDir, join(outDir, 'data'), { recursive: true });
      const index = join(outDir, 'index.html');
      if (existsSync(index)) copyFileSync(index, join(outDir, '404.html'));
    },
  };
}

export default defineConfig({
  base,
  plugins: [react(), tailwindcss(), driftwatchData()],
  resolve: { alias: apiDrift.alias },
  define: apiDrift.define,
  server: { port: 5185, strictPort: true },
  preview: { port: 5185, strictPort: true },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Long-lived vendor chunks: data refreshes every 3 hours, libraries rarely.
        manualChunks(id) {
          if (/node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/.test(id)) return 'react';
          if (/node_modules[\\/](motion|motion-dom|motion-utils|framer-motion)[\\/]/.test(id)) return 'motion';
          return undefined;
        },
      },
    },
  },
});
