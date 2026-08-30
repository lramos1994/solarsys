import { rgba } from './color';
import type { IdGenerator } from './ids';
import type { Canvas } from './orbit';
import {
  type BodyColors,
  type Palette,
  planetColors,
  SUN_TYPES,
  sunColors,
  type SunColors,
  type SunType,
} from './palette';
import type { Prng } from './prng';

export { SUN_TYPES, type SunType } from './palette';

/** Round to the two-decimal precision the baseline emits. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Integer in `[min, max]`, drawn from the supplied seeded generator. */
function randomInt(random: Prng, min: number, max: number): number {
  return min + Math.floor(random.next() * (max - min + 1));
}

const DEFAULT_SUN_TYPE: SunType = 'YellowDwarf';

/** Radius multiplier applied on top of the canvas-derived base radius. */
const SUN_TYPE_SCALE: Record<SunType, number> = {
  YellowDwarf: 1,
  RedGiant: 1.45,
  WhiteDwarf: 0.55,
};

/** Sun radius derived from the canvas dimensions, preserved from the baseline. */
export function sunRadius(canvas: Canvas, type: SunType = DEFAULT_SUN_TYPE): number {
  return ((canvas.width + canvas.height) / 2.5) * 0.05 * SUN_TYPE_SCALE[type];
}

export interface SunOptions {
  /** Authored sun class; omitted keeps the baseline Yellow Dwarf look. */
  type?: SunType;
  /**
   * Seeded generator driving surface-spot placement and rotation duration.
   * Omitted keeps the sun static with no spot layer, for backward
   * compatibility with direct callers that pre-date rotation.
   */
  random?: Prng;
}

/** Low-count surface spots, rotated as a group to read as stellar rotation. */
function renderSunSpots(
  radius: number,
  tones: SunColors,
  random: Prng,
  cx: number,
  cy: number,
): string {
  const count = randomInt(random, 3, 6);
  let spots = '';

  for (let spot = 0; spot < count; spot += 1) {
    const angle = (randomInt(random, 0, 360) * Math.PI) / 180;
    const distance = (radius * randomInt(random, 10, 70)) / 100;
    const spotCx = round(cx + Math.cos(angle) * distance);
    const spotCy = round(cy + Math.sin(angle) * distance);
    const size = (radius * randomInt(random, 8, 20)) / 100;

    spots +=
      `<circle data-role="sun-spot" cx="${spotCx}" cy="${spotCy}" r="${round(size)}"` +
      ` fill="${tones.bands[2]}" opacity="0.35"/>`;
  }

  return spots;
}

/**
 * Render the sun: a radial glow, a corona ring, concentric flat bands, an
 * offset highlight and, when a generator is supplied, a rotating layer of
 * surface spots, centred on the canvas centre (GEN-005).
 *
 * The sun class (`options.type`) is an authored parameter that scales the
 * body and re-tones it (the baseline colours remain the Yellow Dwarf
 * default). Rotation duration is seed-derived, matching how orbital periods
 * and other purely visual motion are generated elsewhere in the scene.
 */
export function renderSun(
  canvas: Canvas,
  palette: Palette,
  ids: IdGenerator,
  options: SunOptions = {},
): string {
  const type = options.type ?? DEFAULT_SUN_TYPE;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const radius = sunRadius(canvas, type);
  const glowId = ids.next('sun-glow');
  const tones = sunColors(palette, type);

  const spotLayer = options.random === undefined
    ? ''
    : (() => {
        const random = options.random as Prng;
        const spotId = ids.next('sun-spots');
        const duration = randomInt(random, 40, 120);

        return (
          `<defs><clipPath id="clip-${spotId}"><circle cx="${cx}" cy="${cy}" r="${radius}"/></clipPath></defs>` +
          `<g id="${spotId}" data-role="sun-spots" clip-path="url(#clip-${spotId})">` +
          renderSunSpots(radius, tones, random, cx, cy) +
          `<animateTransform attributeName="transform" type="rotate"` +
          ` from="0 ${cx} ${cy}" to="360 ${cx} ${cy}" dur="${duration}s" repeatCount="indefinite"/>` +
          `</g>`
        );
      })();

  return (
    `<defs><radialGradient id="${glowId}">` +
    `<stop offset="0%" stop-color="${tones.corona}" stop-opacity="0.45"/>` +
    `<stop offset="55%" stop-color="${tones.corona}" stop-opacity="0.15"/>` +
    `<stop offset="100%" stop-color="${tones.corona}" stop-opacity="0"/>` +
    `</radialGradient></defs>` +
    `<circle data-role="sun-glow" cx="${cx}" cy="${cy}" r="${round(radius * 3)}" fill="url(#${glowId})"/>` +
    `<circle data-role="sun-corona" cx="${cx}" cy="${cy}" r="${round(radius * 1.35)}"` +
    ` fill="none" stroke="${tones.corona}" stroke-width="${round(radius * 0.12)}" opacity="0.5"/>` +
    `<circle data-role="sun-band" data-sun-body="true" cx="${cx}" cy="${cy}" r="${radius}" fill="${tones.bands[2]}"/>` +
    `<circle data-role="sun-band" cx="${cx}" cy="${cy}" r="${round(radius * 0.8)}" fill="${tones.bands[1]}"/>` +
    `<circle data-role="sun-highlight" cx="${round(cx - radius * 0.25)}" cy="${round(cy - radius * 0.25)}"` +
    ` r="${round(radius * 0.5)}" fill="${tones.bands[0]}"/>` +
    spotLayer
  );
}

export interface PlanetBodyOptions {
  size: number;
  index: number;
  palette: Palette;
  ids: IdGenerator;
  random: Prng;
}

/**
 * Render a planet body with the baseline's fixed lighting model: a drop
 * shadow, an atmosphere ring, and — clipped to the body — the base disc, an
 * up-left highlight, surface blobs, and a down-right terminator (GEN-006).
 */
export function renderPlanetBody(options: PlanetBodyOptions): string {
  const { size: r, index, palette, ids, random } = options;
  const tones: BodyColors = planetColors(palette, index);

  const clipId = ids.next('clip');
  const shadowId = ids.next('drop');

  const defs =
    `<defs>` +
    `<clipPath id="${clipId}"><circle cx="0" cy="0" r="${r}"/></clipPath>` +
    `<radialGradient id="${shadowId}">` +
    `<stop offset="0%" stop-color="${rgba('#000000', 0.45)}"/>` +
    `<stop offset="65%" stop-color="${rgba('#000000', 0.18)}"/>` +
    `<stop offset="100%" stop-color="${rgba('#000000', 0)}"/>` +
    `</radialGradient>` +
    `</defs>`;

  return (
    defs +
    `<circle data-role="planet-shadow" cx="${round(r * 0.18)}" cy="${round(r * 0.28)}"` +
    ` r="${round(r * 1.5)}" fill="url(#${shadowId})"/>` +
    `<circle data-role="planet-atmosphere" cx="0" cy="0" r="${round(r * 1.18)}"` +
    ` fill="none" stroke="${tones.atmosphere}" stroke-width="${round(r * 0.16)}"/>` +
    `<g clip-path="url(#${clipId})">` +
    `<circle data-role="planet-body" cx="0" cy="0" r="${r}" fill="${tones.base}"/>` +
    `<circle data-role="planet-highlight" cx="${round(-r * 0.35)}" cy="${round(-r * 0.35)}"` +
    ` r="${round(r * 0.9)}" fill="${tones.light}" opacity="0.5"/>` +
    renderBlobs(r, tones.stains, random) +
    `<circle data-role="planet-terminator" cx="${round(r * 0.55)}" cy="${round(r * 0.35)}"` +
    ` r="${round(r * 1.15)}" fill="${tones.dark}" opacity="0.55"/>` +
    `</g>`
  );
}

/** Low-count quadratic-curve surface blobs in harmonised stain colours. */
function renderBlobs(r: number, stains: readonly string[], random: Prng): string {
  let out = '';
  const count = randomInt(random, 3, 5);

  for (let blob = 0; blob < count; blob += 1) {
    const angle = (randomInt(random, 0, 360) * Math.PI) / 180;
    const distance = randomInt(random, 0, Math.trunc(r * 6)) / 10;
    const cx = round(Math.cos(angle) * distance);
    const cy = round(Math.sin(angle) * distance);
    const size = (r * randomInt(random, 22, 42)) / 100;
    const points = randomInt(random, 6, 9);

    const coords: Array<[number, number]> = [];
    for (let point = 0; point < points; point += 1) {
      const a = (point / points) * 2 * Math.PI;
      const radius = (size * randomInt(random, 70, 115)) / 100;

      coords.push([round(cx + Math.cos(a) * radius), round(cy + Math.sin(a) * radius)]);
    }

    const first = coords[0]!;
    const second = coords[1]!;
    let path = `M ${round((first[0] + second[0]) / 2)} ${round((first[1] + second[1]) / 2)}`;

    for (let point = 1; point <= coords.length; point += 1) {
      const current = coords[point % coords.length]!;
      const next = coords[(point + 1) % coords.length]!;

      path += ` Q ${current[0]} ${current[1]}, ${round((current[0] + next[0]) / 2)} ${round(
        (current[1] + next[1]) / 2,
      )}`;
    }

    const color = stains[randomInt(random, 0, stains.length - 1)] as string;
    out += `<path data-role="planet-blob" d="${path} Z" fill="${color}" opacity="0.55"/>`;
  }

  return out;
}
