import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke test + README screenshots against the *built* site (`npm run build` first),
 * served by `vite preview` on port 5185 under the GitHub Pages base path.
 *
 * On Windows the installed Microsoft Edge is used (no browser download needed);
 * elsewhere Playwright's Chromium (`npx playwright install chromium`). Override
 * with PW_CHANNEL=chrome|msedge|chromium.
 */
const PORT = 5185;
const BASE = process.env.BASE_PATH ?? '/driftwatch/';
const channel = process.env.PW_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined);

export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: '.tmp/playwright',
  use: {
    baseURL: `http://localhost:${PORT}${BASE}`,
    trace: 'off',
  },
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}${BASE}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'smoke',
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], channel: channel === 'chromium' ? undefined : channel },
    },
    {
      name: 'screenshots',
      testMatch: /screenshots\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], channel: channel === 'chromium' ? undefined : channel },
    },
  ],
});
