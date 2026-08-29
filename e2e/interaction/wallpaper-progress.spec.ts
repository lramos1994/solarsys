import { expect, test, type Page } from '@playwright/test';

/**
 * Task 5.1 (WAL-007): the wallpaper export reports progress while it renders,
 * and a second activation during a running export never starts a second render.
 *
 * These drive the real, built application. A full production loop is 1350
 * frames (45 s at 30 fps, ~116 ms/frame per E-012), so the frame budget is
 * bounded through the `__WALLPAPER_FRAME_COUNT__` seam — the same seam the
 * export spec uses. A 30-frame budget keeps the export in flight for a few
 * seconds of real render time, which is what lets these tests observe progress
 * DURING the render rather than only its aftermath.
 *
 * Progress is exposed through `role="progressbar"` with a numeric
 * `aria-valuenow` (and a human `aria-valuetext`), never through colour or an
 * icon alone (UI-008). The interaction assertion reads `aria-valuenow` as the
 * authoritative progress value.
 */

/** Frame budget: 30 frames = 1.0 s of timeline, a few seconds of render. */
const FRAME_BUDGET = 30;

/**
 * Bound the export frame budget and open the app, mirroring the export spec.
 * The seam is injected before the application loads so `main.ts` reads it in
 * the export handler.
 */
async function openWallpaperApp(page: Page, frames: number): Promise<void> {
  await page.addInitScript((budget) => {
    (window as unknown as { __WALLPAPER_FRAME_COUNT__?: number }).__WALLPAPER_FRAME_COUNT__ =
      budget;
  }, frames);

  await page.goto('/');
  await expect(page.locator('#preview svg')).toBeVisible();
}

/**
 * Poll the progress value while an export runs and count how many times it
 * strictly increased. Polling stops when the export action is re-enabled (the
 * export settled). The final reset back to 0 is not an increase, so it is
 * never counted.
 */
async function countProgressIncreases(page: Page): Promise<{ max: number; increases: number }> {
  const button = page.locator('[data-action="download-wallpaper"]');
  const progress = page.locator('[data-role="wallpaper-progress"]');
  let previous = -1;
  let increases = 0;
  let max = 0;

  for (;;) {
    const settled = await button.isEnabled();
    const raw = await progress.getAttribute('aria-valuenow');
    const value = raw === null ? -1 : Number(raw);

    if (value > previous) {
      if (previous >= 0) {
        increases += 1;
      }

      previous = value;
      max = Math.max(max, value);
    }

    // Settled: the export finished and the button is back. Reading `aria-valuenow`
    // first would race the reset, so poll at least once while it is disabled.
    if (settled && max > 0) {
      return { max, increases };
    }

    await page.waitForTimeout(20);
  }
}

test('progress advances at least twice during a render', async ({ page }) => {
  await openWallpaperApp(page, FRAME_BUDGET);

  const wallpaper = page.waitForEvent('download');
  await page.locator('[data-action="download-wallpaper"]').click();

  const { max, increases } = await countProgressIncreases(page);

  // The download itself is expected; consuming it keeps the event from failing.
  await wallpaper;
  await expect(page.locator('[data-action="download-wallpaper"]')).toBeEnabled();

  // WAL-007: the reported value must advance — at least two distinct increases
  // observed, reaching at least the second rendered frame.
  expect(increases).toBeGreaterThanOrEqual(2);
  expect(max).toBeGreaterThanOrEqual(2);
});

test('a second activation during a running export starts no second render', async ({ page }) => {
  await openWallpaperApp(page, FRAME_BUDGET);

  let downloads = 0;
  page.on('download', () => {
    downloads += 1;
  });

  const button = page.locator('[data-action="download-wallpaper"]');
  await button.click();

  // Wait until the export is genuinely in flight: the action is disabled and
  // the progress indication is visible.
  await expect(button).toBeDisabled();
  await expect(page.locator('[data-role="wallpaper-progress"]')).toBeVisible();

  // A second activation while the render is running. The action is disabled, so
  // this must not start a second render: dispatch a synthetic click to exercise
  // the single-render guard directly rather than the disabled attribute.
  await page.evaluate(() => {
    const target = document.querySelector<HTMLButtonElement>('[data-action="download-wallpaper"]');
    target?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  // Let the running export finish. The full render takes a few seconds at
  // ~116-200 ms/frame, so the timeout is generous.
  await expect(button).toBeEnabled({ timeout: 30_000 });

  expect(downloads).toBe(1);
});
