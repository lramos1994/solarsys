import { describe, expect, it } from 'vitest';
import { parseHTML } from 'linkedom';
import { inspectStructure } from '../helpers/structure';
import { createIdGenerator } from '../../ts/generator/ids';
import { createPrng } from '../../ts/generator/prng';
import { paletteByName } from '../../ts/generator/palette';
import { DEFAULT_MOON_PERIOD, renderMoon } from '../../ts/generator/moon';

/**
 * Task 2.8 (GEN-008, CTL-004): moon rendering and motion.
 *
 * "Inherits the parent's motion" is a NESTING property: the moon markup must
 * sit inside the group the planet's own animateMotion drives, so the moon is
 * carried along the planet's orbit while separately orbiting the planet.
 */

const PALETTE = paletteByName('Aurora');

function moon(overrides: { size?: number; distance?: number; period?: number } = {}): string {
  return renderMoon({
    moon: {
      size: overrides.size ?? 3,
      distance: overrides.distance ?? 25,
      ...(overrides.period === undefined ? {} : { period: overrides.period }),
    },
    index: 0,
    palette: PALETTE,
    ids: createIdGenerator(42),
    random: createPrng(42),
  });
}

function parse(markup: string): Document {
  const { document } = parseHTML(
    `<html><body><svg xmlns="http://www.w3.org/2000/svg">${markup}</svg></body></html>`,
  );

  return document as unknown as Document;
}

describe('moon rendering', () => {
  it('renders a moon body of the configured size', () => {
    const body = parse(moon({ size: 4 })).querySelector('circle[data-role="moon-body"]');

    expect(body?.getAttribute('r')).toBe('4');
  });

  it('renders its own orbit path around the parent planet', () => {
    const path = parse(moon()).querySelector('path[data-role="moon-orbit"]');

    expect(path?.getAttribute('d')).toMatch(/^M /);
    expect(path?.getAttribute('d')?.trimEnd().endsWith('Z')).toBe(true);
  });

  it('drives the moon with an animateMotion referencing its own orbit', () => {
    const document = parse(moon());
    const orbitId = document
      .querySelector('path[data-role="moon-orbit"]')
      ?.getAttribute('id');
    const reference = document.querySelector('mpath')?.getAttribute('xlink:href');

    expect(reference).toBe(`#${orbitId}`);
  });

  it('nests the moon body inside the animated group so it inherits parent motion', () => {
    const document = parse(moon());
    const body = document.querySelector('circle[data-role="moon-body"]');
    const animatedGroup = body?.closest('g[data-role="moon"]');

    expect(animatedGroup?.querySelector('animateMotion')).not.toBeNull();
  });

  it('travels in reverse relative to the planet', () => {
    const motion = parse(moon()).querySelector('animateMotion');

    expect(motion?.getAttribute('keyPoints')).toBe('1;0');
    expect(motion?.getAttribute('keyTimes')).toBe('0;1');
  });

  it('repeats indefinitely', () => {
    expect(
      parse(moon()).querySelector('animateMotion')?.getAttribute('repeatCount'),
    ).toBe('indefinite');
  });

  it('clips moon surface detail to the moon body', () => {
    const document = parse(moon());
    const highlight = document.querySelector('circle[data-role="moon-highlight"]');

    expect(highlight?.closest('g[clip-path]')?.getAttribute('clip-path')).toMatch(
      /^url\(#/,
    );
  });

  it('produces a structurally sound fragment with resolved references', () => {
    const report = inspectStructure(
      `<svg xmlns="http://www.w3.org/2000/svg">${moon()}</svg>`,
    );

    expect(report.violations).toEqual([]);
  });
});

describe('moon period', () => {
  it('defaults to the baseline 15 seconds', () => {
    expect(DEFAULT_MOON_PERIOD).toBe(15);
    expect(parse(moon()).querySelector('animateMotion')?.getAttribute('dur')).toBe('15s');
  });

  it('honours an explicit period override', () => {
    expect(
      parse(moon({ period: 40 })).querySelector('animateMotion')?.getAttribute('dur'),
    ).toBe('40s');
  });

  it('scales the start offset with the configured period', () => {
    const begin = parse(moon({ period: 40 }))
      .querySelector('animateMotion')
      ?.getAttribute('begin');
    const offset = Number(begin?.replace(/^-|s$/g, ''));

    expect(offset).toBeGreaterThanOrEqual(0);
    expect(offset).toBeLessThanOrEqual(40);
  });

  it('starts mid-cycle with a negative begin offset', () => {
    expect(
      parse(moon()).querySelector('animateMotion')?.getAttribute('begin'),
    ).toMatch(/^-/);
  });
});
