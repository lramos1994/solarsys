import { expect, test } from '@playwright/test';

// Browser layer harness check (task 1.3): the static build is reachable and
// renders in each configured engine, with no application server involved
// (D-14, QLT-008). The real render/animate matrix is task 3.1 and 4.3.
test('static build renders', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.ok()).toBe(true);
  await expect(page.locator('#app')).toBeVisible();
});
