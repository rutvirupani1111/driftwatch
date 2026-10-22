import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * How Driftwatch finds api-drift (shared by vite.config.ts and vitest.config.ts):
 *
 *  1. ../api-drift/src (sibling checkout, imported from source) when present;
 *  2. otherwise the installed package (node_modules/api-drift, e.g. from
 *     `github:rutvirupani1111/api-drift`), resolved normally.
 *
 * api-drift's source reads a build-time `__VERSION__`, injected here.
 */
export function apiDriftResolution(root: string): { alias: Record<string, string>; define: Record<string, string> } {
  const source = resolve(root, '../api-drift/src/core/index.ts');
  const pkgFiles = [resolve(root, '../api-drift/package.json'), resolve(root, 'node_modules/api-drift/package.json')];
  let version = '0.0.0';
  for (const file of pkgFiles) {
    if (!existsSync(file)) continue;
    try {
      version = (JSON.parse(readFileSync(file, 'utf8')) as { version?: string }).version ?? version;
      break;
    } catch {
      /* keep looking */
    }
  }
  return {
    alias: existsSync(source) ? { 'api-drift/core': source } : {},
    define: { __VERSION__: JSON.stringify(version) },
  };
}
