import { describe, expect, it } from 'vitest';
import {
  PALETTE_NAMES,
  moonColors,
  paletteByName,
  planetColors,
  ringColors,
  sunColors,
} from '../../ts/generator/palette';

// Colour values are ported verbatim from src/Theme.php; the derived tones use
// the task 2.1 colour utilities, so a drift in either shows up here.
describe('palettes', () => {
  it('offers exactly the six baseline palettes in order', () => {
    expect(PALETTE_NAMES).toEqual([
      'Aurora',
      'Ember',
      'Abissal',
      'Amethyst',
      'Verdant',
      'Mono',
    ]);
  });

  it('preserves the baseline Aurora values', () => {
    const aurora = paletteByName('Aurora');

    expect(aurora.background).toEqual(['#0a1a2e', '#0e2a44', '#0a1830', '#050a18']);
    expect(aurora.sun).toBe('#ffd27a');
    expect(aurora.planetHues).toEqual(['#4fa3c7', '#5ec6b0', '#7ea8e0', '#48c78e']);
    expect(aurora.accent).toBe('#7ef0d0');
    expect(aurora.stars).toEqual(['#ffffff', '#bfe6ff', '#d8fff0']);
  });

  it('gives every palette four background tones, four hues and three star tints', () => {
    for (const name of PALETTE_NAMES) {
      const palette = paletteByName(name);

      expect(palette.background).toHaveLength(4);
      expect(palette.planetHues).toHaveLength(4);
      expect(palette.stars).toHaveLength(3);
    }
  });

  it('cycles planet hues by index', () => {
    const palette = paletteByName('Aurora');

    expect(planetColors(palette, 4).base).toBe(planetColors(palette, 0).base);
    expect(planetColors(palette, 1).base).not.toBe(planetColors(palette, 0).base);
  });

  it('derives planet tones from the base hue', () => {
    const tones = planetColors(paletteByName('Aurora'), 0);

    expect(tones.base).toBe('#4fa3c7');
    expect(tones.light).not.toBe(tones.base);
    expect(tones.dark).not.toBe(tones.base);
    expect(tones.stains).toHaveLength(3);
    expect(tones.atmosphere.startsWith('rgba(')).toBe(true);
  });

  it('derives sun bands, corona and glow', () => {
    const sun = sunColors(paletteByName('Ember'));

    expect(sun.bands).toHaveLength(3);
    expect(new Set(sun.bands).size).toBe(3);
    expect(sun.corona).not.toBe(sun.bands[1]);
  });

  it('derives moon tones distinct from the planet tones', () => {
    const palette = paletteByName('Aurora');

    expect(moonColors(palette, 0).base).not.toBe(planetColors(palette, 0).base);
  });

  it('derives ring bands and a gap tone from the accent colour', () => {
    const ring = ringColors(paletteByName('Aurora'));

    expect(ring.bands).toHaveLength(4);
    expect(new Set(ring.bands).size).toBe(4);
    expect(ring.bands).not.toContain(ring.gap);
  });
});
