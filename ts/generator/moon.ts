import { rgba } from './color';
import type { IdGenerator } from './ids';
import { BEZIER_CONSTANT } from './orbit';
import { moonColors, type Palette } from './palette';
import type { Prng } from './prng';

/** Baseline moon period, retained as the default (D-04, E-009). */
export const DEFAULT_MOON_PERIOD = 15;

export interface MoonConfig {
  size: number;
  distance: number;
  /** Orbital period in seconds; defaults to `DEFAULT_MOON_PERIOD`. */
  period?: number;
}

export interface MoonOptions {
  moon: MoonConfig;
  index: number;
  palette: Palette;
  ids: IdGenerator;
  random: Prng;
  /** Internal debug mode: exposes the otherwise invisible moon orbit. */
  debug?: boolean;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Closed Bezier circle of radius `distance` centred on the parent planet,
 * used as the moon's motion path.
 */
function moonOrbitPath(distance: number): string {
  const k = round(distance * BEZIER_CONSTANT);

  return (
    `M ${-distance} 0` +
    ` C ${-distance} ${-k}, ${-k} ${-distance}, 0 ${-distance}` +
    ` S ${distance} ${-k}, ${distance} 0` +
    ` S ${k} ${distance}, 0 ${distance}` +
    ` S ${-distance} ${k}, ${-distance} 0 Z`
  );
}

export interface MoonRenderResult {
  /** Animated moon markup, emitted inside the planet's animated group. */
  markup: string;
  /**
   * Id of the moon's visual group, carrying no animation. The planet's
   * reduced-motion twin references this so the clone stays genuinely static:
   * a `<use>` of an animated subtree keeps animating in the shadow tree.
   */
  bodyId: string;
  /** The moon's t=0 rest offset from its parent planet. */
  rest: { x: number; y: number };
}

/**
 * Render a moon orbiting its parent planet.
 *
 * The returned markup is emitted INSIDE the parent planet's animated group, so
 * the moon is carried along the planet's orbit while independently orbiting it
 * (GEN-008). `keyPoints="1;0"` reverses travel relative to the planet.
 */
export function renderMoon(options: MoonOptions): MoonRenderResult {
  const { moon, index, palette, ids, random } = options;
  const debug = options.debug ?? false;
  const { size, distance } = moon;
  const period = moon.period ?? DEFAULT_MOON_PERIOD;
  const tones = moonColors(palette, index);

  const orbitId = ids.next('moon-orbit');
  const clipId = ids.next('moon-clip');
  const bodyId = ids.next('moon-body-group');
  const offset = round(period * (random.next() * 100) / 100);

  // The moon orbit is a motion path, invisible in normal mode; debug exposes
  // it so the geometry can be inspected (GEN-015).
  const orbitStroke = debug
    ? `stroke="lightgrey" stroke-width="0.5"`
    : `stroke="none"`;

  const markup =
    `<path data-role="moon-orbit" id="${orbitId}" fill="none" ${orbitStroke}` +
    ` d="${moonOrbitPath(distance)}"/>` +
    `<g data-role="moon">` +
    `<g id="${bodyId}">` +
    `<clipPath id="${clipId}"><circle cx="0" cy="0" r="${size}"/></clipPath>` +
    `<circle data-role="moon-shadow" cx="0.4" cy="0.5" r="${round(size * 1.2)}"` +
    ` fill="${rgba('#000000', 0.3)}"/>` +
    `<g clip-path="url(#${clipId})">` +
    `<circle data-role="moon-body" cx="0" cy="0" r="${size}" fill="${tones.base}"/>` +
    `<circle data-role="moon-highlight" cx="${round(-size * 0.3)}" cy="${round(-size * 0.3)}"` +
    ` r="${round(size * 0.8)}" fill="${tones.light}" opacity="0.5"/>` +
    `<circle data-role="moon-terminator" cx="${round(size * 0.5)}" cy="${round(size * 0.35)}"` +
    ` r="${round(size * 1.1)}" fill="${tones.dark}" opacity="0.5"/>` +
    `</g>` +
    `</g>` +
    `<animateMotion keyPoints="1;0" keyTimes="0;1" dur="${period}s"` +
    ` begin="-${offset}s" repeatCount="indefinite">` +
    `<mpath xlink:href="#${orbitId}"/>` +
    `</animateMotion>` +
    `</g>`;

  // keyPoints="1;0" starts the moon at the END of its path, which for this
  // closed circle is the same point as the start: (-distance, 0).
  return { markup, bodyId, rest: { x: -distance, y: 0 } };
}
