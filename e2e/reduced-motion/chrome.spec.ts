import { expect, test } from '@playwright/test';

/**
 * UI-007: application-chrome transitions yield to reduced motion.
 *
 * Chrome transitions (focus/hover) are defined only inside
 * `@media (prefers-reduced-motion: no-preference)`. The pairing below proves
 * the mechanism rather than assuming it: with the preference absent, a chrome
 * element carries a non-zero transition; under `reduce`, it carries none.
 *
 * This mirrors the control discipline from task 1.6 — a check that passed
 * under both conditions would prove nothing.
 */

test.describe('chrome transitions (no preference)', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });

  test('CONTROL: chrome transitions are enabled', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#preview svg')).toBeVisible();

    const duration = await page
      .locator('[data-action="download-svg"]')
      .evaluate((element) => getComputedStyle(element).transitionDuration);

    expect(duration, 'control failed: no transition was enabled').not.toBe('0s');
  });
});

test.describe('chrome transitions (reduced motion)', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('chrome transitions are suppressed', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#preview svg')).toBeVisible();

    const duration = await page
      .locator('[data-action="download-svg"]')
      .evaluate((element) => getComputedStyle(element).transitionDuration);

    expect(duration).toBe('0s');
  });
});
