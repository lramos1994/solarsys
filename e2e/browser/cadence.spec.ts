import { expect, test, type Page } from '@playwright/test';

const DEFAULT_CANVAS = 600;
const MAXIMUM_CANVAS = 1500;
const SAMPLE_DURATION_MS = 2_000;
const MINIMUM_FPS = 50;
const BELT_TYPES = ['rocky', 'icy', 'metallic'] as const;

type BeltType = (typeof BELT_TYPES)[number];

type RgbChannels = [number, number, number];

type ChannelContrast = {
  red: number;
  green: number;
  blue: number;
  max: number;
};

async function setValue(
  control: import('@playwright/test').Locator,
  value: string,
): Promise<void> {
  await control.fill(value);
  await control.blur();
}

function rgbChannels(color: string): RgbChannels {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);

  if (match === null) {
    throw new Error(`cannot parse color: ${color}`);
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function channelContrast(a: string, b: string): ChannelContrast {
  const [ar, ag, ab] = rgbChannels(a);
  const [br, bg, bb] = rgbChannels(b);
  const red = Math.abs(ar - br);
  const green = Math.abs(ag - bg);
  const blue = Math.abs(ab - bb);

  return {
    red,
    green,
    blue,
    max: Math.max(red, green, blue),
  };
}

async function requireDenseBeltDetail(page: Page): Promise<{
  selectedType: string;
  asteroidCount: number;
  symbolCount: number;
  highlightCount: number;
  shadowCount: number;
  silhouetteCount: number;
  firstSymbolLayers: string[];
  silhouetteFill: string;
  highlightFill: string;
  shadowFill: string;
  sampleBodies: Array<{ x: number; y: number; width: number; height: number }>;
}> {
  return page.evaluate(() => {
    const select = document.querySelector<HTMLSelectElement>('[data-control="beltType"]');
    const belt = document.querySelector<SVGGElement>('#preview [data-role="asteroid-belt"]');
    const asteroids = [...document.querySelectorAll<SVGUseElement>('#preview [data-role="asteroid"]')];
    const symbols = [...document.querySelectorAll<SVGGElement>('#preview [data-role="asteroid-symbol"]')];

    if (select === null) {
      throw new Error('Cannot inspect belt detail: the belt type control is missing.');
    }

    if (belt === null) {
      throw new Error('Cannot inspect belt detail: the asteroid belt did not render.');
    }

    if (symbols.length === 0) {
      throw new Error('Cannot inspect belt detail: no asteroid symbols rendered.');
    }

    if (asteroids.length === 0) {
      throw new Error('Cannot inspect belt detail: no asteroid bodies rendered.');
    }

    const first = symbols[0]!;
    const silhouette = first.querySelector<SVGPolygonElement>('[data-role="asteroid-silhouette"]');
    const highlight = first.querySelector<SVGPolygonElement>('[data-role="asteroid-highlight"]');
    const shadow = first.querySelector<SVGPolygonElement>('[data-role="asteroid-shadow"]');

    if (silhouette === null || highlight === null || shadow === null) {
      throw new Error('Cannot inspect belt detail: the first asteroid symbol is incomplete.');
    }

    const silhouetteFill = getComputedStyle(silhouette).fill;
    const highlightFill = getComputedStyle(highlight).fill;
    const shadowFill = getComputedStyle(shadow).fill;
    const firstSymbolLayers = [...first.children].map((node) =>
      node.getAttribute('data-role') ?? node.tagName,
    );
    const highlightCount = document.querySelectorAll('#preview [data-role="asteroid-highlight"]').length;
    const shadowCount = document.querySelectorAll('#preview [data-role="asteroid-shadow"]').length;
    const silhouetteCount = document.querySelectorAll('#preview [data-role="asteroid-silhouette"]').length;
    const sampleBodies = asteroids.slice(0, 3).map((node) => {
      const box = node.getBoundingClientRect();

      return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      };
    });

    if (sampleBodies.some((box) => box.width <= 0 || box.height <= 0)) {
      throw new Error(
        `Cannot inspect belt detail: representative asteroid bodies did not render measurable geometry (${JSON.stringify(sampleBodies)}).`,
      );
    }

    return {
      selectedType: select.value,
      asteroidCount: asteroids.length,
      symbolCount: symbols.length,
      highlightCount,
      shadowCount,
      silhouetteCount,
      firstSymbolLayers,
      silhouetteFill,
      highlightFill,
      shadowFill,
      sampleBodies,
    };
  });
}

async function measureCadence(page: Page): Promise<{
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

    await page.locator('[data-role="asteroid-belt-group"] .belt-chevron').click();
    const beltSelect = page.locator('[data-role="asteroid-belt-group"] [data-control="beltType"]');
    await setValue(page.locator('[data-control="asteroidCount"]'), '500');

    const beltEvidenceByType: Array<
      ReturnType<typeof channelContrast> &
      { type: BeltType; selectedType: string; asteroidCount: number; symbolCount: number; sampleBodies: Array<{ x: number; y: number; width: number; height: number }>; }
    > = [];

    for (const type of BELT_TYPES) {
      await beltSelect.selectOption(type);
      const evidence = await requireDenseBeltDetail(page);

      expect(evidence.selectedType).toBe(type);
      expect(evidence.asteroidCount).toBe(500);
      expect(evidence.symbolCount).toBeGreaterThan(0);
      expect(evidence.sampleBodies.length).toBeGreaterThan(0);

      const silhouetteHighlight = channelContrast(evidence.silhouetteFill, evidence.highlightFill);
      const silhouetteShadow = channelContrast(evidence.silhouetteFill, evidence.shadowFill);
      const highlightShadow = channelContrast(evidence.highlightFill, evidence.shadowFill);

      expect(
        silhouetteHighlight.max,
        `${type} silhouette/highlight contrast: ${JSON.stringify(silhouetteHighlight)}`,
      ).toBeGreaterThan(0);
      expect(
        silhouetteShadow.max,
        `${type} silhouette/shadow contrast: ${JSON.stringify(silhouetteShadow)}`,
      ).toBeGreaterThan(0);
      expect(
        highlightShadow.max,
        `${type} highlight/shadow contrast: ${JSON.stringify(highlightShadow)}`,
      ).toBeGreaterThan(0);

      for (const body of evidence.sampleBodies) {
        expect(body.width, `${type} asteroid body width: ${JSON.stringify(body)}`).toBeGreaterThan(0);
        expect(body.height, `${type} asteroid body height: ${JSON.stringify(body)}`).toBeGreaterThan(0);
      }

      beltEvidenceByType.push({
        type,
        selectedType: evidence.selectedType,
        asteroidCount: evidence.asteroidCount,
        symbolCount: evidence.symbolCount,
        sampleBodies: evidence.sampleBodies,
        ...silhouetteHighlight,
      });
    }

    const asteroids = await page.locator('#preview [data-role="asteroid"]').count();
    expect(asteroids).toBe(500);

    const cadence = await measureCadence(page);

    expect(
      cadence.fps,
      `1500px preview with ${asteroids} asteroids rendered ${cadence.nodes} nodes at ${cadence.fps.toFixed(1)}fps`,
    ).toBeGreaterThanOrEqual(MINIMUM_FPS);
    expect(beltEvidenceByType).toHaveLength(BELT_TYPES.length);
  });
});
