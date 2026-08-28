import { expect, test } from '@playwright/test';

/**
 * Task 8.1 (CX-020, UI-012): native `<dialog>` support across the engine
 * matrix.
 *
 * The planet editor is a real HTML `<dialog>` opened with `showModal()` —
 * modality, Escape handling, and inertness come from the platform (design §1).
 * This suite proves the platform contract holds in every engine the browser
 * matrix exercises: the dialog opens, holds focus, and closes on Escape with
 * focus returned to the opener. It deliberately runs on Chromium, Firefox,
 * and WebKit alike (no project skip), because a `showModal()` that works in
 * one engine but not another is exactly the regression the browser gate
 * exists to catch.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#preview svg')).toBeVisible();
});

test('the planet dialog opens with showModal, traps focus, and closes on Escape', async ({
  page,
}, testInfo) => {
  const opener = page.locator(
    '#controls [data-planet="0"] [data-action="open-planet-dialog"]',
  );

  await opener.click();

  const dialog = page.locator('[data-role="planet-dialog"][data-index="0"]');
  await expect(dialog).toBeVisible();

  // showModal() modality: the platform marks the dialog open and moves focus
  // inside it. Both are engine guarantees, not application conveniences.
  const open = await dialog.evaluate((node) => (node as HTMLDialogElement).open);
  expect(open).toBe(true);

  const focusInside = await dialog.evaluate((node) =>
    node.contains(document.activeElement),
  );
  expect(focusInside).toBe(true);

  testInfo.annotations.push({
    type: 'dialog engine',
    description: `${testInfo.project.name}: showModal open=${open} focusInside=${focusInside}`,
  });

  // Escape is a native showModal() behaviour in every engine.
  await page.keyboard.press('Escape');

  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});
