import { resolve } from 'node:path';

/**
 * How Driftwatch finds api-drift (shared by vite.config.ts and vitest.config.ts):
 *
 * api-drift is not published to npm, so its browser-safe core is vendored into
 * src/vendor/api-drift (each file names its upstream commit). Every build, local
 * or on Vercel, resolves `api-drift/core` to that copy, so no sibling checkout
 * or private package is needed.
 *
 * api-drift's source reads a build-time `__VERSION__`, injected here.
 */
export const VENDORED_API_DRIFT_VERSION = '0.2.0';

export function apiDriftResolution(root: string): { alias: Record<string, string>; define: Record<string, string> } {
  return {
    alias: { 'api-drift/core': resolve(root, 'src/vendor/api-drift/core/index.ts') },
    define: { __VERSION__: JSON.stringify(VENDORED_API_DRIFT_VERSION) },
  };
}
