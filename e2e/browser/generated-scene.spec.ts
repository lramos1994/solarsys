import { expect, test, type Page } from '@playwright/test';
import { generateScene, type SceneParams } from '../../ts/generator/scene';

/**
 * Task 3.2 (QLT-006, EXP-003): the REAL generated scene animates unaided.
 *
 * The task 3.1 spike proved SMIL works using a hand-written fixture. This
 * asserts the property that actually ships: the generator's own output
 * animates standalone and embedded via `<img src>`, with no scripting and no
 * external resource. A scene can satisfy every structural check and still
 * fail to move in a real engine.
 */

const PARAMS: SceneParams = {
  canvas: { width: 300, height: 300 },
  planets: [
    { size: 10, distance: 120, moon: { size: 3, distance: 25 } },
    { size: 6, distance: 55, moon: false },
    { size: 8, distance: 90, moon: { size: 2, distance: 12 } },
  ],
  palette: 'Aurora',
};

const SCENE = generateScene(PARAMS, 42);

/** A scene with no ambient elements, so only planet motion can move pixels. */
const DEBUG_SCENE = generateScene(PARAMS, 42, { debug: true });

function dataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

async function planetPosition(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator('g[data-role="planet"]').first().boundingBox();

  if (box === null) {
    throw new Error('planet group has no bounding box');
  }

  return { x: box.x, y: box.y };
}

test.describe('generated scene animates standalone', () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(
      `<!doctype html><html><body style="margin:0">${SCENE}</body></html>`,
    );
    await page.waitForTimeout(100);
  });

  test('renders in the engine', async ({ page }) => {
    await expect(page.locator('svg.solarsys')).toBeVisible();
    await expect(page.locator('g[data-role="planet"]').first()).toBeVisible();
  });

  test('moves its planets along their orbits', async ({ page }, testInfo) => {
    const first = await planetPosition(page);
    await page.waitForTimeout(700);
    const second = await planetPosition(page);

    const distance = Math.hypot(second.x - first.x, second.y - first.y);

    testInfo.annotations.push({
      type: 'planet displacement',
      description: `${testInfo.project.name}: ${distance.toFixed(2)}px`,
    });

    expect(distance, `${testInfo.project.name} rendered a frozen scene`).toBeGreaterThan(1);
  });

  test('exposes no script element to the engine', async ({ page }) => {
    expect(await page.locator('svg script').count()).toBe(0);
  });
});

test.describe('generated scene animates embedded via img src', () => {
  test('changes rendered pixels over time', async ({ page }, testInfo) => {
    // Debug mode strips the starfield, belt and comets, so any pixel change
    // must come from planet motion rather than ambient animation.
    await page.setContent(
      `<!doctype html><html><body style="margin:0">` +
        `<img id="scene" src="${dataUrl(DEBUG_SCENE)}" width="300" height="300">` +
        `</body></html>`,
    );
    await page.waitForTimeout(150);

    const first = await page.locator('#scene').screenshot();
    await page.waitForTimeout(700);
    const second = await page.locator('#scene').screenshot();

    const identical = Buffer.compare(first, second) === 0;

    testInfo.annotations.push({
      type: 'img animation',
      description: `${testInfo.project.name}: ${identical ? 'STATIC' : 'animated'}`,
    });

    expect(identical, `${testInfo.project.name} froze the embedded scene`).toBe(false);
  });

  test('renders visibly when embedded', async ({ page }) => {
    await page.setContent(
      `<!doctype html><html><body style="margin:0">` +
        `<img id="scene" src="${dataUrl(SCENE)}" width="300" height="300">` +
        `</body></html>`,
    );

    const box = await page.locator('#scene').boundingBox();

    expect(box?.width).toBeGreaterThan(0);
    expect(box?.height).toBeGreaterThan(0);
  });
});
