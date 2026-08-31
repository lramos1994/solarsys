import { expect, test, type Page } from '@playwright/test';

/**
 * Task 2.7 measurement rig (GEN-024).
 *
 * Sweeps rendered rock counts at 1500x1500 in Chromium and reports delivered
 * requestAnimationFrame cadence for each. `BELT_RENDER_CAP` is set from the
 * highest count that holds the existing 50fps budget — it is NOT guessed, and
 * node-count reasoning alone is explicitly not accepted as evidence.
 *
 * This file is a measurement instrument, not an assertion suite: it prints a
 * table and asserts only that the sweep ran. Run it directly:
 *   npx playwright test e2e/browser/belt-cap-measure.spec.ts --project=chromium
 */

const MINIMUM_FPS = 50;
const SAMPLE_MS = 1_000;

async function setValue(page: Page, control: string, value: string): Promise<void> {
  const locator = page.locator(`[data-control="${control}"]`);

  await locator.fill(value);
  await locator.blur();
}

async function measure(page: Page): Promise<{ fps: number; rocks: number; nodes: number }> {
  return page.evaluate(async (duration) => {
    const svg = document.querySelector('#preview svg');
    // Baked form (GEN-026): rocks are silhouette subpaths.
    const rocks = [...document.querySelectorAll('#preview [data-role="asteroid-silhouettes"]')]
      .reduce((sum, path) => sum + ((path.getAttribute('d') ?? '').split('M').length - 1), 0);
    const nodes = svg === null ? 0 : svg.getElementsByTagName('*').length;

    let frames = 0;
    const started = performance.now();

    await new Promise<void>((resolve) => {
      const tick = (): void => {
        frames += 1;
        if (performance.now() - started >= duration) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
    });

    const elapsed = performance.now() - started;

    return { fps: (frames / elapsed) * 1000, rocks, nodes };
  }, SAMPLE_MS);
}

test('measure belt cadence across rock counts at 1500px', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Cadence budget is established in Chromium.');
  test.setTimeout(300_000);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('#preview svg')).toBeVisible();

  await setValue(page, 'canvasWidth', '1500');
  await setValue(page, 'canvasHeight', '1500');
  await expect(page.locator('#preview svg')).toHaveAttribute('viewBox', /1505 1505/);

  await page.locator('[data-role="asteroid-belt-group"] .belt-chevron').click();

  const rows: string[] = [];

  // Sweep the authored count and the band, which together drive the effective
  // count. Widening the band multiplies the effective count, so the widest band
  // at the maximum authored count is the worst case the product can reach.
  for (const [count, centre, thickness] of [
    ['130', '84', '6'],
    ['500', '84', '6'],
    ['500', '84', '20'],
    ['500', '84', '40'],
    ['500', '110', '40'],
  ] as const) {
    await setValue(page, 'asteroidCount', count);
    await setValue(page, 'asteroidCentre', centre);
    await setValue(page, 'asteroidThickness', thickness);
    await expect(page.locator('[data-role="errors"] li')).toHaveCount(0);

    const measured = await measure(page);

    rows.push(
      `count=${count} centre=${centre}% thick=${thickness}% -> ` +
      `rocks=${measured.rocks} nodes=${measured.nodes} fps=${measured.fps.toFixed(1)}` +
      `${measured.fps >= MINIMUM_FPS ? '' : '  <-- BELOW BUDGET'}`,
    );
  }

  // Headroom probe: the cap only means something if we know where cadence
  // ACTUALLY breaks. Clone the rendered rocks to push the node count past the
  // cap and measure, so the chosen cap is backed by a measured ceiling rather
  // than by the fact that it was never exceeded.
  for (const multiplier of [2, 4, 6]) {
    await setValue(page, 'asteroidCount', '500');
    await setValue(page, 'asteroidCentre', '84');
    await setValue(page, 'asteroidThickness', '40');

    const probe = await page.evaluate(async (times) => {
      const group = document.querySelector('#preview [data-role="asteroid-belt"] g');

      if (group === null) return null;

      const original = group.innerHTML;

      for (let i = 1; i < times; i += 1) group.innerHTML += original;

      const rocks = [...document.querySelectorAll('#preview [data-role="asteroid-silhouettes"]')]
        .reduce((sum, path) => sum + ((path.getAttribute('d') ?? '').split('M').length - 1), 0);
      const svg = document.querySelector('#preview svg');
      const nodes = svg === null ? 0 : svg.getElementsByTagName('*').length;

      let frames = 0;
      const started = performance.now();

      await new Promise<void>((resolve) => {
        const tick = (): void => {
          frames += 1;
          if (performance.now() - started >= 1000) { resolve(); return; }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });

      const elapsed = performance.now() - started;

      return { fps: (frames / elapsed) * 1000, rocks, nodes };
    }, multiplier);

    if (probe !== null) {
      rows.push(
        `HEADROOM x${multiplier} -> rocks=${probe.rocks} nodes=${probe.nodes} ` +
        `fps=${probe.fps.toFixed(1)}${probe.fps >= MINIMUM_FPS ? '' : '  <-- BELOW BUDGET'}`,
      );
    }
  }

  console.log('\n=== BELT CADENCE SWEEP (1500x1500, Chromium) ===');
  for (const row of rows) console.log(row);
  console.log('=== END SWEEP ===\n');

  expect(rows).toHaveLength(8);
});
