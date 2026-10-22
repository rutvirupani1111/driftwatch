/**
 * Engine credit without importing the engine: `__VERSION__` is api-drift's
 * version, injected at build time (see build/api-drift.ts). Keeps api-drift
 * out of the first-load bundle; pages that need it import ./drift.
 */
export const ENGINE_LABEL = `api-drift ${typeof __VERSION__ === 'string' ? __VERSION__ : ''}`.trim();
