import { describe, expect, it } from 'vitest';
import { parseHTML } from 'linkedom';
import { inspectStructure } from '../helpers/structure';
import { PALETTE_NAMES, paletteByName } from '../../ts/generator/palette';
import { planetColors, sunColors } from '../../ts/generator/palette';
import { generateScene, type SceneParams } from '../../ts/generator/scene';

/**
 * Task 2.9 (GEN-011): the six named palettes applied cohesively.
 *
 * "Cohesive" is asserted structurally: every colour the scene paints must come
 * from the chosen palette's derived tones. A test that only checked "a palette
 * was used somewhere" would pass even if half the scene came from another one.
 */

const PARAMS: SceneParams = {
  canvas: { width: 300, height: 300 },
  planets: [
    { size: 10, distance: [150, 60, 150, 60], moon: { size: 3, distance: 25 } },
    { size: 6, distance: 55, moon: false },
    { size: 8, distance: 90, moon: { size: 2, distance: 12 } },
  ],
};

function parse(svg: string): Document {
  const { document } = parseHTML(`<html><body>${svg}</body></html>`);

  return document as unknown as Document;
}

/** Every colour literal the scene paints, from fill and stroke attributes. */
function paintedColors(svg: string): Set<string> {
  const document = parse(svg);
  const colors = new Set<string>();

  for (const element of document.querySelectorAll('*')) {
    for (const attribute of ['fill', 'stroke', 'stop-color']) {
      const value = element.getAttribute(attribute);

      if (value !== null && value !== 'none' && !value.startsWith('url(')) {
        colors.add(value);
      }
    }
  }

  return colors;
}

describe('palette application across the scene', () => {
  it('renders a valid scene for every one of the six palettes', () => {
    for (const name of PALETTE_NAMES) {
      const svg = generateScene({ ...PARAMS, palette: name }, 42);
      const report = inspectStructure(svg);

      expect(report.violations, `palette ${name}`).toEqual([]);
    }
  });

  it('paints the sun from the selected palette', () => {
    for (const name of PALETTE_NAMES) {
      const svg = generateScene({ ...PARAMS, palette: name }, 42);
      const tones = sunColors(paletteByName(name));

      expect(paintedColors(svg), `palette ${name}`).toContain(tones.bands[1]);
    }
  });

  it('paints the planets from the selected palette', () => {
    for (const name of PALETTE_NAMES) {
      const svg = generateScene({ ...PARAMS, palette: name }, 42);
      const colors = paintedColors(svg);

      PARAMS.planets.forEach((_, index) => {
        expect(colors, `palette ${name} planet ${index}`).toContain(
          planetColors(paletteByName(name), index).base,
        );
      });
    }
  });

  it('lets one palette govern the whole scene, with no colour from another', () => {
    for (const name of PALETTE_NAMES) {
      const svg = generateScene({ ...PARAMS, palette: name }, 42);
      const colors = paintedColors(svg);

      const foreign = PALETTE_NAMES.filter((other) => other !== name).flatMap(
        (other) => {
          const palette = paletteByName(other);

          // Base hues are distinctive per palette; the derived tones overlap
          // across palettes (both Mono and Aurora can shade to near-black).
          return [...palette.planetHues, palette.sun, palette.accent];
        },
      );
      const ownColors = new Set([
        ...paletteByName(name).planetHues,
        paletteByName(name).sun,
        paletteByName(name).accent,
      ]);

      for (const color of foreign) {
        if (ownColors.has(color)) {
          continue;
        }

        expect(colors, `palette ${name} leaked ${color}`).not.toContain(color);
      }
    }
  });

  it('keeps the chosen palette when other parameters change', () => {
    const wide = generateScene(
      { ...PARAMS, canvas: { width: 640, height: 360 }, palette: 'Ember' },
      42,
    );
    const tones = sunColors(paletteByName('Ember'));

    expect(paintedColors(wide)).toContain(tones.bands[1]);
  });

  it('selects a palette deterministically from the seed when none is named', () => {
    expect(generateScene(PARAMS, 42)).toBe(generateScene(PARAMS, 42));
  });

  it('can select different palettes for different seeds', () => {
    const chosen = new Set(
      Array.from({ length: 40 }, (_, seed) => {
        const colors = paintedColors(generateScene(PARAMS, seed));

        return (
          PALETTE_NAMES.find((name) =>
            colors.has(sunColors(paletteByName(name)).bands[1]),
          ) ?? 'none'
        );
      }),
    );

    expect(chosen.size).toBeGreaterThan(1);
    expect(chosen).not.toContain('none');
  });
});
