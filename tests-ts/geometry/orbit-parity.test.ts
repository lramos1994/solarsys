import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BEZIER_CONSTANT, orbitPath } from '../../ts/generator/orbit';

/**
 * Task 2.4 (GEN-002, QLT-001): geometry parity against the committed PHP
 * oracle captured in task 1.2.
 *
 * Parity is evaluated on COORDINATES, not on the serialized string and not on
 * pixels (D-03). PHP and JavaScript format floats differently, so comparing
 * path strings would fail for reasons that have nothing to do with geometry.
 * Each path is therefore reduced to its command sequence plus its numeric
 * operands, and the numbers are compared within an explicit tolerance.
 */

/** Defined numeric tolerance for QLT-001 coordinate parity, in SVG units. */
const TOLERANCE = 1e-9;

interface OracleOrbit {
  name: string;
  canvas: { width: number; height: number };
  distance: number | [number, number, number, number];
  path: string;
}

interface Oracle {
  source: string;
  bezierConstant: number;
  orbits: OracleOrbit[];
}

const oracle = JSON.parse(
  readFileSync(new URL('../fixtures/geometry-oracle.json', import.meta.url), 'utf8'),
) as Oracle;

/** Split an SVG path into its command letters and its numeric operands. */
function decompose(path: string): { commands: string[]; numbers: number[] } {
  const commands = path.match(/[A-Za-z]/g) ?? [];
  const numbers = (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

  return { commands, numbers };
}

describe('orbit geometry parity with the PHP oracle', () => {
  it('exposes the baseline Bezier constant', () => {
    expect(BEZIER_CONSTANT).toBe(0.5522847498);
    expect(BEZIER_CONSTANT).toBe(oracle.bezierConstant);
  });

  it('covers both scalar and four-value distances in the fixture', () => {
    const scalar = oracle.orbits.filter((orbit) => typeof orbit.distance === 'number');
    const fourValue = oracle.orbits.filter((orbit) => Array.isArray(orbit.distance));

    expect(scalar.length).toBeGreaterThanOrEqual(3);
    expect(fourValue.length).toBeGreaterThanOrEqual(3);
  });

  for (const orbit of oracle.orbits) {
    describe(orbit.name, () => {
      const generated = orbitPath(orbit.canvas, orbit.distance);
      const actual = decompose(generated);
      const expected = decompose(orbit.path);

      it('emits the same command sequence as the reference', () => {
        expect(actual.commands).toEqual(expected.commands);
      });

      it('emits the same number of coordinates as the reference', () => {
        expect(actual.numbers).toHaveLength(expected.numbers.length);
      });

      it('matches every reference coordinate within tolerance', () => {
        expected.numbers.forEach((reference, index) => {
          expect(Math.abs(actual.numbers[index]! - reference)).toBeLessThanOrEqual(
            TOLERANCE,
          );
        });
      });

      it('closes the path', () => {
        expect(generated.trimEnd().endsWith('Z')).toBe(true);
      });
    });
  }
});

describe('orbit geometry semantics', () => {
  const canvas = { width: 300, height: 300 };

  it('treats a scalar distance as four equal extents', () => {
    expect(orbitPath(canvas, 50)).toBe(orbitPath(canvas, [50, 50, 50, 50]));
  });

  it('produces an asymmetric path when extents differ', () => {
    expect(orbitPath(canvas, [150, 60, 150, 60])).not.toBe(orbitPath(canvas, 150));
  });

  it('centres the orbit on the canvas centre', () => {
    const { numbers } = decompose(orbitPath(canvas, 50));

    // The path starts at (cx - left, cy).
    expect(numbers[0]).toBeCloseTo(100, 9);
    expect(numbers[1]).toBeCloseTo(150, 9);
  });

  it('does not clamp an orbit that overflows the canvas (D-07)', () => {
    const { numbers } = decompose(orbitPath(canvas, 5_000));

    expect(Math.min(...numbers)).toBeLessThan(0);
  });
});
