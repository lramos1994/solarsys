import { renderPlanetBody, type PlanetBodyOptions } from './bodies';
import type { IdGenerator } from './ids';
import type { Palette, RingColors } from './palette';
import { ringColors } from './palette';
import type { Prng } from './prng';

/** Flattest permitted ring, preserved from the baseline `Ring` clamp. */
export const MIN_RING_TILT = 0.12;
/** Most open permitted ring, preserved from the baseline `Ring` clamp. */
export const MAX_RING_TILT = 0.4;

export const RING_TYPES = ['Thin', 'Banded', 'Wide'] as const;
export type RingType = (typeof RING_TYPES)[number];

export interface RingConfig {
  type: RingType;
  sizePercent: number;
  inclinationDegrees: number;
}

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

function geometry(r: number, tilt: number, sizePercent = 210): RingGeometry {
  const outerRadius = r * sizePercent / 100;

  return {
    rx: round(outerRadius),
    ry: round(outerRadius * tilt),
    bandWidth: round(r * 0.5),
    gapWidth: round(r * 0.18),
    innerWidth: round(r * 0.28),
  };
}

/**
 * One concentric material layer shared by both the far ellipse and the near
 * arc. `scale` is applied to `rx`/`ry`; `dash` is present only on layers that
 * carry the radial/particulate detail cue (GEN-022) so the layer breaks a
 * uniform stroke instead of being a plain ellipse/arc.
 */
interface RingLayer {
  scale: number;
  colorIndex: 0 | 1 | 'gap';
  width: number;
  opacity: string;
  dash?: string;
}

/**
 * Deterministic layer descriptors per ring type, shared by the back ellipses
 * and the front arcs so both pieces stay structurally matched (task 2.2).
 * Every type has >=3 layers and at least one dashed radial/detail cue, with
 * no random draws: the dash pattern is derived purely from ring geometry.
 */
function layerDescriptors(
  type: RingType,
  { bandWidth, gapWidth, innerWidth }: RingGeometry,
): RingLayer[] {
  if (type === 'Thin') {
    return [
      { scale: 1, colorIndex: 1, width: round(bandWidth * 0.45), opacity: '0.9' },
      {
        scale: 0.9,
        colorIndex: 1,
        width: round(bandWidth * 0.2),
        opacity: '0.7',
        dash: `${round(bandWidth * 0.3)} ${round(bandWidth * 0.3)}`,
      },
      { scale: 0.78, colorIndex: 0, width: round(innerWidth * 0.5), opacity: '0.85' },
    ];
  }

  if (type === 'Wide') {
    return [
      { scale: 1, colorIndex: 1, width: round(bandWidth * 1.65), opacity: '0.82' },
      {
        scale: 0.85,
        colorIndex: 1,
        width: round(bandWidth * 0.35),
        opacity: '0.75',
        dash: `${round(bandWidth * 0.4)} ${round(gapWidth * 0.6)}`,
      },
      { scale: 0.7, colorIndex: 0, width: round(innerWidth * 1.8), opacity: '0.95' },
      {
        scale: 0.55,
        colorIndex: 0,
        width: round(innerWidth * 0.4),
        opacity: '0.6',
        dash: `${round(innerWidth * 0.3)} ${round(innerWidth * 0.5)}`,
      },
    ];
  }

  return [
    { scale: 1, colorIndex: 1, width: bandWidth, opacity: '0.85' },
    {
      scale: 0.82,
      colorIndex: 'gap',
      width: gapWidth,
      opacity: '0.6',
      dash: `${round(bandWidth * 0.35)} ${round(gapWidth * 0.5)}`,
    },
    { scale: 0.66, colorIndex: 0, width: innerWidth, opacity: '0.9' },
  ];
}

function layerColor(colors: RingColors, colorIndex: RingLayer['colorIndex']): string {
  return colorIndex === 'gap' ? colors.gap : colors.bands[colorIndex];
}

/** Full ring ellipse, painted before the planet body so the body occludes it. */
function renderRingBack(
  r: number,
  tilt: number,
  palette: Palette,
  type: RingType = 'Banded',
  sizePercent = 210,
): string {
  const geo = geometry(r, tilt, sizePercent);
  const { rx, ry } = geo;
  const colors = ringColors(palette);
  const layers = layerDescriptors(type, geo);

  const bands = layers
    .map((layer) => {
      const dash = layer.dash ? ` stroke-dasharray="${layer.dash}"` : '';

      return (
        `<ellipse cx="0" cy="0" rx="${round(rx * layer.scale)}" ry="${round(ry * layer.scale)}" fill="none"` +
        ` stroke="${layerColor(colors, layer.colorIndex)}" stroke-width="${layer.width}"` +
        ` opacity="${layer.opacity}"${dash}/>`
      );
    })
    .join('');

  return (
    `<g data-role="ring-back" transform="rotate(${RING_ROTATION})">` +
    bands +
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
  type: RingType = 'Banded',
  sizePercent = 210,
): string {
  const geo = geometry(r, tilt, sizePercent);
  const { rx, ry } = geo;
  const colors = ringColors(palette);
  const clipId = ids.next('ring-clip');
  const extent = round(r * 4);
  const layers = layerDescriptors(type, geo);

  const arc = (layer: RingLayer): string => {
    const arcRx = round(rx * layer.scale);
    const arcRy = round(ry * layer.scale);
    const dash = layer.dash ? ` stroke-dasharray="${layer.dash}"` : '';

    return (
      `<path d="M ${-arcRx} 0 A ${arcRx} ${arcRy} 0 0 0 ${arcRx} 0" fill="none"` +
      ` stroke="${layerColor(colors, layer.colorIndex)}" stroke-width="${layer.width}"` +
      ` opacity="${layer.opacity}"${dash}/>`
    );
  };

  const arcs = layers.map(arc).join('');

  return (
    `<g data-role="ring-front" transform="rotate(${RING_ROTATION})">` +
    `<clipPath id="${clipId}">` +
    `<rect x="${-extent}" y="0" width="${extent * 2}" height="${extent}"/>` +
    `</clipPath>` +
    `<g clip-path="url(#${clipId})">` +
    arcs +
    `</g>` +
    `</g>`
  );
}

export interface RingedPlanetOptions extends PlanetBodyOptions {
  hasRing?: boolean;
  tilt?: number;
  ring?: RingConfig | false;
}

/**
 * Render a planet, straddled by its two ring pieces when it has a ring.
 *
 * Order is the whole point: back piece, then body, then front piece. SVG has
 * no z-index, so occlusion is purely a document-order property.
 */
export function renderPlanetWithRing(options: RingedPlanetOptions): string {
  const { hasRing, tilt, ring, ...body } = options;

  if (ring !== undefined) {
    if (ring === false) {
      return renderPlanetBody(body);
    }

    const authoredTilt = Math.sin(ring.inclinationDegrees * Math.PI / 180);

    return (
      renderRingBack(body.size, authoredTilt, body.palette, ring.type, ring.sizePercent) +
      renderPlanetBody(body) +
      renderRingFront(
        body.size,
        authoredTilt,
        body.palette,
        body.ids,
        ring.type,
        ring.sizePercent,
      )
    );
  }

  if (!hasRing) {
    return renderPlanetBody(body);
  }

  return (
    renderRingBack(body.size, tilt ?? MIN_RING_TILT, body.palette) +
    renderPlanetBody(body) +
    renderRingFront(body.size, tilt ?? MIN_RING_TILT, body.palette, body.ids)
  );
}
