import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Collapsible instruments and the new control affordances
 * (CD-002, CD-003, CD-004, CX-001, CX-003, CX-010, CX-012).
 *
 * These assert BEHAVIOUR, not markup shape: that a collapsed planet is still
 * generated, that a toggle changes nothing about the scene, that an error can
 * never hide inside a closed group, and that the paired controls submit the
 * user's raw value rather than a clamped one.
 */

/** BOUNDS as declared by `ts/app/validation.ts`, mirrored for assertions. */
const BOUNDS = {
  canvasWidth: { min: 100, max: 1500 },
  canvasHeight: { min: 100, max: 1500 },
  planetSize: { min: 1, max: 100 },
  moonSize: { min: 1, max: 40 },
  moonDistance: { min: 0, max: 1000 },
  moonPeriod: { min: 1, max: 120 },
} as const;

function group(page: Page, index: number): Locator {
  return page.locator(`#controls [data-planet="${index}"]`);
}

async function isOpen(target: Locator): Promise<boolean> {
  return target.evaluate((node) => node.hasAttribute('open'));
}

async function toggle(page: Page, index: number): Promise<void> {
  await group(page, index).locator('[data-action="toggle-planet"]').click();
}

async function expand(page: Page, index: number): Promise<void> {
  if (!(await isOpen(group(page, index)))) {
    await toggle(page, index);
  }
}

async function collapse(page: Page, index: number): Promise<void> {
  if (await isOpen(group(page, index))) {
    await toggle(page, index);
  }
}

/** The serialized preview, used to prove a gesture changed nothing. */
async function previewMarkup(page: Page): Promise<string> {
  return page.locator('#preview').innerHTML();
}

async function setValue(control: Locator, value: string): Promise<void> {
  await control.fill(value);
  await control.blur();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#preview svg')).toBeVisible();
});

test.describe('collapsible instruments (CD-002)', () => {
  test('opens with the first instrument expanded and the rest collapsed', async ({
    page,
  }) => {
    // D-211: the budget is met by USING the collapse mechanism by default,
    // while the first planet stays open so the surface explains itself.
    expect(await isOpen(group(page, 0))).toBe(true);
    expect(await isOpen(group(page, 1))).toBe(false);
    expect(await isOpen(group(page, 2))).toBe(false);
  });

  test('a disclosure toggles the group in both directions', async ({ page }) => {
    await collapse(page, 0);
    expect(await isOpen(group(page, 0))).toBe(false);

    await toggle(page, 0);
    expect(await isOpen(group(page, 0))).toBe(true);
  });

  test('the disclosure exposes its expanded state to assistive technology', async ({
    page,
  }) => {
    const summary = group(page, 0).locator('summary');

    // `<details>`/`<summary>` publishes `expanded` natively; the assertion
    // reads the accessibility tree rather than the `open` attribute so it
    // proves what a screen reader would actually be told.
    expect(await summary.evaluate((node) => node.matches('details[open] > summary'))).toBe(
      true,
    );

    await collapse(page, 0);

    expect(await summary.evaluate((node) => node.matches('details[open] > summary'))).toBe(
      false,
    );
  });

  test('the disclosure is operable from the keyboard alone', async ({ page }) => {
    const summary = group(page, 0).locator('summary');

    await summary.focus();
    await page.keyboard.press('Enter');

    expect(await isOpen(group(page, 0))).toBe(false);

    await page.keyboard.press('Enter');

    expect(await isOpen(group(page, 0))).toBe(true);
  });

  test('toggling a group changes neither the scene nor its fixed identity', async ({ page }) => {
    const before = await previewMarkup(page);

    await collapse(page, 0);
    await expand(page, 1);

    expect(await previewMarkup(page)).toBe(before);
  });

  test('a collapsed planet is still read and still generated', async ({ page }) => {
    // Planet 2 and 3 start collapsed; the scene must still contain all three.
    await expect(page.locator('#preview [data-role="orbit"]')).toHaveCount(3);

    // Editing an expanded planet re-reads the whole form. A collapsed group
    // whose values were dropped would silently lose its planet here.
    await setValue(group(page, 0).locator('[data-control="planetSize"]'), '20');

    await expect(page.locator('#preview [data-role="orbit"]')).toHaveCount(3);
    await expect(page.locator('#preview [data-role="moon"]')).toHaveCount(1);
  });

  test('a collapsed group keeps its identity and its remove affordance', async ({
    page,
  }) => {
    const collapsed = group(page, 1);

    expect(await isOpen(collapsed)).toBe(false);
    await expect(collapsed).toHaveAttribute('data-planet', '1');
    await expect(collapsed.locator('.summary-title')).toContainText('Planet 2');
    await expect(collapsed.locator('[data-action="remove-planet"]')).toHaveCount(1);
  });

  test('collapse state survives a form rebuild', async ({ page }) => {
    // A moon toggle rebuilds the entire form via innerHTML. Collapse state
    // held in the DOM would be destroyed here (D-204).
    await collapse(page, 0);
    await expand(page, 1);

    await group(page, 1).locator('[data-control="moonEnabled"]').uncheck();

    expect(await isOpen(group(page, 0))).toBe(false);
    expect(await isOpen(group(page, 1))).toBe(true);
  });

  test('collapse state follows the right planet after a removal', async ({ page }) => {
    // Collapse planet 3, remove planet 2, and the still-collapsed group must
    // be the SAME planet the user collapsed — not whichever index shifted into
    // its slot. This is the defect the index remap exists to prevent.
    await expand(page, 0);
    await expand(page, 1);
    await collapse(page, 2);

    const collapsedDistance = await group(page, 2)
      .locator('[data-control="planetDistance"]')
      .inputValue();

    await group(page, 1).locator('[data-action="remove-planet"]').click();

    await expect(page.locator('#controls [data-planet]')).toHaveCount(2);

    const nowCollapsed = group(page, 1);

    expect(await isOpen(nowCollapsed)).toBe(false);
    expect(await nowCollapsed.locator('[data-control="planetDistance"]').inputValue()).toBe(
      collapsedDistance,
    );
  });
});

test.describe('collapsed summary (CD-003)', () => {
  test('the summary identifies the planet, its size, and its distance', async ({
    page,
  }) => {
    const summary = group(page, 1).locator('summary');

    await expect(summary).toContainText('Planet 2');
    await expect(summary.locator('[data-role="summary-size"]')).toContainText('18');
    await expect(summary.locator('[data-role="summary-distance"]')).toContainText('190');
  });

  test('the summary reflects an edited value', async ({ page }) => {
    await expand(page, 1);
    await setValue(group(page, 1).locator('[data-control="planetSize"]'), '42');
    await collapse(page, 1);

    await expect(group(page, 1).locator('[data-role="summary-size"]')).toContainText('42');
  });

  test('moon presence is announced, not merely coloured', async ({ page }) => {
    // Planet 2 has a moon; planets 1 and 3 do not. The distinction must be
    // available to assistive technology (UI-008), so the badge carries an
    // accessible name rather than relying on its colour.
    const badge = group(page, 1).locator('.summary-moon [role="img"]');

    await expect(badge).toHaveAttribute('aria-label', /moon/i);
    await expect(group(page, 0).locator('.summary-moon')).toHaveCount(0);
  });
});

test.describe('an error never hides inside a collapsed group (CD-004)', () => {
  test('a rejection keeps its group expanded across a form rebuild', async ({ page }) => {
    // A user cannot type into a closed group — its contents are not rendered.
    // The reachable way an error would end up inside a collapsed group is a
    // wholesale form rebuild (add planet, new seed) while the error stands:
    // the rebuild reads collapse state, so without the auto-expansion the
    // message would be re-rendered inside a closed group.
    await expand(page, 1);

    const size = group(page, 1).locator('[data-control="planetSize"]');

    await setValue(size, '9999');
    await expect(page.locator('[data-role="errors"] li')).not.toHaveCount(0);

    await collapse(page, 1);

    // The group refuses to close while it holds an error, and its message
    // stays visible and associated.
    expect(await isOpen(group(page, 1))).toBe(true);

    await page.locator('[data-action="add-planet"]').click();

    expect(await isOpen(group(page, 1))).toBe(true);

    const message = group(page, 1).locator('#planet-1-size-error');

    await expect(message).toBeVisible();
    await expect(group(page, 1).locator('[data-control="planetSize"]')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(group(page, 1).locator('[data-control="planetSize"]')).toHaveAttribute(
      'aria-describedby',
      'planet-1-size-error',
    );
  });

  test('the last valid scene survives a rejection in a group', async ({ page }) => {
    await expand(page, 1);

    const before = await previewMarkup(page);
    const size = group(page, 1).locator('[data-control="planetSize"]');

    await setValue(size, '9999');

    expect(await previewMarkup(page)).toBe(before);
  });

  test('a group holding an error refuses to collapse', async ({ page }) => {
    await expand(page, 1);

    const size = group(page, 1).locator('[data-control="planetSize"]');

    await setValue(size, '9999');
    await expect(page.locator('[data-role="errors"] li')).not.toHaveCount(0);

    await toggle(page, 1);

    expect(await isOpen(group(page, 1))).toBe(true);
  });
});

test.describe('paired range and exact entry (CX-001)', () => {
  test('every bounded magnitude offers a range and an exact figure', async ({ page }) => {
    for (const control of ['canvasWidth', 'canvasHeight', 'planetSize'] as const) {
      const numeric = page.locator(`[data-control="${control}"]`).first();
      const id = await numeric.getAttribute('id');

      await expect(numeric).toHaveAttribute('type', 'number');
      await expect(page.locator(`[data-range-for="${id}"]`)).toHaveAttribute(
        'type',
        'range',
      );
    }
  });

  test('range endpoints match the declared bounds', async ({ page }) => {
    for (const [control, bound] of Object.entries(BOUNDS)) {
      const numeric = page.locator(`[data-control="${control}"]`).first();

      await expect(numeric).toHaveAttribute('min', String(bound.min));
      await expect(numeric).toHaveAttribute('max', String(bound.max));

      const id = await numeric.getAttribute('id');
      const range = page.locator(`[data-range-for="${id}"]`);

      if ((await range.count()) > 0) {
        await expect(range).toHaveAttribute('min', String(bound.min));
        await expect(range).toHaveAttribute('max', String(bound.max));
      }
    }
  });

  test('moving the range updates the exact figure and the scene', async ({ page }) => {
    const numeric = page.locator('[data-control="canvasWidth"]');
    const id = await numeric.getAttribute('id');
    const range = page.locator(`[data-range-for="${id}"]`);

    await range.fill('800');

    await expect(numeric).toHaveValue('800');
    await expect(page.locator('#preview svg')).toHaveAttribute('viewBox', /805/);
  });

  test('typing an exact figure moves the range', async ({ page }) => {
    const numeric = page.locator('[data-control="canvasHeight"]');
    const id = await numeric.getAttribute('id');

    await setValue(numeric, '750');

    await expect(page.locator(`[data-range-for="${id}"]`)).toHaveValue('750');
  });

  test('the range is operable from the keyboard', async ({ page }) => {
    const numeric = page.locator('[data-control="canvasWidth"]');
    const id = await numeric.getAttribute('id');
    const range = page.locator(`[data-range-for="${id}"]`);

    await range.focus();
    await page.keyboard.press('ArrowRight');

    await expect(numeric).toHaveValue('601');
    await expect(page.locator('#preview svg')).toHaveAttribute('viewBox', /606/);
  });

  test('an out-of-range typed value still reaches the validator', async ({ page }) => {
    const numeric = page.locator('[data-control="canvasWidth"]');

    await setValue(numeric, '9999');

    // Not clamped to the maximum: the raw value is submitted and rejected,
    // preserving CTL-007.
    await expect(numeric).toHaveValue('9999');
    await expect(page.locator('[data-role="errors"] li')).toHaveCount(1);
  });

  test('the dual-form orbital distance offers no range', async ({ page }) => {
    const target = page.locator('[data-control="planetDistance"]').first();
    const id = await target.getAttribute('id');

    await expect(page.locator(`[data-range-for="${id}"]`)).toHaveCount(0);
  });

  test('every moon magnitude has a visible, usable range control', async ({ page }) => {
    await expand(page, 1);

    for (const control of ['moonSize', 'moonDistance', 'moonPeriod'] as const) {
      const numeric = group(page, 1).locator(`[data-control="${control}"]`);
      const id = await numeric.getAttribute('id');
      const range = group(page, 1).locator(`[data-range-for="${id}"]`);

      await expect(range).toBeVisible();
      const box = await range.boundingBox();
      expect(box?.width, `${control} range width`).toBeGreaterThan(0);
      expect(box?.height, `${control} range height`).toBeGreaterThanOrEqual(24);
    }
  });

  test('moon ranges synchronize their exact values and regenerate the preview', async ({ page }) => {
    await expand(page, 1);

    const planet = group(page, 1);
    const size = planet.locator('[data-control="moonSize"]');
    const sizeId = await size.getAttribute('id');
    const sizeRange = planet.locator(`[data-range-for="${sizeId}"]`);
    const moonBody = page.locator('#preview [data-role="planet"]').nth(1)
      .locator(':scope > [data-role="moon"] [data-role="moon-body"]');

    await sizeRange.fill('8');
    await expect(size).toHaveValue('8');
    await expect(moonBody).toHaveAttribute('r', '8');

    const period = planet.locator('[data-control="moonPeriod"]');
    const periodId = await period.getAttribute('id');
    const periodRange = planet.locator(`[data-range-for="${periodId}"]`);

    await setValue(period, '30');
    await expect(periodRange).toHaveValue('30');
    await periodRange.focus();
    await page.keyboard.press('ArrowRight');
    await expect(period).toHaveValue('31');
  });
});

test.describe('canvas dimension presets (CX-010)', () => {
  test('a preset sets both dimensions and regenerates', async ({ page }) => {
    await page.locator('[data-preset="canvas"]').selectOption('portrait');

    await expect(page.locator('[data-control="canvasWidth"]')).toHaveValue('600');
    await expect(page.locator('[data-control="canvasHeight"]')).toHaveValue('900');
    await expect(page.locator('#preview svg')).toHaveAttribute('viewBox', /605 905/);
  });

  test('every preset is accepted by the validator', async ({ page }) => {
    const preset = page.locator('[data-preset="canvas"]');
    const values = await preset
      .locator('option')
      .evaluateAll((nodes) =>
        nodes.map((node) => (node as HTMLOptionElement).value).filter((v) => v !== 'custom'),
      );

    for (const value of values) {
      await preset.selectOption(value);
      await expect(page.locator('[data-role="errors"] li')).toHaveCount(0);
    }
  });

  test('a manual dimension reports that no preset applies', async ({ page }) => {
    await setValue(page.locator('[data-control="canvasWidth"]'), '733');

    await expect(page.locator('[data-preset="canvas"]')).toHaveValue('custom');
  });

  test('the preset is not a scene parameter', async ({ page }) => {
    // CTL-009: it must not masquerade as a generator-owned control.
    await expect(page.locator('[data-preset="canvas"]')).not.toHaveAttribute(
      'data-control',
      /.*/,
    );
  });
});

test.describe('moon switch (CX-012)', () => {
  test('the switch exposes its state and keeps its hook', async ({ page }) => {
    await expand(page, 1);

    const toggleControl = group(page, 1).locator('[data-control="moonEnabled"]');

    await expect(toggleControl).toBeChecked();

    await toggleControl.uncheck();

    await expect(toggleControl).not.toBeChecked();
    await expect(group(page, 1).locator('[data-control="moonSize"]')).toHaveCount(0);
  });

  test('the switch is keyboard-operable and applies the defaults', async ({ page }) => {
    await expand(page, 0);

    const toggleControl = group(page, 0).locator('[data-control="moonEnabled"]');

    await expect(toggleControl).not.toBeChecked();

    await toggleControl.focus();
    await page.keyboard.press('Space');

    await expect(group(page, 0).locator('[data-control="moonSize"]')).toHaveValue('5');
    await expect(group(page, 0).locator('[data-control="moonDistance"]')).toHaveValue('32');
    await expect(group(page, 0).locator('[data-control="moonPeriod"]')).toHaveValue('15');
    await expect(page.locator('#preview [data-role="moon"]')).toHaveCount(2);
  });
});
