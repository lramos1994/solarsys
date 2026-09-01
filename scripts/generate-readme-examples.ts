/**
 * Generates the three showcase scenes embedded in README.md.
 *
 * Run: npx vite-node scripts/generate-readme-examples.ts
 *
 * Values are ABSOLUTE SVG units, as the generator requires (the UI's
 * percentage model resolves before calling generateScene). Canvas 600x600
 * gives a drawable half-extent of 300.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateScene, type SceneParams } from '../ts/generator/scene.ts';

const OUT_DIR = new URL('../docs/examples/', import.meta.url);
mkdirSync(OUT_DIR, { recursive: true });

const canvas = { width: 600, height: 600 } as const;

const scenes: Record<string, { params: SceneParams; seed: number }> = {
  // A classic system: three planets, one ringed giant with a moon.
  'aurora-classic': {
    seed: 20260826,
    params: {
      canvas,
      palette: 'Aurora',
      sunType: 'YellowDwarf',
      planets: [
        { size: 12, distance: 96, moon: false, ring: false },
        {
          size: 33,
          distance: 180,
          moon: { size: 9, distance: 66, period: 12 },
          ring: { type: 'Banded', sizePercent: 210, inclinationDegrees: 24 },
        },
        { size: 18, distance: 264, moon: false, ring: false },
      ],
      asteroidBelt: false,
    },
  },

  // A red giant with asymmetric orbits and a wide-ringed world.
  'ember-red-giant': {
    seed: 41,
    params: {
      canvas,
      palette: 'Ember',
      sunType: 'RedGiant',
      planets: [
        {
          size: 15,
          distance: [150, 120, 186, 132],
          moon: false,
          ring: { type: 'Wide', sizePercent: 260, inclinationDegrees: 40 },
        },
        {
          size: 24,
          distance: [255, 210, 285, 240],
          moon: { size: 12, distance: 84, period: 18 },
          ring: false,
        },
      ],
      asteroidBelt: false,
    },
  },

  // A white dwarf sheltered by a dense icy belt.
  'abissal-belt': {
    seed: 7,
    params: {
      canvas,
      palette: 'Abissal',
      sunType: 'WhiteDwarf',
      planets: [
        { size: 10, distance: 84, moon: false, ring: false },
        {
          size: 21,
          distance: 156,
          moon: { size: 8, distance: 72, period: 10 },
          ring: { type: 'Thin', sizePercent: 190, inclinationDegrees: 14 },
        },
      ],
      asteroidBelt: {
        type: 'icy',
        count: 220,
        innerRadius: 216,
        outerRadius: 252,
        baseRadius: 2.4,
        period: 240,
      },
    },
  },
};

for (const [name, { params, seed }] of Object.entries(scenes)) {
  const svg = generateScene(params, seed);
  const path = new URL(`${name}.svg`, OUT_DIR);
  writeFileSync(path, svg);
  console.log(`${name}.svg  ${svg.length} bytes  seed=${seed}`);
}
