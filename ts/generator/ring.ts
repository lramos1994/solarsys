import { renderPlanetBody, type PlanetBodyOptions } from './bodies';
import type { IdGenerator } from './ids';
import type { Palette, RingColors } from './palette';
import { ringColors } from './palette';
import type { Prng } from './prng';

/** Flattest permitted ring, preserved from the baseline `Ring` clamp. */
export const MIN_RING_TILT = 0.12;
/** Most open permitted ring, preserved from the baseline `Ring` clamp. */
export const MAX_RING_TILT = 0.4;

/**
 * Ceiling on the ry/rx ratio produced from an authored inclination.
 *
 * `inclinationDegrees` maps to a tilt via `sin(degrees)`, which approaches 1
 * (a near-circular ellipse) as the authored angle nears 90 degrees. Past
 * roughly this ratio the front/back split and fixed `RING_ROTATION` stop
 * reading as a tilted ring and collapse into a disconnected halo around the
 * planet — this was reported as rings looking "misaligned" at high
 * inclination. Capping the ratio keeps the ellipse visibly elliptical (and
 * the rotation visibly meaningful) across the whole authored range.
 */
export const MAX_AUTHORED_RING_TILT = 0.58;

/** `sin(inclinationDegrees)`, capped so the ring never reads as a halo. */
function resolveAuthoredTilt(inclinationDegrees: number): number {
  return Math.min(
    MAX_AUTHORED_RING_TILT,
    Math.sin((inclinationDegrees * Math.PI) / 180),
  );
}

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
  /** Scale of the innermost material relative to `rx`/`ry` (see `geometry`). */
  innerScale: number;
  bandWidth: number;
  gapWidth: number;
  innerWidth: number;
}

/**
 * Radial position of the innermost ring material, as a multiple of the planet
 * radius. `renderPlanetBody` ends its atmosphere ring at ~1.26r, so this
 * clears the body while keeping the ring visually attached to it.
 */
const INNER_EDGE = 1.32;

/**
 * Upper bound on `innerScale`, so a minimum-size ring still has radial extent
 * to place its layers across instead of collapsing to a single line.
 */
const MAX_INNER_SCALE = 0.92;

function geometry(r: number, tilt: number, sizePercent = 210): RingGeometry {
  const outerRadius = r * sizePercent / 100;

  // The inner edge is pinned to the PLANET, not to a fixed fraction of the
  // ring's own outer radius. With a fixed fraction the gap scaled with
  // `sizePercent`: a 300% ring left its innermost band floating ~2r away from
  // the surface (the ring read as a detached halo), while a 140% ring buried
  // that band underneath the body where it never rendered at all.
  const innerScale = Math.min(MAX_INNER_SCALE, INNER_EDGE / (sizePercent / 100));

  return {
    rx: round(outerRadius),
    ry: round(outerRadius * tilt),
    innerScale,
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
  colorIndex: 0 | 1 | 2 | 3 | 'gap';
  width: number;
  opacity: string;
  /**
   * Particulate detail cue: the number of evenly spaced ticks around the
   * ellipse. See `tickPath` for why this replaced `stroke-dasharray`.
   */
  ticks?: number;
  /** Fraction of each angular slot the tick paints, in (0, 1). */
  duty?: number;
}

/**
 * Place a layer at `position` across the ring's radial extent, where 0 is the
 * inner edge (pinned to the planet) and 1 is the outer edge. This is what
 * keeps the band structure proportional as `sizePercent` changes, instead of
 * hard-coding scales that only looked right at the 210% default.
 */
function at(geo: RingGeometry, position: number): number {
  return round(geo.innerScale + (1 - geo.innerScale) * position);
}

/**
 * Build the particulate layer as discrete arc segments spaced evenly by ARC
 * LENGTH, with an integer tick count so the pattern closes exactly.
 *
 * Two earlier attempts each fixed one half of the problem and broke the other,
 * so both failure modes are recorded here:
 *
 *  - `stroke-dasharray` spaces by arc length (correct rhythm) but its period
 *    almost never divides the circumference evenly — the default Banded ring
 *    came out at ~28.34 periods, leaving a visible seam where the last dash
 *    met the first.
 *  - Stepping the ellipse parameter `t` uniformly closes exactly (the count is
 *    an integer) but is NOT uniform in arc length: near the ends of the major
 *    axis equal steps of `t` cover very little arc, so the ticks collapsed
 *    into a dense radial fan at the left and right extremes.
 *
 * This resolves both by inverting arc length numerically: walk the ellipse
 * once to build a cumulative arc-length table, then place `count` ticks at
 * equal arc-length intervals. Uniform rhythm AND an exact close.
 */
function tickPath(rx: number, ry: number, count: number, duty: number): string {
  // Cumulative arc length over a fine parameter sampling. The sample count is
  // fixed (not derived from rx/ry) so the geometry stays deterministic.
  const SAMPLES = 2048;
  const cumulative: number[] = [0];
  let previousX = rx;
  let previousY = 0;
  let total = 0;

  for (let sample = 1; sample <= SAMPLES; sample += 1) {
    const t = (sample / SAMPLES) * 2 * Math.PI;
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(t);

    total += Math.hypot(x - previousX, y - previousY);
    cumulative.push(total);
    previousX = x;
    previousY = y;
  }

  /** Parameter `t` at a given distance along the perimeter. */
  const parameterAt = (distance: number): number => {
    const target = ((distance % total) + total) % total;
    let low = 0;
    let high = SAMPLES;

    while (low < high) {
      const mid = (low + high) >> 1;

      if (cumulative[mid]! < target) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    return (low / SAMPLES) * 2 * Math.PI;
  };

  const step = total / count;
  // Each tick is drawn as a short STRAIGHT segment centred on its point and
  // aligned to the local tangent, not as an elliptical arc.
  //
  // An arc tick inherits the ellipse's curvature, and near the ends of the
  // major axis that curvature approaches a right angle over the tick's own
  // span — a thick stroke then renders it as a radial spoke pointing at the
  // centre, so the ends read as a wheel hub while the flanks read as a rhythm.
  // A straight tangent segment has the same visual footprint everywhere.
  const length = step * duty;
  let path = '';

  for (let tick = 0; tick < count; tick += 1) {
    const t = parameterAt(tick * step);
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(t);

    // Derivative of (rx cos t, ry sin t), normalised: the local tangent.
    const dx = -rx * Math.sin(t);
    const dy = ry * Math.cos(t);
    const magnitude = Math.hypot(dx, dy) || 1;
    const halfX = (dx / magnitude) * (length / 2);
    const halfY = (dy / magnitude) * (length / 2);

    path +=
      `M ${round(x - halfX)} ${round(y - halfY)}` +
      ` L ${round(x + halfX)} ${round(y + halfY)}`;
  }

  return path;
}

/**
 * Deterministic layer descriptors per ring type, shared by the back ellipses
 * and the front arcs so both pieces stay structurally matched (task 2.2).
 * Every type has >=3 layers and at least one particulate detail cue, with
 * no random draws: the tick count is a fixed integer so the ring closes.
 */
function layerDescriptors(type: RingType, geo: RingGeometry): RingLayer[] {
  const { bandWidth, gapWidth, innerWidth } = geo;

  if (type === 'Thin') {
    return [
      { scale: at(geo, 1), colorIndex: 0, width: round(bandWidth * 0.4), opacity: '0.9' },
      {
        scale: at(geo, 0.62),
        colorIndex: 1,
        width: round(bandWidth * 0.1),
        opacity: '0.7',
        ticks: 56,
        duty: 0.45,
      },
      { scale: at(geo, 0.22), colorIndex: 2, width: round(innerWidth * 0.55), opacity: '0.85' },
      { scale: at(geo, 0), colorIndex: 3, width: round(innerWidth * 0.3), opacity: '0.5' },
    ];
  }

  if (type === 'Wide') {
    return [
      { scale: at(geo, 1), colorIndex: 1, width: round(bandWidth * 0.42), opacity: '0.72' },
      { scale: at(geo, 0.76), colorIndex: 0, width: round(bandWidth * 0.3), opacity: '0.85' },
      {
        scale: at(geo, 0.56),
        colorIndex: 'gap',
        width: round(gapWidth * 0.25),
        opacity: '0.6',
        ticks: 72,
        duty: 0.45,
      },
      { scale: at(geo, 0.34), colorIndex: 2, width: round(innerWidth * 0.75), opacity: '0.8' },
      {
        scale: at(geo, 0.12),
        colorIndex: 3,
        width: round(innerWidth * 0.2),
        opacity: '0.65',
        ticks: 48,
        duty: 0.4,
      },
    ];
  }

  return [
    { scale: at(geo, 1), colorIndex: 1, width: round(bandWidth * 0.32), opacity: '0.78' },
    { scale: at(geo, 0.72), colorIndex: 0, width: round(bandWidth * 0.24), opacity: '0.88' },
    {
      scale: at(geo, 0.46),
      colorIndex: 'gap',
      width: round(gapWidth * 0.25),
      opacity: '0.6',
      ticks: 64,
      duty: 0.45,
    },
    { scale: at(geo, 0.2), colorIndex: 2, width: round(innerWidth * 0.6), opacity: '0.82' },
    { scale: at(geo, 0), colorIndex: 3, width: round(innerWidth * 0.35), opacity: '0.5' },
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
      const layerRx = round(rx * layer.scale);
      const layerRy = round(ry * layer.scale);
      const paint =
        ` stroke="${layerColor(colors, layer.colorIndex)}" stroke-width="${layer.width}"` +
        ` opacity="${layer.opacity}"`;

      if (layer.ticks !== undefined) {
        return (
          `<path data-role="ring-layer" data-ring-detail="ticks"` +
          ` d="${tickPath(layerRx, layerRy, layer.ticks, layer.duty ?? 0.5)}"` +
          ` fill="none"${paint}/>`
        );
      }

      return (
        `<ellipse data-role="ring-layer" cx="0" cy="0" rx="${layerRx}" ry="${layerRy}"` +
        ` fill="none"${paint}/>`
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
    const paint =
      ` stroke="${layerColor(colors, layer.colorIndex)}" stroke-width="${layer.width}"` +
      ` opacity="${layer.opacity}"`;

    // A tick layer emits the SAME full-ellipse tick geometry as the back
    // piece; the clip below keeps only the near half. Emitting a half-arc
    // subset here instead would re-introduce a seam at the clip boundary,
    // because the tick slots would no longer line up with the back piece.
    if (layer.ticks !== undefined) {
      return (
        `<path data-role="ring-layer" data-ring-detail="ticks"` +
        ` d="${tickPath(arcRx, arcRy, layer.ticks, layer.duty ?? 0.5)}"` +
        ` fill="none"${paint}/>`
      );
    }

    return (
      `<path data-role="ring-layer" d="M ${-arcRx} 0 A ${arcRx} ${arcRy} 0 0 0 ${arcRx} 0"` +
      ` fill="none"${paint}/>`
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

    const authoredTilt = resolveAuthoredTilt(ring.inclinationDegrees);

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
