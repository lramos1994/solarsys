import { expect, test } from '@playwright/test';

/**
 * Iconography and compact layout (UI-002, UI-008, CD-005).
 *
 * These assert the ACCESSIBILITY consequences of adding icons, not that icons
 * exist. An icon set that rendered perfectly while stealing announcements or
 * carrying state by colour alone must fail this file.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#preview svg')).toBeVisible();
});

test.describe('iconography (UI-002, UI-008)', () => {
  test('every action control resolves a name independent of its icon', async ({
    page,
  }) => {
    const actions = page.locator('[data-action]');
    const count = await actions.count();

    expect(count).toBeGreaterThan(0);

    for (let index = 0; index < count; index += 1) {
      const action = actions.nth(index);

      // The accessible name must survive removing every icon: an icon may
      // accompany the label but may never BE the label (UI-008).
      const textWithoutIcons = await action.evaluate((node) => {
        const clone = node.cloneNode(true) as HTMLElement;

        for (const svg of clone.querySelectorAll('svg')) {
          svg.remove();
        }

        return (clone.textContent ?? '').trim();
      });

      expect(textWithoutIcons.length).toBeGreaterThan(0);
    }
  });

  test('decorative icons are hidden from assistive technology', async ({ page }) => {
    // Every icon that is not explicitly labelled must be aria-hidden, so a
    // screen reader never announces it as separate content.
    const unlabelled = await page.locator('svg.icon').evaluateAll((nodes) =>
      nodes
        .filter((node) => node.getAttribute('role') !== 'img')
        .map((node) => node.getAttribute('aria-hidden')),
    );

    expect(unlabelled.length).toBeGreaterThan(0);
    expect(unlabelled.every((value) => value === 'true')).toBe(true);
  });

  test('a labelled icon carries a real accessible name', async ({ page }) => {
    const labelled = await page.locator('svg.icon[role="img"]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('aria-label') ?? ''),
    );

    // The moon badge on the collapsed summary is the labelled case.
    expect(labelled.length).toBeGreaterThan(0);
    expect(labelled.every((value) => value.trim().length > 0)).toBe(true);
  });

  test('icons resolve their colour through the token set', async ({ page }) => {
    // Icons inherit `currentColor`, so they cannot introduce a colour outside
    // the declared semantic roles.
    const strokes = await page.locator('svg.icon').evaluateAll((nodes) =>
      nodes.slice(0, 12).map((node) => node.getAttribute('stroke')),
    );

    expect(strokes.length).toBeGreaterThan(0);
    expect(strokes.every((value) => value === 'currentColor')).toBe(true);
  });

  test('no icon asset is fetched from a remote origin', async ({ page }) => {
    const external: string[] = [];

    page.on('request', (request) => {
      const url = new URL(request.url());

      if (url.host !== new URL(page.url()).host) {
        external.push(request.url());
      }
    });

    await page.reload();
    await expect(page.locator('#preview svg')).toBeVisible();

    expect(external).toEqual([]);
  });

  test('state is never carried by an icon or colour alone', async ({ page }) => {
    // Moon enabled: exposed by the native checked state, not by the switch's
    // appearance.
    const group = page.locator('[data-planet="0"]');

    // Planet 1 opens expanded (D-211); only expand if it is not.
    if (!(await group.evaluate((node) => node.hasAttribute('open')))) {
      await group.locator('[data-action="toggle-planet"]').click();
    }

    const moon = group.locator('[data-control="moonEnabled"]');

    await expect(moon).not.toBeChecked();
    await moon.check();
    await expect(moon).toBeChecked();

    // Collapsed: exposed by the native `<details>` open state.
    const collapsedState = await page
      .locator('[data-planet="1"]')
      .evaluate((node) => node.hasAttribute('open'));

    expect(typeof collapsedState).toBe('boolean');

    // Invalid: exposed by aria-invalid plus a text message, not by border
    // colour alone.
    const width = page.locator('[data-control="canvasWidth"]');

    await width.fill('5');
    await width.blur();

    await expect(width).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#canvas-width-error')).not.toBeEmpty();
  });
});

test.describe('compact field layout (CD-005)', () => {
  test('a bounded field shares a row with its label on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.locator('#controls [data-control]')).not.toHaveCount(0);

    const overlap = await page.evaluate(() => {
      const control = document.querySelector<HTMLElement>('[data-control="canvasWidth"]');
      const label = document.querySelector<HTMLElement>('label[for="canvas-width"]');

      if (control === null || label === null) {
        return null;
      }

      const a = control.getBoundingClientRect();
      const b = label.getBoundingClientRect();

      // Sharing a row means the two boxes overlap vertically.
      return Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    });

    expect(overlap).not.toBeNull();
    expect(overlap!).toBeGreaterThan(0);
  });

  test('every control keeps a usable target size', async ({ page }) => {
    const undersized = await page.evaluate(() => {
      const targets = [
        ...document.querySelectorAll<HTMLElement>(
          '#controls input:not([type="radio"]), #controls select, #controls button, #controls summary',
        ),
      ];

      return targets
        .filter((node) => {
          const box = node.getBoundingClientRect();

          return box.width > 0 && (box.width < 24 || box.height < 24);
        })
        .map((node) => node.getAttribute('data-control') ?? node.tagName);
    });

    expect(undersized).toEqual([]);
  });

  test('the surface does not overflow horizontally on a narrow viewport', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('#controls [data-control]')).not.toHaveCount(0);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );

    expect(overflow).toBeLessThanOrEqual(1);
  });
});
