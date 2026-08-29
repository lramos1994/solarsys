import { describe, expect, it } from 'vitest';
import { findBeltLoop, type BeltLoopPlan } from '../../ts/app/wallpaper';

/**
 * Task 3.2 (WAL-005): belt loop closure by N-fold rotational symmetry plus a
 * residual fine-tune.
 *
 * The belt is one group rotation over static rocks (E-019), so a distribution
 * with N-fold symmetry looks identical every 1/N turn. Its effective period is
 * `period / N` with no speed change; a (N, k) search then finds the fold whose
 * effective period lies nearest a whole divisor of the loop length, so the
 * residual adjustment stays tiny (0.6% for the default scene, versus 63% under
 * pure quantization).
 */

const DEFAULT_PERIOD = 163;
const DEFAULT_ROCK_COUNT = 130;
const LOOP_SECONDS = 45;

describe('belt loop closure (WAL-005)', () => {
  it('selects N=18 for the default scene with a sub-1% adjustment', () => {
    const plan = findBeltLoop(DEFAULT_PERIOD, DEFAULT_ROCK_COUNT, LOOP_SECONDS);

    expect(plan.symmetry).toBe(18);
    expect(plan.adjustment).toBeLessThan(0.01);
    // 163/18 = 9.055...s snaps to 45/5 = 9.00s.
    expect(plan.cyclesPerLoop).toBe(5);
    expect(plan.loopPeriod).toBeCloseTo(9, 6);
  });

  it('keeps the redistributed rock count within five percent', () => {
    const plan = findBeltLoop(DEFAULT_PERIOD, DEFAULT_ROCK_COUNT, LOOP_SECONDS);

    const deviation = Math.abs(plan.redistributedCount - DEFAULT_ROCK_COUNT) / DEFAULT_ROCK_COUNT;

    expect(plan.redistributedCount).toBe(126);
    expect(deviation).toBeLessThanOrEqual(0.05);
  });

  it('preserves the belt rotation speed within the residual tolerance', () => {
    // The fine-tuned full rotation is `loopPeriod * symmetry` seconds; for the
    // default scene 9 * 18 = 162s against an authored 163s — a 0.6% change.
    const plan = findBeltLoop(DEFAULT_PERIOD, DEFAULT_ROCK_COUNT, LOOP_SECONDS);
    const fineTunedRotation = plan.loopPeriod * plan.symmetry;

    expect(Math.abs(fineTunedRotation - DEFAULT_PERIOD) / DEFAULT_PERIOD).toBeLessThan(0.01);
  });

  it('rejects a too-large fold that would collapse density or variety', () => {
    // N=127 would give a 0.18% adjustment but leaves only a single rock per
    // sector (127 identical rocks), which the MIN_SECTOR_ROCKS floor forbids.
    const plan = findBeltLoop(DEFAULT_PERIOD, DEFAULT_ROCK_COUNT, LOOP_SECONDS);

    expect(plan.symmetry).toBeLessThan(127);
    expect(DEFAULT_ROCK_COUNT / plan.symmetry).toBeGreaterThanOrEqual(6);
  });

  it('still yields a valid single-fold plan for a tiny belt', () => {
    const plan = findBeltLoop(163, 10, LOOP_SECONDS);

    expect(plan.symmetry).toBe(1);
    expect(plan.redistributedCount).toBe(10);
    expect(plan.cyclesPerLoop).toBeGreaterThanOrEqual(1);
  });
});

describe('belt loop plan invariants', () => {
  it('makes the effective period divide the loop length exactly', () => {
    for (const period of [120, 163, 180, 200, 240]) {
      const plan: BeltLoopPlan = findBeltLoop(period, DEFAULT_ROCK_COUNT, LOOP_SECONDS);
      const cycles = LOOP_SECONDS / plan.loopPeriod;

      expect(cycles).toBeCloseTo(Math.round(cycles), 9);
    }
  });

  it('never exceeds the five-percent density budget across candidate periods', () => {
    for (const period of [120, 140, 163, 180, 220, 240]) {
      const plan = findBeltLoop(period, DEFAULT_ROCK_COUNT, LOOP_SECONDS);
      const deviation =
        Math.abs(plan.redistributedCount - DEFAULT_ROCK_COUNT) / DEFAULT_ROCK_COUNT;

      expect(deviation, `period ${period}`).toBeLessThanOrEqual(0.05);
    }
  });
});
