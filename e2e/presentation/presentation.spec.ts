import { expect, test, type Page, type TestInfo } from '@playwright/test';

/**
 * Presentation layer (UI-001..007, CX-001..009).
 *
 * Drives the application chrome: dark theme, design tokens, focus, responsive
 * two-pane layout, numeric widgets, planet cards, inline error association,
 * and focus management. Runs on chromium plus the mobile projects so both the
 * wide and the narrow layouts are exercised on real engines.
 *
 * The generated scene's own behavior is NOT this suite's subject; the
 * interaction, browser, and reduced-motion suites own that.
 */

const WIDE = { width: 1200, height: 800 };
const EXTRA_WIDE = { width: 1440, height: 900 };
const NARROW = { width: 400, height: 800 };

function isMobileProject(testInfo: TestInfo): boolean {
  return testInfo.project.name.startsWith('mobile-');
}

/** Parse an `rgb()`/`rgba()` string into channels. */
function rgbChannels(color: string): [number, number, number] {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);

  if (match === null) {
    throw new Error(`cannot parse color: ${color}`);
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function relativeLuminance(color: string): number {
  const [red, green, blue] = rgbChannels(color);
  const channelLuminance = (value: number): number => {
    const channel = value / 255;

    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };

  return (
    0.2126 * channelLuminance(red) +
    0.7152 * channelLuminance(green) +
    0.0722 * channelLuminance(blue)
  );
}

function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [high, low] = a > b ? [a, b] : [b, a];

  return (high + 0.05) / (low + 0.05);
}

/** Effective text color and a directly-selected contractual background. */
async function textAndBackground(
  page: Page,
  selectors: { text: string; background: string },
): Promise<{ text: string; background: string }> {
  return page.evaluate(({ text: textSelector, background: backgroundSelector }) => {
    const query = (selector: string): HTMLElement | null => selector.startsWith('text=')
      ? [...document.querySelectorAll<HTMLElement>('body *')].find(
          (node) => node.textContent?.trim() === selector.slice(5),
        ) ?? null
      : document.querySelector<HTMLElement>(selector);

    const textElement = query(textSelector);
    const backgroundElement = query(backgroundSelector);

    if (textElement === null) {
      throw new Error(`missing text element: ${textSelector}`);
    }

    if (backgroundElement === null) {
      throw new Error(`missing background element: ${backgroundSelector}`);
    }

    return {
      text: getComputedStyle(textElement).color,
      background: getComputedStyle(backgroundElement).backgroundColor,
    };
  }, selectors);
}

async function labelSelectorForControl(page: Page, control: string): Promise<string> {
  const id = await page.locator(`[data-control="${control}"]`).first().getAttribute('id');

  expect(id, `${control} needs an id for label association`).toBeTruthy();
  return `label[for="${id}"]`;
}

/** The element that currently owns keyboard focus, described by its hooks. */
function focusedHooks(page: Page): Promise<{
  control: string | null;
  action: string | null;
  planet: string | null;
}> {
  return page.evaluate(() => {
    const element = document.activeElement;

    if (element === null) {
      return { control: null, action: null, planet: null };
    }

    return {
      control: element.getAttribute('data-control'),
      action: element.getAttribute('data-action'),
      planet: element.closest('[data-planet]')?.getAttribute('data-planet') ?? null,
    };
  });
}

/** Open a planet's editing dialog (CX-020), expanding the instrument first. */
async function openPlanetDialog(page: Page, index: number) {
  const group = page.locator(`#controls [data-planet="${index}"]`);

  if (!(await group.evaluate((node) => node.hasAttribute('open')))) {
    await group.locator('[data-action="toggle-planet"]').click();
  }

  await group.locator('[data-action="open-planet-dialog"]').click();
  const dialog = page.locator(`[data-role="planet-dialog"][data-index="${index}"]`);
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('theme (UI-001, UI-002)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#preview svg')).toBeVisible();
  });

  test('declares a dark color scheme and design tokens', async ({ page }) => {
    const tokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);

      return {
        scheme: style.colorScheme,
        bg: style.getPropertyValue('--bg').trim(),
        text: style.getPropertyValue('--text').trim(),
        accent: style.getPropertyValue('--accent').trim(),
      };
    });

    expect(tokens.scheme).toContain('dark');
    expect(tokens.bg).not.toBe('');
    expect(tokens.text).not.toBe('');
    expect(tokens.accent).not.toBe('');
  });

  test('renders a dark page background rather than browser default', async ({ page }) => {
    const body = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    expect(relativeLuminance(body)).toBeLessThan(0.1);
  });

  test('styles inputs away from the browser default white field', async ({ page }) => {
    const input = await page.evaluate(() => {
      const element = document.querySelector<HTMLInputElement>('[data-control="canvasWidth"]');

      return element === null ? '' : getComputedStyle(element).backgroundColor;
    });

    expect(input).not.toBe('');
    expect(relativeLuminance(input)).toBeLessThan(0.3);
  });
});

test.describe('observatory instrument contract (UI-001..007, CX-003, VR-001)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#preview svg')).toBeVisible();
  });

  test('exposes semantic chrome tokens and distinct typography roles', async ({ page }) => {
    const tokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const names = [
        '--chrome-page-bg',
        '--chrome-preview-frame',
        '--chrome-instrument',
        '--chrome-telemetry',
        '--chrome-primary-action',
        '--chrome-status-error',
        '--chrome-focus',
        '--font-interface',
        '--font-heading',
        '--font-data',
      ];

      return Object.fromEntries(
        names.map((name) => [name, style.getPropertyValue(name).trim()]),
      );
    });

    for (const [name, value] of Object.entries(tokens)) {
      expect(value, `${name} must resolve to a semantic value`).not.toBe('');
    }
    expect(tokens['--font-interface']).not.toBe(tokens['--font-data']);
  });

  test('marks the stage, instrument controls, and actions as semantic regions', async ({ page }) => {
    await expect(page.locator('[data-role="instrument-stage"]')).toHaveCount(1);
    await expect(page.locator('[data-role="instrument-controls"]')).toHaveCount(1);
    await expect(page.locator('[data-role="instrument-actions"]')).toHaveCount(1);
    await expect(page.locator('[data-role="scene-telemetry"]')).toHaveCount(0);

    const stage = page.locator('[data-role="instrument-stage"]');
    const controls = page.locator('[data-role="instrument-controls"]');

    await expect(stage).toHaveAttribute('aria-label', /observatory|preview/i);
    await expect(controls).toHaveAttribute('aria-label', /instrument|configuration/i);
  });

  test('retires seed telemetry rather than leaving it hidden in the stage chrome', async ({ page }) => {
    await expect(page.locator('[data-role="scene-telemetry"]')).toHaveCount(0);
    await expect(page.locator('[data-role="current-seed"]')).toHaveCount(0);
  });

  test('keeps the stage primary and overflow-free across the viewport matrix', async ({ page }, testInfo) => {
    const viewports = isMobileProject(testInfo) ? [NARROW] : [NARROW, WIDE, EXTRA_WIDE];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);

      const stage = await page.locator('[data-role="instrument-stage"]').boundingBox();
      const controls = await page.locator('[data-role="instrument-controls"]').boundingBox();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );

      expect(stage, `${viewport.width}px stage`).not.toBeNull();
      expect(controls, `${viewport.width}px controls`).not.toBeNull();
      expect(overflow, `${viewport.width}px horizontal overflow`).toBeLessThanOrEqual(1);

      if (viewport.width === NARROW.width) {
        expect(stage!.y).toBeLessThan(controls!.y);
        expect(stage!.width).toBeGreaterThan(320);
      } else {
        expect(controls!.x).toBeLessThan(stage!.x);
        expect(stage!.width).toBeGreaterThan(controls!.width);
      }
    }
  });

  test('retains scannable operational groups and a legible stage under dense valid content', async ({ page }, testInfo) => {
    test.skip(isMobileProject(testInfo), 'Dense desktop scanability is asserted in desktop Chromium only.');

    await page.setViewportSize(WIDE);

    for (let count = 0; count < 3; count += 1) {
      await page.locator('[data-action="add-planet"]').click();
    }

    const groups = page.locator('[data-role="planet-instrument"]');
    await expect(groups).toHaveCount(6);

    for (const group of await groups.all()) {
      // A planet instrument is a disclosure (CD-002): its summary is always
      // visible and identifies the group, and its controls become visible once
      // expanded. Both halves are asserted rather than assuming every group is
      // permanently open.
      await expect(group.locator('[data-action="toggle-planet"]')).toBeVisible();
      await expect(group.locator('[data-action="toggle-planet"]')).toContainText(/Planet \d+/);

      if (!(await group.evaluate((node) => node.hasAttribute('open')))) {
        await group.locator('[data-action="toggle-planet"]').click();
      }

      // Orbital distance stays in the deck; size/moon/ring moved into the
      // per-planet dialog (design §5). The deck's visible editing surface is
      // therefore the orbit control plus the dialog opener, and the dialog
      // hosts the relocated controls.
      await expect(group.locator('[data-control="planetDistance"]')).toBeVisible();
      await expect(group.locator('[data-action="open-planet-dialog"]')).toBeVisible();
      await expect(
        group.locator('[data-role="planet-dialog"] [data-control="planetSize"]'),
      ).toHaveCount(1);
      await expect(
        group.locator('[data-role="planet-dialog"] [data-control="moonEnabled"]'),
      ).toHaveCount(1);
      await expect(
        group.locator('[data-role="planet-dialog"] [data-action="remove-planet"]'),
      ).toHaveCount(1);
    }

    // One open dialog proves the relocated controls are genuinely reachable.
    const dialog = await openPlanetDialog(page, 0);
    await expect(dialog.locator('[data-control="planetSize"]')).toBeVisible();
    await expect(dialog.locator('[data-control="moonEnabled"]')).toBeVisible();
    await expect(dialog.locator('[data-action="remove-planet"]')).toBeVisible();

    await expect(page.locator('#preview svg')).toBeVisible();
    await expect(page.locator('[data-role="instrument-actions"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });

  test('keeps stage, actions, association, and focus clear in an error state', async ({ page }) => {
    const preview = page.locator('#preview');
    const before = await preview.innerHTML();
    const control = page.locator('[data-control="canvasWidth"]');

    await control.fill('5');
    await control.blur();

    await expect(control).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator(`#${await control.getAttribute('aria-describedby')}`)).toBeVisible();
    expect(await preview.innerHTML()).toBe(before);
    await expect(page.locator('[data-role="instrument-actions"]')).toBeVisible();

    await control.focus();
    const focusColor = await control.evaluate((element) => getComputedStyle(element).outlineColor);
    const errorColor = await control.evaluate((element) => getComputedStyle(element).borderColor);
    expect(focusColor).not.toBe(errorColor);
  });

  test('preserves static chrome communication when reduced motion is requested', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await expect(page.locator('#preview svg')).toBeVisible();

    const transitions = await page.locator('[data-action="toggle-playback"]').evaluate((element) => {
      const style = getComputedStyle(element);

      return { duration: style.transitionDuration, animation: style.animationName };
    });

    expect(transitions.duration).toBe('0s');
    expect(transitions.animation).toBe('none');
    await expect(page.locator('[data-role="reduced-motion-notice"]')).toBeVisible();
    await expect(page.locator('[data-action="toggle-playback"]')).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('stage actions (UI-004, UI-005)', () => {
  test('places playback and download above the preview in every required viewport', async ({ page }, testInfo) => {
    const viewports = isMobileProject(testInfo) ? [NARROW] : [NARROW, WIDE, EXTRA_WIDE];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect(page.locator('#preview svg')).toBeVisible();

      const preview = await page.locator('#preview').boundingBox();
      const actions = await page.locator('[data-role="instrument-actions"]').boundingBox();

      expect(preview, `${viewport.width}px preview`).not.toBeNull();
      expect(actions, `${viewport.width}px actions`).not.toBeNull();
      expect(actions!.y + actions!.height, `${viewport.width}px action bottom`).toBeLessThanOrEqual(preview!.y);
      expect(actions!.y + actions!.height).toBeLessThanOrEqual(viewport.height);
    }
  });
});

test.describe('layout (UI-004, UI-005)', () => {
  test.describe('wide viewport', () => {
    test.use({ viewport: WIDE });

    test.beforeEach(async ({ page }, testInfo) => {
      test.skip(isMobileProject(testInfo), 'Desktop layout assertions do not run under mobile emulation.');

      await page.goto('/');
      await expect(page.locator('#preview svg')).toBeVisible();
    });

    test('places the controls beside the preview', async ({ page }) => {
      const controls = await page.locator('[data-role="instrument-controls"]').boundingBox();
      const preview = await page.locator('[data-role="instrument-stage"]').boundingBox();

      expect(controls).not.toBeNull();
      expect(preview).not.toBeNull();
      expect(controls!.x).toBeLessThan(preview!.x);
      expect(preview!.width).toBeGreaterThan(controls!.width);
    });
  });

  test.describe('narrow viewport', () => {
    test.use({ viewport: NARROW });

    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('#preview svg')).toBeVisible();
    });

    test('stacks the preview above the controls', async ({ page }) => {
      const controls = await page.locator('[data-role="instrument-controls"]').boundingBox();
      const preview = await page.locator('[data-role="instrument-stage"]').boundingBox();

      expect(controls).not.toBeNull();
      expect(preview).not.toBeNull();
      expect(preview!.y).toBeLessThan(controls!.y);
    });

    test('does not force horizontal scroll', async ({ page }) => {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );

      expect(overflow).toBeLessThanOrEqual(1);
    });

    test('keeps the preview legible and full-width', async ({ page }) => {
      const preview = await page.locator('[data-role="instrument-stage"]').boundingBox();

      expect(preview).not.toBeNull();
      expect(preview!.width).toBeGreaterThan(320);
    });
  });

  test('reflows between the two arrangements on resize', async ({ page }, testInfo) => {
    test.skip(isMobileProject(testInfo), 'Desktop reflow is asserted in desktop Chromium only.');

    await page.setViewportSize(WIDE);
    await page.goto('/');
    await expect(page.locator('#preview svg')).toBeVisible();

    const wideControls = await page.locator('[data-role="instrument-controls"]').boundingBox();
    const widePreview = await page.locator('[data-role="instrument-stage"]').boundingBox();
    expect(wideControls!.x).toBeLessThan(widePreview!.x);

    await page.setViewportSize(NARROW);

    const narrowControls = await page.locator('[data-role="instrument-controls"]').boundingBox();
    const narrowPreview = await page.locator('[data-role="instrument-stage"]').boundingBox();
    expect(narrowPreview!.y).toBeLessThan(narrowControls!.y);
  });
});

test.describe('focus (UI-003)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#preview svg')).toBeVisible();
  });

  test('shows a visible focus indicator on a focused control', async ({ page }) => {
    const control = page.locator('[data-control="canvasWidth"]');

    await control.focus();

    const outline = await control.evaluate((element) => {
      const style = getComputedStyle(element);

      return {
        width: style.outlineWidth,
        style: style.outlineStyle,
        color: style.outlineColor,
      };
    });

    expect(outline.style).toBe('solid');
    expect(parseFloat(outline.width)).toBeGreaterThan(0);
    expect(outline.color).not.toBe('rgb(0, 0, 0)');
  });
});

test.describe('numeric widgets (CX-001, CX-002)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#preview svg')).toBeVisible();
  });

  test('bounded scalar inputs are type=number with native min/max/step', async ({ page }) => {
    const expected = {
      canvasWidth: { min: '100', max: '1500' },
      canvasHeight: { min: '100', max: '1500' },
      // CTL-015: orbital distance is a percentage of the scene radius,
      // 0..120; the slider reads it from the same shared BOUNDS.
      planetDistance: { min: '0', max: '120' },
    };

    for (const [control, bounds] of Object.entries(expected)) {
      const input = page.locator(`[data-control="${control}"]`).first();

      await expect(input).toHaveAttribute('type', 'number');
      await expect(input).toHaveAttribute('min', bounds.min);
      await expect(input).toHaveAttribute('max', bounds.max);
      await expect(input).toHaveAttribute('step', '1');
    }

    await expect(page.locator('[data-control="planetSize"]').first()).toHaveAttribute(
      'type',
      'number',
    );
    await expect(page.locator('[data-control="planetSize"]').first()).toHaveAttribute(
      'min',
      '1',
    );
    await expect(page.locator('[data-control="planetSize"]').first()).toHaveAttribute(
      'max',
      '25',
    );
    // Planet size is authored in half-percent increments (CTL-015).
    await expect(page.locator('[data-control="planetSize"]').first()).toHaveAttribute(
      'step',
      '0.5',
    );
  });

  test('orbital distance offers a scalar range and custom four-value entry', async ({ page }) => {
    const planet = page.locator('#controls [data-planet]').first();

    await expect(planet.locator('[data-control="planetDistance"]')).toHaveAttribute(
      'type',
      'number',
    );

    await planet.locator('[data-orbit-mode="custom"]').check();

    await planet.locator('[data-control="orbitLeft"]').fill('67');
    await planet.locator('[data-control="orbitTop"]').fill('20');
    await planet.locator('[data-control="orbitRight"]').fill('67');
    await planet.locator('[data-control="orbitBottom"]').fill('20');
    await planet.locator('[data-control="orbitBottom"]').blur();

    // A four-value distance is accepted (no error), preserving CTL-002.
    await expect(page.locator('[data-role="errors"] li')).toHaveCount(0);
  });

  test('an out-of-range value is rejected rather than clamped (CX-001)', async ({ page }) => {
    const control = page.locator('[data-control="canvasWidth"]');

    await control.fill('5');
    await control.blur();

    const message = await page.locator('[data-role="errors"] li').first().textContent();

    expect(message).toContain('Canvas width');
    expect(message).toContain('100');
    expect(message).toContain('1500');
  });
});

test.describe('planet cards (CX-003)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#preview svg')).toBeVisible();
  });

  test('presents each planet as a distinct card with its controls', async ({ page }) => {
    const cards = page.locator('#controls [data-planet]');

    await expect(cards).toHaveCount(3);

    for (const card of await cards.all()) {
      // Orbital distance stays in the deck; size and the remove affordance
      // moved into the planet's dialog (design §5, CX-020).
      await expect(card.locator('[data-control="planetDistance"]')).toHaveCount(1);
      await expect(
        card.locator('[data-role="planet-dialog"] [data-control="planetSize"]'),
      ).toHaveCount(1);
      await expect(
        card.locator('[data-role="planet-dialog"] [data-action="remove-planet"]'),
      ).toHaveCount(1);
    }
  });
});

test.describe('inline errors (CX-004, CX-005)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#preview svg')).toBeVisible();
  });

  test('associates an inline message with the offending control', async ({ page }) => {
    const control = page.locator('[data-control="canvasWidth"]');

    await control.fill('5');
    await control.blur();

    await expect(control).toHaveAttribute('aria-invalid', 'true');

    const describedBy = await control.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();

    const message = await page.locator(`#${describedBy}`).textContent();
    expect(message).toContain('Canvas width');
    expect(message).toContain('100');
  });

  test('reports every invalid field inline at once', async ({ page }) => {
    await page.locator('[data-control="canvasWidth"]').fill('5');
    await page.locator('[data-control="canvasWidth"]').blur();
    await page.locator('[data-control="canvasHeight"]').fill('5');
    await page.locator('[data-control="canvasHeight"]').blur();

    await expect(page.locator('#controls [aria-invalid="true"]')).toHaveCount(2);
    await expect(page.locator('[data-role="errors"] li')).toHaveCount(2);
  });

  test('declares the error summary as a live region', async ({ page }) => {
    await expect(page.locator('[data-role="errors"]')).toHaveAttribute('aria-live', 'polite');
  });

  test('associates a planet error with the correct card', async ({ page }) => {
    // Planet 2's size is invalid; the inline message must land inside card 2's
    // dialog, which hosts the relocated size control (CX-020).
    const dialog = await openPlanetDialog(page, 1);

    const size = dialog.locator('[data-control="planetSize"]');

    await size.fill('999');
    await size.blur();

    await expect(size).toHaveAttribute('aria-invalid', 'true');

    // `aria-describedby` is a token list: a proportional control also points
    // at its unit description (CX-022).
    const describedBy = await size.getAttribute('aria-describedby');
    const errorId = (describedBy ?? '').split(/\s+/).find((token) => token.endsWith('-error'));
    const message = await dialog.locator(`#${errorId}`).textContent();

    expect(message).toContain('planet 2');
  });

  test('clears inline errors once the input is valid again (CX-005)', async ({ page }) => {
    const control = page.locator('[data-control="canvasWidth"]');

    await control.fill('5');
    await control.blur();
    await expect(control).toHaveAttribute('aria-invalid', 'true');

    await control.fill('500');
    await control.blur();

    await expect(page.locator('#controls [aria-invalid="true"]')).toHaveCount(0);
    await expect(page.locator('[data-role="errors"] li')).toHaveCount(0);
  });
});

test.describe('focus management (CX-006, CX-008)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#preview svg')).toBeVisible();
  });

  test('lands focus on the new card after a keyboard add', async ({ page }) => {
    await page.locator('[data-action="add-planet"]').focus();
    await page.keyboard.press('Enter');

    await expect(page.locator('#controls [data-planet]')).toHaveCount(4);
    // Size/moon/ring live in the dialog now, so focus lands on the new card's
    // editing entry point — its "Edit planet N" opener — not a control inside
    // the closed dialog (CX-006, CX-020).
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('data-action') === 'open-planet-dialog',
    );

    const hooks = await focusedHooks(page);

    expect(hooks.action).toBe('open-planet-dialog');
    expect(hooks.planet).toBe('3');
  });

  test('moves focus to the next group after a keyboard remove', async ({ page }) => {
    // The remove affordance lives in the dialog now (CX-020), so the planet's
    // dialog is opened first to operate it.
    const dialog = await openPlanetDialog(page, 1);
    await dialog.locator('[data-action="remove-planet"]').focus();
    await page.keyboard.press('Enter');

    await expect(page.locator('#controls [data-planet]')).toHaveCount(2);
    await page.waitForFunction(
      // Focus lands on the shifted group's disclosure: a control inside a
      // collapsed instrument is not rendered and cannot take focus, so the
      // summary is the group's focusable entry point (CD-002, CX-006).
      () => document.activeElement?.getAttribute('data-action') === 'toggle-planet',
    );

    const hooks = await focusedHooks(page);

    expect(hooks.action).toBe('toggle-planet');
    expect(hooks.planet).toBe('1');
  });
});

test.describe('labels (CX-007)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#preview svg')).toBeVisible();
  });

  test('labels the playback toggle at first paint', async ({ page }) => {
    const toggle = page.locator('[data-action="toggle-playback"]');

    await expect(toggle).toHaveText(/Pause animation|Play animation/);
  });

  test('keeps the label[for=id] contract through the restyle', async ({ page }) => {
    const controls = page.locator('[data-control]');
    const total = await controls.count();

    for (let index = 0; index < total; index += 1) {
      const id = await controls.nth(index).getAttribute('id');

      expect(id, `control ${index} needs an id`).toBeTruthy();
      await expect(page.locator(`label[for="${id}"]`)).toHaveCount(1);
    }
  });

  test('detects when the canvas width label contract is absent', async ({ page }) => {
    const control = page.locator('[data-control="canvasWidth"]').first();
    const id = await control.getAttribute('id');

    expect(id).toBeTruthy();

    const labelSelector = `label[for="${id}"]`;
    await expect(page.locator(labelSelector)).toHaveCount(1);
    await expect(page.getByText('Canvas width', { exact: true })).toHaveCount(1);

    await page.evaluate((controlId) => {
      const label = document.querySelector<HTMLLabelElement>(`label[for="${controlId}"]`);

      if (label === null) {
        throw new Error(`missing label for ${controlId}`);
      }

      label.setAttribute('for', `${controlId}-broken`);
    }, id!);

    await expect(page.locator(labelSelector)).toHaveCount(0);
    await expect(control).toHaveCount(1);
    await expect(page.getByText('Canvas width', { exact: true })).toHaveCount(1);
  });
});

test.describe('contrast (UI-006)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#preview svg')).toBeVisible();
  });

  test('primary text meets WCAG AA contrast', async ({ page }) => {
    const cases = [
      {
        text: '[data-control="canvasWidth"]',
        background: '[data-control="canvasWidth"]',
      },
      {
        text: await labelSelectorForControl(page, 'canvasWidth'),
        background: '[data-role="instrument-controls"]',
      },
      {
        text: '[data-action="download-svg"]',
        background: '[data-action="download-svg"]',
      },
    ];

    for (const selectors of cases) {
      const { text, background } = await textAndBackground(page, selectors);

      expect(
        contrastRatio(text, background),
        `${selectors.text} contrast ${contrastRatio(text, background).toFixed(2)}:1 is below 4.5:1`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('muted helper text remains discernible', async ({ page }) => {
    const { text, background } = await textAndBackground(
      page,
      {
        text: 'text=Calibrate the system, then observe the generated artefact.',
        background: '[data-role="instrument-controls"]',
      },
    );

    expect(contrastRatio(text, background)).toBeGreaterThanOrEqual(3);
  });
});

test.describe('belt row presentation (UI-011)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#preview svg')).toBeVisible();
  });

  test('the belt row treatment is distinct from a planet summary row', async ({ page }) => {
    const beltRow = page.locator('[data-role="asteroid-belt-group"] .belt-row');
    const planetSummary = page.locator('[data-planet="0"] [data-action="toggle-planet"]').first();

    await expect(beltRow).toBeVisible();
    await expect(planetSummary).toBeVisible();

    const beltBorder = await beltRow.evaluate((node) => {
      const style = getComputedStyle(node);
      return { style: style.borderLeftStyle, width: style.borderLeftWidth };
    });
    const planetBorder = await planetSummary.evaluate((node) => {
      const style = getComputedStyle(node);
      return { style: style.borderLeftStyle, width: style.borderLeftWidth };
    });

    // The belt row borrows the dashed band language; a planet summary row has
    // no left border at all.
    expect(beltBorder.style).toBe('dashed');
    expect(beltBorder.width).not.toBe('0px');
    expect(planetBorder.style).not.toBe('dashed');
  });

  test('the belt type options are readable as text', async ({ page }) => {
    await page.locator('[data-role="asteroid-belt-group"] [data-action="toggle-belt-details"]').click();

    const options = await page
      .locator('[data-control="beltType"] option')
      .allTextContents();

    expect(options).toEqual(['rocky', 'icy', 'metallic']);
    expect(options.every((name) => name.trim().length > 0)).toBe(true);
  });

  test('the belt row resolves its colours through the token set', async ({ page }) => {
    const colours = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const row = document.querySelector<HTMLElement>('[data-role="asteroid-belt-group"] .belt-row');

      if (row === null) {
        return null;
      }

      // A probe resolves the declared token the same way the engine resolves
      // the row, so the comparison is immune to colour-space formatting.
      const probe = document.createElement('div');
      probe.style.borderLeftColor = 'var(--chrome-status)';
      document.body.appendChild(probe);
      const token = getComputedStyle(probe).borderLeftColor;
      probe.remove();

      return {
        row: getComputedStyle(row).borderLeftColor,
        token,
        background: getComputedStyle(row).backgroundImage,
      };
    });

    expect(colours).not.toBeNull();
    expect(colours!.row).toBe(colours!.token);
    expect(colours!.background).toContain('gradient');
  });

  test('hovering the belt row changes its computed treatment', async ({ page }) => {
    const beltRow = page.locator('[data-role="asteroid-belt-group"] .belt-row');
    await expect(beltRow).toBeVisible();

    const before = await beltRow.evaluate((node) => {
      const style = getComputedStyle(node);

      return { border: style.borderLeftColor, background: style.backgroundImage };
    });

    await beltRow.hover();

    const after = await beltRow.evaluate((node) => {
      const style = getComputedStyle(node);

      return { border: style.borderLeftColor, background: style.backgroundImage };
    });

    expect(after.border).not.toBe(before.border);
    expect(after.background).not.toBe(before.background);
  });
});

test.describe('planet dialog presentation (UI-012)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#preview svg')).toBeVisible();
  });

  test('the dialog surface and backdrop resolve through the tokens', async ({ page }) => {
    const dialog = await openPlanetDialog(page, 0);

    const colours = await dialog.evaluate((node) => {
      const probe = (property: string): string => {
        const element = document.createElement('div');
        element.style.background = `var(${property})`;
        document.body.appendChild(element);
        const value = getComputedStyle(element).backgroundColor;
        element.remove();
        return value;
      };

      return {
        surface: getComputedStyle(node).backgroundColor,
        surfaceToken: probe('--chrome-control'),
        backdrop: getComputedStyle(node, '::backdrop').backgroundColor,
        backdropToken: probe('--chrome-backdrop'),
      };
    });

    expect(colours.surface).toBe(colours.surfaceToken);
    expect(colours.backdrop).toBe(colours.backdropToken);
    expect(colours.backdrop).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('no application rule restyles a generated preview descendant', async ({ page }) => {
    const offending = await page.evaluate(() => {
      const selectors: string[] = [];

      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRule[] = [];

        try {
          rules = Array.from(sheet.cssRules);
        } catch {
          continue;
        }

        for (const rule of rules) {
          if (!(rule instanceof CSSStyleRule)) {
            continue;
          }

          for (const selector of rule.selectorText.split(',')) {
            const trimmed = selector.trim();

            // The only permitted chrome selectors into #preview are the
            // container itself and the root SVG sizing rule (docs/ARCHITECTURE.md
            // invariant); anything that names a generated descendant
            // restyles the scene.
            if (!trimmed.includes('#preview')) {
              continue;
            }

            const tail = trimmed.split('#preview')[1] ?? '';

            if (!/^\s*((>\s*)?svg)?\s*$/.test(tail)) {
              selectors.push(trimmed);
            }
          }
        }
      }

      return selectors;
    });

    expect(offending).toEqual([]);
  });
});
