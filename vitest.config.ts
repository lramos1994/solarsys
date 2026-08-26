import { defineConfig } from 'vitest/config';

// Headless verification layers only (geometry parity, determinism, structural).
// Browser and interaction layers run under Playwright — see playwright.config.ts.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests-ts/**/*.test.ts'],
    reporters: ['default'],
  },
});
