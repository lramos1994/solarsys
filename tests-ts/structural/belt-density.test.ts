import { describe, expect, it } from 'vitest';
import { generateScene, type SceneParams } from '../../ts/generator/scene';
import type { Canvas } from '../../ts/generator/orbit';
import {
  BELT_RENDER_CAP,
  validateScene,
  type RawSceneInput,
} from '../../ts/app/validation';
import { parseBakedRocks, stampedRockCount, type BakedRock } from '../helpers/baked-belt';

/**
 * Task 1.3 (GEN-023, GEN-024): the measurement harness for belt density.
 *
 * These helpers are the metrics the later slices assert against. They are
 * introduced FIRST, asserting the CURRENT behaviour, so that they are proven to
 * measure something real before the geometry changes underneath them. A metric
 * that silently returned a constant would satisfy a "coverage is preserved"
 * assertion forever; the CONTROL arms below exist to make that impossible.
 *
 * Measurements go through `generateScene`, not `renderAsteroidBelt` directly:
 * the belt shares one PRNG with the background rendered before it, so calling
 * the belt in isolation draws a different sequence and yields different numbers.
 * This is the path `reference-behavior.md` AB-001 measured, and the values
 * pinned below reproduce that table exactly.
 *
 * When slices 2.4/2.6 land, the CONTROL arms are the assertions that must go red.
 */

const SEED = 20260826;

/**
 * The unit shape polygons span roughly 1.8 units across, so a rock's rendered
 * diameter is `1.8 * scale`. The constant only has to be consistent: every
 * metric below is a ratio, so a systematic factor cancels.
 */
const ROCK_UNIT_SPAN = 1.8;

type Rock = BakedRock;

function rockArea(scale: number): number {
  return (ROCK_UNIT_SPAN * scale) ** 2 * 0.6;
}

/**
 * Summed rock footprint over annulus area, as a percentage. This is the
 * "presence" metric: the one that collapses from 2.90% to 0.50% in AB-001.
 *
 * The annulus is measured from the rocks themselves rather than from the
 * configuration, so the metric survives the parameter-shape change in slice 2.2.
 */
export function coveragePercent(rocks: readonly Rock[]): number {
  const radii = rocks.map((rock) => rock.radius);
  const inner = Math.min(...radii);
  const outer = Math.max(...radii);
  const annulus = Math.PI * (outer * outer - inner * inner);
  const footprint = rocks.reduce((sum, rock) => sum + rockArea(rock.scale), 0);

  return (footprint / annulus) * 100;
}

/** Mean rendered rock diameter as a percentage of the drawable half-extent. */
export function rockDiameterPercent(
  rocks: readonly Rock[],
  canvas: Canvas,
): number {
  const halfExtent = Math.min(canvas.width, canvas.height) / 2;
  const meanScale =
    rocks.reduce((sum, rock) => sum + rock.scale, 0) / rocks.length;

  return ((meanScale * ROCK_UNIT_SPAN) / halfExtent) * 100;
}

/** Radial band width in absolute units: greatest rock radius minus least. */
export function bandWidth(rocks: readonly Rock[]): number {
  const radii = rocks.map((rock) => rock.radius);

  return Math.max(...radii) - Math.min(...radii);
}

/**
 * Share of rocks falling in the OUTER half of the annulus BY AREA.
 *
 * Under area-uniform sampling this tends to 50%. Under the current
 * uniform-in-radius sampling it falls below 50%, because equal radial slices
 * carry unequal area and the inner slice is over-weighted (AB-D7). The effect
 * is only visible on a WIDE band: across a thin 6-point band the two
 * distributions are numerically indistinguishable.
 */
export function outerHalfShare(rocks: readonly Rock[]): number {
  const radii = rocks.map((rock) => rock.radius);
  const inner = Math.min(...radii);
  const outer = Math.max(...radii);
  const split = Math.sqrt((inner * inner + outer * outer) / 2);
  const beyond = rocks.filter((rock) => rock.radius >= split).length;

  return (beyond / rocks.length) * 100;
}

/** Ratio of the largest to the smallest rendered rock scale. */
export function scaleRatio(rocks: readonly Rock[]): number {
  const scales = rocks.map((rock) => rock.scale);

  return Math.max(...scales) / Math.min(...scales);
}

interface BeltOverrides {
  count?: string;
  sizePercent?: string;
  centrePercent?: string;
  thicknessPercent?: string;
}

/**
 * Generate a scene through the control boundary and return its rocks.
 *
 * Percentages are resolved by `validateScene`, exactly as the product does, so
 * these measurements exercise the real resolution path rather than a
 * test-local reimplementation of it.
 */
function belt(canvas: Canvas, overrides: BeltOverrides = {}): Rock[] {
  const result = validateScene({
    canvasWidth: String(canvas.width),
    canvasHeight: String(canvas.height),
    seed: String(SEED),
    palette: 'Aurora',
    planets: [
      { size: '6', distance: { mode: 'scalar', value: '63' }, moon: false },
    ],
    asteroidBelt: {
      type: 'rocky',
      count: '130',
      sizePercent: '0.7',
      centrePercent: '84',
      thicknessPercent: '6',
      period: '163',
      ...overrides,
    },
  } as unknown as RawSceneInput);

  if (result.ok !== true) {
    throw new Error(`invalid belt input: ${JSON.stringify(result.errors)}`);
  }

  const svg = generateScene(result.params as SceneParams, result.seed);
  const rocks = parseBakedRocks(svg, canvas);

  expect(rocks).toHaveLength(stampedRockCount(svg));

  return rocks;
}

describe('belt density (GEN-023, GEN-024)', () => {
  it('parses every rendered rock', () => {
    const rocks = belt({ width: 600, height: 600 });

    expect(rocks).toHaveLength(130);
    expect(rocks.every((rock) => Number.isFinite(rock.radius))).toBe(true);
    expect(rocks.every((rock) => rock.scale > 0)).toBe(true);
  });

  // These five assertions were written as CONTROL arms against the pre-change
  // generator, where each reproduced a measured defect from AB-001. They went
  // red exactly when the corresponding slice landed, which is what proves the
  // metrics above measure real geometry rather than returning constants. They
  // now pin the corrected behaviour.
  it('preserves annulus coverage as the canvas grows (was AB-D3: 5.8x collapse)', () => {
    const small = coveragePercent(belt({ width: 600, height: 600 }));
    const large = coveragePercent(belt({ width: 1500, height: 1500 }));

    // The resolution is exact — `belt-geometry.test.ts` asserts that on the
    // resolved values. What is measured HERE is rendered output, where each
    // rock draws its own size multiplier, so the realised mean of squared
    // multipliers carries sampling noise. Across seeds this ratio was measured
    // spanning 0.90..1.12 in BOTH directions, which is variance, not bias.
    // The band below is wide enough for that noise and still an order of
    // magnitude tighter than the 5.8x collapse it replaced.
    expect(large / small).toBeGreaterThan(0.8);
    expect(large / small).toBeLessThan(1.25);
  });

  it('grows rock presence sublinearly, not absolutely (was AB-D1)', () => {
    const small = { width: 600, height: 600 };
    const large = { width: 1500, height: 1500 };

    const smallShare = rockDiameterPercent(belt(small), small);
    const largeShare = rockDiameterPercent(belt(large), large);

    // Damped: a rock keeps more of its presence than the absolute model, but
    // deliberately does not hold a constant share — the count carries the rest.
    expect(largeShare).toBeLessThan(smallShare);
    expect(largeShare).toBeGreaterThan(smallShare / 2);
  });

  it('keeps the band circular on a non-square canvas (was AB-D2: 394px)', () => {
    const square = bandWidth(belt({ width: 600, height: 600 }));
    const wide = bandWidth(belt({ width: 1500, height: 600 }));

    // Centroid-estimator slack; the pinned defect was a 376px difference.
    expect(Math.abs(wide - square)).toBeLessThan(3);
  });

  it('distributes radial placement by area (was AB-D7: 31.4% outer half)', () => {
    const rocks = belt(
      { width: 600, height: 600 },
      { count: '500', centrePercent: '55', thicknessPercent: '40' },
    );

    // Equal areas receive equal expected counts, so the outer half by area
    // holds about half the rocks.
    expect(outerHalfShare(rocks)).toBeGreaterThan(45);
    expect(outerHalfShare(rocks)).toBeLessThan(55);
  });

  it('gives rocks a visible size hierarchy (was AB-D8: 2.36 ratio)', () => {
    const rocks = belt({ width: 600, height: 600 }, { count: '500' });

    expect(scaleRatio(rocks)).toBeGreaterThanOrEqual(4);
  });

  it('renders the authored count verbatim on the default canvas', () => {
    expect(belt({ width: 600, height: 600 })).toHaveLength(130);
  });

  it('caps the effective count', () => {
    const rocks = belt(
      { width: 1500, height: 1500 },
      { count: '500', centrePercent: '110', thicknessPercent: '40' },
    );

    expect(rocks.length).toBeLessThanOrEqual(BELT_RENDER_CAP);
  });
});
