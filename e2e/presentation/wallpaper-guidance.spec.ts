import { expect, test } from '@playwright/test';

/**
 * Task 5.3 (WAL-009): the wallpaper export action makes guidance available
 * describing how to apply the exported video on Android and on iOS, and states
 * the iOS limitation honestly — iOS does not accept MP4 as a wallpaper and
 * requires conversion to a Live Photo through a separate application.
 *
 * The guidance is a native dialog reached from a "How to apply" action beside
 * the export action. A dialog is out-of-flow, so the guidance costs nothing
 * against the measured control-deck vertical budget (CD-001) while remaining
 * reachable from the action. This runs on chromium and both mobile projects.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#preview svg')).toBeVisible();
});

/** Open the guidance dialog from its action button. */
async function openGuidance(page: import('@playwright/test').Page) {
  await page.locator('[data-action="show-wallpaper-guidance"]').click();
  await expect(page.locator('[data-role="wallpaper-guidance-dialog"]')).toBeVisible();
}

test('guidance is reachable from the export action', async ({ page }) => {
  // The trigger sits in the same actions region as the export action.
  const trigger = page.locator('[data-action="show-wallpaper-guidance"]');

  await expect(trigger).toBeAttached();
  await expect(trigger).toContainText(/apply/i);

  await openGuidance(page);

  const dialog = page.locator('[data-role="wallpaper-guidance-dialog"]');
  await expect(dialog).toContainText('Android');
  await expect(dialog).toContainText('iOS');
});

test('the iOS limitation is stated honestly, not promised away', async ({ page }) => {
  await openGuidance(page);

  const dialog = page.locator('[data-role="wallpaper-guidance-dialog"]');

  // Android: the MP4 applies directly through a live-wallpaper app.
  await expect(dialog).toContainText(/live-wallpaper app/i);

  // iOS: the export is NOT directly usable — it must be converted to a Live
  // Photo (paired JPEG + MOV with a matching Content Identifier) by a separate
  // application. The wording must name the limitation, not promise delivery.
  await expect(dialog).toContainText(/does not accept MP4/i);
  await expect(dialog).toContainText(/Live Photo/i);
  await expect(dialog).toContainText(/Content Identifier/i);
  await expect(dialog).toContainText(/separate app/i);
});
