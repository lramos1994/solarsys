// Standalone child process for the task 1.6 control probe.
//
// This intentionally runs outside Playwright Test's process environment.
// The test runner's reducedMotion fixture otherwise leaks into independently
// launched browsers and makes a bare Chromium launch report `true`.
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const browser = await chromium.launch({ args });

try {
  // `null` explicitly clears Playwright's context emulation, leaving the
  // Chromium process flag as the only possible source of this preference.
  const context = await browser.newContext({ reducedMotion: null });
  const page = await context.newPage();

  await page.setContent('<!doctype html><title>isolated reduced-motion probe</title>');

  process.stdout.write(
    JSON.stringify(
      await page.evaluate(
        () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      ),
    ),
  );
} finally {
  await browser.close();
}
