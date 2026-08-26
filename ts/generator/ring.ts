import { renderPlanetBody, type PlanetBodyOptions } from './bodies';
import type { IdGenerator } from './ids';
import type { Palette } from './palette';
import { ringColors } from './palette';
import type { Prng } from './prng';

/** Flattest permitted ring, preserved from the baseline `Ring` clamp. */
export const MIN_RING_TILT = 0.12;
/** Most open permitted ring, preserved from the baseline `Ring` clamp. */
export const MAX_RING_TILT = 0.4;

/** Planets smaller than this never receive a ring (E-010). */
const MIN_RINGED_SIZE = 6;
/** Percentage chance that an eligible planet receives a ring (E-010). */
const RING_CHANCE = 45;

/** Rotation applied to both ring pieces so the ring reads as tilted. */
const RING_ROTATION = -18;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function randomInt(random: Prng, min: number, max: number): number {
  return min + Math.floor(random.next() * (max - min + 1));
}

export interface RingAssignment {
  hasRing: boolean;
  tilt: number;
}

/**
 * Decide ring presence and tilt for one planet.
 *
 * Both values are generator-owned and derived solely from the supplied seeded
 * generator, so they are never exposed as user controls (GEN-007, CTL-009).
 */
export function ringAssignment(random: Prng, size: number): RingAssignment {
  const eligible = size >= MIN_RINGED_SIZE;
  const hasRing = eligible && randomInt(random, 0, 100) < RING_CHANCE;
  const tilt = Math.max(
    MIN_RING_TILT,
    Math.min(MAX_RING_TILT, randomInt(random, 15, 32) / 100),
  );

  return { hasRing, tilt };
}

interface RingGeometry {
  rx: number;
  ry: number;
  bandWidth: number;
  gapWidth: number;
  innerWidth: number;
}

function geometry(r: number, tilt: number): RingGeometry {
  return {
    rx: round(r * 2.1),
    ry: round(r * 2.1 * tilt),
    bandWidth: round(r * 0.5),
    gapWidth: round(r * 0.18),
    innerWidth: round(r * 0.28),
  };
}

/** Full ring ellipse, painted before the planet body so the body occludes it. */
function renderRingBack(r: number, tilt: number, palette: Palette): string {
  const { rx, ry, bandWidth, gapWidth, innerWidth } = geometry(r, tilt);
  const colors = ringColors(palette);

  return (
    `<g data-role="ring-back" transform="rotate(${RING_ROTATION})">` +
    `<ellipse cx="0" cy="0" rx="${rx}" ry="${ry}" fill="none"` +
    ` stroke="${colors.bands[1]}" stroke-width="${bandWidth}" opacity="0.85"/>` +
    `<ellipse cx="0" cy="0" rx="${round(rx * 0.82)}" ry="${round(ry * 0.82)}" fill="none"` +
    ` stroke="${colors.gap}" stroke-width="${gapWidth}" opacity="0.6"/>` +
    `<ellipse cx="0" cy="0" rx="${round(rx * 0.66)}" ry="${round(ry * 0.66)}" fill="none"` +
    ` stroke="${colors.bands[0]}" stroke-width="${innerWidth}" opacity="0.9"/>` +
    `</g>`
  );
}

/**
 * Near half of the ring: the same ellipse clipped to the lower band and
 * painted after the planet body, so it covers the body (GEN-007).
 */
function renderRingFront(
  r: number,
  tilt: number,
  palette: Palette,
  ids: IdGenerator,
): string {
  const { rx, ry, bandWidth, gapWidth, innerWidth } = geometry(r, tilt);
  const colors = ringColors(palette);
  const clipId = ids.next('ring-clip');
  const extent = round(r * 4);

  const arc = (
    arcRx: number,
    arcRy: number,
    stroke: string,
    width: number,
    opacity: string,
  ): string =>
    `<path d="M ${-arcRx} 0 A ${arcRx} ${arcRy} 0 0 0 ${arcRx} 0" fill="none"` +
    ` stroke="${stroke}" stroke-width="${width}" opacity="${opacity}"/>`;

  return (
    `<g data-role="ring-front" transform="rotate(${RING_ROTATION})">` +
    `<clipPath id="${clipId}">` +
    `<rect x="${-extent}" y="0" width="${extent * 2}" height="${extent}"/>` +
    `</clipPath>` +
    `<g clip-path="url(#${clipId})">` +
    arc(rx, ry, colors.bands[1], bandWidth, '0.95') +
    arc(round(rx * 0.82), round(ry * 0.82), colors.gap, gapWidth, '0.6') +
    arc(round(rx * 0.66), round(ry * 0.66), colors.bands[0], innerWidth, '1') +
    `</g>` +
    `</g>`
  );
}

export interface RingedPlanetOptions extends PlanetBodyOptions {
  hasRing: boolean;
  tilt: number;
}

/**
 * Render a planet, straddled by its two ring pieces when it has a ring.
 *
 * Order is the whole point: back piece, then body, then front piece. SVG has
 * no z-index, so occlusion is purely a document-order property.
 */
export function renderPlanetWithRing(options: RingedPlanetOptions): string {
  const { hasRing, tilt, ...body } = options;

  if (!hasRing) {
    return renderPlanetBody(body);
  }

  return (
    renderRingBack(body.size, tilt, body.palette) +
    renderPlanetBody(body) +
    renderRingFront(body.size, tilt, body.palette, body.ids)
  );
}
