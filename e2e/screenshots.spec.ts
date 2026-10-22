import { mkdirSync } from 'node:fs';
import { test, type Page } from '@playwright/test';

/** README screenshots: `npm run build && npm run screenshots` → docs/screenshots/*.png */

const OUT = 'docs/screenshots';
mkdirSync(OUT, { recursive: true });

async function settle(page: Page, theme: 'night' | 'day') {
  await page.addInitScript((t) => localStorage.setItem('driftwatch-theme', t), theme);
}

async function shoot(page: Page, path: string, name: string, opts: { full?: boolean; waitFor?: string } = {}) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  if (opts.waitFor) await page.locator(opts.waitFor).first().waitFor();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: opts.full ?? false });
}

test.describe('desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

  test('forecast night', async ({ page }) => {
    await settle(page, 'night');
    await shoot(page, './', 'forecast-night', { waitFor: '#forecast-heading' });
  });

  test('forecast day', async ({ page }) => {
    await settle(page, 'day');
    await shoot(page, './', 'forecast-day', { waitFor: '#forecast-heading' });
  });

  test('forecast full', async ({ page }) => {
    await settle(page, 'night');
    await shoot(page, './', 'forecast-full', { full: true, waitFor: '#forecast-heading' });
  });

  test('api detail', async ({ page }) => {
    await settle(page, 'night');
    await shoot(page, 'api/wikipedia-random', 'api-detail', { full: true, waitFor: 'h1' });
  });

  test('changes', async ({ page }) => {
    await settle(page, 'night');
    await shoot(page, 'changes', 'changes', { waitFor: 'h1' });
  });

  test('playground', async ({ page }) => {
    await settle(page, 'night');
    await page.goto('playground');
    await page.getByRole('button', { name: 'Ids become strings' }).click();
    await page.waitForTimeout(300);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.screenshot({ path: `${OUT}/playground.png`, fullPage: true });
  });

  test('watch your own', async ({ page }) => {
    await settle(page, 'day');
    await shoot(page, 'watch-your-own', 'watch-your-own', { full: true, waitFor: 'h1' });
  });

  test('about', async ({ page }) => {
    await settle(page, 'night');
    await shoot(page, 'about', 'about', { full: true, waitFor: 'h1' });
  });
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  test('forecast mobile', async ({ page }) => {
    await settle(page, 'night');
    await shoot(page, './', 'mobile-forecast', { full: true, waitFor: '#forecast-heading' });
  });

  test('api mobile', async ({ page }) => {
    await settle(page, 'day');
    await shoot(page, 'api/github-repo', 'mobile-api', { full: true, waitFor: 'h1' });
  });
});
