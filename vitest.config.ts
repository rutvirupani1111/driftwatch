import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { apiDriftResolution } from './build/api-drift';

const apiDrift = apiDriftResolution(fileURLToPath(new URL('.', import.meta.url)));

export default defineConfig({
  resolve: { alias: apiDrift.alias },
  define: apiDrift.define,
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
  },
});
