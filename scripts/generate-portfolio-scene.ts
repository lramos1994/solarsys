/**
 * Generates the SolarSys scene embedded in the portfolio homepage.
 *
 * Run from the solarsys checkout:
 *   npx vite-node scripts/generate-portfolio-scene.ts
 *
 * Writes ../portfolio/assets/solarsys-scene.svg
 *
 * Values are ABSOLUTE SVG units, as generateScene requires (the UI's
 * percentage model resolves before calling it). The canvas is 1200x675 to
 * match the 16/9 .project-stage in the portfolio, which gives a drawable
 * half-extent of 337 vertically — that vertical extent, not the width, is
 * what bounds every orbit below.
 *
 * The scene this replaces had three planets and a belt spanning radius
 * 125..1075, which is both wider than the canvas and so sparse that the
 * rocks read as noise. Two things follow from that, and they are the whole
 * design of this file:
 *
 *   1. Orbits stay inside the vertical half-extent. An orbit at distance d
 *      is an ellipse whose vertical semi-axis is d * (height/width), so a
 *      distance of 520 reaches 292 vertically and clears the 337 edge.
 *      Distances are the free parameter; the aspect ratio is not.
 *
 *   2. The belt is narrow and dense, not wide and thin. Rocks are placed
 *      area-uniformly between innerRadius and outerRadius, so widening the
 *      band spreads the same count over a quadratically larger area. A
 *      tight band with a high count is what makes it read as a belt.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateScene, type SceneParams } from '../ts/generator/scene.ts';

const OUT = new URL('../../portfolio/assets/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const canvas = { width: 1200, height: 675 } as const;

/**
 * Seven planets, ordered outward. Sizes deliberately do not increase
 * monotonically: a flat progression reads as a diagram, and the two ringed
 * giants need smaller neighbours around them to look like giants.
 *
 * Every `distance` is a scalar except where an eccentric orbit earns its
 * keep. The four-extent form is [right, top, left, bottom], so an orbit
 * that is wider than it is tall keeps its planet away from the vertical
 * edges where the canvas runs out first.
 */
const params: SceneParams = {
  canvas,
  palette: 'Aurora',
  sunType: 'YellowDwarf',
  planets: [
    // Inner rocky pair, close and quick.
    { size: 9, distance: 92, moon: false, ring: false },
    { size: 14, distance: 138, moon: false, ring: false },

    // First world with a moon, still inside the belt.
    {
      size: 19,
      distance: 196,
      moon: { size: 6, distance: 40, period: 9 },
      ring: false,
    },

    // Ringed giant just outside the belt: the scene's focal body.
    {
      size: 34,
      distance: 300,
      moon: { size: 10, distance: 72, period: 14 },
      ring: { type: 'Banded', sizePercent: 205, inclinationDegrees: 22 },
    },

    // Eccentric mid-outer world. Wider than tall, for the reason above.
    {
      size: 22,
      distance: [400, 350, 400, 350],
      moon: { size: 7, distance: 48, period: 11 },
      ring: false,
    },

    // Second ringed body, thinner ring so it reads as a different class.
    {
      size: 27,
      distance: [470, 405, 470, 405],
      moon: false,
      ring: { type: 'Thin', sizePercent: 240, inclinationDegrees: 38 },
    },

    // Cold outer world at the edge of the drawable area: 520 * (675/1200)
    // = 292 vertically, inside the 337 half-extent.
    {
      size: 16,
      distance: 520,
      moon: { size: 6, distance: 38, period: 13 },
      ring: false,
    },
  ],

  /**
   * The belt sits in the gap between planet 3 (196) and the ringed giant
   * (300), which is where a real belt would be and where it is legible.
   * 320 rocks across a 42-unit band is roughly 12x the density of the
   * scene this replaces, whose band was 950 units wide.
   */
  asteroidBelt: {
    count: 320,
    innerRadius: 228,
    outerRadius: 270,
    baseRadius: 1.5,
    period: 210,
    type: 'rocky',
  },
};

const seed = 20260903;
const svg = generateScene(params, seed);

writeFileSync(new URL('solarsys-scene.svg', OUT), svg);

const count = (pattern: string): number =>
  svg.split(`data-role="${pattern}"`).length - 1;

console.log(`seed ${seed}, ${svg.length} bytes`);
console.log(
  `planets ${count('planet')}  moons ${count('moon')}  ` +
    `rings ${count('ring-front')}  comets ${count('comet')}  ` +
    `stars ${count('star')}  belt rocks ${
      /data-count="(\d+)"/.exec(svg)?.[1] ?? '?'
    }`,
);
