import { describe, expect, it } from 'vitest';
import { parseHTML } from 'linkedom';
import { inspectStructure } from '../helpers/structure';
import { createIdGenerator } from '../../ts/generator/ids';
import { createPrng } from '../../ts/generator/prng';
import { paletteByName } from '../../ts/generator/palette';
import {
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
    expect(document.querySelectorAll('[data-role="ring-back"] ellipse')).toHaveLength(3);
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

      expect(back.querySelectorAll('ellipse').length).toBeGreaterThanOrEqual(3);
      expect(front.querySelectorAll('path').length).toBeGreaterThanOrEqual(3);
    });

    it(`includes a non-uniform radial/detail cue on both pieces of a ${type} ring`, () => {
      const { back, front } = pieces(authoredMarkup(type));

      // A uniform ellipse/arc stroke has no dash pattern; the detail cue is
      // required to break that uniformity, so at least one layer per piece
      // must carry a stroke-dasharray (a radial/particulate cue).
      const backDashed = [...back.querySelectorAll('ellipse')].some(
        (el) => el.getAttribute('stroke-dasharray') !== null,
      );
      const frontDashed = [...front.querySelectorAll('path')].some(
        (el) => el.getAttribute('stroke-dasharray') !== null,
      );

      expect(backDashed).toBe(true);
      expect(frontDashed).toBe(true);
    });

    it(`matches layer counts between the back and front pieces of a ${type} ring`, () => {
      const { back, front } = pieces(authoredMarkup(type));

      expect(front.querySelectorAll('path').length).toBe(
        back.querySelectorAll('ellipse').length,
      );
    });
  }

  it('keeps distinct layer compositions across ring types', () => {
    const compositions = RING_TYPES.map((type) => {
      const { back } = pieces(authoredMarkup(type));

      return back.querySelectorAll('ellipse').length + ':' +
        [...back.querySelectorAll('ellipse')].filter(
          (el) => el.getAttribute('stroke-dasharray') !== null,
        ).length;
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
