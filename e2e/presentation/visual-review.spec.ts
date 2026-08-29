import { writeFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const VIEWPORTS = {
  narrow: { width: 390, height: 844 },
  desktop: { width: 1200, height: 800 },
  wide: { width: 1440, height: 900 },
} as const;

const STATES = ['initial', 'dense-valid', 'validation-error', 'reduced-motion', 'dialog-open'] as const;

type ReviewState = (typeof STATES)[number];

const BELT_TYPES = ['rocky', 'icy', 'metallic'] as const;
const RING_TYPES = ['Thin', 'Banded', 'Wide'] as const;
const RING_LAYER_COUNTS = {
  Thin: 3,
  Banded: 3,
  Wide: 4,
} as const;

type BeltType = (typeof BELT_TYPES)[number];
type RingType = (typeof RING_TYPES)[number];

type RgbChannels = [number, number, number];

type ChannelContrast = {
  red: number;
  green: number;
  blue: number;
  max: number;
};

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

async function prepareState(page: Page, state: ReviewState): Promise<boolean> {
  if (state === 'reduced-motion') {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  }

  await page.goto('/');
  await expect(page.locator('#preview svg')).toBeVisible();
  const initialPreview = await page.locator('#preview').innerHTML();

  if (state === 'dense-valid') {
    for (let count = 0; count < 3; count += 1) {
      await page.locator('[data-action="add-planet"]').click();
    }
  }

  if (state === 'validation-error') {
    const width = page.locator('[data-control="canvasWidth"]');
    await width.fill('5');
    await width.blur();
    await expect(width).toHaveAttribute('aria-invalid', 'true');
  }

  if (state === 'reduced-motion') {
    await expect(page.locator('[data-role="reduced-motion-notice"]')).toBeVisible();
  }

  if (state === 'dialog-open') {
    // Open planet 2's dialog (the one with a moon and a ring) so the matrix
    // measures the fullest editing surface (UI-012).
    const group = page.locator('#controls [data-planet="1"]');

    if (!(await group.evaluate((node) => node.hasAttribute('open')))) {
      await group.locator('[data-action="toggle-planet"]').click();
    }

    await group.locator('[data-action="open-planet-dialog"]').click();
    await expect(page.locator('[data-role="planet-dialog"][data-index="1"]')).toBeVisible();
  }

  return state !== 'validation-error' || (await page.locator('#preview').innerHTML()) === initialPreview;
}

async function openPlanetDialog(page: Page, index: number): Promise<void> {
  const group = page.locator(`#controls [data-planet="${index}"]`);

  if (!(await group.evaluate((node) => node.hasAttribute('open')))) {
    await group.locator('[data-action="toggle-planet"]').click();
  }

  await group.locator('[data-action="open-planet-dialog"]').click();
  await expect(page.locator(`[data-role="planet-dialog"][data-index="${index}"]`)).toBeVisible();
}

async function openBeltDetails(page: Page): Promise<void> {
  const group = page.locator('[data-role="asteroid-belt-group"]');
  const chevron = group.locator('[data-action="toggle-belt-details"]');

  if ((await chevron.getAttribute('aria-expanded')) !== 'true') {
    await chevron.click();
  }

  await expect(group.locator('[data-control="beltType"]')).toBeVisible();
}

async function openRingDetails(page: Page, index: number): Promise<void> {
  const dialog = page.locator(`[data-role="planet-dialog"][data-index="${index}"]`);
  const details = dialog.locator('details.authored-group');

  if (!(await details.evaluate((node) => node.hasAttribute('open')))) {
    await details.locator('summary').click();
  }

  await expect(dialog.locator('[data-control="ringType"]')).toBeVisible();
}

type BeltEvidence = {
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
};

async function beltMaterialEvidence(page: Page): Promise<BeltEvidence> {
  return page.evaluate(() => {
    const select = document.querySelector<HTMLSelectElement>('[data-control="beltType"]');
    const belt = document.querySelector<SVGGElement>('#preview [data-role="asteroid-belt"]');
    const asteroidCount = document.querySelectorAll('#preview [data-role="asteroid"]').length;
    const symbols = [...document.querySelectorAll<SVGGElement>('#preview [data-role="asteroid-symbol"]')];
    const highlights = document.querySelectorAll('#preview [data-role="asteroid-highlight"]').length;
    const shadows = document.querySelectorAll('#preview [data-role="asteroid-shadow"]').length;
    const silhouettes = document.querySelectorAll('#preview [data-role="asteroid-silhouette"]').length;
    const asteroidBodies = [...document.querySelectorAll<SVGUseElement>('#preview [data-role="asteroid"]')];

    if (select === null) {
      throw new Error('Cannot inspect belt detail: the belt type control is missing.');
    }

    if (belt === null) {
      throw new Error('Cannot inspect belt detail: the asteroid belt did not render.');
    }

    if (symbols.length === 0) {
      throw new Error('Cannot inspect belt detail: no asteroid symbols rendered.');
    }

    if (asteroidBodies.length === 0) {
      throw new Error('Cannot inspect belt detail: no asteroid bodies rendered.');
    }

    const first = symbols[0]!;
    const firstSymbolLayers = [...first.children].map((node) =>
      node.getAttribute('data-role') ?? node.tagName,
    );
    const silhouette = first.querySelector<SVGPolygonElement>('[data-role="asteroid-silhouette"]');
    const highlight = first.querySelector<SVGPolygonElement>('[data-role="asteroid-highlight"]');
    const shadow = first.querySelector<SVGPolygonElement>('[data-role="asteroid-shadow"]');

    if (silhouette === null || highlight === null || shadow === null) {
      throw new Error('Cannot inspect belt detail: the first asteroid symbol is incomplete.');
    }

    const silhouetteFill = getComputedStyle(silhouette).fill;
    const highlightFill = getComputedStyle(highlight).fill;
    const shadowFill = getComputedStyle(shadow).fill;
    const sampleBodies = asteroidBodies.slice(0, 3).map((node) => {
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
      asteroidCount: asteroidCount,
      symbolCount: symbols.length,
      highlightCount: highlights,
      shadowCount: shadows,
      silhouetteCount: silhouettes,
      firstSymbolLayers,
      silhouetteFill,
      highlightFill,
      shadowFill,
      sampleBodies,
    };
  });
}

type RingEvidence = {
  selectedType: string;
  expectedLayers: number;
  order: string[];
  backLayers: number;
  frontLayers: number;
  backOverlap: boolean;
  frontOverlap: boolean;
  bodyBox: { x: number; y: number; width: number; height: number };
  backBox: { x: number; y: number; width: number; height: number };
  frontBox: { x: number; y: number; width: number; height: number };
};

async function ringLayeringEvidence(page: Page, expectedType: RingType): Promise<RingEvidence> {
  return page.evaluate((type) => {
    const dialog = document.querySelector<HTMLElement>('[data-role="planet-dialog"][data-index="1"]');

    if (dialog === null) {
      throw new Error('Cannot inspect ring detail: the planet 2 dialog is missing.');
    }

    const select = dialog.querySelector<HTMLSelectElement>('[data-control="ringType"]');

    if (select === null) {
      throw new Error('Cannot inspect ring detail: the ring type control is missing.');
    }

    if (select.value !== type) {
      throw new Error(`Cannot inspect ring detail: expected ${type} but found ${select.value}.`);
    }

    const bodyGroup = [...document.querySelectorAll<SVGGElement>('#preview g[data-role="planet"] > g')]
      .find((group) => group.querySelector('[data-role="ring-back"]') !== null);

    if (bodyGroup === undefined) {
      throw new Error('Cannot inspect ring detail: no rendered ringed planet was found.');
    }

    const back = bodyGroup.querySelector<SVGGElement>('[data-role="ring-back"]');
    const front = bodyGroup.querySelector<SVGGElement>('[data-role="ring-front"]');
    const body = bodyGroup.querySelector<SVGCircleElement>('[data-role="planet-body"]');

    if (back === null || front === null || body === null) {
      throw new Error('Cannot inspect ring detail: the ring or body layers are incomplete.');
    }

    const rect = (node: Element) => {
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };

    const intersects = (
      a: { x: number; y: number; width: number; height: number },
      b: { x: number; y: number; width: number; height: number },
    ): boolean =>
      a.width > 0 &&
      a.height > 0 &&
      b.width > 0 &&
      b.height > 0 &&
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y;

    const order = Array.from(bodyGroup.children).map((node) =>
      node.getAttribute('data-role') ?? node.tagName,
    );
    const backLayers = back.querySelectorAll('ellipse').length;
    const frontLayers = front.querySelectorAll('path').length;
    const expectedLayers =
      type === 'Wide' ? 4 : 3;
    const bodyBox = rect(body);
    const backBox = rect(back);
    const frontBox = rect(front);

    if (order[0] !== 'ring-back' || order[order.length - 1] !== 'ring-front') {
      throw new Error(`Cannot inspect ring detail: unexpected layer order (${order.join(', ')}).`);
    }

    if (backLayers !== expectedLayers || frontLayers !== expectedLayers) {
      throw new Error(
        `Cannot inspect ring detail: expected ${expectedLayers} layers on both ring pieces (${backLayers}/${frontLayers}).`,
      );
    }

    if (backLayers !== frontLayers) {
      throw new Error(
        `Cannot inspect ring detail: expected matching back/front layers but found ${backLayers}/${frontLayers}.`,
      );
    }

    if (!intersects(backBox, bodyBox) || !intersects(frontBox, bodyBox)) {
      throw new Error('Cannot inspect ring detail: the ring pieces no longer overlap the planet body.');
    }

    return {
      selectedType: select.value,
      expectedLayers,
      order,
      backLayers,
      frontLayers,
      backOverlap: intersects(backBox, bodyBox),
      frontOverlap: intersects(frontBox, bodyBox),
      bodyBox,
      backBox,
      frontBox,
    };
  }, expectedType);
}

async function writeEvidenceArtifacts(
  testInfo: TestInfo,
  fileStem: string,
  payload: unknown,
): Promise<void> {
  const jsonPath = testInfo.outputPath(`${fileStem}.json`);
  await writeFile(jsonPath, JSON.stringify(payload, null, 2));
  await testInfo.attach(fileStem, {
    path: jsonPath,
    contentType: 'application/json',
  });
}


test.describe('material layering evidence (QLT-009)', () => {
  test('belt material stays layered at default scale', async ({ page }, testInfo: TestInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Durable review evidence is captured once in Chromium.');

    await page.setViewportSize(VIEWPORTS.wide);
    await page.goto('/');
    await expect(page.locator('#preview svg')).toBeVisible();

    await openBeltDetails(page);
    const beltSelect = page.locator('[data-role="asteroid-belt-group"] [data-control="beltType"]');
    const beltEvidenceByType: Array<BeltEvidence & { type: BeltType; contrasts: { silhouetteHighlight: number; silhouetteShadow: number; highlightShadow: number } }> = [];

    for (const type of BELT_TYPES) {
      await beltSelect.selectOption(type);
      const evidence = await beltMaterialEvidence(page);

      expect(evidence.selectedType).toBe(type);
      expect(evidence.asteroidCount).toBeGreaterThan(0);
      expect(evidence.symbolCount).toBeGreaterThan(0);
      expect(evidence.highlightCount).toBeGreaterThan(0);
      expect(evidence.shadowCount).toBeGreaterThan(0);
      expect(evidence.silhouetteCount).toBeGreaterThan(0);
      expect(evidence.firstSymbolLayers).toEqual(['asteroid-silhouette', 'asteroid-highlight', 'asteroid-shadow']);

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
        ...evidence,
        contrasts: {
          silhouetteHighlight: silhouetteHighlight.max,
          silhouetteShadow: silhouetteShadow.max,
          highlightShadow: highlightShadow.max,
        },
      });
    }

    const asteroids = await page.locator('#preview [data-role="asteroid"]').count();
    expect(asteroids).toBeGreaterThan(0);

    const screenshot = testInfo.outputPath('belt-material.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    await writeEvidenceArtifacts(testInfo, 'belt-material', {
      viewport: VIEWPORTS.wide,
      beltEvidenceByType,
      screenshot,
      verifiedAt: 'default and maximum belt-type state',
    });
  });

  test('all ring types stay layered and occluded', async ({ page }, testInfo: TestInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Durable review evidence is captured once in Chromium.');

    await page.setViewportSize(VIEWPORTS.wide);
    await page.goto('/');
    await expect(page.locator('#preview svg')).toBeVisible();

    await openPlanetDialog(page, 1);
    await openRingDetails(page, 1);
    const ringSelect = page.locator('[data-role="planet-dialog"][data-index="1"] [data-control="ringType"]');
    const ringEvidenceByType: Array<RingEvidence & { type: RingType }> = [];

    for (const type of RING_TYPES) {
      await ringSelect.selectOption(type);
      const evidence = await ringLayeringEvidence(page, type);

      expect(evidence.selectedType).toBe(type);
      expect(evidence.order[0]).toBe('ring-back');
      expect(evidence.order[evidence.order.length - 1]).toBe('ring-front');
      expect(evidence.expectedLayers).toBe(RING_LAYER_COUNTS[type]);
      expect(evidence.backLayers).toBe(RING_LAYER_COUNTS[type]);
      expect(evidence.frontLayers).toBe(RING_LAYER_COUNTS[type]);
      expect(evidence.frontLayers).toBe(evidence.backLayers);
      expect(evidence.backOverlap).toBe(true);
      expect(evidence.frontOverlap).toBe(true);

      ringEvidenceByType.push({ ...evidence, type });
    }

    const screenshot = testInfo.outputPath('ring-layering.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    await writeEvidenceArtifacts(testInfo, 'ring-layering', {
      viewport: VIEWPORTS.wide,
      ringEvidenceByType,
      screenshot,
      verifiedAt: 'all authored ring types',
    });
  });
});

for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
  for (const state of STATES) {
    test(`visual matrix: ${viewportName} / ${state}`, async ({ page }, testInfo: TestInfo) => {
      test.skip(testInfo.project.name !== 'chromium', 'Durable review evidence is captured once in Chromium.');
      await page.setViewportSize(viewport);
      const retainedPreview = await prepareState(page, state);

      const focusTarget =
        state === 'dialog-open'
          ? page.locator('[data-role="planet-dialog"][open] [data-control="planetSize"]')
          : page.locator('[data-control="canvasWidth"]');
      await focusTarget.focus();

      const evidence = await page.evaluate(({ expectedWidth, stateName }) => {
        const box = (selector: string): { x: number; y: number; width: number; height: number } | null => {
          const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();

          return rect === undefined
            ? null
            : { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        };
        const controls = [...document.querySelectorAll<HTMLElement>('[data-control]')];
        const scene = document.querySelector<SVGSVGElement>('#preview > svg');
        const focused = document.activeElement instanceof HTMLElement
          ? getComputedStyle(document.activeElement)
          : null;

        return {
          viewportWidth: innerWidth,
          viewportHeight: innerHeight,
          expectedWidth,
          state: stateName,
          desktopMediaMatches: matchMedia('(min-width: 720px)').matches,
          sceneComputedWidth: scene === null ? null : getComputedStyle(scene).width,
          horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
          stage: box('[data-role="instrument-stage"]'),
          controls: box('[data-role="instrument-controls"]'),
          actions: box('[data-role="instrument-actions"]'),
          preview: box('#preview'),
          dialog: box('[data-role="planet-dialog"][open]'),
          previewVisible: box('#preview svg') !== null,
          actionsVisible: box('[data-role="instrument-actions"]') !== null,
          telemetryVisible: box('[data-role="scene-telemetry"]') !== null,
          planetCount: document.querySelectorAll('[data-role="planet-instrument"]').length,
          invalidCount: document.querySelectorAll('[aria-invalid="true"]').length,
          allControlsLabelled: controls.every((control) => {
            const id = control.id;
            return id !== '' && document.querySelector(`label[for="${CSS.escape(id)}"]`) !== null;
          }),
          inlineErrorsAssociated: [...document.querySelectorAll<HTMLElement>('[aria-invalid="true"]')]
            .every((control) => {
              const id = control.getAttribute('aria-describedby');
              return id !== null && document.getElementById(id)?.textContent?.trim() !== '';
            }),
          focus: focused === null
            ? null
            : {
                outlineStyle: focused.outlineStyle,
                outlineWidth: focused.outlineWidth,
                outlineColor: focused.outlineColor,
              },
          reducedNoticeVisible: !document.querySelector<HTMLElement>(
            '[data-role="reduced-motion-notice"]',
          )?.hidden,
          transitionDuration: getComputedStyle(
            document.querySelector<HTMLElement>('[data-action="toggle-playback"]')!,
          ).transitionDuration,
        };
      }, { expectedWidth: viewport.width, stateName: state });

      expect(evidence.viewportWidth).toBe(viewport.width);
      expect(evidence.horizontalOverflow).toBeLessThanOrEqual(1);
      expect(evidence.stage).not.toBeNull();
      expect(evidence.controls).not.toBeNull();
      expect(evidence.actions).not.toBeNull();
      expect(evidence.previewVisible).toBe(true);
      expect(evidence.actionsVisible).toBe(true);
      expect(evidence.telemetryVisible).toBe(false);
      expect(evidence.allControlsLabelled).toBe(true);
      expect(evidence.inlineErrorsAssociated).toBe(true);
      expect(evidence.focus?.outlineStyle).toBe('solid');
      expect(parseFloat(evidence.focus?.outlineWidth ?? '0')).toBeGreaterThan(0);
      expect(retainedPreview).toBe(true);
      expect(
        evidence.actions!.y + evidence.actions!.height,
        JSON.stringify({
          viewportHeight: evidence.viewportHeight,
          desktopMediaMatches: evidence.desktopMediaMatches,
          sceneComputedWidth: evidence.sceneComputedWidth,
        }),
      ).toBeLessThanOrEqual(viewport.height + 1);
      expect(evidence.preview).not.toBeNull();
      expect(evidence.actions!.y + evidence.actions!.height).toBeLessThanOrEqual(
        evidence.preview!.y,
      );

      if (viewport.width === VIEWPORTS.narrow.width) {
        expect(evidence.stage!.y).toBeLessThan(evidence.controls!.y);
      } else {
        expect(evidence.controls!.x).toBeLessThan(evidence.stage!.x);
        expect(evidence.stage!.width).toBeGreaterThan(evidence.controls!.width);
      }

      expect(evidence.planetCount).toBe(state === 'dense-valid' ? 6 : 3);
      expect(evidence.invalidCount).toBe(state === 'validation-error' ? 1 : 0);
      expect(evidence.reducedNoticeVisible).toBe(state === 'reduced-motion');
      if (state === 'reduced-motion') {
        expect(evidence.transitionDuration).toBe('0s');
      }

      if (state === 'dialog-open') {
        // UI-012: the dialog fits its viewport — no horizontal overflow on the
        // narrow (390px) viewport and fully visible on the wide (1440x900) one.
        expect(evidence.dialog, JSON.stringify(evidence.dialog)).not.toBeNull();
        expect(evidence.dialog!.x).toBeGreaterThanOrEqual(0);
        expect(evidence.dialog!.y).toBeGreaterThanOrEqual(0);
        expect(evidence.dialog!.x + evidence.dialog!.width).toBeLessThanOrEqual(
          viewport.width + 1,
        );
        expect(evidence.dialog!.y + evidence.dialog!.height).toBeLessThanOrEqual(
          viewport.height + 1,
        );
      }

      const screenshot = testInfo.outputPath(`${viewportName}-${state}.png`);
      const domEvidence = testInfo.outputPath(`${viewportName}-${state}.json`);
      await page.screenshot({ path: screenshot, fullPage: true });
      await writeFile(domEvidence, JSON.stringify({ ...evidence, retainedPreview }, null, 2));
      await testInfo.attach('dom-evidence', {
        path: domEvidence,
        contentType: 'application/json',
      });
    });
  }
}
