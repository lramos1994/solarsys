import { hueShift, mix, rgba, shade, tint } from './color';

/** Authored sun classes (an authored parameter, not seed-only). */
export const SUN_TYPES = ['YellowDwarf', 'RedGiant', 'WhiteDwarf'] as const;
export type SunType = (typeof SUN_TYPES)[number];

/** The six cohesive palettes preserved from the baseline (E-011, GEN-011). */
export const PALETTE_NAMES = [
  'Aurora',
  'Ember',
  'Abissal',
  'Amethyst',
  'Verdant',
  'Mono',
] as const;

export type PaletteName = (typeof PALETTE_NAMES)[number];

export interface Palette {
  name: PaletteName;
  /** Four nebula tones; the last doubles as the vignette colour. */
  background: readonly [string, string, string, string];
  sun: string;
  planetHues: readonly [string, string, string, string];
  accent: string;
  stars: readonly [string, string, string];
}

const PALETTES: Record<PaletteName, Omit<Palette, 'name'>> = {
  Aurora: {
    background: ['#0a1a2e', '#0e2a44', '#0a1830', '#050a18'],
    sun: '#ffd27a',
    planetHues: ['#4fa3c7', '#5ec6b0', '#7ea8e0', '#48c78e'],
    accent: '#7ef0d0',
    stars: ['#ffffff', '#bfe6ff', '#d8fff0'],
  },
  Ember: {
    background: ['#2a1010', '#3a1408', '#200a08', '#100405'],
    sun: '#ffb347',
    planetHues: ['#e8734a', '#e8a24a', '#c85a3a', '#d98a3a'],
    accent: '#ff9e6d',
    stars: ['#ffffff', '#ffe0c0', '#ffd0a0'],
  },
  Abissal: {
    background: ['#08161f', '#0a2230', '#061620', '#03080f'],
    sun: '#9fe0ff',
    planetHues: ['#2f8fb0', '#3aa0a0', '#4f7fb0', '#2fa08a'],
    accent: '#6fd0f0',
    stars: ['#ffffff', '#cfeaff', '#bfffff'],
  },
  Amethyst: {
    background: ['#1a0f2e', '#241145', '#160a2a', '#0a0518'],
    sun: '#e6b3ff',
    planetHues: ['#9a6ee0', '#b06ec8', '#7e6ee0', '#c86ea8'],
    accent: '#d0a0ff',
    stars: ['#ffffff', '#e6d0ff', '#f0d8ff'],
  },
  Verdant: {
    background: ['#0a2018', '#0e3024', '#082018', '#04120c'],
    sun: '#eaf0a0',
    planetHues: ['#4faa6e', '#6ec86e', '#3aa08a', '#8ac85e'],
    accent: '#a0f0a0',
    stars: ['#ffffff', '#e0ffd8', '#f0ffe0'],
  },
  Mono: {
    background: ['#14161a', '#1c2028', '#101216', '#08090c'],
    sun: '#f0f0f0',
    planetHues: ['#8a8f98', '#a0a4ac', '#727782', '#b8bcc4'],
    accent: '#d8dce4',
    stars: ['#ffffff', '#e0e4ec', '#c8ccd4'],
  },
};

/** Look up one of the six named palettes. */
export function paletteByName(name: PaletteName): Palette {
  return { name, ...PALETTES[name] };
}

export interface BodyColors {
  base: string;
  light: string;
  dark: string;
  stains: readonly [string, string, string];
  atmosphere: string;
}

/** Derive a planet's tones from its palette hue, cycling hues by index. */
export function planetColors(palette: Palette, index: number): BodyColors {
  const hues = palette.planetHues;
  const base = hues[index % hues.length] as string;

  return {
    base,
    light: tint(base, 0.35),
    dark: shade(base, 0.5),
    stains: [shade(base, 0.6), shade(base, 0.3), hueShift(base, -14)],
    atmosphere: rgba(tint(base, 0.25), 0.35),
  };
}

/** Derive a moon's tones: the planet hue softened toward the faintest star tint. */
export function moonColors(palette: Palette, index: number): BodyColors {
  const hues = palette.planetHues;
  const hue = hues[index % hues.length] as string;
  const base = mix(hue, palette.stars[palette.stars.length - 1] as string, 0.5);

  return {
    base,
    light: tint(base, 0.3),
    dark: shade(base, 0.5),
    stains: [shade(base, 0.55), shade(base, 0.3), shade(base, 0.7)],
    atmosphere: rgba(tint(base, 0.25), 0.35),
  };
}

export interface RingColors {
  /** Four material tones, ordered from the brightest icy band to the dustiest. */
  bands: readonly [string, string, string, string];
  gap: string;
}

/**
 * Derive the ring's material tones and its gap tone from the palette accent.
 *
 * Four tones rather than two: real ring systems read as banded because
 * adjacent bands differ in brightness AND in material, so the darkest tone
 * also carries a small hue shift toward dust instead of being a plain
 * darkening of the same colour.
 */
export function ringColors(palette: Palette): RingColors {
  const accent = palette.accent;

  return {
    bands: [
      tint(accent, 0.45),
      tint(accent, 0.1),
      shade(accent, 0.3),
      shade(hueShift(accent, -12), 0.5),
    ],
    gap: shade(accent, 0.68),
  };
}

export interface SunColors {
  bands: readonly [string, string, string];
  glow: string;
  corona: string;
}

/** Derive the sun's banded tones, glow and corona from the palette.
 *
 * `type` re-tones the baseline Yellow Dwarf palette colour toward each
 * authored sun class: a Red Giant hue-shifts warmer, a White Dwarf is
 * desaturated toward white. Omitted keeps the exact baseline colours.
 */
export function sunColors(palette: Palette, type?: SunType): SunColors {
  const base = type === 'RedGiant'
    ? shade(hueShift(palette.sun, -20), 0.05)
    : type === 'WhiteDwarf'
      ? tint(palette.sun, 0.55)
      : palette.sun;

  return {
    bands: [tint(base, 0.5), base, shade(base, 0.35)],
    glow: rgba(base, 0.35),
    corona: shade(base, 0.15),
  };
}
