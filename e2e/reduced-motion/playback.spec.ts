import { expect, test, type Page } from '@playwright/test';

/**
 * QLT-005 / QLT-009 (D-28): playback is controlled by the application.
 *
 * Measured POSITIONALLY in a real engine, never by inspecting markup: a
 * browser that parses SMIL and ignores it would satisfy a presence check.
 *
 * The control discipline from task 1.6 still applies. Every suppression claim
 * is paired with a run that must MOVE, because a scene that never animates
 * would otherwise pass every "it stopped" assertion while proving nothing.
 */

/** Displacement of the first visible planet over ~700ms. */
async function displacement(page: Page): Promise<number> {
  const box = async (): Promise<{ x: number; y: number }> => {
    for (const locator of await page.locator('#preview g[data-role="planet"]').all()) {
      const rect = await locator.boundingBox();

      if (rect !== null && rect.width > 0) {
        return { x: rect.x, y: rect.y };
      }
    }

    throw new Error('no visible planet group in the preview');
  };

  const first = await box();
  await page.waitForTimeout(700);
  const second = await box();

  return Math.hypot(second.x - first.x, second.y - first.y);
}

test.describe('playback control', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#preview svg')).toBeVisible();
  });

  test('CONTROL: the scene moves on load without the preference', async ({ page }) => {
    expect(
      await displacement(page),
      'control failed: the scene never animated, so the pause assertions prove nothing',
    ).toBeGreaterThan(1);
  });

  test('pausing stops the motion and keeps every element visible', async ({ page }) => {
    const button = page.locator('[data-action="toggle-playback"]');

    await expect(button).toHaveText('Pause animation');
    await button.click();

    expect(await displacement(page), 'motion did not stop').toBeLessThan(1);
    await expect(button).toHaveText('Play animation');

    const visible = await page.locator('#preview g[data-role="planet"]').count();
    expect(visible).toBe(3);
  });

  test('resuming restores the motion', async ({ page }) => {
    const button = page.locator('[data-action="toggle-playback"]');

    await button.click();
    expect(await displacement(page)).toBeLessThan(1);

    await button.click();
    await expect(button).toHaveText('Pause animation');
    expect(await displacement(page), 'motion did not resume').toBeGreaterThan(1);
  });

  test('a paused scene stays paused when a parameter changes', async ({ page }) => {
    await page.locator('[data-action="toggle-playback"]').click();

    const width = page.locator('[data-control="canvasWidth"]');
    await width.fill('640');
    await width.blur();

    await expect(page.locator('#preview svg')).toHaveAttribute('viewBox', /645/);
    expect(await displacement(page), 'the regenerated scene resumed on its own').toBeLessThan(1);
  });

  test('a paused regeneration keeps planets on their orbits', async ({ page }) => {
    const planet = page.locator('#preview [data-role="planet"]').first();
    const orbit = page.locator('#preview [data-role="orbit"]').first();

    await page.locator('[data-action="toggle-playback"]').click(); // pause

    const size = page.locator('[data-control="planetSize"]').first();
    await size.fill('60');
    await size.blur();
    await expect(page.locator('#preview [data-role="planet-body"]').first()).toHaveAttribute('r', '60');

    const [planetBox, orbitBox] = await Promise.all([planet.boundingBox(), orbit.boundingBox()]);

    if (planetBox === null || orbitBox === null) {
      throw new Error('expected planet and orbit geometry to be measurable');
    }

    // The planet is centred on its orbit path. A paused regeneration must not
    // collapse it to the base position (the top-left corner) before the SMIL
    // mpath resolves.
    const cx = planetBox.x + planetBox.width / 2;
    const cy = planetBox.y + planetBox.height / 2;
    const margin = 40;

    expect(cx, 'planet left its orbit horizontally').toBeGreaterThan(orbitBox.x - margin);
    expect(cx, 'planet left its orbit horizontally').toBeLessThan(orbitBox.x + orbitBox.width + margin);
    expect(cy, 'planet left its orbit vertically').toBeGreaterThan(orbitBox.y - margin);
    expect(cy, 'planet left its orbit vertically').toBeLessThan(orbitBox.y + orbitBox.height + margin);
  });

  test('shows no reduced-motion notice when the preference is absent', async ({ page }) => {
    await expect(page.locator('[data-role="reduced-motion-notice"]')).toBeHidden();
  });
});

test.describe('reduced motion starts the scene paused', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#preview svg')).toBeVisible();
  });

  test('the scene does not move on load', async ({ page }) => {
    expect(await displacement(page)).toBeLessThan(1);
    await expect(page.locator('[data-action="toggle-playback"]')).toHaveText('Play animation');
  });

  test('every planet stays visible and on its own orbit', async ({ page }) => {
    const positions = await page.locator('#preview').evaluate((node) =>
      [...node.querySelectorAll('g[data-role="planet"]')]
        .map((element) => element.getBoundingClientRect())
        .filter((box) => box.width > 0)
        .map((box) => `${Math.round(box.x)},${Math.round(box.y)}`),
    );

    expect(positions).toHaveLength(3);
    // Distinct orbital distances must yield distinct rest positions.
    expect(new Set(positions).size).toBe(3);
  });

  test('explains why the scene is paused, then stops explaining', async ({ page }) => {
    const notice = page.locator('[data-role="reduced-motion-notice"]');

    await expect(notice).toBeVisible();

    await page.locator('[data-action="toggle-playback"]').click();

    await expect(notice).toBeHidden();
    expect(await displacement(page), 'play did not start the animation').toBeGreaterThan(1);
  });
});

test.describe('hovering an editable control pauses the preview (QLT-010)', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#preview svg')).toBeVisible();
  });

  test('hovering a control stops motion without changing the button', async ({ page }) => {
    const button = page.locator('[data-action="toggle-playback"]');

    await expect(button).toHaveText('Pause animation');
    await page.locator('[data-control="canvasWidth"]').hover();

    expect(await displacement(page), 'motion did not pause on hover').toBeLessThan(1);
    await expect(button).toHaveText('Pause animation');
  });

  test('leaving the control restores motion', async ({ page }) => {
    await page.locator('[data-control="canvasWidth"]').hover();
    await page.locator('#preview').hover();

    expect(await displacement(page), 'motion did not resume').toBeGreaterThan(1);
  });

  test('a user-paused scene stays paused through hover and leave', async ({ page }) => {
    const button = page.locator('[data-action="toggle-playback"]');

    await button.click();
    await expect(button).toHaveText('Play animation');

    await page.locator('[data-control="canvasWidth"]').hover();
    await page.locator('#preview').hover();

    expect(await displacement(page)).toBeLessThan(1);
    await expect(button).toHaveText('Play animation');
  });

  test('a hover-paused scene does not resume when a parameter changes', async ({ page }) => {
    await page.locator('[data-control="canvasWidth"]').hover();

    const width = page.locator('[data-control="canvasWidth"]');
    await width.fill('640');
    await width.blur();

    await expect(page.locator('#preview svg')).toHaveAttribute('viewBox', /645/);
    expect(
      await displacement(page),
      'regenerated scene resumed under the hovering pointer',
    ).toBeLessThan(1);
  });
});
