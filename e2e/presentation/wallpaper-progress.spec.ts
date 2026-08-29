import { expect, test } from '@playwright/test';

/**
 * Task 5.2 (WAL-007): the wallpaper export progress indication exposes its
 * state through text and an ARIA state — never through colour or an icon alone
 * (UI-008).
 *
 * The progress element is hidden while idle and only appears during an export,
 * so the accessibility guarantee is asserted on the mechanism itself: the
 * element must carry `role="progressbar"` with numeric `aria-valuemin` /
 * `aria-valuemax` / `aria-valuenow`, plus a visible text label. Removing every
 * icon must leave that text intact, which is what the iconography suite already
 * demands of every action control. This runs on chromium and both mobile
 * projects, where an actual export cannot be relied upon (WebKit has no
 * supported encoder), so the assertion reads the DOM contract rather than a
 * live render.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#preview svg')).toBeVisible();
});

test('progress exposes a numeric ARIA state, not colour or an icon alone', async ({ page }) => {
  const progress = page.locator('[data-role="wallpaper-progress"]');

  // ARIA progressbar with all three numeric bounds present.
  await expect(progress).toHaveAttribute('role', 'progressbar');
  await expect(progress).toHaveAttribute('aria-valuemin', '0');
  await expect(progress).toHaveAttribute('aria-valuemax', /\d+/);
  await expect(progress).toHaveAttribute('aria-valuenow', /\d+/);
});

test('progress carries a visible text label independent of any icon', async ({ page }) => {
  const label = page.locator('[data-role="wallpaper-progress-label"]');

  // The label is real text (not an empty icon wrapper), and survives removing
  // every icon — an icon may accompany text but never BE the label (UI-008).
  const textWithoutIcons = await label.evaluate((node) => {
    const clone = node.cloneNode(true) as HTMLElement;

    for (const svg of clone.querySelectorAll('svg')) {
      svg.remove();
    }

    return (clone.textContent ?? '').trim();
  });

  expect(textWithoutIcons).toMatch(/rendering/i);

  // No icon sits inside the progress indication carrying the state alone.
  await expect(page.locator('[data-role="wallpaper-progress"] svg')).toHaveCount(0);
});
