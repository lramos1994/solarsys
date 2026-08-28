import { expect, test } from '@playwright/test';

/**
 * Density budget (CD-001, CD-002, CD-006, CX-012, UI-008).
 *
 * Every assertion here measures RENDERED GEOMETRY. None of them inspects a
 * class name, an attribute, or markup shape: CD-001's third scenario makes that
 * explicit, for the same reason the reduced-motion suite measures displacement
 * rather than asserting SMIL is present. A surface that declared every density
 * class and still rendered 1592px tall must fail this file.
 *
 * The baseline these ceilings replace was measured at commit 36208bb and is
 * recorded in the change's `evidence/baseline-measurements.json`:
 * form 1592px, pane scroll 1800px, mobile document scroll 2336px, and 187px of
 * error slot height reserved while holding no text.
 */

/** CD-001: the default three-planet scene must fit the desktop control pane. */
const DESKTOP_FORM_CEILING = 560;

/** CD-001: bounded narrow scroll, down from a measured 2336px. */
const MOBILE_DOCUMENT_CEILING = 1250;

/** CD-002: a collapsed planet group is a summary row, not a panel. */
const COLLAPSED_GROUP_CEILING = 64;

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

async function measureSurface(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const pane = document.querySelector<HTMLElement>('.controls-pane');
    const form = document.querySelector<HTMLElement>('#controls');

    if (pane === null || form === null) {
      throw new Error('Control surface is not present.');
    }

    const emptyErrorHeight = [...document.querySelectorAll<HTMLElement>('.field-error')]
      .filter((slot) => slot.textContent === '')
      .reduce((total, slot) => total + slot.getBoundingClientRect().height, 0);

    return {
      formHeight: form.getBoundingClientRect().height,
      paneScrollHeight: pane.scrollHeight,
      paneClientHeight: pane.clientHeight,
      paneWidth: pane.getBoundingClientRect().width,
      documentScrollHeight: document.documentElement.scrollHeight,
      emptyErrorHeight,
    };
  });
}

/** Open a planet's editing dialog (CX-020), expanding the instrument first. */
async function openPlanetDialog(page: import('@playwright/test').Page, index: number) {
  const group = page.locator(`#controls [data-planet="${index}"]`);

  if (!(await group.evaluate((node) => node.hasAttribute('open')))) {
    await group.locator('[data-action="toggle-planet"]').click();
  }

  await group.locator('[data-action="open-planet-dialog"]').click();
  const dialog = page.locator(`[data-role="planet-dialog"][data-index="${index}"]`);
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('control deck density budget (CD-001)', () => {
  test('the default scene fits the desktop control pane without internal scroll', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/');
    await page.waitForSelector('#controls [data-control]');

    const measured = await measureSurface(page);

    expect(measured.formHeight).toBeLessThanOrEqual(DESKTOP_FORM_CEILING);
    // An overflowing pane scrolls internally; scrollHeight exceeding clientHeight
    // is the measured definition of that, independent of any CSS declaration.
    expect(measured.paneScrollHeight).toBeLessThanOrEqual(measured.paneClientHeight + 1);
  });

  test('the default scene stays within a bounded narrow scroll', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/');
    await page.waitForSelector('#controls [data-control]');

    const measured = await measureSurface(page);

    expect(measured.documentScrollHeight).toBeLessThanOrEqual(MOBILE_DOCUMENT_CEILING);
  });

  test('density never suppresses a control', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/');
    await page.waitForSelector('#controls [data-control]');

    // Every parameter of the default scene must still be reachable and
    // editable while the budget holds — deck controls directly, and the
    // dialog-relocated size/moon controls through their dialog. Meeting the
    // ceiling by dropping a control is not an acceptable outcome.
    const deckRequired = ['canvasWidth', 'canvasHeight', 'palette', 'planetDistance'];

    for (const control of deckRequired) {
      const first = page.locator(`#controls [data-control="${control}"]`).first();

      await expect(first).toBeAttached();
      await expect(first).toBeEditable();
    }

    const dialog = await openPlanetDialog(page, 0);

    for (const control of ['planetSize', 'moonEnabled']) {
      await expect(dialog.locator(`[data-control="${control}"]`)).toBeEditable();
    }

    const measured = await measureSurface(page);

    expect(measured.formHeight).toBeLessThanOrEqual(DESKTOP_FORM_CEILING);
  });

  test('the orbital distance control stays in the deck', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/');
    await page.waitForSelector('#controls [data-control]');

    // CD-008: orbital distance is deliberately NOT relocated (design §5), so it
    // remains measurable in the deck and contributes height there.
    const orbit = page.locator('#controls [data-control="planetDistance"]').first();

    await expect(orbit).toBeVisible();
    const box = await orbit.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThan(0);

    // And it is absent from the dialog.
    const dialog = await openPlanetDialog(page, 0);
    await expect(dialog.locator('[data-control="planetDistance"]')).toHaveCount(0);
  });
});

test.describe('wider control deck (CD-005)', () => {
  test('uses the allocated desktop column without taking preview width', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/');
    await page.waitForSelector('#controls [data-control]');

    const measured = await measureSurface(page);
    const preview = await page.locator('.preview-pane').boundingBox();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

    expect(measured.paneWidth).toBeGreaterThanOrEqual(420);
    expect(measured.paneWidth).toBeLessThanOrEqual(480);
    expect(preview?.width).toBeGreaterThan(0);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('collapsed instrument groups (CD-002)', () => {
  test('a collapsed planet group measures no more than a summary row', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/');
    await page.waitForSelector('#controls [data-control]');

    const group = page.locator('[data-planet="0"]');
    const disclosure = group.locator('[data-action="toggle-planet"]');

    await expect(disclosure).toBeVisible();

    // Collapse if the group is currently open, so the test does not depend on
    // which state the application chooses to start in.
    const wasOpen = await group.evaluate((node) => node.hasAttribute('open'));

    if (wasOpen) {
      await disclosure.click();
    }

    const collapsedHeight = await group.evaluate(
      (node) => node.getBoundingClientRect().height,
    );

    expect(collapsedHeight).toBeLessThanOrEqual(COLLAPSED_GROUP_CEILING);
  });
});

test.describe('error space is allocated on demand (CD-006)', () => {
  test('empty error slots contribute no height in the initial state', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/');
    await page.waitForSelector('#controls [data-control]');

    const measured = await measureSurface(page);

    expect(measured.emptyErrorHeight).toBe(0);
  });
});

test.describe('the moon sub-group is compact (CX-012)', () => {
  test('moon controls occupy no more than one row per control with visible sliders', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/');
    await page.waitForSelector('#controls [data-control]');

    // Planet 2 carries a moon in the default scene; its controls now live in
    // the planet dialog (CX-020).
    const dialog = await openPlanetDialog(page, 1);

    // Count distinct bands and inspect the actual range boxes. The budget must
    // not be met by putting sliders in the DOM and hiding them with CSS.
    const measured = await dialog.evaluate((node) => {
      const controls = ['moonSize', 'moonDistance', 'moonPeriod']
        .map((control) => node.querySelector<HTMLElement>(`[data-control="${control}"]`))
        .filter((element): element is HTMLElement => element !== null);

      const tops = controls.map((element) => Math.round(element.getBoundingClientRect().top));
      const ranges = controls.map((control) => {
        const id = control.id;
        const range = node.querySelector<HTMLInputElement>(`[data-range-for="${id}"]`);
        const rect = range?.getBoundingClientRect();

        return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
      });

      return { bands: new Set(tops).size, ranges };
    });

    expect(measured.bands).toBeGreaterThan(0);
    expect(measured.bands).toBeLessThanOrEqual(3);
    for (const range of measured.ranges) {
      expect(range.width).toBeGreaterThan(0);
      expect(range.height).toBeGreaterThanOrEqual(24);
    }
  });
});
