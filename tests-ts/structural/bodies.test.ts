import { describe, expect, it } from 'vitest';
import { parseHTML } from 'linkedom';
import { inspectStructure } from '../helpers/structure';
import { createIdGenerator } from '../../ts/generator/ids';
import { createPrng } from '../../ts/generator/prng';
import { paletteByName } from '../../ts/generator/palette';
import { renderPlanetBody, renderSun, sunRadius } from '../../ts/generator/bodies';

/**
 * Task 2.6 (GEN-005, GEN-006): sun and planet rendering.
 *
 * Assertions target the rendered structure — element presence, clipping, and
 * the lighting geometry — rather than exact colour strings, which task 2.1 and
 * the palette tests already cover.
 */

const PALETTE = paletteByName('Aurora');

function parse(markup: string): Document {
  const { document } = parseHTML(
    `<html><body><svg xmlns="http://www.w3.org/2000/svg">${markup}</svg></body></html>`,
  );

  return document as unknown as Document;
}

function planet(size = 10, index = 0, seed = 42): string {
  return renderPlanetBody({
    size,
    index,
    palette: PALETTE,
    ids: createIdGenerator(seed),
    random: createPrng(seed),
  });
}

describe('sun rendering', () => {
  it('derives its radius from the canvas rather than a constant', () => {
    expect(sunRadius({ width: 300, height: 300 })).toBeCloseTo(12, 9);
    expect(sunRadius({ width: 600, height: 600 })).toBeGreaterThan(
      sunRadius({ width: 300, height: 300 }),
    );
  });
  it('centres the sun on the canvas centre', () => {
    const document = parse(
      renderSun({ width: 300, height: 180 }, PALETTE, createIdGenerator(1)),
    );
    const body = document.querySelector('circle[data-sun-body]');

    expect(body?.getAttribute('cx')).toBe('150');
    expect(body?.getAttribute('cy')).toBe('90');
  });

  it('renders concentric bands, a highlight, a corona ring and a glow', () => {
    const document = parse(
      renderSun({ width: 300, height: 300 }, PALETTE, createIdGenerator(1)),
    );

    expect(document.querySelectorAll('circle[data-role="sun-band"]').length).toBeGreaterThanOrEqual(
      2,
    );
    expect(document.querySelector('circle[data-role="sun-highlight"]')).not.toBeNull();
    expect(document.querySelector('circle[data-role="sun-corona"]')).not.toBeNull();
    expect(document.querySelector('circle[data-role="sun-glow"]')).not.toBeNull();
  });

  it('extends the glow beyond the sun body', () => {
    const document = parse(
      renderSun({ width: 300, height: 300 }, PALETTE, createIdGenerator(1)),
    );
    const glow = Number(document.querySelector('circle[data-role="sun-glow"]')?.getAttribute('r'));
    const body = Number(document.querySelector('circle[data-sun-body]')?.getAttribute('r'));

    expect(glow).toBeGreaterThan(body);
  });
});

describe('sun type and rotation', () => {
  it('scales the Red Giant larger and the White Dwarf smaller than the default', () => {
    const canvas = { width: 300, height: 300 };

    expect(sunRadius(canvas, 'RedGiant')).toBeGreaterThan(sunRadius(canvas, 'YellowDwarf'));
    expect(sunRadius(canvas, 'WhiteDwarf')).toBeLessThan(sunRadius(canvas, 'YellowDwarf'));
  });

  it('keeps the baseline radius when no type is authored', () => {
    const canvas = { width: 300, height: 300 };

    expect(sunRadius(canvas)).toBe(sunRadius(canvas, 'YellowDwarf'));
  });

  it('re-tones the sun per authored type', () => {
    const bandsFor = (type: 'YellowDwarf' | 'RedGiant' | 'WhiteDwarf'): string | null =>
      parse(
        renderSun({ width: 300, height: 300 }, PALETTE, createIdGenerator(1), { type }),
      ).querySelector('circle[data-sun-body]')?.getAttribute('fill') ?? null;

    const tones = new Set([bandsFor('YellowDwarf'), bandsFor('RedGiant'), bandsFor('WhiteDwarf')]);

    expect(tones.size).toBe(3);
  });

  it('omits the rotating spot layer when no generator is supplied', () => {
    const document = parse(
      renderSun({ width: 300, height: 300 }, PALETTE, createIdGenerator(1)),
    );

    expect(document.querySelector('[data-role="sun-spots"]')).toBeNull();
  });

  it('renders a rotating spot layer when a generator is supplied', () => {
    const document = parse(
      renderSun({ width: 300, height: 300 }, PALETTE, createIdGenerator(1), {
        random: createPrng(7),
      }),
    );
    const spots = document.querySelector('[data-role="sun-spots"]');

    expect(spots).not.toBeNull();
    expect(spots?.querySelector('animateTransform[type="rotate"]')).not.toBeNull();
    expect(document.querySelectorAll('circle[data-role="sun-spot"]').length).toBeGreaterThan(0);
  });

  it('renders the spot layer identically for a repeated seed', () => {
    const render = (): string =>
      renderSun({ width: 300, height: 300 }, PALETTE, createIdGenerator(7), {
        random: createPrng(7),
      });

    expect(render()).toBe(render());
  });
});

describe('planet rendering', () => {
  it('renders a circular body of the configured size', () => {
    const body = parse(planet(12)).querySelector('circle[data-role="planet-body"]');

    expect(body?.getAttribute('r')).toBe('12');
  });

  it('renders the full lighting treatment', () => {
    const document = parse(planet());

    expect(document.querySelector('circle[data-role="planet-highlight"]')).not.toBeNull();
    expect(document.querySelector('circle[data-role="planet-terminator"]')).not.toBeNull();
    expect(document.querySelector('circle[data-role="planet-atmosphere"]')).not.toBeNull();
    expect(document.querySelector('circle[data-role="planet-shadow"]')).not.toBeNull();
    expect(document.querySelectorAll('path[data-role="planet-blob"]').length).toBeGreaterThan(0);
  });

  it('clips every piece of surface detail to the planet body', () => {
    const document = parse(planet());

    for (const selector of [
      'circle[data-role="planet-highlight"]',
      'circle[data-role="planet-terminator"]',
      'path[data-role="planet-blob"]',
    ]) {
      for (const element of document.querySelectorAll(selector)) {
        const clip = element.closest('g[clip-path]')?.getAttribute('clip-path');

        expect(clip).toMatch(/^url\(#/);
      }
    }
  });

  it('does not clip the atmosphere ring, which sits outside the body', () => {
    const document = parse(planet());
    const atmosphere = document.querySelector('circle[data-role="planet-atmosphere"]');

    expect(atmosphere?.closest('g[clip-path]')).toBeNull();
  });

  it('places the highlight and terminator on opposing sides', () => {
    const document = parse(planet());
    const highlight = document.querySelector('circle[data-role="planet-highlight"]');
    const terminator = document.querySelector('circle[data-role="planet-terminator"]');

    expect(Number(highlight?.getAttribute('cx'))).toBeLessThan(0);
    expect(Number(terminator?.getAttribute('cx'))).toBeGreaterThan(0);
  });

  it('lights every planet from the same direction', () => {
    const directions = [0, 1, 2, 3].map((index) => {
      const highlight = parse(planet(10, index)).querySelector(
        'circle[data-role="planet-highlight"]',
      );

      return Math.sign(Number(highlight?.getAttribute('cx')));
    });

    expect(new Set(directions).size).toBe(1);
  });

  it('produces a structurally sound fragment with resolved references', () => {
    const report = inspectStructure(
      `<svg xmlns="http://www.w3.org/2000/svg">${planet()}</svg>`,
    );

    expect(report.violations).toEqual([]);
  });

  it('renders identically for a repeated seed', () => {
    expect(planet(10, 0, 7)).toBe(planet(10, 0, 7));
  });

  it('varies surface detail across seeds', () => {
    expect(planet(10, 0, 7)).not.toBe(planet(10, 0, 8));
  });
});
