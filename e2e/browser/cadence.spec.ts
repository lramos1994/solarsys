import { expect, test } from '@playwright/test';

const DEFAULT_CANVAS = 600;
const MAXIMUM_CANVAS = 1500;
const SAMPLE_DURATION_MS = 2_000;
const MINIMUM_FPS = 50;

async function setValue(
  control: import('@playwright/test').Locator,
  value: string,
): Promise<void> {
  await control.fill(value);
  await control.blur();
}

async function measureCadence(page: import('@playwright/test').Page): Promise<{
  fps: number;
  nodes: number;
  stars: number;
}> {
  return page.evaluate(async (duration) => {
    const svg = document.querySelector('#preview svg');

    if (svg === null) {
      throw new Error('Cannot measure cadence: the preview SVG did not render.');
    }

    const nodes = svg.querySelectorAll('*').length;
    const stars = svg.querySelectorAll('[data-role="star"]').length;

    if (nodes === 0 || stars === 0) {
      throw new Error(`Cannot measure cadence: rendered SVG has ${nodes} nodes and ${stars} stars.`);
    }

    const startedAt = performance.now();
    let frames = 0;

    await new Promise<void>((resolve) => {
      const frame = () => {
        frames += 1;

        if (performance.now() - startedAt >= duration) {
          resolve();
        } else {
          requestAnimationFrame(frame);
        }
      };

      requestAnimationFrame(frame);
    });

    return {
      fps: (frames * 1_000) / (performance.now() - startedAt),
      nodes,
      stars,
    };
  }, SAMPLE_DURATION_MS);
}

test.describe('preview animation cadence (GEN-016)', () => {
  test('keeps default and maximum permitted canvases animatable', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Cadence budget is established in Chromium.');

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.locator('#preview svg')).toBeVisible();

    const defaultCadence = await measureCadence(page);
    expect(
      defaultCadence.fps,
      `600px preview rendered ${defaultCadence.nodes} nodes / ${defaultCadence.stars} stars at ${defaultCadence.fps.toFixed(1)}fps`,
    ).toBeGreaterThanOrEqual(MINIMUM_FPS);

    await setValue(page.locator('[data-control="canvasWidth"]'), String(MAXIMUM_CANVAS));
    await setValue(page.locator('[data-control="canvasHeight"]'), String(MAXIMUM_CANVAS));
    await expect(page.locator('#preview svg')).toHaveAttribute('viewBox', /1505 1505/);

    const maximumCadence = await measureCadence(page);
    expect(
      maximumCadence.fps,
      `1500px preview rendered ${maximumCadence.nodes} nodes / ${maximumCadence.stars} stars at ${maximumCadence.fps.toFixed(1)}fps`,
    ).toBeGreaterThanOrEqual(MINIMUM_FPS);
    expect(maximumCadence.stars).toBeLessThanOrEqual(7_000);
    expect(maximumCadence.stars).toBeGreaterThan(defaultCadence.stars);
  });
});

test.describe('configurable asteroid belt cadence (GEN-018)', () => {
  test('keeps a maximum configured belt at 1500px animatable', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Cadence budget is established in Chromium.');

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.locator('#preview svg')).toBeVisible();

    await setValue(page.locator('[data-control="canvasWidth"]'), '1500');
    await setValue(page.locator('[data-control="canvasHeight"]'), '1500');
    await expect(page.locator('#preview svg')).toHaveAttribute('viewBox', /1505 1505/);

    // Open the belt details and set the maximum accepted count, then prove the
    // configured belt actually rendered before sampling frames (GEN-018).
    await page.locator('[data-role="asteroid-belt-group"] .belt-chevron').click();
    await setValue(page.locator('[data-control="asteroidCount"]'), '500');

    const asteroids = await page.locator('#preview [data-role="asteroid"]').count();

    expect(asteroids).toBe(500);

    const cadence = await measureCadence(page);

    expect(
      cadence.fps,
      `1500px preview with ${asteroids} asteroids rendered ${cadence.nodes} nodes at ${cadence.fps.toFixed(1)}fps`,
    ).toBeGreaterThanOrEqual(MINIMUM_FPS);
  });
});
