import { describe, expect, it } from 'vitest';
import { generateScene, type SceneParams } from '../../ts/generator/scene';
import type { Canvas } from '../../ts/generator/orbit';
import {
  BOUNDS,
  halfExtent,
  validateScene,
  type RawSceneInput,
} from '../../ts/app/validation';
import { parseBakedRocks, stampedRockCount, type BakedRock } from '../helpers/baked-belt';

/**
 * Slices 2.1/2.3 (CTL-017, CTL-018, CTL-019, GEN-023, GEN-025).
 *
 * The belt is the last geometric parameter group still authored in absolute
 * units. These tests assert the proportional model: percentages resolve against
 * the drawable half-extent at the control boundary, the band is a circular
 * annulus rather than a per-axis ellipse, and the generator keeps receiving
 * absolute units.
 *
 * Measurements are taken from generated output, never from configuration.
 */

const SEED = 20260826;

interface RawBelt {
  type?: string;
  count: string;
  sizePercent: string;
  centrePercent: string;
  thicknessPercent: string;
  period: string;
}

const DEFAULT_BELT: RawBelt = {
  type: 'rocky',
  count: '130',
  sizePercent: '0.7',
  centrePercent: '84',
  thicknessPercent: '6',
  period: '163',
};

function sceneInput(
  canvas: Canvas,
  belt: Partial<RawBelt> | false = {},
): RawSceneInput {
  return {
    canvasWidth: String(canvas.width),
    canvasHeight: String(canvas.height),
    seed: String(SEED),
    palette: 'Aurora',
    planets: [
      {
        size: '6',
        distance: { mode: 'scalar', value: '63' },
        moon: false,
      },
    ],
    asteroidBelt: belt === false ? false : { ...DEFAULT_BELT, ...belt },
  } as unknown as RawSceneInput;
}

interface ResolvedBelt {
  baseRadius: number;
  innerRadius: number;
  outerRadius: number;
  count: number;
  period: number;
}

/** Validate and return the resolved absolute belt the generator will receive. */
function resolveBelt(
  canvas: Canvas,
  belt: Partial<RawBelt> = {},
): ResolvedBelt {
  const result = validateScene(sceneInput(canvas, belt));

  expect(result.ok, JSON.stringify(result.ok === false ? result.errors : {})).toBe(true);
  if (result.ok !== true) throw new Error('unreachable');

  const resolved = result.params.asteroidBelt;

  expect(resolved).toBeTruthy();

  return resolved as unknown as ResolvedBelt;
}

function rocksOf(canvas: Canvas, belt: Partial<RawBelt> = {}): BakedRock[] {
  const result = validateScene(sceneInput(canvas, belt));

  expect(result.ok).toBe(true);
  if (result.ok !== true) throw new Error('unreachable');

  const svg = generateScene(result.params as SceneParams, result.seed);
  const rocks = parseBakedRocks(svg, canvas);

  // The generator's own count claim must agree with what was actually baked;
  // this is what stops `data-count` from silently lying (GEN-026).
  expect(rocks).toHaveLength(stampedRockCount(svg));

  return rocks;
}

function sceneOf(canvas: Canvas, belt: Partial<RawBelt> | false = {}): string {
  const result = validateScene(sceneInput(canvas, belt));

  expect(result.ok).toBe(true);
  if (result.ok !== true) throw new Error('unreachable');

  return generateScene(result.params as SceneParams, result.seed);
}

const DEFAULT_CANVAS: Canvas = { width: 600, height: 600 };
const MAX_CANVAS: Canvas = { width: 1500, height: 1500 };
const WIDE_CANVAS: Canvas = { width: 1500, height: 600 };

describe('belt bounds and units (CTL-018)', () => {
  it('declares the proportional belt bounds once', () => {
    expect(BOUNDS.asteroidSize).toEqual({ min: 0.2, max: 3, step: 0.1 });
    expect(BOUNDS.asteroidCentre).toEqual({ min: 20, max: 110 });
    expect(BOUNDS.asteroidThickness).toEqual({ min: 1, max: 40 });
  });

  it('no longer declares the retired radius bounds', () => {
    expect('asteroidInnerRadius' in BOUNDS).toBe(false);
    expect('asteroidOuterRadius' in BOUNDS).toBe(false);
  });

  it('accepts both endpoints of every proportional belt range', () => {
    for (const [key, bound] of [
      ['sizePercent', BOUNDS.asteroidSize],
      ['centrePercent', BOUNDS.asteroidCentre],
      ['thicknessPercent', BOUNDS.asteroidThickness],
    ] as const) {
      for (const value of [bound.min, bound.max]) {
        const result = validateScene(
          sceneInput(DEFAULT_CANVAS, { [key]: String(value) }),
        );

        expect(result.ok, `${key}=${value}`).toBe(true);
      }
    }
  });

  it('rejects a value beyond a range, naming it', () => {
    const result = validateScene(
      sceneInput(DEFAULT_CANVAS, { centrePercent: '111' }),
    );

    expect(result.ok).toBe(false);
    if (result.ok !== false) throw new Error('unreachable');
    expect(result.errors.some((error) => error.field === 'asteroidCentre')).toBe(true);
    expect(result.errors.some((error) => /20 to 110/.test(error.message))).toBe(true);
  });

  it('rejects an asteroid size off its 0.1 increment', () => {
    const result = validateScene(
      sceneInput(DEFAULT_CANVAS, { sizePercent: '0.75' }),
    );

    expect(result.ok).toBe(false);
  });

  it('accepts the extreme band and keeps the inner edge non-negative', () => {
    const resolved = resolveBelt(DEFAULT_CANVAS, {
      centrePercent: '20',
      thicknessPercent: '40',
    });

    expect(resolved.innerRadius).toBeCloseTo(0, 6);
    expect(resolved.outerRadius).toBeGreaterThan(resolved.innerRadius);
  });

  it('accepts a belt beyond the canvas edge without clamping', () => {
    const resolved = resolveBelt(DEFAULT_CANVAS, { centrePercent: '110' });

    expect(resolved.outerRadius).toBeGreaterThan(halfExtent(DEFAULT_CANVAS));
  });

  it('never reports a retired radius-relation error', () => {
    const result = validateScene(
      sceneInput(DEFAULT_CANVAS, { centrePercent: '20', thicknessPercent: '40' }),
    );

    expect(result.ok).toBe(true);
    const failing = validateScene(
      sceneInput(DEFAULT_CANVAS, { centrePercent: '5' }),
    );

    expect(failing.ok).toBe(false);
    if (failing.ok !== false) throw new Error('unreachable');
    // `asteroidRadiusRelation` is gone from the ValidationField union, so a
    // direct comparison no longer type-checks. Compare as strings to assert the
    // runtime consequence: nothing ever emits that field.
    const fields: string[] = failing.errors.map((error) => error.field);

    expect(fields).not.toContain('asteroidRadiusRelation');
  });

  it('rejects the retired absolute belt shape', () => {
    const legacy = validateScene({
      ...sceneInput(DEFAULT_CANVAS),
      asteroidBelt: {
        type: 'rocky',
        count: '130',
        innerRadiusPercent: '81',
        outerRadiusPercent: '87',
        size: '10',
        period: '163',
      },
    } as unknown as RawSceneInput);

    expect(legacy.ok).toBe(false);
  });

  it('does not round a resolved belt value to whole units', () => {
    // 0.7% of a 300 unit reference is 2.1 — a fractional length that must
    // survive to the generator (CTL-015).
    const resolved = resolveBelt(DEFAULT_CANVAS, { sizePercent: '0.7' });

    expect(resolved.baseRadius).toBeCloseTo(2.1, 6);
    expect(Number.isInteger(resolved.baseRadius)).toBe(false);
  });
});

describe('proportional belt geometry (CTL-017)', () => {
  it('grows rock size with the canvas, damped rather than fully proportional', () => {
    const small = resolveBelt(DEFAULT_CANVAS);
    const large = resolveBelt(MAX_CANVAS);

    // Damped by sqrt (D-belt): the rock grows, but sublinearly, so a wider view
    // shows more asteroids rather than bigger ones.
    const ratio = large.baseRadius / small.baseRadius;
    const canvasRatio = halfExtent(MAX_CANVAS) / halfExtent(DEFAULT_CANVAS);

    expect(ratio).toBeCloseTo(Math.sqrt(canvasRatio), 6);
    expect(ratio).toBeGreaterThan(1);
    expect(ratio).toBeLessThan(canvasRatio);
  });

  it('preserves annulus coverage across canvas sizes', () => {
    // Presence is what must hold, not any single term of it: the damped size
    // and the compensating count together keep coverage constant.
    const coverage = (canvas: Canvas): number => {
      const belt = resolveBelt(canvas);
      const annulus =
        Math.PI * (belt.outerRadius ** 2 - belt.innerRadius ** 2);

      return (belt.count * belt.baseRadius ** 2) / annulus;
    };

    // The ratio is exact; the only slack is integer rounding of the resolved
    // count, which is proportionally largest where the count is smallest.
    const base = coverage(DEFAULT_CANVAS);

    expect(coverage(MAX_CANVAS) / base).toBeCloseTo(1, 6);
    expect(coverage({ width: 100, height: 100 }) / base).toBeCloseTo(1, 1);
  });

  it('preserves annulus coverage across band thicknesses', () => {
    const coverage = (thicknessPercent: string): number => {
      const belt = resolveBelt(DEFAULT_CANVAS, { thicknessPercent });
      const annulus =
        Math.PI * (belt.outerRadius ** 2 - belt.innerRadius ** 2);

      return (belt.count * belt.baseRadius ** 2) / annulus;
    };

    expect(coverage('40') / coverage('6')).toBeCloseTo(1, 2);
    expect(coverage('1') / coverage('6')).toBeCloseTo(1, 1);
  });

  it('renders the authored count verbatim on the default canvas', () => {
    expect(resolveBelt(DEFAULT_CANVAS).count).toBe(130);
  });

  it('shares its reference length with planet orbits', () => {
    const result = validateScene(
      sceneInput(DEFAULT_CANVAS, { centrePercent: '63' }),
    );

    expect(result.ok).toBe(true);
    if (result.ok !== true) throw new Error('unreachable');

    const belt = result.params.asteroidBelt as unknown as ResolvedBelt;
    const planetDistance = result.params.planets[0]!.distance as number;

    // The planet is authored at the same 63 percent as the belt centre.
    expect((belt.innerRadius + belt.outerRadius) / 2).toBeCloseTo(planetDistance, 9);
  });

  it('moves both band edges symmetrically when thickness changes', () => {
    const thin = resolveBelt(DEFAULT_CANVAS, { thicknessPercent: '6' });
    const thick = resolveBelt(DEFAULT_CANVAS, { thicknessPercent: '20' });

    const thinCentre = (thin.innerRadius + thin.outerRadius) / 2;
    const thickCentre = (thick.innerRadius + thick.outerRadius) / 2;

    expect(thickCentre).toBeCloseTo(thinCentre, 9);
    expect(thin.innerRadius - thick.innerRadius).toBeCloseTo(
      thick.outerRadius - thin.outerRadius,
      9,
    );
  });

  it('moves the band without resizing it when the centre changes', () => {
    const near = resolveBelt(DEFAULT_CANVAS, { centrePercent: '50' });
    const far = resolveBelt(DEFAULT_CANVAS, { centrePercent: '90' });

    expect(far.outerRadius - far.innerRadius).toBeCloseTo(
      near.outerRadius - near.innerRadius,
      9,
    );
  });

  it('hands the generator absolute units and stays byte-identical', () => {
    const result = validateScene(sceneInput(DEFAULT_CANVAS));

    expect(result.ok).toBe(true);
    if (result.ok !== true) throw new Error('unreachable');

    const belt = result.params.asteroidBelt as unknown as ResolvedBelt;

    for (const value of [belt.baseRadius, belt.innerRadius, belt.outerRadius]) {
      expect(typeof value).toBe('number');
      expect(Number.isFinite(value)).toBe(true);
    }

    expect(generateScene(result.params as SceneParams, result.seed)).toBe(
      generateScene(result.params as SceneParams, result.seed),
    );
  });
});

describe('circular annulus (GEN-023)', () => {
  it('places every rock inside the resolved annulus', () => {
    for (const canvas of [DEFAULT_CANVAS, MAX_CANVAS, WIDE_CANVAS]) {
      const resolved = resolveBelt(canvas);
      const rocks = rocksOf(canvas);

      expect(rocks.length).toBeGreaterThan(0);
      for (const rock of rocks) {
        // The baked parser estimates a rock's centre as its silhouette
        // centroid, which for the asymmetric shapes sits up to ~one scale unit
        // off the true translate origin. The tolerance is the estimator's,
        // not the generator's.
        const slack = rock.scale + 0.01;

        expect(rock.radius).toBeGreaterThanOrEqual(resolved.innerRadius - slack);
        expect(rock.radius).toBeLessThanOrEqual(resolved.outerRadius + slack);
      }
    }
  });

  it('keeps band width independent of the canvas aspect ratio', () => {
    const widthOf = (canvas: Canvas): number => {
      const radii = rocksOf(canvas).map((rock) => rock.radius);

      return Math.max(...radii) - Math.min(...radii);
    };

    // Same smaller dimension (600), very different larger dimension. The
    // centroid estimator adds up to ~a scale unit of spread per edge, so the
    // comparison carries a small absolute slack; the defect this pins was a
    // 376px difference (AB-001), three orders of magnitude above it.
    expect(Math.abs(widthOf(WIDE_CANVAS) - widthOf(DEFAULT_CANVAS))).toBeLessThan(3);
  });
});

describe('belt orbit stroke (GEN-025)', () => {
  const strokes = (svg: string): RegExpMatchArray[] =>
    [...svg.matchAll(/<[^>]*data-role="belt-orbit"[^>]*>/g)];

  it('emits exactly one stroke when the belt is enabled', () => {
    expect(strokes(sceneOf(DEFAULT_CANVAS))).toHaveLength(1);
  });

  it('emits no stroke when the belt is disabled', () => {
    expect(strokes(sceneOf(DEFAULT_CANVAS, false))).toHaveLength(0);
  });

  it('is distinguishable from a planet orbit', () => {
    const stroke = strokes(sceneOf(DEFAULT_CANVAS))[0]![0];

    expect(stroke).not.toContain('data-planet-index');
    expect(stroke).not.toContain('data-role="orbit"');
  });

  it('moves with the authored centre radius', () => {
    const near = strokes(sceneOf(DEFAULT_CANVAS, { centrePercent: '50' }))[0]![0];
    const far = strokes(sceneOf(DEFAULT_CANVAS, { centrePercent: '90' }))[0]![0];

    expect(near).not.toBe(far);
  });
});
