/**
 * api-drift's source reads a build-time `__VERSION__` constant. Vite and
 * Vitest inject it with `define`; this declaration lets Driftwatch typecheck
 * api-drift from source (src/vendor/api-drift).
 */
declare const __VERSION__: string;
