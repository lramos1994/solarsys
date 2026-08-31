import { describe, expect, it } from 'vitest';
import type { AsteroidBeltConfig } from '../../ts/generator/ambient';
import {
  BOUNDS,
  validateScene,
  type RawAsteroidBeltConfig,
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
  ...(['orbitLeft', 'orbitTop', 'orbitRight', 'orbitBottom'] as const).map((field) => ({
    field,
    bound: BOUNDS[field],
    build: (value: string) => {
      const directions = {
        left: '120',
        top: '120',
        right: '120',
        bottom: '120',
        [field.replace('orbit', '').toLowerCase()]: value,
      };

      return input({
        planets: [{
          size: '10',
          distance: { mode: 'custom', ...directions },
          moon: false,
        }],
      });
    },
  })),
  {
    field: 'moonSize',
    bound: BOUNDS.moonSize,
    build: (value: string) =>
      input({
        planets: [
          { size: '10', distance: '120', moon: { size: value, distance: '200', period: '15' } },
        ],
      }),
  },
  {
    field: 'moonDistance',
    bound: BOUNDS.moonDistance,
    build: (value: string) =>
      input({
        planets: [
          { size: '10', distance: '120', moon: { size: '30', distance: value, period: '15' } },
        ],
      }),
  },
  {
    field: 'moonPeriod',
    bound: BOUNDS.moonPeriod,
    build: (value: string) =>
      input({
        planets: [
          { size: '10', distance: '120', moon: { size: '30', distance: '200', period: value } },
        ],
      }),
  },
  {
    field: 'ringSize',
    bound: BOUNDS.ringSize,
    build: (value: string) => input({
      planets: [{
        size: '10',
        distance: '120',
        moon: false,
        ring: { type: 'Banded', sizePercent: value, inclinationDegrees: '16' },
      }],
    }),
  },
  {
    field: 'ringInclination',
    bound: BOUNDS.ringInclination,
    build: (value: string) => input({
      planets: [{
        size: '10',
        distance: '120',
        moon: false,
        ring: { type: 'Banded', sizePercent: '210', inclinationDegrees: value },
      }],
    }),
  },
  ...([
    ['asteroidCount', 'count'],
    ['asteroidCentre', 'centrePercent'],
    ['asteroidThickness', 'thicknessPercent'],
    ['asteroidSize', 'sizePercent'],
    ['asteroidPeriod', 'period'],
  ] as const).map(([field, property]) => ({
    field,
    bound: BOUNDS[field],
    build: (value: string) => input({
      asteroidBelt: {
        count: '130',
        sizePercent: '0.7',
        centrePercent: '84',
        thicknessPercent: '6',
        period: '163',
        [property]: value,
      },
    }),
  })),
] as const;

describe('parameter bounds (task 1.7 acceptance evidence)', () => {
  it('defines a bound for every user-supplied numeric parameter', () => {
    expect(Object.keys(BOUNDS).sort()).toEqual(
      [
        'canvasHeight',
        'canvasWidth',
        'asteroidCount',
        'asteroidCentre',
        'asteroidThickness',
        'asteroidPeriod',
        'asteroidSize',
        'moonDistance',
        'moonPeriod',
        'moonSize',
        'orbitBottom',
        'orbitDistance',
        'orbitLeft',
        'orbitRight',
        'orbitTop',
        'planetSize',
        'ringInclination',
        'ringSize',
        'seed',
      ].sort(),
    );
  });

  it('records the ergonomics bounds', () => {
    // Canvas stays absolute; the geometric parameters are percentages of a
    // stated reference length (CTL-015).
    expect(BOUNDS.canvasWidth).toEqual({ min: 100, max: 1_500 });
    expect(BOUNDS.canvasHeight).toEqual({ min: 100, max: 1_500 });
    expect(BOUNDS.planetSize).toEqual({ min: 1, max: 25, step: 0.5 });
    expect(BOUNDS.orbitDistance).toEqual({ min: 0, max: 120 });
    expect(BOUNDS.moonSize).toEqual({ min: 10, max: 60 });
    expect(BOUNDS.moonDistance).toEqual({ min: 120, max: 600, step: 5 });
    expect(BOUNDS.moonPeriod).toEqual({ min: 1, max: 120 });
    expect(BOUNDS.ringSize).toEqual({ min: 140, max: 300 });
    expect(BOUNDS.ringInclination).toEqual({ min: 5, max: 60 });
    expect(BOUNDS.asteroidCount).toEqual({ min: 10, max: 500 });
    expect(BOUNDS.asteroidSize).toEqual({ min: 0.2, max: 3, step: 0.1 });
    expect(BOUNDS.asteroidCentre).toEqual({ min: 20, max: 110 });
    expect(BOUNDS.asteroidThickness).toEqual({ min: 1, max: 40 });
    expect(BOUNDS.asteroidPeriod).toEqual({ min: 30, max: 600 });
    expect(BOUNDS.seed).toEqual({ min: 0, max: 4_294_967_295 });
  });

  it('keeps body and orbit maxima proportionate to every canvas', () => {
    // CTL-008 restated: proportionality now holds at every canvas size, not
    // just against the largest one, because the values are percentages.
    expect(BOUNDS.planetSize.max * 2).toBeLessThanOrEqual(50);
    expect(BOUNDS.moonSize.max).toBeLessThanOrEqual(100);
    expect(BOUNDS.orbitDistance.max).toBeGreaterThanOrEqual(100);
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

describe('belt type (CTL-012)', () => {
  const belt = (type?: string): RawAsteroidBeltConfig => ({
    count: '130',
    sizePercent: '0.7',
    centrePercent: '84',
    thicknessPercent: '6',
    period: '163',
    ...(type === undefined ? {} : { type }),
  });

  function parsedBeltType(result: ReturnType<typeof validateScene>): string | undefined {
    if (!result.ok) {
      return undefined;
    }

    const config = result.params.asteroidBelt;

    if (config === undefined || config === false) {
      return undefined;
    }

    return (config as AsteroidBeltConfig & { type?: string }).type;
  }

  it('accepts and propagates every documented belt type', () => {
    for (const type of ['rocky', 'icy', 'metallic'] as const) {
      const result = validateScene(input({ asteroidBelt: belt(type) }));

      expect(result.ok, `${type} accepted`).toBe(true);
      expect(parsedBeltType(result), `${type} propagated`).toBe(type);
    }
  });

  it('rejects an unrecognised belt type', () => {
    const result = validateScene(input({ asteroidBelt: belt('molten') }));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.some((error) => error.field === 'beltType'))
      .toBe(true);
  });

  it('defaults to rocky when the type is omitted', () => {
    const result = validateScene(input({ asteroidBelt: belt() }));

    expect(result.ok).toBe(true);
    expect(parsedBeltType(result)).toBe('rocky');
  });
});

describe('orbit bound (CTL-015, retiring CTL-013)', () => {
  it('caps the shared orbital distance bound at 120 percent in every direction', () => {
    expect(BOUNDS.orbitDistance).toEqual({ min: 0, max: 120 });
    expect(BOUNDS.orbitLeft).toEqual({ min: 0, max: 120 });
    expect(BOUNDS.orbitTop).toEqual({ min: 0, max: 120 });
    expect(BOUNDS.orbitRight).toEqual({ min: 0, max: 120 });
    expect(BOUNDS.orbitBottom).toEqual({ min: 0, max: 120 });
  });

  it('accepts the new maximum of 120', () => {
    expect(
      validateScene(input({ planets: [{ size: '10', distance: '120', moon: false }] })).ok,
    ).toBe(true);
  });

  it('no longer accepts the retired absolute maximum of 400', () => {
    const result = validateScene(
      input({ planets: [{ size: '10', distance: '400', moon: false }] }),
    );

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors[0]?.field).toBe('orbitDistance');
  });

  it('rejects a scalar distance above 120', () => {
    const result = validateScene(
      input({ planets: [{ size: '10', distance: '121', moon: false }] }),
    );

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors[0]?.field).toBe('orbitDistance');
  });

  it('rejects any custom orbit extent above 120', () => {
    for (const direction of ['left', 'top', 'right', 'bottom'] as const) {
      const extents = {
        left: '100',
        top: '100',
        right: '100',
        bottom: '100',
        [direction]: '121',
      };
      const result = validateScene(input({
        planets: [{
          size: '10',
          distance: { mode: 'custom', ...extents },
          moon: false,
        }],
      }));

      expect(result.ok, `${direction} extent`).toBe(false);
      expect(
        result.ok === false && result.errors[0]?.field,
      ).toBe(`orbit${direction.charAt(0).toUpperCase()}${direction.slice(1)}`);
    }
  });

  it('keeps the default orbits 37/63/87 within the new bound', () => {
    for (const distance of [37, 63, 87]) {
      expect(distance, `${distance} within bound`).toBeLessThanOrEqual(
        BOUNDS.orbitDistance.max,
      );
      expect(
        validateScene(
          input({ planets: [{ size: '10', distance: String(distance), moon: false }] }),
        ).ok,
      ).toBe(true);
    }
  });

  it('resolves an authored percentage against the drawable half-extent', () => {
    const result = validateScene(
      input({
        canvasWidth: '600',
        canvasHeight: '600',
        planets: [{ size: '10', distance: '50', moon: false }],
      }),
    );

    // 50% of min(600, 600) / 2 = 150 absolute units reaching the generator.
    expect(result.ok && result.params.planets[0]?.distance).toBe(150);
  });
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
        input({ planets: [{ size: '10', distance: '50,20,50,20', moon: false }] }),
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
      input({ planets: [{ size: '10', distance: '100,40,80,20', moon: false }] }),
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      // Percentages of the 300x300 canvas's 150-unit half-extent.
      expect(result.params.planets[0]?.distance).toEqual([150, 60, 120, 30]);
    }
  });

  it('parses an explicit custom orbit into four directional extents', () => {
    const custom = input({
      planets: [
        {
          size: '10',
          distance: {
            mode: 'custom',
            left: '100',
            top: '40',
            right: '80',
            bottom: '20',
          },
          moon: false,
        },
      ],
    } as unknown as Partial<RawSceneInput>);

    expect(() => validateScene(custom)).not.toThrow();
    const result = validateScene(custom);

    expect(result.ok).toBe(true);

    if (result.ok) {
      // Percentages of the 300x300 canvas's 150-unit half-extent.
      expect(result.params.planets[0]?.distance).toEqual([150, 60, 120, 30]);
    }
  });

  it('rejects invalid authored ring and asteroid-belt configuration', () => {
    const result = validateScene(input({
      planets: [{
        size: '10',
        distance: '120',
        moon: false,
        ring: { type: 'Unknown', sizePercent: '301', inclinationDegrees: '4' },
      }],
      asteroidBelt: {
        count: '501',
        sizePercent: '3.1',
        centrePercent: '111',
        thicknessPercent: '41',
        period: '29',
      },
    } as unknown as Partial<RawSceneInput>));

    expect(result.ok).toBe(false);

    if (result.ok === false) {
      expect(result.errors.map((error) => error.field)).toEqual(
        expect.arrayContaining([
          'ringType',
          'ringSize',
          'ringInclination',
          'asteroidCount',
          'asteroidSize',
          'asteroidCentre',
          'asteroidThickness',
          'asteroidPeriod',
        ]),
      );
    }
  });
});
