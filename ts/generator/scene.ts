import { renderAsteroidBelt, renderBackground, renderComets } from './ambient';
import { renderSun } from './bodies';
import { rgba } from './color';
import { documentShell } from './document';
import { createIdGenerator, type IdGenerator } from './ids';
import { renderMoon, type MoonConfig } from './moon';
import { orbitPath, type Canvas, type OrbitDistance } from './orbit';
import {
  PALETTE_NAMES,
  paletteByName,
  type Palette,
  type PaletteName,
} from './palette';
import { createPrng, type Prng } from './prng';
import { renderPlanetWithRing, ringAssignment } from './ring';

export interface PlanetParams {
  size: number;
  distance: OrbitDistance;
  moon: MoonConfig | false;
}

export interface SceneParams {
  canvas: Canvas;
  planets: readonly PlanetParams[];
  /** A named palette, or omitted to let the seed choose one. */
  palette?: PaletteName;
}

export interface SceneOptions {
  /**
   * Internal development mode: suppresses ambient elements and renders orbit
   * geometry with increased visibility. Never exposed as a user control
   * (D-11, GEN-015, CTL-009).
   */
  debug?: boolean;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function randomInt(random: Prng, min: number, max: number): number {
  return min + Math.floor(random.next() * (max - min + 1));
}

/** Choose the scene palette: an explicit name, or one derived from the seed. */
function selectPalette(params: SceneParams, random: Prng): Palette {
  if (params.palette !== undefined) {
    return paletteByName(params.palette);
  }

  return paletteByName(PALETTE_NAMES[randomInt(random, 0, PALETTE_NAMES.length - 1)]!);
}

/** Visible orbit stroke, which is also the planet's motion path (GEN-003). */
function renderOrbit(
  canvas: Canvas,
  distance: OrbitDistance,
  orbitId: string,
  debug: boolean,
): string {
  // Debug renders the guide geometry boldly; normal mode keeps it a faint hint.
  const stroke = debug
    ? `stroke="lightgrey" stroke-width="1"`
    : `stroke="${rgba('#ffffff', 0.06)}" stroke-width="0.4"`;

  return (
    `<path data-role="orbit" id="${orbitId}" fill="none" ${stroke}` +
    ` d="${orbitPath(canvas, distance)}"/>`
  );
}

interface PlanetRenderResult {
  orbit: string;
  planet: string;
}

/**
 * Reduced-motion style rule (QLT-005).
 *
 * Measured before implementing: CSS cannot stop a running SMIL animation.
 * `display:none` on `<animateMotion>` (E-054), `animation-play-state`, and a
 * transform override on the animated group all left the element moving. The
 * only technique that suppressed motion was hiding the animated SUBTREE.
 *
 * So each moving element ships twice — an animated variant and a static twin
 * resting at its t=0 position — and this one query swaps them. Elements stay
 * visible and on their orbits, which QLT-005 requires.
 */
const REDUCED_MOTION_STYLE =
  `<style>` +
  `.ss-static{display:none}` +
  `@media (prefers-reduced-motion: reduce){` +
  `.ss-animated{display:none}` +
  `.ss-static{display:inline}` +
  `}` +
  `</style>`;

/**
 * Render one planet: its orbit path, and the animated group carrying the
 * planet body, its ring pieces and its moon, plus a static twin for
 * reduced-motion environments.
 *
 * The moon is nested INSIDE the animated group, so it inherits the planet's
 * travel along the orbit while orbiting the planet itself (GEN-008).
 *
 * The twin references the body through `<use>` rather than duplicating the
 * markup, so honouring the preference does not double the file size.
 */
function renderPlanet(
  params: PlanetParams,
  index: number,
  canvas: Canvas,
  palette: Palette,
  ids: IdGenerator,
  random: Prng,
  debug: boolean,
): PlanetRenderResult {
  const orbitId = ids.next('orbit');
  const orbit = renderOrbit(canvas, params.distance, orbitId, debug);

  const { hasRing, tilt } = ringAssignment(random, params.size);
  const body = renderPlanetWithRing({
    size: params.size,
    index,
    palette,
    ids,
    random,
    hasRing,
    tilt,
  });

  const moon =
    params.moon === false
      ? null
      : renderMoon({ moon: params.moon, index, palette, ids, random, debug });

  const duration = randomInt(random, 20, 60);
  const offset = round((duration * randomInt(random, 0, 100)) / 100);

  const bodyId = ids.next('planet-body-group');
  const restX = canvas.width / 2 - leftExtentOf(params.distance);
  const restY = canvas.height / 2;

  // The twin must contain NO animation. Referencing the animated subtree with
  // <use> is not enough: a cloned SMIL animation keeps running in the shadow
  // tree, so a twin built that way still moves its moon. The twin therefore
  // references the animation-free body group and places a second <use> of the
  // moon's body group at the moon's t=0 rest offset.
  const staticMoon =
    moon === null
      ? ''
      : `<g transform="translate(${moon.rest.x} ${moon.rest.y})">` +
        `<use href="#${moon.bodyId}"/>` +
        `</g>`;

  const planet =
    `<g data-role="planet" class="ss-animated">` +
    `<g id="${bodyId}">${body}</g>` +
    (moon === null ? '' : moon.markup) +
    `<animateMotion dur="${duration}s" begin="-${offset}s" repeatCount="indefinite">` +
    `<mpath xlink:href="#${orbitId}"/>` +
    `</animateMotion>` +
    `</g>` +
    // The twin rests where the animated body sits at t=0: the orbit start.
    `<g data-role="planet" class="ss-static" transform="translate(${restX} ${restY})">` +
    `<use href="#${bodyId}"/>` +
    staticMoon +
    `</g>`;

  return { orbit, planet };
}

/**
 * Left extent of a distance. `orbitPath` starts its path at `(cx - left, cy)`,
 * so this is the x-offset of a planet's t=0 rest position.
 */
function leftExtentOf(distance: OrbitDistance): number {
  return typeof distance === 'number' ? distance : distance[0];
}

/**
 * Generate a complete scene as a single serialized SVG string.
 *
 * Pure: identical `params` and `seed` always produce identical bytes. All
 * randomness flows through one explicitly threaded PRNG and all identity
 * through one seed-derived counter, so nothing observes the clock (D-19, D-20).
 */
export function generateScene(
  params: SceneParams,
  seed: number,
  options: SceneOptions = {},
): string {
  const debug = options.debug ?? false;
  const random = createPrng(seed);
  const ids = createIdGenerator(seed);
  const palette = selectPalette(params, random);

  // Generation order is contractual: ids are seed-derived counters, so
  // reordering these calls changes every downstream id (D-20).
  const background = debug
    ? ''
    : renderBackground(params.canvas, palette, ids, random);
  const belt = debug ? '' : renderAsteroidBelt(params.canvas, palette, ids, random);

  const orbits: string[] = [];
  const planets: string[] = [];

  params.planets.forEach((planet, index) => {
    const rendered = renderPlanet(
      planet,
      index,
      params.canvas,
      palette,
      ids,
      random,
      debug,
    );

    orbits.push(rendered.orbit);
    planets.push(rendered.planet);
  });

  const sun = renderSun(params.canvas, palette, ids);
  const comets = debug ? '' : renderComets(params.canvas, palette, ids, random);

  // Document order IS depth in SVG: background, belt, orbits, sun, planets,
  // comets (GEN-004).
  const content =
    REDUCED_MOTION_STYLE +
    background +
    belt +
    orbits.join('') +
    sun +
    planets.join('') +
    comets;

  return documentShell(params.canvas, content);
}
