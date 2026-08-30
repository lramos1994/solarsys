import { describe, expect, it } from 'vitest';
import { BOUNDS, validateScene, type RawSceneInput } from '../../ts/app/validation';
import { generateScene } from '../../ts/generator/scene';

/**
 * Tasks 1.2, 2.1–2.6 (CTL-014, CTL-015, CTL-016, CTL-008).
 *
 * These assertions are GEOMETRIC: every claim is measured from the path data
 * the generator actually emitted, never from `BOUNDS` or from the markup shape.
 * A model that declared proportional bounds and still resolved them absolutely
 * would satisfy a configuration check and must fail here.
 *
 * The reference length for orbital distance and planet size is the drawable
 * half-extent `min(width, height) / 2`; for a moon it is its parent planet's
 * resolved radius (PR-D1..PR-D4).
 */

const SEED = 20260826;

/** Drawable half-extent: the distance from the centre to the nearest edge. */
function halfExtent(width: number, height: number): number {
  return Math.min(width, height) / 2;
}

function scene(input: RawSceneInput): string {
  const result = validateScene(input);

  if (!result.ok) {
    throw new Error(
      `expected valid input, got: ${result.errors.map((e) => e.message).join('; ')}`,
    );
  }

  return generateScene(result.params, result.seed);
}

function input(overrides: Partial<RawSceneInput> = {}): RawSceneInput {
  return {
    canvasWidth: '600',
    canvasHeight: '600',
    seed: String(SEED),
    palette: 'Aurora',
    planets: [{ size: '6', distance: { mode: 'scalar', value: '50' }, moon: false }],
    ...overrides,
  };
}

/**
 * Leftmost x of the first orbit path. `orbitPath` starts at `M cx-left cy`,
 * so the orbit's left extent is `cx` minus this value.
 */
function orbitExtent(svg: string, canvasWidth: number): number {
  const match = /data-role="orbit"[^>]*\sd="M ([-\d.]+) /.exec(svg);

  if (match === null) {
    throw new Error('no orbit path in the generated scene');
  }

  return canvasWidth / 2 - Number(match[1]);
}

/** Radius of the first planet body circle. */
function planetRadius(svg: string): number {
  const match = /data-role="planet-body"[^>]*\sr="([\d.]+)"/.exec(svg);

  if (match === null) {
    throw new Error('no planet body in the generated scene');
  }

  return Number(match[1]);
}

/** Radius of the first moon orbit path, which starts at `M -distance 0`. */
function moonOrbitRadius(svg: string): number {
  const match = /data-role="moon-orbit"[^>]*\sd="M ([-\d.]+) /.exec(svg);

  if (match === null) {
    throw new Error('no moon orbit in the generated scene');
  }

  return -Number(match[1]);
}

function moonRadius(svg: string): number {
  const match = /data-role="moon-body"[^>]*\sr="([\d.]+)"/.exec(svg);

  if (match === null) {
    throw new Error('no moon body in the generated scene');
  }

  return Number(match[1]);
}

describe('CTL-014 orbital distance is proportional to the canvas', () => {
  it('reaches the same fraction of the drawable half-extent at every canvas size', () => {
    const authored = '80';
    const ratios = [100, 300, 600, 900, 1500].map((size) => {
      const svg = scene(
        input({
          canvasWidth: String(size),
          canvasHeight: String(size),
          planets: [
            { size: '6', distance: { mode: 'scalar', value: authored }, moon: false },
          ],
        }),
      );

      return orbitExtent(svg, size) / halfExtent(size, size);
    });

    for (const ratio of ratios) {
      expect(ratio).toBeCloseTo(0.8, 6);
    }
  });

  it('can reach the edge of the largest permitted canvas', () => {
    const size = BOUNDS.canvasWidth.max;
    const svg = scene(
      input({
        canvasWidth: String(size),
        canvasHeight: String(size),
        planets: [
          {
            size: '6',
            distance: { mode: 'scalar', value: String(BOUNDS.orbitDistance.max) },
            moon: false,
          },
        ],
      }),
    );

    // PR-004 measured 53.3% here under the absolute model.
    expect(orbitExtent(svg, size)).toBeGreaterThanOrEqual(halfExtent(size, size));
  });

  it('accepts an orbit beyond the canvas edge and does not clamp it', () => {
    const svg = scene(
      input({
        planets: [{ size: '6', distance: { mode: 'scalar', value: '120' }, moon: false }],
      }),
    );

    expect(orbitExtent(svg, 600)).toBeCloseTo(halfExtent(600, 600) * 1.2, 6);
  });

  it('uses the smaller dimension as the reference on a non-square canvas', () => {
    const svg = scene(
      input({
        canvasWidth: '1200',
        canvasHeight: '400',
        planets: [{ size: '6', distance: { mode: 'scalar', value: '100' }, moon: false }],
      }),
    );

    expect(orbitExtent(svg, 1200)).toBeCloseTo(halfExtent(1200, 400), 6);
  });
});

describe('CTL-014 planet size is proportional to the canvas', () => {
  it('keeps the same fraction of the drawable half-extent at every canvas size', () => {
    for (const size of [100, 600, 1500]) {
      const svg = scene(
        input({
          canvasWidth: String(size),
          canvasHeight: String(size),
          planets: [{ size: '10', distance: { mode: 'scalar', value: '50' }, moon: false }],
        }),
      );

      expect(planetRadius(svg) / halfExtent(size, size)).toBeCloseTo(0.1, 6);
    }
  });

  it('caps the maximum planet diameter at half the smaller canvas dimension', () => {
    for (const size of [100, 300, 600, 900, 1500]) {
      const svg = scene(
        input({
          canvasWidth: String(size),
          canvasHeight: String(size),
          planets: [
            {
              size: String(BOUNDS.planetSize.max),
              distance: { mode: 'scalar', value: '50' },
              moon: false,
            },
          ],
        }),
      );

      expect(planetRadius(svg) * 2).toBeLessThanOrEqual(size / 2);
    }
  });
});

describe('CTL-014 a moon is measured against the planet it orbits', () => {
  const moon = (size: string, distance: string) => ({
    size,
    distance,
    period: '15',
  });

  it('orbits outside its planet at the minimum distance, for every planet size', () => {
    for (const canvas of [100, 600, 1500]) {
      for (const planet of [BOUNDS.planetSize.min, 10, BOUNDS.planetSize.max]) {
        const svg = scene(
          input({
            canvasWidth: String(canvas),
            canvasHeight: String(canvas),
            planets: [
              {
                size: String(planet),
                distance: { mode: 'scalar', value: '50' },
                moon: moon(String(BOUNDS.moonSize.min), String(BOUNDS.moonDistance.min)),
              },
            ],
          }),
        );

        expect(moonOrbitRadius(svg)).toBeGreaterThan(planetRadius(svg));
      }
    }
  });

  it('grows with its planet when the moon itself is not edited', () => {
    const build = (planetSize: string) =>
      scene(
        input({
          planets: [
            {
              size: planetSize,
              distance: { mode: 'scalar', value: '50' },
              moon: moon('30', '200'),
            },
          ],
        }),
      );

    const small = build('4');
    const large = build('20');

    expect(moonOrbitRadius(large)).toBeGreaterThan(moonOrbitRadius(small));
    expect(moonRadius(large)).toBeGreaterThan(moonRadius(small));
    expect(moonOrbitRadius(large)).toBeGreaterThan(planetRadius(large));
  });

  it('does not round a resolved value to a whole unit', () => {
    // At the smallest canvas the smallest planet has radius 0.5; rounding the
    // resolved moon distance to an integer would put the moon ON the planet.
    const size = BOUNDS.canvasWidth.min;
    const svg = scene(
      input({
        canvasWidth: String(size),
        canvasHeight: String(size),
        planets: [
          {
            size: String(BOUNDS.planetSize.min),
            distance: { mode: 'scalar', value: '50' },
            moon: moon(String(BOUNDS.moonSize.min), String(BOUNDS.moonDistance.min)),
          },
        ],
      }),
    );

    expect(planetRadius(svg)).toBeCloseTo(0.5, 6);
    expect(moonOrbitRadius(svg)).toBeGreaterThan(planetRadius(svg));
  });
});

describe('CTL-014 resizing the canvas rescales the composition', () => {
  it('preserves every ratio when only the canvas changes', () => {
    const planets: RawSceneInput['planets'] = [
      {
        size: '6',
        distance: { mode: 'scalar', value: '37' },
        moon: { size: '28', distance: '180', period: '15' },
      },
    ];

    const measure = (size: number) => {
      const svg = scene(
        input({ canvasWidth: String(size), canvasHeight: String(size), planets }),
      );
      const R = halfExtent(size, size);

      return {
        orbit: orbitExtent(svg, size) / R,
        planet: planetRadius(svg) / R,
        moonOrbit: moonOrbitRadius(svg) / planetRadius(svg),
      };
    };

    const small = measure(300);
    const large = measure(1500);

    expect(large.orbit).toBeCloseTo(small.orbit, 6);
    expect(large.planet).toBeCloseTo(small.planet, 6);
    expect(large.moonOrbit).toBeCloseTo(small.moonOrbit, 6);
  });
});

describe('CTL-016 defaults reproduce the previously shipped composition', () => {
  /** The absolute default composition at 600x600 before the units changed. */
  const SHIPPED = [
    { size: 12, distance: 110 },
    { size: 18, distance: 190 },
    { size: 9, distance: 260 },
  ];

  it('resolves each default within one unit of the shipped value', () => {
    const proportional = [
      { size: '4', distance: '37' },
      { size: '6', distance: '63' },
      { size: '3', distance: '87' },
    ];

    proportional.forEach((authored, index) => {
      const svg = scene(
        input({
          planets: [
            {
              size: authored.size,
              distance: { mode: 'scalar', value: authored.distance },
              moon: false,
            },
          ],
        }),
      );

      expect(Math.abs(planetRadius(svg) - SHIPPED[index]!.size)).toBeLessThanOrEqual(1);
      expect(
        Math.abs(orbitExtent(svg, 600) - SHIPPED[index]!.distance),
      ).toBeLessThanOrEqual(1);
    });
  });
});
