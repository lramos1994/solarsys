import { expect, test } from '@playwright/test';

// Interaction layer harness check (task 1.3): Playwright can drive the real
// application and observe its control surface and generated preview.
test('page state is observable', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#controls')).toBeVisible();
  await expect(page.locator('#preview svg')).toBeVisible();
});
