import { expect, test, type Page } from '@playwright/test';
import { generateScene, type SceneParams } from '../../ts/generator/scene';

type Point = { x: number; y: number };

const MOTION_TIMEOUT_MS = 1500;
const MOTION_INTERVALS_MS = [120, 180, 240, 320];

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

async function waitForInlineScene(page: Page): Promise<void> {
  await expect(page.locator('svg.solarsys')).toBeVisible();
  await expect
    .poll(async () => (await page.locator('g[data-role="planet"]').first().boundingBox())?.width ?? 0)
    .toBeGreaterThan(0);
}

async function waitForImageScene(page: Page): Promise<void> {
  const scene = page.locator('#scene');

  await expect(scene).toBeVisible();
  await expect
    .poll(async () =>
      scene.evaluate((node) => {
        const image = node as HTMLImageElement;

        return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
      }),
    )
    .toBe(true);
}

async function planetPosition(page: Page): Promise<Point> {
  const box = await page.locator('g[data-role="planet"]').first().boundingBox();

  if (box === null) {
    throw new Error('planet group has no bounding box');
  }

  return { x: box.x, y: box.y };
}

async function observedPlanetDisplacement(page: Page): Promise<number> {
  const first = await planetPosition(page);
  let furthest = 0;

  await expect
    .poll(
      async () => {
        const current = await planetPosition(page);
        furthest = Math.max(furthest, Math.hypot(current.x - first.x, current.y - first.y));
        return furthest;
      },
      {
        intervals: MOTION_INTERVALS_MS,
        timeout: MOTION_TIMEOUT_MS,
        message: 'rendered planet never moved within the bounded polling window',
      },
    )
    .toBeGreaterThan(1);

  return furthest;
}

test.describe('generated scene animates standalone', () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(
      `<!doctype html><html><body style="margin:0">${SCENE}</body></html>`,
    );
    await waitForInlineScene(page);
  });

  test('renders in the engine', async ({ page }) => {
    await expect(page.locator('svg.solarsys')).toBeVisible();
    await expect(page.locator('g[data-role="planet"]').first()).toBeVisible();
  });

  test('moves its planets along their orbits', async ({ page }, testInfo) => {
    const distance = await observedPlanetDisplacement(page);

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
    await waitForImageScene(page);

    const first = await page.locator('#scene').screenshot();
    let identical = true;

    await expect
      .poll(
        async () => {
          identical = Buffer.compare(first, await page.locator('#scene').screenshot()) === 0;
          return identical;
        },
        {
          intervals: MOTION_INTERVALS_MS,
          timeout: MOTION_TIMEOUT_MS,
          message: 'embedded scene pixels never changed within the bounded polling window',
        },
      )
      .toBe(false);

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
