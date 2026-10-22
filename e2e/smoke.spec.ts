import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Smoke test of the *built* site (npm run build && npm run e2e), served by
 * `vite preview` on :5185 under the GitHub Pages base path. Data-driven, so it
 * keeps passing after a fork replaces the monitored APIs.
 */

interface Station {
  id: string;
  name: string;
  category: string;
  fieldCount: number;
}

async function stations(request: APIRequestContext): Promise<Station[]> {
  const res = await request.get('data/index.json');
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { apis: Station[] }).apis;
}

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

test('forecast: headline, stations, filters, climate, theme', async ({ page, request }) => {
  const apis = await stations(request);
  const errors = trackErrors(page);
  await page.goto('./');
  await expect(page.locator('#forecast-heading')).toContainText(/today/);
  const cards = page.locator('main a[href*="/api/"][aria-label]');
  await expect(cards).toHaveCount(apis.length);

  const byCategory = new Map<string, number>();
  for (const a of apis) byCategory.set(a.category, (byCategory.get(a.category) ?? 0) + 1);
  const [category, count] = [...byCategory.entries()].sort((a, b) => a[1] - b[1])[0];
  const filters = page.getByRole('group', { name: 'Filter by category' });
  await filters.getByRole('button', { name: new RegExp(`^${category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).click();
  await expect(cards).toHaveCount(count);
  await filters.getByRole('button', { name: /^All/ }).click();
  await page.getByPlaceholder('Search by name or host').fill(apis[0].name);
  await expect(cards.first()).toHaveAttribute('href', new RegExp(`/api/${apis[0].id}$`));
  await page.getByPlaceholder('Search by name or host').fill('');
  await expect(cards).toHaveCount(apis.length);

  await expect(page.getByRole('table', { name: /Contract changes and outages/ })).toBeVisible();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  await page.getByRole('button', { name: /daylight/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
  expect(errors).toEqual([]);
});

test('api detail: contract tree, types, timeline, badge', async ({ page, request }) => {
  const api = (await stations(request)).sort((a, b) => b.fieldCount - a.fieldCount)[0];
  const errors = trackErrors(page);
  await page.goto('./');
  await page.locator(`main a[href$="/api/${api.id}"][aria-label]`).click();
  await expect(page.locator('h1')).toHaveText(api.name);
  await expect(page.getByRole('heading', { name: 'What it returns' })).toBeVisible();
  const tree = page.getByLabel('Inferred contract');
  await expect(tree).toContainText('$');
  await page.getByRole('button', { name: 'Expand all' }).click();
  await expect(tree.getByRole('button', { expanded: false })).toHaveCount(0);
  await page.getByRole('tab', { name: 'TypeScript' }).click();
  await expect(page.locator('pre code').first()).toContainText('export');
  await expect(page.getByRole('heading', { name: 'Contract changes' })).toBeVisible();
  const badge = page.getByAltText(/Schema badge/);
  await expect(badge).toBeVisible();
  expect(await badge.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('deep links, 404 page and the Pages fallback', async ({ page, request }) => {
  const [first] = await stations(request);
  await page.goto(`api/${first.id}`);
  await expect(page.locator('h1')).toHaveText(first.name);
  await page.goto('api/does-not-exist');
  await expect(page.getByRole('heading', { name: /No station called/ })).toBeVisible();
  await page.goto('no/such/page');
  await expect(page.getByRole('heading', { name: 'Lost in the fog' })).toBeVisible();
  const fallback = await request.get('404.html');
  expect(fallback.ok()).toBe(true);
  expect(await fallback.text()).toContain('<div id="root"></div>');
});

test('feeds, badges and data are published', async ({ request }) => {
  const [first] = await stations(request);
  const feed = await request.get('feed.xml');
  expect(feed.ok()).toBe(true);
  expect(await feed.text()).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
  expect((await request.get(`feeds/${first.id}.xml`)).ok()).toBe(true);
  const badge = await request.get(`badges/${first.id}.svg`);
  expect(await badge.text()).toContain('aria-label="schema:');
  expect((await request.get(`data/apis/${first.id}/history.jsonl`)).ok()).toBe(true);
});

test('changes page filters', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('changes');
  await expect(page.locator('h1')).toContainText('Every shift');
  const info = page.getByRole('group', { name: 'Filter by severity' }).getByRole('button', { name: /Info/ });
  await info.click();
  await expect(info).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('playground: JSON vs JSON and HAR import', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('playground');
  await expect(page.locator('#report-heading')).toHaveText('Storm');
  await page.getByRole('button', { name: 'Values change, shape holds' }).click();
  await expect(page.locator('#report-heading')).toHaveText('Clear skies');
  await page.getByLabel('After (observed)').fill('{ "base": 1 }');
  await expect(page.locator('#report-heading')).toHaveText('Storm');
  await page.getByLabel('After (observed)').fill('{ nope');
  await expect(page.getByText('invalid JSON')).toBeVisible();

  await page.getByRole('tab', { name: 'HAR → contract' }).click();
  await page.getByRole('button', { name: 'Load example HAR' }).click();
  const endpoints = page.getByRole('list', { name: 'Endpoints' }).getByRole('button');
  await expect(endpoints.first()).toBeVisible();
  expect(await endpoints.count()).toBeGreaterThanOrEqual(8);
  await endpoints.nth(2).click();
  await page.getByRole('tab', { name: 'Zod' }).click();
  await expect(page.locator('pre code').first()).toContainText("import { z } from 'zod'");
  expect(errors).toEqual([]);
});

test('watch your own: config builder validates and exports', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('watch-your-own');
  const output = page.locator('pre code').last();
  await expect(output).toContainText('"payments-status"');
  await page.getByRole('button', { name: /Start from our/ }).click();
  await expect(page.getByText(/Valid config · \d+ monitors/)).toBeVisible();
  await page.getByRole('button', { name: 'Add a monitor' }).click();
  await expect(page.getByText(/to fix/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('about page renders the diagram', async ({ page }) => {
  await page.goto('about');
  await expect(page.getByRole('img', { name: /GitHub Actions schedule/ }).first()).toBeAttached();
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  async function noOverflow(page: Page, path: string) {
    await page.goto(path);
    await expect(page.locator('h1').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width, `horizontal overflow on ${path}`).toBeLessThanOrEqual(375);
  }

  for (const path of ['./', 'changes', 'playground', 'watch-your-own', 'about']) {
    test(`no horizontal overflow at 375px: ${path}`, async ({ page }) => {
      await noOverflow(page, path);
    });
  }

  test('no horizontal overflow at 375px: every API page', async ({ page, request }) => {
    test.setTimeout(120_000);
    for (const api of await stations(request)) await noOverflow(page, `api/${api.id}`);
  });

  test('menu opens and navigates', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.locator('#mobile-nav').getByRole('link', { name: 'Playground' }).click();
    await expect(page.locator('h1')).toContainText('See drift');
  });
});
