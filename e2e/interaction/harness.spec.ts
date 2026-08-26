import { expect, test } from '@playwright/test';

// Interaction layer harness check (task 1.3): Playwright can drive the page and
// observe DOM state. The control-driving suites are tasks 3.5 through 3.11.
test('page state is observable', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#app')).toHaveText(/SolarSys/);
});
