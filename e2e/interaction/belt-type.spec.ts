import { expect, test } from '@playwright/test';

/**
 * Task 5.5 (CTL-012): belt type validation at the UI boundary.
 *
 * The belt type select sources its options from `BELT_TYPES`, so an
 * unrecognised value can only arrive through direct DOM manipulation. It must
 * still be rejected by the validator: an inline error is shown and the
 * displayed scene is left exactly as it was.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#preview svg')).toBeVisible();
});

test('an unrecognised belt type shows an inline error and keeps the scene', async ({ page }) => {
  // Reveal the belt detail group so the type select is reachable.
  await page.locator('[data-role="asteroid-belt-group"] .belt-chevron').click();

  const before = await page.locator('#preview').innerHTML();

  // Force an unrecognised value into the select and commit it as an edit.
  await page.locator('[data-control="beltType"]').evaluate((select) => {
    const element = select as HTMLSelectElement;
    element.value = '';
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await expect(page.locator('[data-role="errors"] li')).toContainText('Belt type');
  await expect(page.locator('[data-control="beltType"]')).toHaveAttribute('aria-invalid', 'true');
  expect(await page.locator('#preview').innerHTML()).toBe(before);
});
