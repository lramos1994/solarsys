import { describe, expect, it } from 'vitest';
import { parseHTML } from 'linkedom';

// Toolchain smoke test for task 1.3.
//
// It proves the three headless-layer prerequisites actually work in this
// repository, rather than asserting that they were chosen:
//   1. Vitest executes TypeScript sources.
//   2. linkedom parses SVG markup and exposes DOM queries used by the
//      structural assertion helper (task 1.5).
//   3. Numeric comparison with tolerance works for the geometry parity layer.
describe('toolchain', () => {
  it('runs TypeScript under Vitest', () => {
    const value: number = 0.5522847498;
    expect(value).toBeCloseTo(0.5522847498, 10);
  });

  it('parses SVG markup with linkedom and resolves internal references', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 105 105">
        <path id="orbit-0" d="M 0 0 L 10 10" />
        <circle r="2"><animateMotion dur="8s"><mpath href="#orbit-0" /></animateMotion></circle>
      </svg>`;

    const { document } = parseHTML(`<html><body>${svg}</body></html>`);

    const mpath = document.querySelector('mpath');
    expect(mpath).not.toBeNull();

    const reference = mpath?.getAttribute('href') ?? '';
    expect(reference.startsWith('#')).toBe(true);
    expect(document.querySelector(reference)).not.toBeNull();
  });
});
