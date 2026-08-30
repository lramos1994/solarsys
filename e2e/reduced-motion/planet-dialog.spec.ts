import { expect, test, type Page } from '@playwright/test';

type Point = { x: number; y: number };

const MOTION_TIMEOUT_MS = 1200;
const MOTION_INTERVAL_MS = 120;

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Task 7.3 (UI-012): the isolated dialog preview honours reduced motion.
 *
 * The per-planet `<dialog>` preview (GEN-020) is a separate animated SVG. It
 * must be owned by the same playback rule as the main scene: under an active
 * reduced-motion preference it starts PAUSED, and the application explains
 * why. This is measured POSITIONALLY — the moon body's displacement over time
 * in the dialog preview — never by inspecting markup, for the same reason the
 * main-scene playback suite measures displacement: an engine that parses SMIL
 * and ignores it would satisfy a presence check.
 *
 * Every suppression claim is paired with a control run that MUST move,
 * otherwise a preview that never animated would pass "it stopped" while
 * proving nothing.
 */

/** Open planet `index`'s editing dialog, expanding the group if collapsed. */
async function openDialog(page: Page, index: number): Promise<void> {
  const group = page.locator(`#controls [data-planet="${index}"]`);

  if (!(await group.evaluate((node) => node.hasAttribute('open')))) {
    await group.locator('[data-action="toggle-planet"]').click();
  }

  await group.locator('[data-action="open-planet-dialog"]').click();
  await expect(page.locator(`[data-role="planet-dialog"][data-index="${index}"]`)).toBeVisible();
}

/** Position of the dialog preview's moon body for planet 2 (index 1). */
async function previewMoonPosition(page: Page): Promise<Point> {
  const moon = page.locator(
    '[data-role="planet-dialog"][data-index="1"] [data-role="planet-preview"] [data-role="moon"]',
  );
  const rect = await moon.boundingBox();

  if (rect === null) {
    throw new Error('no moon body in the dialog preview');
  }

  return { x: rect.x, y: rect.y };
}

/** Poll positionally until timeout, returning the largest observed displacement. */
async function previewMoonDisplacement(
  page: Page,
  timeoutMs: number = MOTION_TIMEOUT_MS,
  intervalMs: number = MOTION_INTERVAL_MS,
): Promise<number> {
  const first = await previewMoonPosition(page);
  const startedAt = Date.now();
  let furthest = 0;

  while (Date.now() - startedAt < timeoutMs) {
    await page.waitForTimeout(intervalMs);
    furthest = Math.max(furthest, distance(first, await previewMoonPosition(page)));
  }

  return furthest;
}

test.describe('dialog preview under reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#preview svg')).toBeVisible();
  });

  test('the dialog preview starts paused under an active preference', async ({ page }) => {
    await openDialog(page, 1);

    expect(
      await previewMoonDisplacement(page),
      'the dialog preview moved despite the reduced-motion preference',
    ).toBeLessThan(1);
  });

  test('the preview is paused alongside the main scene and the notice explains why', async ({ page }) => {
    await expect(page.locator('[data-role="reduced-motion-notice"]')).toBeVisible();
    await expect(page.locator('[data-action="toggle-playback"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await openDialog(page, 1);

    expect(await previewMoonDisplacement(page)).toBeLessThan(1);
  });
});

test.describe('dialog preview with no preference (control)', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#preview svg')).toBeVisible();
  });

  test('CONTROL: the dialog preview moves without the preference', async ({ page }) => {
    await openDialog(page, 1);

    expect(
      await previewMoonDisplacement(page),
      'control failed: the dialog preview never moved, so the pause assertions prove nothing',
    ).toBeGreaterThan(1);
  });
});
