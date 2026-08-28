import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/**
 * Task 5.3 (CX-019): belt band emphasis.
 *
 * Hovering the asteroid-belt row draws the belt's inner/outer band as dashed
 * ellipses in the app-owned `[data-role="orbit-emphasis"]` overlay. The band
 * is geometric (derived from the belt radii), never intercepts pointer input,
 * never reaches the stored/downloaded bytes, clears on pointer out, is not
 * locked by a summary's focus, and does not appear when the belt is off.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#preview svg')).toBeVisible();
});

const bandInner = (page: Page) => page.locator('[data-role="belt-band-inner"]');
const bandOuter = (page: Page) => page.locator('[data-role="belt-band-outer"]');
const beltRow = (page: Page) =>
  page.locator('[data-role="asteroid-belt-group"] .belt-row');

/** True while the band ellipses carry their radii (i.e. the band is drawn). */
async function bandShown(page: Page): Promise<boolean> {
  return bandInner(page).evaluate((node) => node.hasAttribute('rx'));
}

test.describe('belt band emphasis (CX-019)', () => {
  test('hovering the belt row draws the inner and outer band ellipses', async ({ page }) => {
    await beltRow(page).hover();

    await expect(bandInner(page)).toHaveAttribute('rx', /.+/);
    await expect(bandOuter(page)).toHaveAttribute('rx', /.+/);

    // Geometric, not colour-only: the outer radius exceeds the inner one.
    const innerRx = Number(await bandInner(page).getAttribute('rx'));
    const outerRx = Number(await bandOuter(page).getAttribute('rx'));
    expect(outerRx).toBeGreaterThan(innerRx);
  });

  test('clears the band on pointer out', async ({ page }) => {
    await beltRow(page).hover();
    expect(await bandShown(page)).toBe(true);

    await page.locator('#preview').hover();
    expect(await bandShown(page)).toBe(false);
  });

  test('the band never enters the previewed or downloaded bytes', async ({ page }) => {
    await beltRow(page).hover();
    expect(await bandShown(page)).toBe(true);

    const previewText = await page.locator('#preview').innerHTML();
    expect(previewText).not.toContain('belt-band');

    const download = page.waitForEvent('download');
    await page.locator('[data-action="download-svg"]').click();
    const downloadPath = await (await download).path();
    const bytes = await readFile(downloadPath!);
    const text = bytes.toString('utf8');

    expect(text).not.toContain('belt-band');
    expect(text).not.toContain('belt-band-inner');
    expect(text).not.toContain('belt-band-outer');
    expect(text).toContain('<svg');
  });

  test('the band does not intercept pointer input', async ({ page }) => {
    await beltRow(page).hover();
    expect(await bandShown(page)).toBe(true);

    const pointerEvents = await bandInner(page).evaluate((node) =>
      getComputedStyle(node).pointerEvents,
    );
    expect(pointerEvents).toBe('none');
  });

  test('a summary holding focus does not lock the band', async ({ page }) => {
    // Focus a planet's disclosure summary — not an editable control — which
    // must not suppress belt hover emphasis (CX-019, CX-018 precedence).
    await page.locator('#controls [data-planet="0"] [data-action="toggle-planet"]').focus();
    await beltRow(page).hover();

    expect(await bandShown(page)).toBe(true);
  });

  test('shows no band when the belt is disabled', async ({ page }) => {
    await page.locator('[data-control="beltEnabled"]').uncheck();
    await beltRow(page).hover();

    expect(await bandShown(page)).toBe(false);
  });
});
