import { expect, test, type Page } from '@playwright/test';

/**
 * CX-017: control edits are debounced.
 *
 * A continuous manipulation (a range drag) emits many `input` events in a
 * burst; the debounce coalesces them into one regeneration. This is measured
 * by counting child-list mutations on `#preview`: each regeneration replaces
 * the single `<svg>` child, producing one child-list record. The un-debounced
 * path produces one record per event (30 for the burst below).
 */

interface RegenProbe {
  __regenCount: number;
  __observer?: MutationObserver;
}

async function regenCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as RegenProbe).__regenCount ?? 0);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#preview svg')).toBeVisible();
});

/** Open planet 0's editing dialog, where the size range now lives (CX-020). */
async function openSizeDialog(page: Page): Promise<void> {
  const group = page.locator('#controls [data-planet="0"]');

  if (!(await group.evaluate((node) => node.hasAttribute('open')))) {
    await group.locator('[data-action="toggle-planet"]').click();
  }

  await group.locator('[data-action="open-planet-dialog"]').click();
  await expect(page.locator('[data-role="planet-dialog"][data-index="0"]')).toBeVisible();
}

test.describe('debounced regeneration (CX-017)', () => {
  test('a burst of range edits coalesces into a single regeneration', async ({ page }) => {
    // The planet-size control moved into the dialog (CX-020); open it so the
    // range is the visible control a real drag would operate.
    await openSizeDialog(page);

    // Observe child-list changes on #preview from here on; the initial render
    // has already completed.
    await page.evaluate(() => {
      const probe = window as unknown as RegenProbe;
      probe.__regenCount = 0;

      const preview = document.querySelector('#preview');
      probe.__observer = new MutationObserver((mutations) => {
        // Count RECORDS, not callback invocations: one observer callback can
        // deliver the whole batch of mutations for a burst.
        probe.__regenCount += mutations.length;
      });
      probe.__observer!.observe(preview!, { childList: true });
    });

    // A burst of synchronous `input` events on the planet-size range, as a
    // fast drag.
    await page.evaluate(() => {
      const range = document.querySelector<HTMLInputElement>(
        '#controls [data-range-for="planet-0-size"]',
      );

      // Planet size is 1..25 percent of the scene radius; a value outside the
      // range is clamped by the native range widget and would emit no change.
      for (let value = 1; value < 25; value += 1) {
        range!.value = String(value);
        range!.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    // The paired exact figure updates immediately, before the debounce fires.
    await expect(
      page.locator('[data-role="planet-dialog"][data-index="0"] [data-control="planetSize"]'),
    ).toHaveValue('24');

    // Let the debounce fire and settle.
    await page.waitForTimeout(400);

    // One regeneration replaces the single `<svg>` child, producing one
    // child-list record. A per-event regeneration would be 24 records here.
    expect(await regenCount(page)).toBeLessThanOrEqual(2);

    // The settled value applied to the preview.
    const body = page.locator('#preview [data-role="planet-body"]').first();
    // 24% of the 300-unit scene radius on the default 600x600 canvas.
    await expect(body).toHaveAttribute('r', '72');
  });
});
