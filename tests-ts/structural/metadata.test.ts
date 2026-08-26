import { describe, expect, it } from 'vitest';
import { parseHTML } from 'linkedom';
import { inspectStructure } from '../helpers/structure';
import { PALETTE_NAMES } from '../../ts/generator/palette';
import { escapeText } from '../../ts/generator/metadata';
import { generateScene, type SceneParams } from '../../ts/generator/scene';

/**
 * Task 3.4 (QLT-004): accessibility metadata.
 *
 * The description must describe the scene's content rather than be a fixed
 * constant, so the tests compare descriptions across differing scenes instead
 * of merely asserting that a `<desc>` element exists.
 */

const BASE: SceneParams = {
  canvas: { width: 300, height: 300 },
  planets: [
    { size: 10, distance: 120, moon: { size: 3, distance: 25 } },
    { size: 6, distance: 55, moon: false },
  ],
  palette: 'Aurora',
};

function parse(svg: string): Document {
  const { document } = parseHTML(`<html><body>${svg}</body></html>`);

  return document as unknown as Document;
}

function titleOf(svg: string): string {
  return parse(svg).querySelector('svg > title')?.textContent?.trim() ?? '';
}

function descriptionOf(svg: string): string {
  return parse(svg).querySelector('svg > desc')?.textContent?.trim() ?? '';
}

describe('title and description are present', () => {
  it('emits a title as a direct child of the root', () => {
    expect(parse(generateScene(BASE, 42)).querySelectorAll('svg > title')).toHaveLength(1);
  });

  it('emits a description as a direct child of the root', () => {
    expect(parse(generateScene(BASE, 42)).querySelectorAll('svg > desc')).toHaveLength(1);
  });

  it('places metadata first so assistive technology reads it before content', () => {
    const root = parse(generateScene(BASE, 42)).querySelector('svg');
    const firstTwo = [...(root?.children ?? [])]
      .slice(0, 2)
      .map((element) => element.tagName.toLowerCase());

    expect(firstTwo).toEqual(['title', 'desc']);
  });

  it('gives every scene a non-empty title and description', () => {
    for (let seed = 0; seed < 8; seed += 1) {
      expect(titleOf(generateScene(BASE, seed)).length, `seed ${seed}`).toBeGreaterThan(0);
      expect(descriptionOf(generateScene(BASE, seed)).length, `seed ${seed}`).toBeGreaterThan(
        0,
      );
    }
  });

  it('emits metadata even for a scene with no planets', () => {
    const empty = generateScene({ ...BASE, planets: [] }, 42);

    expect(titleOf(empty).length).toBeGreaterThan(0);
    expect(descriptionOf(empty).length).toBeGreaterThan(0);
  });
});

describe('description reflects scene content', () => {
  it('is not a fixed constant across differing planet counts', () => {
    const descriptions = [0, 1, 3, 8].map((count) =>
      descriptionOf(
        generateScene(
          {
            ...BASE,
            planets: Array.from({ length: count }, (_, index) => ({
              size: 6,
              distance: 40 + index * 10,
              moon: false as const,
            })),
          },
          42,
        ),
      ),
    );

    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it('states the planet count', () => {
    expect(descriptionOf(generateScene({ ...BASE, planets: [] }, 42))).toMatch(/no planets/i);
    expect(
      descriptionOf(
        generateScene({ ...BASE, planets: [{ size: 6, distance: 40, moon: false }] }, 42),
      ),
    ).toMatch(/\b1 planet\b/i);
    expect(descriptionOf(generateScene(BASE, 42))).toMatch(/\b2 planets\b/i);
  });

  it('mentions how many planets carry a moon', () => {
    expect(descriptionOf(generateScene(BASE, 42))).toMatch(/moon/i);
  });

  it('names the palette governing the scene', () => {
    for (const name of PALETTE_NAMES) {
      expect(
        descriptionOf(generateScene({ ...BASE, palette: name }, 42)),
        `palette ${name}`,
      ).toContain(name);
    }
  });

  it('distinguishes scenes that differ only by palette', () => {
    expect(descriptionOf(generateScene({ ...BASE, palette: 'Aurora' }, 42))).not.toBe(
      descriptionOf(generateScene({ ...BASE, palette: 'Ember' }, 42)),
    );
  });

  it('reports the canvas dimensions', () => {
    expect(
      descriptionOf(generateScene({ ...BASE, canvas: { width: 640, height: 360 } }, 42)),
    ).toContain('640');
  });
});

describe('metadata integrity', () => {
  // escapeText is not reachable with dangerous input through generateScene
  // today, because titles and descriptions are built from fixed palette names
  // and numbers. It is tested directly so the guard is verified rather than
  // merely present — a mutation removing it would otherwise go undetected.
  it('escapes the XML metacharacters', () => {
    expect(escapeText('a & b')).toBe('a &amp; b');
    expect(escapeText('<desc>')).toBe('&lt;desc&gt;');
    expect(escapeText('</desc><script>x</script>')).toBe(
      '&lt;/desc&gt;&lt;script&gt;x&lt;/script&gt;',
    );
  });

  it('escapes ampersands before angle brackets, avoiding double-escaping', () => {
    expect(escapeText('&lt;')).toBe('&amp;lt;');
  });

  it('leaves safe text untouched', () => {
    expect(escapeText('Aurora 300 by 300')).toBe('Aurora 300 by 300');
  });

  it('keeps a scene well-formed even if metadata text were hostile', () => {
    const hostile = `<title>${escapeText('</title><script>alert(1)</script>')}</title>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">${hostile}</svg>`;

    expect(inspectStructure(svg).violations).toEqual([]);
  });

  it('escapes markup so the description cannot break the document', () => {
    const svg = generateScene(BASE, 42);

    expect(inspectStructure(svg).violations).toEqual([]);
    expect(descriptionOf(svg)).not.toContain('<');
  });

  it('keeps the scene byte-identical for a repeated seed', () => {
    expect(generateScene(BASE, 11)).toBe(generateScene(BASE, 11));
  });

  it('carries the same metadata in a debug-mode render', () => {
    expect(titleOf(generateScene(BASE, 42, { debug: true }))).toBe(
      titleOf(generateScene(BASE, 42)),
    );
  });
});
