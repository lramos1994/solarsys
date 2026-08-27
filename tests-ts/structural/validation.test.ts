import { describe, expect, it } from 'vitest';
import {
  BOUNDS,
  validateScene,
  type RawSceneInput,
} from '../../ts/app/validation';

/**
 * Task 3.5 (CTL-007, CTL-008) — and the acceptance evidence for task 1.7.
 *
 * Every bound fixed in 1.7 is asserted here at BOTH endpoints and immediately
 * beyond each, which is what 1.7's corrected verification criterion requires.
 *
 * Validation lives at the UI boundary; the generator assumes valid input
 * (D-21), so these tests target the validator rather than `generateScene`.
 */

function input(overrides: Partial<RawSceneInput> = {}): RawSceneInput {
  return {
    canvasWidth: '300',
    canvasHeight: '300',
    seed: '42',
    palette: 'Aurora',
    planets: [{ size: '10', distance: '120', moon: false }],
    ...overrides,
  };
}

/** Every numeric bound, as a table so no parameter can be silently skipped. */
const NUMERIC_CASES = [
  {
    field: 'canvasWidth',
    bound: BOUNDS.canvasWidth,
    build: (value: string) => input({ canvasWidth: value }),
  },
  {
    field: 'canvasHeight',
    bound: BOUNDS.canvasHeight,
    build: (value: string) => input({ canvasHeight: value }),
  },
  {
    field: 'seed',
    bound: BOUNDS.seed,
    build: (value: string) => input({ seed: value }),
  },
  {
    field: 'planetSize',
    bound: BOUNDS.planetSize,
    build: (value: string) =>
      input({ planets: [{ size: value, distance: '120', moon: false }] }),
  },
  {
    field: 'orbitDistance',
    bound: BOUNDS.orbitDistance,
    build: (value: string) =>
      input({ planets: [{ size: '10', distance: value, moon: false }] }),
  },
  {
    field: 'moonSize',
    bound: BOUNDS.moonSize,
    build: (value: string) =>
      input({
        planets: [
          { size: '10', distance: '120', moon: { size: value, distance: '25', period: '15' } },
        ],
      }),
  },
  {
    field: 'moonDistance',
    bound: BOUNDS.moonDistance,
    build: (value: string) =>
      input({
        planets: [
          { size: '10', distance: '120', moon: { size: '3', distance: value, period: '15' } },
        ],
      }),
  },
  {
    field: 'moonPeriod',
    bound: BOUNDS.moonPeriod,
    build: (value: string) =>
      input({
        planets: [
          { size: '10', distance: '120', moon: { size: '3', distance: '25', period: value } },
        ],
      }),
  },
] as const;

describe('parameter bounds (task 1.7 acceptance evidence)', () => {
  it('defines a bound for every user-supplied numeric parameter', () => {
    expect(Object.keys(BOUNDS).sort()).toEqual(
      [
        'canvasHeight',
        'canvasWidth',
        'moonDistance',
        'moonPeriod',
        'moonSize',
        'orbitDistance',
        'planetSize',
        'seed',
      ].sort(),
    );
  });

  it('records the ergonomics bounds', () => {
    expect(BOUNDS.canvasWidth).toEqual({ min: 100, max: 1_500 });
    expect(BOUNDS.canvasHeight).toEqual({ min: 100, max: 1_500 });
    expect(BOUNDS.planetSize).toEqual({ min: 1, max: 100 });
    expect(BOUNDS.orbitDistance).toEqual({ min: 0, max: 1_200 });
    expect(BOUNDS.moonSize).toEqual({ min: 1, max: 40 });
    expect(BOUNDS.moonDistance).toEqual({ min: 0, max: 1_000 });
    expect(BOUNDS.moonPeriod).toEqual({ min: 1, max: 120 });
    expect(BOUNDS.seed).toEqual({ min: 0, max: 4_294_967_295 });
  });

  it('keeps body and orbit maxima proportionate to the largest canvas', () => {
    const largestCanvas = BOUNDS.canvasWidth.max;

    expect(BOUNDS.planetSize.max).toBeLessThanOrEqual(largestCanvas / 10);
    expect(BOUNDS.moonSize.max).toBeLessThanOrEqual(largestCanvas / 10);
    expect(BOUNDS.orbitDistance.max).toBeLessThanOrEqual(largestCanvas * 2);
  });

  for (const { field, bound, build } of NUMERIC_CASES) {
    describe(field, () => {
      it('accepts the minimum', () => {
        expect(validateScene(build(String(bound.min))).ok, `${field} min`).toBe(true);
      });

      it('accepts the maximum', () => {
        expect(validateScene(build(String(bound.max))).ok, `${field} max`).toBe(true);
      });

      it('rejects just below the minimum', () => {
        const result = validateScene(build(String(bound.min - 1)));

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.errors[0]?.field).toBe(field);
      });

      it('rejects just above the maximum', () => {
        const result = validateScene(build(String(bound.max + 1)));

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.errors[0]?.field).toBe(field);
      });

      it('states the accepted range in the rejection message', () => {
        const result = validateScene(build(String(bound.max + 1)));

        expect(result.ok).toBe(false);

        if (result.ok === false) {
          expect(result.errors[0]?.message).toContain(String(bound.min));
          expect(result.errors[0]?.message).toContain(String(bound.max));
        }
      });

      it('rejects a non-numeric value naming the control', () => {
        const result = validateScene(build('abc'));

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.errors[0]?.field).toBe(field);
      });
    });
  }
});

describe('baseline invalid-input cases', () => {
  // Each case comes from the audit's edge-case probes (E-026..E-033), where
  // the PHP baseline threw a raw ValueError/TypeError or silently degraded.
  it('rejects a negative canvas dimension (E-026)', () => {
    expect(validateScene(input({ canvasWidth: '-300' })).ok).toBe(false);
  });

  it('rejects a negative planet size (E-027)', () => {
    expect(
      validateScene(input({ planets: [{ size: '-5', distance: '50', moon: false }] })).ok,
    ).toBe(false);
  });

  it('rejects a non-numeric planet size (E-028)', () => {
    expect(
      validateScene(input({ planets: [{ size: 'abc', distance: '50', moon: false }] })).ok,
    ).toBe(false);
  });

  it('rejects non-numeric canvas dimensions (E-029)', () => {
    expect(validateScene(input({ canvasWidth: 'abc', canvasHeight: 'def' })).ok).toBe(false);
  });

  it('rejects a zero planet size rather than rendering an invisible planet', () => {
    expect(
      validateScene(input({ planets: [{ size: '0', distance: '50', moon: false }] })).ok,
    ).toBe(false);
  });

  it('rejects an empty value', () => {
    expect(validateScene(input({ canvasWidth: '' })).ok).toBe(false);
  });

  it('rejects a non-finite value', () => {
    expect(validateScene(input({ canvasWidth: 'Infinity' })).ok).toBe(false);
    expect(validateScene(input({ canvasWidth: 'NaN' })).ok).toBe(false);
  });

  it('rejects a fractional value where an integer is required', () => {
    expect(validateScene(input({ canvasWidth: '300.7' })).ok).toBe(false);
  });

  it('accepts a four-value distance and rejects a malformed one (E-030)', () => {
    expect(
      validateScene(
        input({ planets: [{ size: '10', distance: '150,60,150,60', moon: false }] }),
      ).ok,
    ).toBe(true);
    expect(
      validateScene(input({ planets: [{ size: '10', distance: '10,20', moon: false }] })).ok,
    ).toBe(false);
  });

  it('rejects an unknown palette name', () => {
    expect(validateScene(input({ palette: 'Neon' })).ok).toBe(false);
  });

  it('maps the Random UI option to generator-owned palette selection', () => {
    const result = validateScene(input({ palette: 'Random' }));

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.params).not.toHaveProperty('palette');
    }
  });
});

describe('rejection semantics', () => {
  it('never silently clamps an out-of-range value', () => {
    const result = validateScene(input({ canvasWidth: '999999' }));

    expect(result.ok).toBe(false);
  });

  it('never substitutes a default for an invalid value', () => {
    const result = validateScene(input({ canvasWidth: 'abc' }));

    expect(result.ok).toBe(false);
  });

  it('reports every invalid field rather than stopping at the first', () => {
    const result = validateScene(input({ canvasWidth: 'abc', canvasHeight: '-1' }));

    expect(result.ok).toBe(false);

    if (result.ok === false) {
      expect(result.errors.map((error) => error.field)).toEqual([
        'canvasWidth',
        'canvasHeight',
      ]);
    }
  });

  it('surfaces no raw runtime error text', () => {
    const result = validateScene(input({ canvasWidth: 'abc' }));

    if (result.ok === false) {
      for (const error of result.errors) {
        expect(error.message).not.toMatch(/TypeError|ValueError|undefined|NaN/);
      }
    }
  });

  it('identifies the offending planet by index', () => {
    const result = validateScene(
      input({
        planets: [
          { size: '10', distance: '50', moon: false },
          { size: '-1', distance: '50', moon: false },
        ],
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors[0]?.message).toMatch(/planet 2/i);
  });

  it('produces generator-ready params on success', () => {
    const result = validateScene(input());

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.params.canvas).toEqual({ width: 300, height: 300 });
      expect(result.params.planets).toHaveLength(1);
      expect(result.seed).toBe(42);
    }
  });

  it('parses a four-value distance into its four extents', () => {
    const result = validateScene(
      input({ planets: [{ size: '10', distance: '150,60,140,50', moon: false }] }),
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.params.planets[0]?.distance).toEqual([150, 60, 140, 50]);
    }
  });
});
