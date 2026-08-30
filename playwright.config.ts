import { defineConfig, devices } from '@playwright/test';

const CHROMIUM_ONLY_PRESENTATION_FILES = ['e2e/presentation/visual-review.spec.ts'];

// QLT-005/E-052: reduced-motion must be simulated through a mechanism that is
// PROVEN to have an observable effect, never an assumed one.
//
// E-052 was measured against raw Chrome headless, where
// `--force-prefers-reduced-motion` is inert and
// `--blink-settings=prefersReducedMotion=1` works. Measured again against the
// toolchain actually selected here (Playwright + chromium-headless-shell 151),
// the result INVERTS: `--blink-settings=...` is inert, while both
// `--force-prefers-reduced-motion` and Playwright's own `reducedMotion`
// context option work. The context option is used because it is Playwright's
// supported API and is engine-independent, so it also covers Firefox and
// WebKit. Task 1.6 still owns the control probe that proves this at runtime.

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e/.artifacts',
  fullyParallel: true,
  reporter: [['list']],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://127.0.0.1:4173/',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'firefox',
      testIgnore: CHROMIUM_ONLY_PRESENTATION_FILES,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      testIgnore: CHROMIUM_ONLY_PRESENTATION_FILES,
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'chromium-reduced-motion',
      testIgnore: CHROMIUM_ONLY_PRESENTATION_FILES,
      use: {
        ...devices['Desktop Chrome'],
        contextOptions: { reducedMotion: 'reduce' },
      },
    },
    {
      name: 'mobile-chrome',
      testIgnore: CHROMIUM_ONLY_PRESENTATION_FILES,
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'mobile-safari',
      testIgnore: CHROMIUM_ONLY_PRESENTATION_FILES,
      use: { ...devices['iPhone 14'] },
    },
  ],
});
