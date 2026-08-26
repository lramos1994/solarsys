import { expect, test, type Locator, type Page } from '@playwright/test';

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

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#preview svg')).toBeVisible();
});

test.describe('control surface', () => {
  test('presents controls for every in-scope parameter', async ({ page }) => {
    await expect(page.locator('[data-control="canvasWidth"]')).toBeVisible();
    await expect(page.locator('[data-control="canvasHeight"]')).toBeVisible();
    await expect(page.locator('[data-control="planetSize"]').first()).toBeVisible();
    await expect(page.locator('[data-control="planetDistance"]').first()).toBeVisible();
    await expect(page.locator('[data-control="moonEnabled"]').first()).toBeVisible();
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

    await setValue(page.locator('[data-control="planetSize"]').first(), '30');

    await expect(radius).not.toHaveAttribute('r', before ?? '');
    expect(Number(await radius.getAttribute('r'))).toBe(30);
  });
});

test.describe('orbital distance forms (CTL-002)', () => {
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
    await setValue(
      page.locator('[data-control="planetDistance"]').first(),
      '200,60,200,60',
    );

    const numbers =
      (await orbitPathData(page, 0)).match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
    const xs = numbers.filter((_, index) => index % 2 === 0);
    const ys = numbers.filter((_, index) => index % 2 === 1);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);

    // 400 wide against 120 tall: the asymmetry must survive into the path.
    expect(width).toBeCloseTo(400, 6);
    expect(height).toBeCloseTo(120, 6);
  });

  test('switching between the two forms updates the same orbit', async ({ page }) => {
    const control = page.locator('[data-control="planetDistance"]').first();

    await setValue(control, '150');
    const circular = await orbitPathData(page, 0);

    await setValue(control, '150,40,150,40');
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
    await expect(planets.nth(3).locator('[data-control="planetDistance"]')).toHaveValue('150');
  });

  test('removes the selected planet, its orbit, and its moon', async ({ page }) => {
    const planets = page.locator('#controls [data-planet]');

    await expect(planets).toHaveCount(3);
    await expect(page.locator('#preview [data-role="orbit"]')).toHaveCount(3);
    // Planet 2 is the default planet that has a moon.
    await expect(page.locator('#preview [data-role="moon"]')).toHaveCount(1);

    await planets.nth(1).locator('[data-action="remove-planet"]').click();

    await expect(planets).toHaveCount(2);
    await expect(page.locator('#preview [data-role="orbit"]')).toHaveCount(2);
    await expect(page.locator('#preview [data-role="moon"]')).toHaveCount(0);
  });

  test('keeps a valid ambient scene after removing the last planet', async ({ page }) => {
    const planets = page.locator('#controls [data-planet]');

    while ((await planets.count()) > 0) {
      await planets.first().locator('[data-action="remove-planet"]').click();
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
    const planet = page.locator('#controls [data-planet]').first();

    // Planet 1 starts with no moon, so moon-specific controls must not be
    // exposed until the feature is enabled.
    await expect(planet.locator('[data-control="moonSize"]')).toHaveCount(0);
    await expect(planet.locator('[data-control="moonDistance"]')).toHaveCount(0);
    await expect(planet.locator('[data-control="moonPeriod"]')).toHaveCount(0);
    await expect(page.locator('#preview [data-role="moon"]')).toHaveCount(1);

    await planet.locator('[data-control="moonEnabled"]').check();

    await expect(planet.locator('[data-control="moonSize"]')).toBeVisible();
    await expect(planet.locator('[data-control="moonDistance"]')).toBeVisible();
    await expect(planet.locator('[data-control="moonPeriod"]')).toHaveValue('15');
    await expect(page.locator('#preview [data-role="moon"]')).toHaveCount(2);
    await expect(
      page.locator('#preview [data-role="planet"].ss-animated').first()
        .locator(':scope > [data-role="moon"] > animateMotion'),
    ).toHaveAttribute('dur', '15s');
  });

  test('disabling a moon hides its controls and removes it from the preview', async ({ page }) => {
    const planet = page.locator('#controls [data-planet]').nth(1);

    // Planet 2 starts with the default moon enabled.
    await expect(planet.locator('[data-control="moonSize"]')).toBeVisible();
    await expect(planet.locator('[data-control="moonDistance"]')).toBeVisible();
    await expect(planet.locator('[data-control="moonPeriod"]')).toBeVisible();
    await expect(page.locator('#preview [data-role="moon"]')).toHaveCount(1);

    await planet.locator('[data-control="moonEnabled"]').uncheck();

    await expect(planet.locator('[data-control="moonSize"]')).toHaveCount(0);
    await expect(planet.locator('[data-control="moonDistance"]')).toHaveCount(0);
    await expect(planet.locator('[data-control="moonPeriod"]')).toHaveCount(0);
    await expect(page.locator('#preview [data-role="moon"]')).toHaveCount(0);
  });

  test('applies configured moon size, distance, and period to the preview', async ({ page }) => {
    const planet = page.locator('#controls [data-planet]').nth(1);
    const renderedPlanet = page.locator('#preview [data-role="planet"].ss-animated').nth(1);

    await setValue(planet.locator('[data-control="moonSize"]'), '8');
    await setValue(planet.locator('[data-control="moonDistance"]'), '40');
    await setValue(planet.locator('[data-control="moonPeriod"]'), '30');

    await expect(
      renderedPlanet.locator(':scope > [data-role="moon"] [data-role="moon-body"]'),
    ).toHaveAttribute('r', '8');
    await expect(renderedPlanet.locator(':scope > [data-role="moon-orbit"]'))
      .toHaveAttribute('d', /^M -40 0/);
    await expect(renderedPlanet.locator(':scope > [data-role="moon"] > animateMotion'))
      .toHaveAttribute('dur', '30s');
  });
});

test.describe('palette selection (CTL-005)', () => {
  test('offers Random plus the six preserved palettes, with Random selected by default', async ({ page }) => {
    const palette = page.locator('[data-control="palette"]');

    await expect(palette).toHaveValue('Random');
    await expect(palette.locator('option')).toHaveText([
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

  test('applies a selected named palette and retains it when another parameter changes', async ({ page }) => {
    const palette = page.locator('[data-control="palette"]');
    const description = page.locator('#preview desc');

    await palette.selectOption('Ember');

    await expect(palette).toHaveValue('Ember');
    await expect(description).toContainText('Ember');

    await setValue(page.locator('[data-control="canvasWidth"]'), '640');

    await expect(palette).toHaveValue('Ember');
    await expect(description).toContainText('Ember');
    expect(await viewBox(page)).toContain('645');
  });
});

test.describe('seed control (CTL-006)', () => {
  test('displays the seed that produced the current scene', async ({ page }) => {
    await expect(page.locator('[data-control="seed"]')).toHaveValue('20260826');
    await expect(page.locator('[data-role="current-seed"]')).toHaveText('20260826');
  });

  test('reproduces a scene when the same seed is entered again', async ({ page }) => {
    const seed = page.locator('[data-control="seed"]');

    await setValue(seed, '42');
    const expected = await page.locator('#preview').innerHTML();

    await setValue(seed, '43');
    await setValue(seed, '42');

    await expect(page.locator('[data-role="current-seed"]')).toHaveText('42');
    expect(await page.locator('#preview').innerHTML()).toBe(expected);
  });

  test('preserves the current seed when another parameter changes', async ({ page }) => {
    const seed = page.locator('[data-control="seed"]');

    await setValue(seed, '42');
    await setValue(page.locator('[data-control="canvasWidth"]'), '640');

    await expect(seed).toHaveValue('42');
    await expect(page.locator('[data-role="current-seed"]')).toHaveText('42');
  });

  test('generates and displays a different seed on request', async ({ page }) => {
    const seed = page.locator('[data-control="seed"]');
    const beforeSeed = await seed.inputValue();
    const beforeScene = await page.locator('#preview').innerHTML();

    await page.locator('[data-action="new-seed"]').click();

    const afterSeed = await seed.inputValue();

    expect(afterSeed).not.toBe(beforeSeed);
    await expect(page.locator('[data-role="current-seed"]')).toHaveText(afterSeed);
    expect(await page.locator('#preview').innerHTML()).not.toBe(beforeScene);
  });

  test('retains the displayed seed when a pending seed is invalid', async ({ page }) => {
    await setValue(page.locator('[data-control="seed"]'), '42');
    await setValue(page.locator('[data-control="seed"]'), 'not-a-seed');

    await expect(page.locator('[data-role="errors"] li')).toHaveCount(1);
    await expect(page.locator('[data-role="current-seed"]')).toHaveText('42');
  });
});

test.describe('invalid input (CTL-007)', () => {
  test('reports the rejection and keeps the previous scene', async ({ page }) => {
    const before = await page.locator('#preview').innerHTML();

    await setValue(page.locator('[data-control="canvasWidth"]'), 'abc');

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

    await setValue(page.locator('[data-control="canvasWidth"]'), 'abc');
    await expect(page.locator('[data-role="errors"] li')).toHaveCount(1);

    // A rewritten preview starts a fresh timeline at zero.
    expect(await elapsed()).toBeGreaterThanOrEqual(before);
  });

  test('names the control and its range', async ({ page }) => {
    await setValue(page.locator('[data-control="canvasWidth"]'), '5');

    const message = await page.locator('[data-role="errors"] li').first().textContent();

    expect(message).toContain('Canvas width');
    expect(message).toContain('100');
    expect(message).toContain('2000');
  });

  test('recovers once the value is valid again', async ({ page }) => {
    const control = page.locator('[data-control="canvasWidth"]');

    await setValue(control, 'abc');
    await expect(page.locator('[data-role="errors"] li')).toHaveCount(1);

    await setValue(control, '500');
    await expect(page.locator('[data-role="errors"] li')).toHaveCount(0);
    expect(await viewBox(page)).toContain('505');
  });
});
