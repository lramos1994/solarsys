import {
  renderAsteroidBelt,
  renderBackground,
  renderComets,
  type AsteroidBeltConfig,
} from './ambient';
import { renderSun, type SunType } from './bodies';
import { rgba } from './color';
import { documentShell } from './document';
import { createIdGenerator, type IdGenerator } from './ids';
import { escapeText, sceneDescription, sceneTitle } from './metadata';
import { renderMoon, type MoonConfig } from './moon';
import { orbitPath, type Canvas, type OrbitDistance } from './orbit';
import {
  PALETTE_NAMES,
  paletteByName,
  type Palette,
  type PaletteName,
} from './palette';
import { createPrng, type Prng } from './prng';
import { renderPlanetWithRing, ringAssignment, type RingConfig } from './ring';

export interface PlanetParams {
  size: number;
  distance: OrbitDistance;
  moon: MoonConfig | false;
  /** Omitted preserves legacy seed assignment for direct callers. */
  ring?: RingConfig | false;
}

export interface SceneParams {
  canvas: Canvas;
  planets: readonly PlanetParams[];
  /** A named palette, or omitted to let the seed choose one. */
  palette?: PaletteName;
  /** Omitted preserves the legacy fixed belt for direct callers. */
  asteroidBelt?: AsteroidBeltConfig | false;
  /** Authored sun class; omitted keeps the baseline Yellow Dwarf look. */
  sunType?: SunType;
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

/**
 * Visible orbit stroke marking the asteroid belt's centre radius (GEN-025).
 *
 * Emitted outside the belt's rotating group so it stays static, and given a
 * role of its own so it is never mistaken for a planet orbit. It carries no
 * planet index because it belongs to no planet.
 */
function renderBeltOrbit(
  canvas: Canvas,
  belt: AsteroidBeltConfig,
  orbitId: string,
): string {
  const centre = (belt.innerRadius + belt.outerRadius) / 2;

  return (
    `<path data-role="belt-orbit"` +
    ` id="${orbitId}" fill="none"` +
    ` stroke="${rgba('#ffffff', 0.06)}" stroke-width="0.4"` +
    ` d="${orbitPath(canvas, centre)}"/>`
  );
}

/** Visible orbit stroke, which is also the planet's motion path (GEN-003). */
function renderOrbit(
  canvas: Canvas,
  distance: OrbitDistance,
  orbitId: string,
  planetIndex: number,
  debug: boolean,
): string {
  // Debug renders the guide geometry boldly; normal mode keeps it a faint hint.
  const stroke = debug
    ? `stroke="lightgrey" stroke-width="1"`
    : `stroke="${rgba('#ffffff', 0.06)}" stroke-width="0.4"`;

  return (
    `<path data-role="orbit" data-planet-index="${planetIndex}"` +
    ` id="${orbitId}" fill="none" ${stroke}` +
    ` d="${orbitPath(canvas, distance)}"/>`
  );
}

interface PlanetRenderResult {
  orbit: string;
  planet: string;
}

/**
 * Render one planet: its orbit path, and the animated group carrying the
 * planet body, its ring pieces and its moon.
 *
 * The moon is nested INSIDE the animated group, so it inherits the planet's
 * travel along the orbit while orbiting the planet itself (GEN-008).
 *
 * The artefact animates unconditionally: playback is controlled by the
 * application through the SVG DOM, never by markup inside the file (D-28).
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
  const orbit = renderOrbit(canvas, params.distance, orbitId, index, debug);

  const bodyOptions = {
    size: params.size,
    index,
    palette,
    ids,
    random,
  };
  const body = params.ring === undefined
    ? renderPlanetWithRing({
        ...bodyOptions,
        ...ringAssignment(random, params.size),
      })
    : renderPlanetWithRing({ ...bodyOptions, ring: params.ring });

  const moon =
    params.moon === false
      ? null
      : renderMoon({ moon: params.moon, index, palette, ids, random, debug });

  const duration = randomInt(random, 20, 60);
  const offset = round((duration * randomInt(random, 0, 100)) / 100);

  const bodyId = ids.next('planet-body-group');

  const planet =
    `<g data-role="planet">` +
    `<g id="${bodyId}">${body}</g>` +
    (moon === null ? '' : moon.markup) +
    `<animateMotion dur="${duration}s" begin="-${offset}s" repeatCount="indefinite">` +
    `<mpath xlink:href="#${orbitId}"/>` +
    `</animateMotion>` +
    `</g>`;

  return { orbit, planet };
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
  const belt = debug || params.asteroidBelt === false
    ? ''
    : renderAsteroidBelt(params.canvas, palette, ids, random, params.asteroidBelt);
  // The belt's own orbit stroke (GEN-025). Emitted here so it sits in the orbit
  // layer and outside the belt's rotating group; its position in generation
  // order is contractual because ids are seed-derived counters.
  const beltOrbit =
    debug || params.asteroidBelt === false || params.asteroidBelt === undefined
      ? ''
      : renderBeltOrbit(params.canvas, params.asteroidBelt, ids.next('belt-orbit'));

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

  const sun = renderSun(params.canvas, palette, ids, {
    ...(params.sunType === undefined ? {} : { type: params.sunType }),
    random,
  });
  const comets = debug ? '' : renderComets(params.canvas, palette, ids, random);

  // Title and description come first so assistive technology encounters the
  // scene's summary before its geometry (QLT-004).
  const summary = {
    canvas: params.canvas,
    palette,
    planetCount: params.planets.length,
    moonCount: params.planets.filter((planet) => planet.moon !== false).length,
  };
  const metadata =
    `<title>${escapeText(sceneTitle(summary))}</title>` +
    `<desc>${escapeText(sceneDescription(summary))}</desc>`;

  // Document order IS depth in SVG: background, belt, orbits, sun, planets,
  // comets (GEN-004).
  const content =
    background +
    belt +
    beltOrbit +
    orbits.join('') +
    sun +
    planets.join('') +
    comets;

  return documentShell(params.canvas, content, metadata);
}
