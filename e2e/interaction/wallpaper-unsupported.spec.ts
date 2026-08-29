import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/**
 * Task 4.1 (WAL-008): when no usable video encoder is available, the export
 * action must say so explicitly and leave the SVG download fully functional.
 *
 * Firefox measured zero supported `MediaRecorder` types (E-009), so this path
 * is real rather than defensive. The test stubs `MediaRecorder.isTypeSupported`
 * absent before the application loads, which is exactly the runtime condition
 * the probe in `ts/app/wallpaper.ts` must detect.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Simulate a browser with no usable encoder: every MIME probe fails.
    MediaRecorder.isTypeSupported = () => false;
  });

  await page.goto('/');
  await expect(page.locator('#preview svg')).toBeVisible();
});

test('reports unavailability instead of failing silently', async ({ page }) => {
  await page.locator('[data-action="download-wallpaper"]').click();

  const status = page.locator('[data-role="wallpaper-status"]');

  await expect(status).toBeVisible();
  await expect(status).toContainText(/not available|unavailable|no supported/i);
});

test('the SVG download still produces valid bytes when export is unavailable', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-action="download-svg"]').click();
  const download = await downloadPromise;

  const path = await download.path();
  expect(path).not.toBeNull();

  const bytes = await readFile(path!);

  expect(bytes.toString('utf8')).toContain('<svg');
});
