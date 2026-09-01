import { describe, expect, it } from 'vitest';
import { inspectStructure } from '../helpers/structure';
import { PALETTE_NAMES } from '../../ts/generator/palette';
import {
  generateScene,
  type PlanetParams,
  type SceneParams,
} from '../../ts/generator/scene';

/**
 * Task 2.15 (QLT-002, QLT-003, EXP-004): determinism and integrity sweep.
 *
 * The earlier tests each probe one property on one configuration. This sweep
 * asserts those properties hold ACROSS the parameter space — many seeds,
 * planet counts, canvas sizes and moon configurations — which is where
 * order-dependent id collisions and dangling references actually surface.
 */

const CANVASES = [
  { width: 100, height: 100 },
  { width: 300, height: 300 },
  { width: 640, height: 360 },
  { width: 360, height: 640 },
] as const;

const PLANET_COUNTS = [0, 1, 3, 8] as const;

/** Build a planet set exercising scalar/four-value distance and moon variants. */
function planetsFor(count: number): PlanetParams[] {
  return Array.from({ length: count }, (_, index) => ({
    size: 4 + (index % 5) * 2,
    distance:
      index % 3 === 0
        ? 40 + index * 12
        : ([40 + index * 10, 30 + index * 8, 40 + index * 10, 30 + index * 8] as [
            number,
            number,
            number,
            number,
          ]),
    moon:
      index % 3 === 1
        ? false
        : { size: 2 + (index % 3), distance: 10 + index * 2 },
  }));
}

/** The full parameter sweep: canvases x planet counts x palettes. */
function sweep(): SceneParams[] {
  const cases: SceneParams[] = [];

  CANVASES.forEach((canvas, canvasIndex) => {
    PLANET_COUNTS.forEach((count, countIndex) => {
      cases.push({
        canvas,
        planets: planetsFor(count),
        palette: PALETTE_NAMES[(canvasIndex + countIndex) % PALETTE_NAMES.length]!,
      });
    });
  });

  return cases;
}

const SEEDS = [0, 1, 42, 1_337, 99_991, 4_294_967_295] as const;
const CASES = sweep();

describe('determinism sweep', () => {
  it('covers a meaningful parameter space', () => {
    expect(CASES.length).toBe(CANVASES.length * PLANET_COUNTS.length);
    expect(CASES.length * SEEDS.length).toBeGreaterThanOrEqual(90);
  });

  it('produces byte-identical output on repeat generation across the sweep', () => {
    for (const params of CASES) {
      for (const seed of SEEDS) {
        const first = generateScene(params, seed);
        const second = generateScene(params, seed);

        expect(
          first,
          `canvas ${params.canvas.width}x${params.canvas.height}, ` +
            `${params.planets.length} planets, seed ${seed}`,
        ).toBe(second);
      }
    }
  });

  it('produces different output for different seeds on the same parameters', () => {
    for (const params of CASES) {
      const outputs = new Set(SEEDS.map((seed) => generateScene(params, seed)));

      // A zero-planet scene still varies through its ambient elements.
      expect(outputs.size, `${params.planets.length} planets`).toBeGreaterThan(1);
    }
  });

  it('does not depend on generation order between scenes', () => {
    const forward = CASES.map((params) => generateScene(params, 42));
    const backward = [...CASES]
      .reverse()
      .map((params) => generateScene(params, 42))
      .reverse();

    expect(forward).toEqual(backward);
  });
});

describe('integrity sweep', () => {
  // The XML well-formedness pass over every (params, seed) combination is CPU
  // bound and routinely exceeds the default 5s budget on shared CI runners
  // (observed twice on GitHub-hosted ubuntu-latest); the generous budget only
  // bounds a hang, it never masks a failure.
  it('keeps every generated scene well-formed', { timeout: 60_000 }, () => {
    for (const params of CASES) {
      for (const seed of SEEDS) {
        const report = inspectStructure(generateScene(params, seed));
        const wellFormed = report.violations.filter(
          (violation) => violation.kind === 'not-well-formed',
        );

        expect(
          wellFormed,
          `canvas ${params.canvas.width}x${params.canvas.height}, seed ${seed}`,
        ).toEqual([]);
      }
    }
  });

  it('keeps every identifier unique across the sweep', () => {
    for (const params of CASES) {
      for (const seed of SEEDS) {
        const report = inspectStructure(generateScene(params, seed));
        const duplicates = report.violations.filter(
          (violation) => violation.kind === 'duplicate-id',
        );

        expect(
          duplicates,
          `canvas ${params.canvas.width}x${params.canvas.height}, seed ${seed}`,
        ).toEqual([]);
      }
    }
  });

  it('resolves every internal reference across the sweep', () => {
    for (const params of CASES) {
      for (const seed of SEEDS) {
        const report = inspectStructure(generateScene(params, seed));
        const dangling = report.violations.filter(
          (violation) => violation.kind === 'dangling-reference',
        );

        expect(
          dangling,
          `canvas ${params.canvas.width}x${params.canvas.height}, seed ${seed}`,
        ).toEqual([]);
      }
    }
  });

  it('actually inspected identifiers and references, not empty documents', () => {
    const report = inspectStructure(
      generateScene(
        { canvas: { width: 300, height: 300 }, planets: planetsFor(3) },
        42,
      ),
    );

    expect(report.ids.length).toBeGreaterThan(10);
    expect(report.references.length).toBeGreaterThan(5);
  });

  it('holds integrity in debug mode too', () => {
    for (const params of CASES.slice(0, 6)) {
      const report = inspectStructure(generateScene(params, 42, { debug: true }));

      expect(report.violations).toEqual([]);
    }
  });
});
