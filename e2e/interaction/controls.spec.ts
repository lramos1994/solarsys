import { expect, test, type Download, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/**
 * Task 3.6 (CTL-001, CTL-002): parameter controls drive the preview.
 *
 * These run against the built application in a real browser, so they exercise
 * the control surface the user actually operates rather than a simulated DOM.
 */

/** Read the previewed scene's viewBox, which encodes the canvas dimensions. */
async function viewBox(page: Page): Promise<string> {
  return (await page.locator('#preview svg').getAttribute('viewBox')) ?? '';
}

async function orbitPathData(page: Page, index: number): Promise<string> {
  return (
    (await page.locator('#preview [data-role="orbit"]').nth(index).getAttribute('d')) ?? ''
  );
}

/** Set a control's value and dispatch the events a real edit would. */
async function setValue(control: Locator, value: string): Promise<void> {
  await control.fill(value);
  await control.blur();
}

/**
 * Expand a planet instrument if it is collapsed (CD-002, D-211).
 *
 * The deck opens with only the first planet expanded, so a test that operates
 * a later planet's controls must expand it first — exactly as a user would.
 * This is idempotent: an already-open group is left alone.
 */
async function expandPlanet(page: Page, index: number): Promise<void> {
  const group = page.locator(`#controls [data-planet="${index}"]`);

  if (await group.evaluate((node) => node.hasAttribute('open'))) {
    return;
  }

  await group.locator('[data-action="toggle-planet"]').click();
  await expect(group).toHaveAttribute('open', '');
}

/** Expand every planet instrument, for tests that operate the whole set. */
async function expandAllPlanets(page: Page): Promise<void> {
  const count = await page.locator('#controls [data-planet]').count();

  for (let index = 0; index < count; index += 1) {
    await expandPlanet(page, index);
  }
}

/**
 * Open a planet's editing dialog (CX-020), expanding the instrument first if
 * it is collapsed — the dialog's opener lives inside the instrument body, which
 * a collapsed group does not render.
 */
async function openPlanetDialog(page: Page, index: number): Promise<Locator> {
  await expandPlanet(page, index);
  const group = page.locator(`#controls [data-planet="${index}"]`);
  await group.locator('[data-action="open-planet-dialog"]').click();
  const dialog = page.locator(`[data-role="planet-dialog"][data-index="${index}"]`);
  await expect(dialog).toBeVisible();
  return dialog;
}

/**
 * Select a palette from the swatch group (CX-011).
 *
 * The radio itself is visually replaced by its swatch label, so a pointer
 * click lands on the label — which is what a real user clicks, and what keeps
 * the native `label[for]` association under test. Clicking the input directly
 * fails: the label sits over it and intercepts the pointer event.
 */
async function selectPalette(page: Page, name: string): Promise<void> {
  await page.locator(`[data-role="palette-group"] label[for="palette-${name.toLowerCase()}"]`).click();
  await expect(page.locator(`[data-control="palette"][value="${name}"]`)).toBeChecked();
}

/** Read the bytes Playwright received for a browser download. */
async function downloadedBytes(download: Download): Promise<Buffer> {
  const path = await download.path();

  expect(path).not.toBeNull();

  return readFile(path!);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#preview svg')).toBeVisible();
});

test.describe('control surface', () => {
  test('presents controls for every in-scope parameter', async ({ page }) => {
    await expect(page.locator('[data-control="canvasWidth"]')).toBeVisible();
    await expect(page.locator('[data-control="canvasHeight"]')).toBeVisible();
    // Orbital distance stays in the deck (design §5); size and moon moved into
    // the per-planet dialog and are reachable through its opener.
    await expect(page.locator('[data-control="planetDistance"]').first()).toBeVisible();
    const dialog = await openPlanetDialog(page, 0);
    await expect(dialog.locator('[data-control="planetSize"]')).toBeVisible();
    await expect(dialog.locator('[data-control="moonEnabled"]')).toBeVisible();
  });

  test('renders a scene without the user doing anything', async ({ page }) => {
    await expect(page.locator('#preview svg')).toHaveCount(1);
    await expect(page.locator('#preview [data-role="planet"]').first()).toBeVisible();
  });

  test('labels every control', async ({ page }) => {
    const controls = page.locator('[data-control]');
    const total = await controls.count();

    expect(total).toBeGreaterThan(0);

    for (let index = 0; index < total; index += 1) {
      const id = await controls.nth(index).getAttribute('id');

      expect(id, `control ${index} needs an id to be labelled`).toBeTruthy();
      await expect(page.locator(`label[for="${id}"]`)).toHaveCount(1);
    }
  });
});

test.describe('canvas dimensions', () => {
  test('changing the width regenerates the preview', async ({ page }) => {
    const before = await viewBox(page);

    await setValue(page.locator('[data-control="canvasWidth"]'), '640');

    await expect(page.locator('#preview svg')).not.toHaveAttribute('viewBox', before);
    // The shell adds a 5-unit margin to the canvas (CANVAS_MARGIN).
    expect(await viewBox(page)).toContain('645');
  });

  test('changing the height regenerates the preview', async ({ page }) => {
    await setValue(page.locator('[data-control="canvasHeight"]'), '480');

    expect(await viewBox(page)).toContain('485');
  });
});

test.describe('planet size', () => {
  test('changing the size changes the rendered planet', async ({ page }) => {
    const radius = page.locator('#preview [data-role="planet-body"]').first();
    const before = await radius.getAttribute('r');

    const dialog = await openPlanetDialog(page, 0);
    await setValue(dialog.locator('[data-control="planetSize"]'), '20');

    await expect(radius).not.toHaveAttribute('r', before ?? '');
    // 20% of the 300-unit scene radius on the default 600x600 canvas.
    expect(Number(await radius.getAttribute('r'))).toBe(60);
  });
});

test.describe('orbital distance forms (CTL-002)', () => {
  test('defaults to a scalar range and reveals four ranges in custom mode', async ({ page }) => {
    const planet = page.locator('#controls [data-planet]').first();

    await expect(planet.locator('[data-orbit-mode="scalar"]')).toBeChecked();
    await expect(planet.locator('[data-range-for="planet-0-distance"]')).toBeVisible();

    await planet.locator('[data-orbit-mode="custom"]').check();

    for (const direction of ['left', 'top', 'right', 'bottom']) {
      const control = `orbit${direction[0]!.toUpperCase()}${direction.slice(1)}`;
      const exact = planet.locator(`[data-control="${control}"]`);
      const id = await exact.getAttribute('id');

      await expect(exact).toBeVisible();
      expect(id).toBeTruthy();
      await expect(planet.locator(`[data-range-for="${id}"]`)).toBeVisible();
      await expect(exact).toHaveValue('37');
    }
  });

  test('a single value produces a circular orbit', async ({ page }) => {
    await setValue(page.locator('[data-control="planetDistance"]').first(), '100');

    const data = await orbitPathData(page, 0);
    // A circular orbit is symmetric: its horizontal and vertical extents match.
    const numbers = data.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];

    expect(numbers.length).toBeGreaterThan(0);

    const xs = numbers.filter((_, index) => index % 2 === 0);
    const ys = numbers.filter((_, index) => index % 2 === 1);

    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(
      Math.max(...ys) - Math.min(...ys),
      6,
    );
  });

  test('four values produce independent extents', async ({ page }) => {
    const planet = page.locator('#controls [data-planet]').first();

    await planet.locator('[data-orbit-mode="custom"]').check();

    await setValue(planet.locator('[data-control="orbitLeft"]'), '67');
    await setValue(planet.locator('[data-control="orbitTop"]'), '20');
    await setValue(planet.locator('[data-control="orbitRight"]'), '67');
    await setValue(planet.locator('[data-control="orbitBottom"]'), '20');

    const numbers =
      (await orbitPathData(page, 0)).match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
    const xs = numbers.filter((_, index) => index % 2 === 0);
    const ys = numbers.filter((_, index) => index % 2 === 1);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);

    // 67% and 20% of the 300-unit scene radius: 402 wide against 120 tall.
    // The asymmetry must survive into the path.
    expect(width).toBeCloseTo(402, 6);
    expect(height).toBeCloseTo(120, 6);
  });

  test('switching between the two forms updates the same orbit', async ({ page }) => {
    const planet = page.locator('#controls [data-planet]').first();

    await setValue(planet.locator('[data-control="planetDistance"]'), '50');
    const circular = await orbitPathData(page, 0);

    await planet.locator('[data-orbit-mode="custom"]').check();
    await setValue(planet.locator('[data-control="orbitTop"]'), '13');
    await setValue(planet.locator('[data-control="orbitBottom"]'), '13');
    const asymmetric = await orbitPathData(page, 0);

    expect(asymmetric).not.toBe(circular);
    // The orbit count is unchanged: editing a distance must not add or drop
    // a planet. The default scene ships three.
    await expect(page.locator('#preview [data-role="orbit"]')).toHaveCount(3);
  });
});

test.describe('planet composition (CTL-003)', () => {
  test('adds a planet and its own orbit to the preview', async ({ page }) => {
    const planets = page.locator('#controls [data-planet]');
    const orbits = page.locator('#preview [data-role="orbit"]');

    await expect(planets).toHaveCount(3);
    await expect(orbits).toHaveCount(3);

    await page.locator('[data-action="add-planet"]').click();

    await expect(planets).toHaveCount(4);
    await expect(orbits).toHaveCount(4);
    await expect(planets.nth(3).locator('[data-control="planetSize"]')).toHaveValue('10');
    await expect(planets.nth(3).locator('[data-control="planetDistance"]')).toHaveValue('50');
  });

  test('removes the selected planet, its orbit, and its moon', async ({ page }) => {
    const planets = page.locator('#controls [data-planet]');

    await expect(planets).toHaveCount(3);
    await expect(page.locator('#preview [data-role="orbit"]')).toHaveCount(3);
    // Planet 2 is the default planet that has a moon.
    await expect(page.locator('#preview [data-role="moon"]')).toHaveCount(1);

    // The remove affordance now lives in the planet dialog (CX-020), reached
    // through the instrument's "Edit planet N" opener.
    const dialog = await openPlanetDialog(page, 1);
    await dialog.locator('[data-action="remove-planet"]').click();

    await expect(planets).toHaveCount(2);
    await expect(page.locator('#preview [data-role="orbit"]')).toHaveCount(2);
    await expect(page.locator('#preview [data-role="moon"]')).toHaveCount(0);
  });

  test('keeps a valid ambient scene after removing the last planet', async ({ page }) => {
    const planets = page.locator('#controls [data-planet]');

    while ((await planets.count()) > 0) {
      const dialog = await openPlanetDialog(page, 0);
      await dialog.locator('[data-action="remove-planet"]').click();
    }

    await expect(planets).toHaveCount(0);
    await expect(page.locator('#preview [data-role="orbit"]')).toHaveCount(0);
    await expect(page.locator('#preview [data-sun-body]')).toHaveCount(1);
    await expect(page.locator('#preview [data-role="nebula"]')).not.toHaveCount(0);
    await expect(page.locator('#preview [data-role="asteroid-belt"]')).not.toHaveCount(0);
    await expect(page.locator('#preview [data-role="comet"]')).not.toHaveCount(0);
  });
});

test.describe('moon configuration (CTL-004)', () => {
  test('enabling a moon reveals its controls, uses the 15-second default, and renders it', async ({ page }) => {
    const dialog = await openPlanetDialog(page, 0);

    // Planet 1 starts with no moon, so moon-specific controls must not be
    // exposed until the feature is enabled.
    await expect(dialog.locator('[data-control="moonSize"]')).toHaveCount(0);
    await expect(dialog.locator('[data-control="moonDistance"]')).toHaveCount(0);
    await expect(dialog.locator('[data-control="moonPeriod"]')).toHaveCount(0);
    await expect(page.locator('#preview [data-role="moon"]')).toHaveCount(1);

    await dialog.locator('[data-control="moonEnabled"]').check();

    await expect(dialog.locator('[data-control="moonSize"]')).toBeVisible();
    await expect(dialog.locator('[data-control="moonDistance"]')).toBeVisible();
    await expect(dialog.locator('[data-control="moonPeriod"]')).toHaveValue('15');
    await expect(page.locator('#preview [data-role="moon"]')).toHaveCount(2);
    await expect(
      page.locator('#preview [data-role="planet"]').first()
        .locator(':scope > [data-role="moon"] > animateMotion'),
    ).toHaveAttribute('dur', '15s');
  });

  test('disabling a moon hides its controls and removes it from the preview', async ({ page }) => {
    const dialog = await openPlanetDialog(page, 1);

    // Planet 2 starts with the default moon enabled.
    await expect(dialog.locator('[data-control="moonSize"]')).toBeVisible();
    await expect(dialog.locator('[data-control="moonDistance"]')).toBeVisible();
    await expect(dialog.locator('[data-control="moonPeriod"]')).toBeVisible();
    await expect(page.locator('#preview [data-role="moon"]')).toHaveCount(1);

    await dialog.locator('[data-control="moonEnabled"]').uncheck();

    await expect(dialog.locator('[data-control="moonSize"]')).toHaveCount(0);
    await expect(dialog.locator('[data-control="moonDistance"]')).toHaveCount(0);
    await expect(dialog.locator('[data-control="moonPeriod"]')).toHaveCount(0);
    await expect(page.locator('#preview [data-role="moon"]')).toHaveCount(0);
  });

  test('applies configured moon size, distance, and period to the preview', async ({ page }) => {
    const dialog = await openPlanetDialog(page, 1);
    const renderedPlanet = page.locator('#preview [data-role="planet"]').nth(1);

    // Planet 2's default size is 6% of the 300-unit scene radius: an 18-unit
    // radius. Moon values are percentages OF THAT.
    await setValue(dialog.locator('[data-control="moonSize"]'), '50');
    await setValue(dialog.locator('[data-control="moonDistance"]'), '200');
    await setValue(dialog.locator('[data-control="moonPeriod"]'), '30');

    await expect(
      renderedPlanet.locator(':scope > [data-role="moon"] [data-role="moon-body"]'),
    ).toHaveAttribute('r', '9');
    await expect(renderedPlanet.locator(':scope > [data-role="moon-orbit"]'))
      .toHaveAttribute('d', /^M -36 0/);
    await expect(renderedPlanet.locator(':scope > [data-role="moon"] > animateMotion'))
      .toHaveAttribute('dur', '30s');
  });
});

test.describe('ring configuration (CTL-010)', () => {
  test('planet 2 opens with a Banded 210% 16° ring; others have none', async ({ page }) => {
    await expandPlanet(page, 1);

    const planet2 = page.locator('#controls [data-planet]').nth(1);

    await expect(planet2.locator('[data-control="ringEnabled"]')).toBeChecked();
    await expect(planet2.locator('[data-control="ringType"]')).toHaveValue('Banded');
    await expect(planet2.locator('[data-control="ringSize"]')).toHaveValue('210');
    await expect(planet2.locator('[data-control="ringInclination"]')).toHaveValue('16');
    await expect(page.locator('#preview [data-role="ring-back"]')).toHaveCount(1);

    const planet1 = page.locator('#controls [data-planet]').first();

    await expect(planet1.locator('[data-control="ringEnabled"]')).not.toBeChecked();
  });

  test('disabling a ring removes its nodes from the preview', async ({ page }) => {
    const dialog = await openPlanetDialog(page, 1);

    await dialog.locator('[data-control="ringEnabled"]').uncheck();

    await expect(page.locator('#preview [data-role="ring-back"]')).toHaveCount(0);
    await expect(page.locator('#preview [data-role="ring-front"]')).toHaveCount(0);
  });

  test('enabling a ring on a ringless planet applies the defaults', async ({ page }) => {
    const dialog = await openPlanetDialog(page, 0);

    await dialog.locator('[data-control="ringEnabled"]').check();

    await expect(dialog.locator('[data-control="ringType"]')).toHaveValue('Banded');
    await expect(dialog.locator('[data-control="ringSize"]')).toHaveValue('210');
    await expect(page.locator('#preview [data-role="ring-back"]')).toHaveCount(2);
  });

  test('an invalid ring size is rejected inline and keeps the scene', async ({ page }) => {
    const dialog = await openPlanetDialog(page, 1);

    await dialog.locator('.authored-group summary').click();
    const before = await page.locator('#preview').innerHTML();

    await setValue(dialog.locator('[data-control="ringSize"]'), '999');

    await expect(page.locator('[data-role="errors"] li')).not.toHaveCount(0);
    expect(await page.locator('#preview').innerHTML()).toBe(before);
  });
});

test.describe('asteroid belt configuration (CTL-011)', () => {
  /** Rock count under the baked serialization: silhouette subpaths (GEN-026). */
  const bakedRockCount = (page: Page): Promise<number> =>
    page.evaluate(() =>
      [...document.querySelectorAll('#preview [data-role="asteroid-silhouettes"]')]
        .reduce((sum, path) => sum + ((path.getAttribute('d') ?? '').split('M').length - 1), 0),
    );

  test('opens enabled with the default configuration', async ({ page }) => {
    await expect(page.locator('[data-control="beltEnabled"]')).toBeChecked();
    await expect(page.locator('[data-control="asteroidCount"]')).toHaveValue('130');
    expect(await bakedRockCount(page)).toBe(130);
    await expect(page.locator('#preview [data-role="asteroid-belt"]')).toHaveAttribute(
      'data-count',
      '130',
    );
  });

  test('disabling the belt removes belt output', async ({ page }) => {
    await page.locator('[data-control="beltEnabled"]').uncheck();

    await expect(page.locator('#preview [data-role="asteroid-cluster"]')).toHaveCount(0);
    await expect(page.locator('#preview [data-role="asteroid-belt"]')).toHaveCount(0);
  });

  test('changing the count regenerates the preview', async ({ page }) => {
    await page.locator('[data-role="asteroid-belt-group"] .belt-chevron').click();

    await setValue(page.locator('[data-control="asteroidCount"]'), '40');

    await expect(page.locator('#preview [data-role="asteroid-belt"]')).toHaveAttribute(
      'data-count',
      '40',
    );
    expect(await bakedRockCount(page)).toBe(40);
  });

  test('the retired inner/outer radius controls are gone', async ({ page }) => {
    await page.locator('[data-role="asteroid-belt-group"] .belt-chevron').click();

    // Replaced by centre + thickness (CTL-017); the ordering relation they
    // needed is now unreachable by construction, so it is no longer validated.
    await expect(page.locator('[data-control="asteroidInnerRadius"]')).toHaveCount(0);
    await expect(page.locator('[data-control="asteroidOuterRadius"]')).toHaveCount(0);
    await expect(page.locator('[data-control="asteroidCentre"]')).toHaveCount(1);
    await expect(page.locator('[data-control="asteroidThickness"]')).toHaveCount(1);
  });

  test('the extreme band is accepted rather than rejected', async ({ page }) => {
    await page.locator('[data-role="asteroid-belt-group"] .belt-chevron').click();

    // Minimum centre with maximum thickness puts the inner edge at exactly 0.
    await setValue(page.locator('[data-control="asteroidCentre"]'), '20');
    await setValue(page.locator('[data-control="asteroidThickness"]'), '40');

    await expect(page.locator('[data-role="errors"] li')).toHaveCount(0);
    await expect(page.locator('#preview [data-role="asteroid-cluster"]').first()).toBeVisible();
  });

  test('an out-of-range belt value is rejected and retains the scene', async ({ page }) => {
    await page.locator('[data-role="asteroid-belt-group"] .belt-chevron').click();
    const before = await page.locator('#preview').innerHTML();

    await setValue(page.locator('[data-control="asteroidCentre"]'), '111');

    await expect(page.locator('[data-role="errors"] li')).not.toHaveCount(0);
    expect(await page.locator('#preview').innerHTML()).toBe(before);
  });
});

test.describe('active orbit emphasis (CX-016, UI-009)', () => {
  const activePath = (page: Page) => page.locator('[data-role="active-orbit-path"]');
  const orbit = (page: Page, index: number) =>
    page.locator('#preview [data-role="orbit"]').nth(index);

  test('hovering a planet instrument emphasizes only that orbit', async ({ page }) => {
    await page.locator('#controls [data-planet]').first().hover();

    const expected = await orbit(page, 0).getAttribute('d');

    await expect(activePath(page)).toHaveAttribute('d', expected ?? '');
    await expect(page.locator('[data-role="orbit-emphasis"]')).toBeVisible();
  });

  test('keyboard focus provides equivalent emphasis and wins over hover', async ({ page }) => {
    await page.locator('#controls [data-planet]').first().hover();

    const dialog = await openPlanetDialog(page, 1);
    await dialog.locator('[data-control="planetSize"]').focus();

    const expected = await orbit(page, 1).getAttribute('d');

    await expect(activePath(page)).toHaveAttribute('d', expected ?? '');
  });

  test('leaving restores the ordinary preview', async ({ page }) => {
    const planet1 = page.locator('#controls [data-planet]').first();

    await planet1.hover();
    await expect(activePath(page)).toHaveAttribute('d', /.+/);

    await page.locator('#preview').hover();

    await expect(page.locator('[data-role="orbit-emphasis"]')).toBeHidden();
  });

  test('the overlay never enters the downloaded SVG (EXP-002)', async ({ page }) => {
    await page.locator('#controls [data-planet]').first().hover();

    const download = page.waitForEvent('download');
    await page.locator('[data-action="download-svg"]').click();
    const bytes = await downloadedBytes(await download);
    const text = bytes.toString('utf8');

    expect(text).not.toContain('orbit-emphasis');
    expect(text).not.toContain('active-orbit-path');
    expect(text).not.toContain('active-moon-orbit-path');
    expect(text).not.toContain('active-planet-highlight');
    expect(text).toContain('<svg');
  });

  test('the overlay matches the generated scene geometry (UI-009)', async ({ page }) => {
    await page.locator('#controls [data-planet]').first().hover();

    const boxes = await page.evaluate(() => {
      const snap = (box: DOMRect) => ({
        x: Math.round(box.x),
        y: Math.round(box.y),
        w: Math.round(box.width),
        h: Math.round(box.height),
      });

      return {
        svg: snap(document.querySelector('#preview svg')!.getBoundingClientRect()),
        overlay: snap(
          document.querySelector('[data-role="orbit-emphasis"]')!.getBoundingClientRect(),
        ),
        orbit: snap(
          document.querySelector('#preview [data-role="orbit"][data-planet-index="0"]')!
            .getBoundingClientRect(),
        ),
        path: snap(
          document.querySelector('[data-role="active-orbit-path"]')!.getBoundingClientRect(),
        ),
      };
    });

    // The overlay is a sibling of #preview and must be sized and positioned to
    // exactly cover the generated scene (which is CSS-sized, not viewBox-sized,
    // and centred on desktop), so the copied orbit lands on the generated one.
    expect(boxes.overlay).toEqual(boxes.svg);
    expect(boxes.path).toEqual(boxes.orbit);
  });

  test('the body highlight aligns with the generated body (CX-018, UI-010)', async ({ page }) => {
    // Freeze the scene so the body position is stable for the geometry compare.
    await page.locator('[data-action="toggle-playback"]').click();
    await page.locator('#controls [data-planet]').first().hover();

    const centres = await page.evaluate(() => {
      const snap = (element: Element | null) => {
        if (element === null) {
          return null;
        }

        const rect = element.getBoundingClientRect();

        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      };

      return {
        highlight: snap(document.querySelector('[data-role="active-planet-highlight"]')),
        body: snap(document.querySelector('#preview [data-role="planet-body"]')),
      };
    });

    expect(centres.highlight).not.toBeNull();
    expect(centres.body).not.toBeNull();
    expect(Math.abs(centres.highlight!.x - centres.body!.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(centres.highlight!.y - centres.body!.y)).toBeLessThanOrEqual(2);
  });

  test('the body highlight tracks the planet as it moves (CX-018)', async ({ page }) => {
    // Ensure the scene is running so the body actually moves: under reduced
    // motion the preview starts paused, and a static body cannot demonstrate
    // tracking. Hover the summary (not editable) afterwards so the implicit
    // hover pause does not re-freeze the scene.
    const playbackButton = page.locator('[data-action="toggle-playback"]');

    if ((await playbackButton.getAttribute('aria-pressed')) === 'true') {
      await playbackButton.click();
    }

    await page
      .locator('#controls [data-planet]')
      .first()
      .locator('[data-action="toggle-planet"]')
      .hover();

    const centre = () =>
      page.evaluate(() => {
        const rect = document
          .querySelector('[data-role="active-planet-highlight"]')!
          .getBoundingClientRect();

        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      });

    const before = await centre();
    await page.waitForTimeout(700);
    const after = await centre();

    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(2);
  });

  test('a moon-bearing planet shows its moon orbit (CX-018)', async ({ page }) => {
    await expandPlanet(page, 1);
    await page.locator('#controls [data-planet]').nth(1).hover();

    const expected = await page.locator('#preview [data-role="moon-orbit"]').first().getAttribute('d');

    await expect(page.locator('[data-role="active-moon-orbit-path"]')).toHaveAttribute(
      'd',
      expected ?? '',
    );
  });

  test('a moon-less planet shows no moon orbit (CX-018)', async ({ page }) => {
    await page.locator('#controls [data-planet]').first().hover();

    const hasMoonOrbit = await page
      .locator('[data-role="active-moon-orbit-path"]')
      .evaluate((element) => element.hasAttribute('d') && element.getAttribute('d') !== '');

    expect(hasMoonOrbit).toBe(false);
  });

  test('keyboard focus on an editable control emphasizes body and moon orbit (CX-018)', async ({ page }) => {
    const dialog = await openPlanetDialog(page, 1);
    await dialog.locator('[data-control="planetSize"]').focus();

    const expected = await orbit(page, 1).getAttribute('d');

    await expect(activePath(page)).toHaveAttribute('d', expected ?? '');
    await expect(page.locator('[data-role="active-planet-highlight"]')).toHaveAttribute('r', /.+/);
    await expect(page.locator('[data-role="active-moon-orbit-path"]')).toHaveAttribute('d', /.+/);
  });

  test('toggling an accordion does not lock the emphasis to that planet (CX-018)', async ({ page }) => {
    const planet0 = page.locator('#controls [data-planet]').first();
    const planet1 = page.locator('#controls [data-planet]').nth(1);

    // Open planet 1's accordion via its summary; the click leaves keyboard
    // focus on that summary.
    await planet1.locator('[data-action="toggle-planet"]').click();
    await expect(planet1).toHaveAttribute('open', '');

    // Hovering planet 0 must transfer the emphasis to planet 0, not keep it on
    // the planet whose accordion was just toggled.
    await planet0.locator('[data-action="toggle-planet"]').hover();

    const expected = await orbit(page, 0).getAttribute('d');

    await expect(activePath(page)).toHaveAttribute('d', expected ?? '');
  });
});

test.describe('palette selection (CTL-005, CX-011)', () => {
  test('offers Random plus the six preserved palettes, with Random selected by default', async ({ page }) => {
    const options = page.locator('[data-control="palette"]');

    // The palette is a swatch radio group rather than a select (CX-011, D-207):
    // the selected value is the checked input, and each option shows its
    // colours while still carrying its name as text.
    await expect(options).toHaveCount(7);
    await expect(page.locator('[data-control="palette"]:checked')).toHaveValue('Random');
    await expect(page.locator('[data-role="palette-group"] .swatch-name')).toHaveText([
      'Random',
      'Aurora',
      'Ember',
      'Abissal',
      'Amethyst',
      'Verdant',
      'Mono',
    ]);
    await expect(page.locator('[data-role="errors"] li')).toHaveCount(0);

    // Random selection is still deterministic for a given seed and must
    // resolve to one of the six real scene palettes, never a literal label.
    const description = await page.locator('#preview desc').textContent();
    expect(description).toMatch(
      /Aurora|Ember|Abissal|Amethyst|Verdant|Mono/,
    );
  });

  test('every palette option previews its colours', async ({ page }) => {
    const swatches = page.locator('[data-role="palette-group"] .swatch');

    await expect(swatches).toHaveCount(7);

    // CX-011's first scenario: EVERY selectable palette shows a sample, not
    // just the currently selected one.
    const chipCounts = await swatches.evaluateAll((nodes) =>
      nodes.map((node) => node.querySelectorAll('.swatch-chip').length),
    );

    expect(chipCounts.every((count) => count > 0)).toBe(true);
  });

  test('applies a selected named palette and retains it when another parameter changes', async ({ page }) => {
    const selected = page.locator('[data-control="palette"]:checked');
    const description = page.locator('#preview desc');

    await selectPalette(page, 'Ember');

    await expect(selected).toHaveValue('Ember');
    await expect(description).toContainText('Ember');

    await setValue(page.locator('[data-control="canvasWidth"]'), '640');

    await expect(selected).toHaveValue('Ember');
    await expect(description).toContainText('Ember');
    expect(await viewBox(page)).toContain('645');
  });
});

test.describe('fixed scene seed (CX-013)', () => {
  test('does not surface a seed control, action, or telemetry value', async ({ page }) => {
    await expect(page.locator('[data-control="seed"]')).toHaveCount(0);
    await expect(page.locator('[data-action="new-seed"]')).toHaveCount(0);
    await expect(page.locator('[data-role="current-seed"]')).toHaveCount(0);
  });

  test('renders byte-identical scenes across fresh application loads', async ({ page }) => {
    const first = await page.locator('#preview').innerHTML();
    const secondPage = await page.context().newPage();

    try {
      await secondPage.goto('/');
      await expect(secondPage.locator('#preview svg')).toBeVisible();
      expect(await secondPage.locator('#preview').innerHTML()).toBe(first);
    } finally {
      await secondPage.close();
    }
  });

  test('does not draw browser entropy to choose the application seed', async () => {
    const mainSource = await readFile('ts/app/main.ts', 'utf8');

    expect(mainSource).not.toContain('crypto.getRandomValues');
    expect(mainSource).not.toContain('Math.random');
  });
});

test.describe('generator-owned values (CTL-009)', () => {
  test('does not expose controls for generator-owned randomness', async ({ page }) => {
    // Ring and asteroid-belt magnitude parameters are now authored (CTL-009
    // modified). These remaining values stay seed-derived. Test both the
    // machine-readable hook and the visible labels so a future control cannot
    // evade the contract merely by choosing a new hook.
    const forbiddenControls = [
      'planetPeriod',
      'starCount',
      'starPosition',
      'cometCount',
      'cometPath',
      'ringColor',
      'surfaceDetail',
      'asteroidPosition',
      'asteroidRotation',
    ];

    for (const control of forbiddenControls) {
      await expect(page.locator(`[data-control="${control}"]`)).toHaveCount(0);
    }

    const labels = await page.locator('#controls label').allTextContents();

    expect(labels.join('\n')).not.toMatch(
      /orbital period|star (count|position)|comet (count|path)|ring colou?r|surface detail/i,
    );
  });

  test('keeps generator-owned values stable when a user parameter changes', async ({ page }) => {
    // Generator-owned values have no control and the app holds a fixed seed.
    // Read them from the rendered scene rather than comparing whole markup,
    // which must change with the edited planet size.
    const ambientFingerprint = async (): Promise<string> =>
      page.locator('#preview').evaluate((node) => {
        const roles = ['star', 'asteroid', 'comet', 'ring'];
        return roles
          .map((role) => {
            const elements = [...node.querySelectorAll(`[data-role^="${role}"]`)];
            return `${role}:${elements.length}:${elements
              .slice(0, 5)
              .map((element) => element.getAttribute('transform') ?? element.getAttribute('d') ?? '')
              .join(',')}`;
          })
          .join('|');
      });

    const before = await ambientFingerprint();

    // Control: the fingerprint must actually observe something.
    expect(before).not.toBe('star:0:|asteroid:0:|comet:0:|ring:0:');

    const dialog = await openPlanetDialog(page, 0);
    const planetSize = dialog.locator('[data-control="planetSize"]');
    const sizeBefore = await planetSize.inputValue();

    await setValue(planetSize, '30');

    await expect(planetSize).not.toHaveValue(sizeBefore);
    expect(await ambientFingerprint()).toBe(before);
  });
});

test.describe('SVG download (EXP-001, EXP-002)', () => {
  test('only exposes SVG as a downloadable format', async ({ page }) => {
    await expect(page.locator('[data-action="download-svg"]')).toBeVisible();
    await expect(page.locator('[data-action="download-wallpaper"]')).toHaveCount(0);
    await expect(page.locator('[data-role="wallpaper-preset"]')).toHaveCount(0);
    await expect(page.locator('[data-action="show-wallpaper-guidance"]')).toHaveCount(0);
    await expect(page.locator('[data-role="wallpaper-status"]')).toHaveCount(0);
    await expect(page.locator('[data-role="wallpaper-progress"]')).toHaveCount(0);
  });

  test('downloads the currently previewed scene repeatedly as SVG', async ({ page }) => {
    const preview = page.locator('#preview');
    const downloadButton = page.locator('[data-action="download-svg"]');

    await expect(downloadButton).toBeVisible();

    const firstDownload = page.waitForEvent('download');
    await downloadButton.click();
    const first = await firstDownload;

    const secondDownload = page.waitForEvent('download');
    await downloadButton.click();
    const second = await secondDownload;

    expect(first.suggestedFilename()).toBe('solarsys-20260826.svg');
    expect(second.suggestedFilename()).toBe('solarsys-20260826.svg');
    const [firstBytes, secondBytes] = await Promise.all([
      downloadedBytes(first),
      downloadedBytes(second),
    ]);

    expect(firstBytes).toEqual(secondBytes);
    expect(firstBytes.toString('utf8')).toContain('<svg');
    await expect(preview.locator('svg')).toBeVisible();
  });
});

test.describe('static client-side operation (QLT-008)', () => {
  test('generates, previews, and downloads without generation or export requests', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));

    await setValue(page.locator('[data-control="canvasWidth"]'), '640');
    await expect(page.locator('#preview svg')).toHaveAttribute('viewBox', /645/);

    const download = page.waitForEvent('download');
    await page.locator('[data-action="download-svg"]').click();
    await expect((await download).failure()).resolves.toBeNull();

    expect(requests).toEqual([]);
  });
});

test.describe('invalid input (CTL-007)', () => {
  test('reports the rejection and keeps the previous scene', async ({ page }) => {
    const before = await page.locator('#preview').innerHTML();

    await setValue(page.locator('[data-control="canvasWidth"]'), '5');

    await expect(page.locator('[data-role="errors"] li')).toHaveCount(1);
    expect(await page.locator('#preview').innerHTML()).toBe(before);
  });

  test('does not restart the animation when a submission is rejected', async ({ page }) => {
    // Comparing markup cannot catch this: re-writing identical innerHTML
    // yields an identical string while resetting every SMIL timeline to zero.
    // Position is the wrong probe — an orbit is a closed loop, so the planet
    // periodically returns to any chosen reference point. The SVG timeline is
    // measured instead, which is monotonic and unambiguous.
    const elapsed = () =>
      page.locator('#preview svg').evaluate((node) =>
        (node as SVGSVGElement).getCurrentTime(),
      );

    await page.waitForTimeout(2_000);
    const before = await elapsed();

    // Control: a frozen or absent timeline would make the check below vacuous.
    expect(before).toBeGreaterThan(1);

    await setValue(page.locator('[data-control="canvasWidth"]'), '5');
    await expect(page.locator('[data-role="errors"] li')).toHaveCount(1);

    // A rewritten preview starts a fresh timeline at zero.
    expect(await elapsed()).toBeGreaterThanOrEqual(before);
  });

  test('names the control and its range', async ({ page }) => {
    await setValue(page.locator('[data-control="canvasWidth"]'), '5');

    const message = await page.locator('[data-role="errors"] li').first().textContent();

    expect(message).toContain('Canvas width');
    expect(message).toContain('100');
    expect(message).toContain('1500');
  });

  test('recovers once the value is valid again', async ({ page }) => {
    const control = page.locator('[data-control="canvasWidth"]');

    await setValue(control, '5');
    await expect(page.locator('[data-role="errors"] li')).toHaveCount(1);

    await setValue(control, '500');
    await expect(page.locator('[data-role="errors"] li')).toHaveCount(0);
    expect(await viewBox(page)).toContain('505');
  });
});
