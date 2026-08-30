import { describe, expect, it } from 'vitest';
import { parseHTML } from 'linkedom';
import { inspectStructure } from '../helpers/structure';
import { createIdGenerator } from '../../ts/generator/ids';
import { createPrng } from '../../ts/generator/prng';
import { paletteByName } from '../../ts/generator/palette';
import {
  MAX_AUTHORED_RING_TILT,
  MAX_RING_TILT,
  MIN_RING_TILT,
  RING_TYPES,
  renderPlanetWithRing,
  ringAssignment,
} from '../../ts/generator/ring';

/**
 * Task 2.7 (GEN-007): two-piece rings with correct occlusion.
 *
 * The occlusion requirement is a DOCUMENT ORDER property — SVG has no
 * z-index — so the decisive assertion compares the index of the back piece,
 * the planet body, and the front piece within the flattened element order.
 */

const PALETTE = paletteByName('Aurora');

function render(size = 10, index = 0, seed = 42): string {
  return renderPlanetWithRing({
    size,
    index,
    palette: PALETTE,
    ids: createIdGenerator(seed),
    random: createPrng(seed),
    hasRing: true,
    tilt: 0.25,
  });
}

/** Positions of the ring pieces and the planet body in document order. */
function ordering(markup: string): {
  back: number;
  body: number;
  front: number;
} {
  const { document } = parseHTML(
    `<html><body><svg xmlns="http://www.w3.org/2000/svg">${markup}</svg></body></html>`,
  );
  const elements = [...document.querySelectorAll('*')];
  const indexOf = (selector: string): number =>
    elements.findIndex((element) => element.matches(selector));

  return {
    back: indexOf('[data-role="ring-back"]'),
    body: indexOf('[data-role="planet-body"]'),
    front: indexOf('[data-role="ring-front"]'),
  };
}

describe('ring occlusion', () => {
  it('renders an explicit Banded ring from authored size and inclination', () => {
    const markup = renderPlanetWithRing({
      size: 10,
      index: 0,
      palette: PALETTE,
      ids: createIdGenerator(42),
      random: createPrng(42),
      ring: { type: 'Banded', sizePercent: 250, inclinationDegrees: 30 },
    } as unknown as Parameters<typeof renderPlanetWithRing>[0]);
    const document = parseHTML(
      `<html><body><svg xmlns="http://www.w3.org/2000/svg">${markup}</svg></body></html>`,
    ).document;
    const outer = document.querySelector('[data-role="ring-back"] ellipse');

    expect(outer?.getAttribute('rx')).toBe('25');
    expect(Number(outer?.getAttribute('ry'))).toBeCloseTo(12.5, 2);
    // 5 concentric layers; one of them is the particulate tick path, the rest
    // are ellipses, so count by the layer marker rather than element type.
    expect(document.querySelectorAll('[data-role="ring-back"] [data-role="ring-layer"]'))
      .toHaveLength(5);
  });

  it('renders structurally distinct authored ring types', () => {
    const authored = (type: 'Thin' | 'Banded' | 'Wide'): string =>
      renderPlanetWithRing({
        size: 10,
        index: 0,
        palette: PALETTE,
        ids: createIdGenerator(42),
        random: createPrng(42),
        ring: { type, sizePercent: 210, inclinationDegrees: 16 },
      } as unknown as Parameters<typeof renderPlanetWithRing>[0]);

    expect(new Set((['Thin', 'Banded', 'Wide'] as const).map(authored)).size).toBe(3);
  });

  it('emits both ring pieces and the planet body', () => {
    const { back, body, front } = ordering(render());

    expect(back).toBeGreaterThanOrEqual(0);
    expect(body).toBeGreaterThanOrEqual(0);
    expect(front).toBeGreaterThanOrEqual(0);
  });

  it('places the far ring piece behind the planet body', () => {
    const { back, body } = ordering(render());

    expect(back).toBeLessThan(body);
  });

  it('places the near ring piece in front of the planet body', () => {
    const { body, front } = ordering(render());

    expect(front).toBeGreaterThan(body);
  });

  it('straddles the planet body with the two ring pieces', () => {
    const { back, body, front } = ordering(render());

    expect(back).toBeLessThan(body);
    expect(body).toBeLessThan(front);
  });

  it('clips the near piece so it covers only the lower half', () => {
    const { document } = parseHTML(
      `<html><body><svg xmlns="http://www.w3.org/2000/svg">${render()}</svg></body></html>`,
    );
    const front = document.querySelector('[data-role="ring-front"]');
    const clipped = front?.querySelector('g[clip-path]');

    expect(clipped?.getAttribute('clip-path')).toMatch(/^url\(#/);
  });

  it('omits both ring pieces when the planet has no ring', () => {
    const markup = renderPlanetWithRing({
      size: 10,
      index: 0,
      palette: PALETTE,
      ids: createIdGenerator(42),
      random: createPrng(42),
      hasRing: false,
      tilt: 0.25,
    });

    expect(markup).not.toContain('ring-back');
    expect(markup).not.toContain('ring-front');
  });

  it('produces a structurally sound fragment with resolved references', () => {
    const report = inspectStructure(
      `<svg xmlns="http://www.w3.org/2000/svg">${render()}</svg>`,
    );

    expect(report.violations).toEqual([]);
  });
});

describe('ring layer detail (GEN-022)', () => {
  function authoredMarkup(type: 'Thin' | 'Banded' | 'Wide'): string {
    return renderPlanetWithRing({
      size: 10,
      index: 0,
      palette: PALETTE,
      ids: createIdGenerator(42),
      random: createPrng(42),
      ring: { type, sizePercent: 210, inclinationDegrees: 16 },
    } as unknown as Parameters<typeof renderPlanetWithRing>[0]);
  }

  function pieces(markup: string): { back: Element; front: Element } {
    const { document } = parseHTML(
      `<html><body><svg xmlns="http://www.w3.org/2000/svg">${markup}</svg></body></html>`,
    );
    const back = document.querySelector('[data-role="ring-back"]');
    const front = document.querySelector('[data-role="ring-front"]');

    if (!back || !front) {
      throw new Error('expected both ring pieces to be present');
    }

    return { back, front };
  }

  for (const type of RING_TYPES) {
    it(`renders at least three concentric layers on both pieces of a ${type} ring`, () => {
      const { back, front } = pieces(authoredMarkup(type));

      expect(back.querySelectorAll('[data-role="ring-layer"]').length).toBeGreaterThanOrEqual(3);
      expect(front.querySelectorAll('[data-role="ring-layer"]').length).toBeGreaterThanOrEqual(3);
    });

    it(`includes a particulate detail cue on both pieces of a ${type} ring`, () => {
      const { back, front } = pieces(authoredMarkup(type));

      // A uniform ellipse/arc stroke carries no radial texture; the detail cue
      // is required to break that uniformity. It is emitted as discrete tick
      // segments (not stroke-dasharray, which does not close on an ellipse),
      // so both pieces must contain a layer flagged as the particulate cue.
      const backTick = back.querySelectorAll('[data-ring-detail="ticks"]').length;
      const frontTick = front.querySelectorAll('[data-ring-detail="ticks"]').length;

      expect(backTick).toBeGreaterThan(0);
      expect(frontTick).toBeGreaterThan(0);
    });

    it(`matches layer counts between the back and front pieces of a ${type} ring`, () => {
      const { back, front } = pieces(authoredMarkup(type));

      expect(front.querySelectorAll('[data-role="ring-layer"]').length).toBe(
        back.querySelectorAll('[data-role="ring-layer"]').length,
      );
    });
  }

  it('keeps distinct layer compositions across ring types', () => {
    const compositions = RING_TYPES.map((type) => {
      const { back } = pieces(authoredMarkup(type));

      return back.querySelectorAll('[data-role="ring-layer"]').length + ':' +
        back.querySelectorAll('[data-ring-detail="ticks"]').length;
    });

    expect(new Set(compositions).size).toBeGreaterThan(1);
  });
});

describe('ring assignment determinism', () => {
  it('assigns the same rings for a repeated seed', () => {
    const first = [0, 1, 2, 3].map((index) =>
      ringAssignment(createPrng(99 + index), 10),
    );
    const second = [0, 1, 2, 3].map((index) =>
      ringAssignment(createPrng(99 + index), 10),
    );

    expect(first).toEqual(second);
  });

  it('assigns the same tilt for a repeated seed', () => {
    expect(ringAssignment(createPrng(7), 10).tilt).toBe(
      ringAssignment(createPrng(7), 10).tilt,
    );
  });

  it('never assigns a ring to a small planet', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      expect(ringAssignment(createPrng(seed), 5).hasRing).toBe(false);
    }
  });

  it('assigns rings to some but not all large planets', () => {
    const assigned = Array.from({ length: 200 }, (_, seed) =>
      ringAssignment(createPrng(seed), 10).hasRing,
    );

    expect(assigned).toContain(true);
    expect(assigned).toContain(false);
  });

  it('keeps every tilt within the baseline bounds', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const { tilt } = ringAssignment(createPrng(seed), 10);

      expect(tilt).toBeGreaterThanOrEqual(MIN_RING_TILT);
      expect(tilt).toBeLessThanOrEqual(MAX_RING_TILT);
    }
  });
});

describe('authored ring inclination stays visibly elliptical', () => {
  function outerRatio(inclinationDegrees: number): number {
    const markup = renderPlanetWithRing({
      size: 10,
      index: 0,
      palette: PALETTE,
      ids: createIdGenerator(42),
      random: createPrng(42),
      ring: { type: 'Banded', sizePercent: 210, inclinationDegrees },
    } as unknown as Parameters<typeof renderPlanetWithRing>[0]);
    const document = parseHTML(
      `<html><body><svg xmlns="http://www.w3.org/2000/svg">${markup}</svg></body></html>`,
    ).document;
    const outer = document.querySelector('[data-role="ring-back"] ellipse');

    return Number(outer?.getAttribute('ry')) / Number(outer?.getAttribute('rx'));
  }

  it('never produces a near-circular (halo-like) ring, even at the maximum authored inclination', () => {
    // 60 degrees is the authored maximum (BOUNDS.ringInclination.max); an
    // uncapped sin(60deg) ~= 0.866 read as a disconnected halo rather than a
    // tilted ring (the reported "misaligned" defect).
    expect(outerRatio(60)).toBeLessThanOrEqual(MAX_AUTHORED_RING_TILT);
  });

  it('keeps the low end of the authored range unaffected by the cap', () => {
    // 16 degrees (the seeded default) is well inside the cap, so it must
    // resolve to the plain sin(16deg) tilt rather than the ceiling.
    expect(outerRatio(16)).toBeCloseTo(Math.sin((16 * Math.PI) / 180), 3);
  });

  it('increases monotonically up to the cap as inclination increases', () => {
    const ratios = [5, 16, 30, 45].map(outerRatio);

    for (let i = 1; i < ratios.length; i += 1) {
      expect(ratios[i]).toBeGreaterThan(ratios[i - 1]!);
    }
  });
});

describe('ring inner edge stays anchored to the planet', () => {
  /** Radius of the innermost back-piece ellipse, in planet-radius units. */
  function innerEdgeInPlanetRadii(sizePercent: number, planetRadius = 10): number {
    const markup = renderPlanetWithRing({
      size: planetRadius,
      index: 0,
      palette: PALETTE,
      ids: createIdGenerator(42),
      random: createPrng(42),
      ring: { type: 'Banded', sizePercent, inclinationDegrees: 20 },
    } as unknown as Parameters<typeof renderPlanetWithRing>[0]);
    const document = parseHTML(
      `<html><body><svg xmlns="http://www.w3.org/2000/svg">${markup}</svg></body></html>`,
    ).document;
    const radii = [...document.querySelectorAll('[data-role="ring-back"] ellipse')].map(
      (ellipse) => Number(ellipse.getAttribute('rx')),
    );

    return Math.min(...radii) / planetRadius;
  }

  it('keeps the innermost band just outside the planet at every authored size', () => {
    // The atmosphere ring ends at ~1.26r, so the innermost band must clear the
    // body without floating away from it. Before the inner edge was pinned to
    // the planet, a 300% ring put this band at ~2r (a detached halo) while a
    // 140% ring put it at ~0.92r, underneath the body where it never showed.
    for (const sizePercent of [140, 210, 250, 300]) {
      const edge = innerEdgeInPlanetRadii(sizePercent);

      expect(edge).toBeGreaterThan(1.26);
      expect(edge).toBeLessThan(1.5);
    }
  });

  it('does not let the gap grow with the authored ring size', () => {
    // A fixed inner scale made this difference grow without bound; pinning the
    // inner edge keeps the smallest and largest rings within a hair of each
    // other at the surface.
    const spread = Math.abs(innerEdgeInPlanetRadii(300) - innerEdgeInPlanetRadii(140));

    expect(spread).toBeLessThan(0.1);
  });

  it('scales the inner edge with the planet, not with absolute units', () => {
    expect(innerEdgeInPlanetRadii(210, 4)).toBeCloseTo(innerEdgeInPlanetRadii(210, 20), 2);
  });
});

describe('ring particulate cue is a closed, arc-uniform tick pattern', () => {
  function tickSegments(type: 'Banded' | 'Thin' | 'Wide'): {
    segments: Array<{ length: number }>;
    path: string;
  } {
    const markup = renderPlanetWithRing({
      size: 10,
      index: 0,
      palette: PALETTE,
      ids: createIdGenerator(42),
      random: createPrng(42),
      ring: { type, sizePercent: 210, inclinationDegrees: 20 },
    } as unknown as Parameters<typeof renderPlanetWithRing>[0]);
    const document = parseHTML(
      `<html><body><svg xmlns="http://www.w3.org/2000/svg">${markup}</svg></body></html>`,
    ).document;
    const path = document.querySelector('[data-role="ring-back"] [data-ring-detail="ticks"]')
      ?.getAttribute('d') ?? '';

    const segments = [...path.matchAll(/M (-?[\d.]+) (-?[\d.]+) L (-?[\d.]+) (-?[\d.]+)/g)].map(
      (match) => ({ length: Math.hypot(+match[3]! - +match[1]!, +match[4]! - +match[2]!) }),
    );

    return { segments, path };
  }

  it('emits straight tangent segments, not elliptical arcs', () => {
    const { path } = tickSegments('Banded');

    expect(path).toContain('L');
    expect(path).not.toContain(' A ');
  });

  it('produces uniform tick lengths all the way around the ellipse', () => {
    for (const type of ['Banded', 'Thin', 'Wide'] as const) {
      const { segments } = tickSegments(type);
      const lengths = segments.map((segment) => segment.length);
      const spread = Math.max(...lengths) - Math.min(...lengths);

      expect(lengths.length).toBeGreaterThanOrEqual(40);
      // The arc-length sampling keeps tick sizes within a small tolerance of
      // one another; a radial fan (the pre-fix failure) showed a large spread.
      expect(spread).toBeLessThan(Math.min(...lengths) * 0.3);
    }
  });
});
