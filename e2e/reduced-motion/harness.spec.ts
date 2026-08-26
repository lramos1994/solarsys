import { expect, test } from '@playwright/test';

// Reduced-motion layer harness check (task 1.3).
//
// This is NOT the control probe required by task 1.6 — that probe must prove
// the simulation mechanism has an observable effect and fail loudly when the
// mechanism is inert (E-052). This file only records that the
// `chromium-reduced-motion` project's simulation (Playwright's `reducedMotion`
// context option) is readable from the page, so the recorded command is
// runnable before task 1.6 lands.
//
// Measured on this toolchain: `--blink-settings=prefersReducedMotion=1` is
// INERT under Playwright's chromium-headless-shell, inverting E-052's finding
// against raw Chrome headless. Task 1.6 must re-measure rather than trust
// either result.
test('reduced-motion preference is observable in this project', async ({ page }) => {
  await page.goto('/');

  const reduced = await page.evaluate(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  expect(reduced).toBe(true);
});
