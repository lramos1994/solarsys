import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';

const execFileAsync = promisify(execFile);
const ISOLATED_PROBE = 'e2e/reduced-motion/isolated-browser-probe.mjs';
const QUERY = '(prefers-reduced-motion: reduce)';
const CLEAN_BROWSER_ENV = {
  HOME: process.env.HOME ?? '',
  PATH: process.env.PATH ?? '',
};


async function reportsReducedMotion(args: string[] = []): Promise<boolean> {
  const { stdout } = await execFileAsync(process.execPath, [ISOLATED_PROBE, ...args], {
    cwd: process.cwd(),
    env: CLEAN_BROWSER_ENV,
  });

  return JSON.parse(stdout) as boolean;
}

/**
 * Task 1.6 control probe (QLT-005, E-052).
 *
 * Environment simulations are assertions only after this probe proves they
 * change an independently-observable signal. The selected mechanism is the
 * Playwright context option configured in playwright.config.ts; a test running
 * in the chromium-reduced-motion project must see the media query match.
 *
 * The historical flags are measured in a separate Node process launched with a
 * clean environment. Playwright Test's current project fixture leaks into a
 * browser launched from the runner — even with `playwright-core` — and makes a
 * supposedly bare launch report `true`. The subprocess prevents that circular
 * measurement and isolates the Chromium binary from runner configuration.
 */
test.describe('reduced-motion control probe', () => {
  test('proves the configured Playwright simulation has an observable effect', async ({
    page,
  }) => {
    await page.goto('/');

    await expect
      .poll(() => page.evaluate((query) => window.matchMedia(query).matches, QUERY))
      .toBe(true);
  });

  test('records that no flag leaves the preference disabled', async () => {
    await expect(reportsReducedMotion()).resolves.toBe(false);
  });

  test('records that blink-settings is inert on the selected Chromium binary', async () => {
    await expect(
      reportsReducedMotion(['--blink-settings=prefersReducedMotion=1']),
    ).resolves.toBe(false);
  });

  test('records that force-prefers-reduced-motion changes the signal here', async () => {
    await expect(reportsReducedMotion(['--force-prefers-reduced-motion'])).resolves.toBe(
      true,
    );
  });
});
