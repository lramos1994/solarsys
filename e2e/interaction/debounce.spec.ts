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

test.describe('debounced regeneration (CX-017)', () => {
  test('a burst of range edits coalesces into a single regeneration', async ({ page }) => {
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

    // 30 synchronous `input` events on the planet-size range, as a fast drag.
    await page.evaluate(() => {
      const range = document.querySelector<HTMLInputElement>(
        '#controls [data-range-for="planet-0-size"]',
      );

      for (let value = 10; value < 40; value += 1) {
        range!.value = String(value);
        range!.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    // The paired exact figure updates immediately, before the debounce fires.
    await expect(page.locator('[data-control="planetSize"]').first()).toHaveValue('39');

    // Let the debounce fire and settle.
    await page.waitForTimeout(400);

    // One regeneration replaces the single `<svg>` child, producing one
    // child-list record. A per-event regeneration would be 30 records here.
    expect(await regenCount(page)).toBeLessThanOrEqual(2);

    // The settled value applied to the preview.
    const body = page.locator('#preview [data-role="planet-body"]').first();
    await expect(body).toHaveAttribute('r', '39');
  });
});
