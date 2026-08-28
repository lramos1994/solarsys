import { expect, test, type Page } from '@playwright/test';

/**
 * Task 5.1 (CX-020): per-planet dialog lifecycle.
 *
 * The planet instrument hosts a native `<dialog>` editor for size, moon and
 * ring (P4 markup). This suite asserts the APPLICATION lifecycle that owns it
 * (P5): opening moves focus inside, Escape and the close control both close
 * and return focus to the opener, focus is trapped while open, orbital
 * distance stays in the deck, edits drive the scene and the isolated preview
 * together, a rejected edit retains the last valid scene with an associated
 * inline error, and the open state survives a form rebuild and remaps on
 * planet removal.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#preview svg')).toBeVisible();
});

/** The dialog for a planet index, keyed on its `data-index` attribute. */
function dialogFor(page: Page, index: number) {
  return page.locator(`[data-role="planet-dialog"][data-index="${index}"]`);
}

/** The deck button that opens a planet's dialog. */
function openButtonFor(page: Page, index: number) {
  return page.locator(`#controls [data-planet="${index}"] [data-action="open-planet-dialog"]`);
}

test.describe('planet dialog lifecycle (CX-020)', () => {
  test('opening a dialog moves focus inside it and renders an isolated preview', async ({ page }) => {
    await openButtonFor(page, 0).click();

    const dialog = dialogFor(page, 0);
    await expect(dialog).toBeVisible();

    const focusInside = await dialog.evaluate((node) =>
      node.contains(document.activeElement),
    );
    expect(focusInside).toBe(true);

    await expect(dialog.locator('[data-role="planet-preview"] svg')).toHaveCount(1);
  });

  test('Escape closes the dialog and returns focus to the opener', async ({ page }) => {
    const opener = openButtonFor(page, 0);
    await opener.click();

    const dialog = dialogFor(page, 0);
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('the close control closes the dialog and returns focus to the opener', async ({ page }) => {
    const opener = openButtonFor(page, 0);
    await opener.click();

    const dialog = dialogFor(page, 0);
    await expect(dialog).toBeVisible();

    await dialog.locator('[data-action="close-planet-dialog"]').click();

    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('focus is trapped inside the dialog under repeated Tab', async ({ page }) => {
    await openButtonFor(page, 0).click();
    const dialog = dialogFor(page, 0);
    await expect(dialog).toBeVisible();

    for (let step = 0; step < 24; step += 1) {
      await page.keyboard.press('Tab');
    }

    const focusInside = await dialog.evaluate((node) =>
      node.contains(document.activeElement),
    );
    expect(focusInside).toBe(true);
  });

  test('keeps orbital distance in the deck, never in the dialog', async ({ page }) => {
    const dialog = dialogFor(page, 0);

    await expect(dialog.locator('[data-control="planetDistance"]')).toHaveCount(0);
    await expect(dialog.locator('[data-orbit-mode]')).toHaveCount(0);
    await expect(
      page.locator('#controls [data-planet="0"] [data-control="planetDistance"]'),
    ).toHaveCount(1);
  });

  test('editing in the dialog updates both the scene and the isolated preview', async ({ page }) => {
    await openButtonFor(page, 0).click();
    const dialog = dialogFor(page, 0);
    await expect(dialog).toBeVisible();

    const sceneBody = page.locator('#preview [data-role="planet-body"]').first();
    const previewBody = dialog.locator('[data-role="planet-preview"] [data-role="planet-body"]').first();
    const before = await sceneBody.getAttribute('r');

    const sizeInput = dialog.locator('[data-control="planetSize"]');
    await sizeInput.fill('30');
    await sizeInput.blur();

    await expect(sceneBody).not.toHaveAttribute('r', before ?? '');
    await expect(sceneBody).toHaveAttribute('r', '30');
    await expect(previewBody).toHaveAttribute('r', '30');
  });

  test('a rejected edit keeps the last valid scene and associates an inline error', async ({ page }) => {
    await openButtonFor(page, 0).click();
    const dialog = dialogFor(page, 0);
    await expect(dialog).toBeVisible();

    const before = await page.locator('#preview').innerHTML();
    const sizeInput = dialog.locator('[data-control="planetSize"]');

    await sizeInput.fill('999');
    await sizeInput.blur();

    await expect(page.locator('[data-role="errors"] li')).not.toHaveCount(0);
    expect(await page.locator('#preview').innerHTML()).toBe(before);
    await expect(sizeInput).toHaveAttribute('aria-invalid', 'true');
    await expect(sizeInput).toHaveAttribute('aria-describedby', /.+/);
  });

  test('the dialog stays open for the same planet across a form rebuild', async ({ page }) => {
    await openButtonFor(page, 0).click();
    const dialog = dialogFor(page, 0);
    await expect(dialog).toBeVisible();

    // Toggling the moon checkbox inside the dialog rebuilds the form wholesale.
    await dialog.locator('[data-control="moonEnabled"]').check();

    // The rebuild destroys and recreates the dialog; the app must re-open it.
    await expect(dialogFor(page, 0)).toBeVisible();
    const stillOpen = await dialogFor(page, 0).evaluate((node) => (node as HTMLDialogElement).open);
    expect(stillOpen).toBe(true);

    // The recorded index still targets the same planet: planet 0's size edit
    // remains inside the recreated dialog, not a shifted one.
    await expect(dialogFor(page, 0).locator('[data-control="planetSize"]')).toHaveValue('12');
  });

  test('removing the open planet closes its dialog and leaves no dangling state', async ({ page }) => {
    await openButtonFor(page, 0).click();
    const dialog = dialogFor(page, 0);
    await expect(dialog).toBeVisible();

    await dialog.locator('[data-action="remove-planet"]').click();

    // The removed planet's dialog is gone and no dialog is left open.
    await expect(page.locator('#controls [data-planet]')).toHaveCount(2);
    await expect(page.locator('[data-role="planet-dialog"]')).toHaveCount(2);
    const anyOpen = await page.evaluate(() =>
      [...document.querySelectorAll('[data-role="planet-dialog"]')].some(
        (node) => (node as HTMLDialogElement).open,
      ),
    );
    expect(anyOpen).toBe(false);
  });
});
