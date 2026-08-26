import { expect, test, type Page } from '@playwright/test';
import { generateScene, type SceneParams } from '../../ts/generator/scene';

/**
 * Task 3.3 (QLT-005): reduced-motion behaviour measured in a real engine.
 *
 * Uses the task 1.6 control discipline: the same measurement runs under both
 * preferences, and the normal-motion run must show movement. Without that
 * control, a scene that never animates would pass the suppression test while
 * proving nothing.
 */

const PARAMS: SceneParams = {
  canvas: { width: 300, height: 300 },
  planets: [
    { size: 10, distance: 120, moon: { size: 3, distance: 25 } },
    { size: 6, distance: 55, moon: false },
  ],
  palette: 'Aurora',
};

// Debug mode suppresses ambient elements, so any movement observed comes
// from planet motion rather than the starfield, belt or comets.
const SCENE = generateScene(PARAMS, 42, { debug: true });

async function visiblePlanetBox(page: Page): Promise<{ x: number; y: number }> {
  for (const locator of await page.locator('g[data-role="planet"]').all()) {
    const box = await locator.boundingBox();

    if (box !== null && box.width > 0) {
      return { x: box.x, y: box.y };
    }
  }

  throw new Error('no visible planet group');
}

async function displacement(page: Page): Promise<number> {
  await page.setContent(
    `<!doctype html><html><body style="margin:0">${SCENE}</body></html>`,
  );
  await page.waitForTimeout(150);

  const first = await visiblePlanetBox(page);
  await page.waitForTimeout(700);
  const second = await visiblePlanetBox(page);

  return Math.hypot(second.x - first.x, second.y - first.y);
}

test.describe('reduced motion is honoured', () => {
  test('CONTROL: the scene moves when no preference is signalled', async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext({ reducedMotion: 'no-preference' });
    const page = await context.newPage();

    const moved = await displacement(page);

    testInfo.annotations.push({
      type: 'control displacement',
      description: `${testInfo.project.name}: ${moved.toFixed(2)}px`,
    });

    expect(
      moved,
      'control failed: the scene did not animate, so the suppression test below proves nothing',
    ).toBeGreaterThan(1);

    await context.close();
  });

  test('motion stops when reduced motion is preferred', async ({ browser }, testInfo) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();

    const moved = await displacement(page);

    testInfo.annotations.push({
      type: 'reduced displacement',
      description: `${testInfo.project.name}: ${moved.toFixed(2)}px`,
    });

    expect(moved, 'motion was not suppressed').toBeLessThan(1);

    await context.close();
  });

  test('every planet stays visible under reduced motion', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();

    await page.setContent(
      `<!doctype html><html><body style="margin:0">${SCENE}</body></html>`,
    );
    await page.waitForTimeout(150);

    const visible = await page.evaluate(
      () =>
        [...document.querySelectorAll('g[data-role="planet"]')].filter((element) => {
          const box = element.getBoundingClientRect();

          return box.width > 0 && box.height > 0;
        }).length,
    );

    expect(visible).toBe(2);

    await context.close();
  });

  test('planets rest on their orbits rather than collapsing to the origin', async ({
    browser,
  }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();

    await page.setContent(
      `<!doctype html><html><body style="margin:0">${SCENE}</body></html>`,
    );
    await page.waitForTimeout(150);

    const positions = await page.evaluate(() =>
      [...document.querySelectorAll('g[data-role="planet"]')]
        .map((element) => element.getBoundingClientRect())
        .filter((box) => box.width > 0)
        .map((box) => ({ x: Math.round(box.x), y: Math.round(box.y) })),
    );

    expect(positions).toHaveLength(2);

    // Distinct orbital distances must yield distinct rest positions; if the
    // twins collapsed to a shared point the composition would be wrong.
    expect(new Set(positions.map((p) => `${p.x},${p.y}`)).size).toBe(2);

    await context.close();
  });
});
