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
const DESKTOP_FORM_CEILING = 620;

/** CD-001: bounded narrow scroll, down from a measured 2336px. */
const MOBILE_DOCUMENT_CEILING = 1400;

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
      documentScrollHeight: document.documentElement.scrollHeight,
      emptyErrorHeight,
    };
  });
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
    // editable while the budget holds. Meeting the ceiling by dropping a
    // control is not an acceptable outcome.
    const required = [
      'canvasWidth',
      'canvasHeight',
      'seed',
      'palette',
      'planetSize',
      'planetDistance',
      'moonEnabled',
    ];

    for (const control of required) {
      const first = page.locator(`#controls [data-control="${control}"]`).first();

      await expect(first).toBeAttached();
      await expect(first).toBeEditable();
    }

    const measured = await measureSurface(page);

    expect(measured.formHeight).toBeLessThanOrEqual(DESKTOP_FORM_CEILING);
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
  test('moon controls occupy fewer rows than one row per control', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/');
    await page.waitForSelector('#controls [data-control]');

    // Planet 2 carries a moon in the default scene. Expand it if collapsed.
    const group = page.locator('[data-planet="1"]');
    const isOpen = await group.evaluate((node) => node.hasAttribute('open'));

    if (!isOpen) {
      await group.locator('[data-action="toggle-planet"]').click();
    }

    // Count DISTINCT vertical bands occupied by the three moon controls. Three
    // controls sharing two bands is compact; three controls in three bands is
    // the stacked layout this change retires.
    const bands = await group.evaluate((node) => {
      const controls = ['moonSize', 'moonDistance', 'moonPeriod']
        .map((control) => node.querySelector<HTMLElement>(`[data-control="${control}"]`))
        .filter((element): element is HTMLElement => element !== null);

      const tops = controls.map((element) => Math.round(element.getBoundingClientRect().top));

      return new Set(tops).size;
    });

    expect(bands).toBeGreaterThan(0);
    expect(bands).toBeLessThan(3);
  });
});
