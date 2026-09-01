import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Task 4.1 (QLT-034): guard against `test:all` silently dropping a declared
 * layer or losing its fail-fast chaining.
 *
 * This reads the actual `package.json` on disk (not a hardcoded copy of the
 * script) so a future edit that removes a layer or swaps `&&` for `;`/`||`
 * fails this test instead of only being caught by someone reading the diff.
 */
const packageJsonPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../package.json',
);

function readScripts(): Record<string, string> {
  const raw = readFileSync(packageJsonPath, 'utf-8');
  const parsed = JSON.parse(raw) as { scripts?: Record<string, string> };
  return parsed.scripts ?? {};
}

const REQUIRED_LAYER_COMMANDS = [
  'npm run test',
  'npm run test:browser',
  'npm run test:interaction',
  'npm run test:density',
  'npm run test:reduced-motion',
  'npm run test:presentation',
];

describe('aggregate gate (test:all)', () => {
  it('declares every required per-layer script', () => {
    const scripts = readScripts();

    for (const name of [
      'test',
      'test:browser',
      'test:interaction',
      'test:density',
      'test:reduced-motion',
      'test:presentation',
    ]) {
      expect(scripts).toHaveProperty(name);
      expect(scripts[name]).toBeTruthy();
    }
  });

  it('invokes all six layers, in order, chained with && so a failure short-circuits the rest', () => {
    const scripts = readScripts();
    const testAll = scripts['test:all'];
    expect(testAll).toBeTruthy();

    // Splitting on '&&' and requiring an exact match (rather than
    // substring/includes checks) means a swap to ';' or '||' -- which would
    // no longer stop the run or would mask a non-zero exit -- fails here too.
    const steps = (testAll ?? '').split('&&').map((step) => step.trim());
    expect(steps).toEqual(REQUIRED_LAYER_COMMANDS);
  });

  it('documents the six aggregate layers in README.md so the commands stay discoverable', () => {
    const readmePath = path.resolve(path.dirname(packageJsonPath), 'README.md');
    const readme = readFileSync(readmePath, 'utf-8');
    expect(readme).toContain('npm run test:all');
    for (const layer of [
      'headless',
      'browser',
      'interaction',
      'density',
      'reduced-motion',
      'presentation',
    ]) {
      expect(readme.toLowerCase()).toContain(layer);
    }
  });
});
