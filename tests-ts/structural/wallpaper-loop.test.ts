import { describe, expect, it } from 'vitest';
import {
  WALLPAPER_LOOP_SECONDS,
  quantizePeriod,
} from '../../ts/app/wallpaper';

/**
 * Task 3.1 (WAL-004): period quantization snaps every non-belt authored period
 * to `T / round(T/p)` so each exported period divides the loop length exactly.
 *
 * The default scene's non-belt periods are 36s, 33s, 24s, 15s, 13s, 10s
 * (E-013, E-014). The authored loop table (design.md) maps them to 45, 45,
 * 22.5, 15, 15, 11.25 seconds — four distinct periods surviving from six, on
 * purpose: the goal is to preserve VARIETY, not to minimize per-element
 * percent error (the authored periods are themselves arbitrary draws from
 * `randomInt(random, 20, 60)`, E-017).
 */

describe('period quantization (WAL-004)', () => {
  it('snaps the default scene periods to the authored loop table', () => {
    const authored = [36, 33, 24, 15, 13, 10];
    const exported = authored.map((period) => quantizePeriod(period));

    expect(exported).toEqual([45, 45, 22.5, 15, 15, 11.25]);
  });

  it('rounds half-cycle ties to the even divisor (10s -> 11.25s, not 9s)', () => {
    // 45 / 10 = 4.5: a tie between 4 and 5 cycles. The authored table keeps 4
    // cycles (11.25s), so a plain `Math.round` (which yields 9s) must NOT be
    // used.
    expect(quantizePeriod(10)).toBe(11.25);
  });

  it('makes every exported period divide the loop length to an integer', () => {
    for (const authored of [36, 33, 24, 15, 13, 10, 17, 29, 41, 47]) {
      const exported = quantizePeriod(authored);
      const cycles = WALLPAPER_LOOP_SECONDS / exported;

      expect(cycles).toBeCloseTo(Math.round(cycles), 9);
      expect(exported).toBeGreaterThan(0);
    }
  });

  it('preserves variety: four distinct periods survive the default scene', () => {
    const authored = [36, 33, 24, 15, 13, 10];
    const exported = new Set(authored.map((period) => quantizePeriod(period)));

    expect(exported.size).toBe(4);
    expect([...exported].sort((a, b) => a - b)).toEqual([11.25, 15, 22.5, 45]);
  });

  it('leaves an already-dividing period untouched', () => {
    expect(quantizePeriod(15)).toBe(15);
    expect(quantizePeriod(45)).toBe(45);
  });

  it('clamps very long periods to a single cycle in the loop', () => {
    // A period far longer than the loop still completes exactly one cycle.
    expect(quantizePeriod(90)).toBe(45);
    expect(quantizePeriod(360)).toBe(45);
  });
});
