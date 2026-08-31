import type { AsteroidBeltConfig } from '../generator/ambient';
import { SUN_TYPES, type SunType } from '../generator/bodies';
import type { MoonConfig } from '../generator/moon';
import type { Canvas, OrbitDistance } from '../generator/orbit';
import { PALETTE_NAMES, type PaletteName } from '../generator/palette';
import { RING_TYPES, type RingConfig, type RingType } from '../generator/ring';
import type { PlanetParams, SceneParams } from '../generator/scene';

/**
 * Validation at the UI boundary (CTL-007, CTL-008, D-21).
 *
 * The generator assumes valid input and never re-checks defensively, so this
 * is the single place responsible for rejecting bad values and for the
 * user-facing message that explains why. Nothing here clamps silently or
 * substitutes a default.
 */

export interface Bound {
  min: number;
  max: number;
  /**
   * Smallest accepted increment above `min` (CTL-015). A value inside the range
   * but off this increment is rejected, and every native widget sources its
   * `step` attribute from here. Defaults to 1 where omitted.
   */
  step?: number;
}

/** Both endpoints are accepted and source every matching native widget. */
export const BOUNDS = {
  canvasWidth: { min: 100, max: 1_500 },
  canvasHeight: { min: 100, max: 1_500 },
  planetSize: { min: 1, max: 25, step: 0.5 },
  orbitDistance: { min: 0, max: 120 },
  orbitLeft: { min: 0, max: 120 },
  orbitTop: { min: 0, max: 120 },
  orbitRight: { min: 0, max: 120 },
  orbitBottom: { min: 0, max: 120 },
  moonSize: { min: 10, max: 60 },
  moonDistance: { min: 120, max: 600, step: 5 },
  moonPeriod: { min: 1, max: 120 },
  ringSize: { min: 140, max: 300 },
  ringInclination: { min: 5, max: 60 },
  asteroidCount: { min: 10, max: 500 },
  // Proportional belt geometry (CTL-017, CTL-018): percentages of the drawable
  // half-extent, the same reference orbital distance and planet size use. The
  // centre/thickness pair is bounded so that the minimum centre with the
  // maximum thickness yields an inner edge of exactly 0, which is why no
  // cross-field ordering relation is enforced.
  asteroidSize: { min: 0.2, max: 3, step: 0.1 },
  asteroidCentre: { min: 20, max: 110 },
  asteroidThickness: { min: 1, max: 40 },
  asteroidPeriod: { min: 30, max: 600 },
  seed: { min: 0, max: 4_294_967_295 },
} as const satisfies Record<string, Bound>;

export type BoundedField = keyof typeof BOUNDS;

/** A parameter's accepted increment, defaulting to whole numbers. */
export function stepOf(field: BoundedField): number {
  return (BOUNDS[field] as Bound).step ?? 1;
}

/** UI-only selector value: the generator chooses a palette from the seed. */
export const RANDOM_PALETTE = 'Random';

/** UI-only selector value: the generator keeps the baseline Yellow Dwarf sun. */
export const DEFAULT_SUN_SELECTION = SUN_TYPES[0];

/**
 * Authored asteroid-belt type value set (CTL-012). `rocky` is the documented
 * default, applied when the field is omitted.
 */
export const BELT_TYPES = ['rocky', 'icy', 'metallic'] as const;
export type BeltType = (typeof BELT_TYPES)[number];
export const DEFAULT_BELT_TYPE: BeltType = 'rocky';

export interface RawMoonInput {
  size: string;
  distance: string;
  period: string;
}

export type RawOrbitInput =
  | { mode: 'scalar'; value: string }
  | { mode: 'custom'; left: string; top: string; right: string; bottom: string };

export interface RawRingConfig {
  type: string;
  sizePercent: string;
  inclinationDegrees: string;
}

export type RawRingInput = RawRingConfig | false;

export interface RawAsteroidBeltConfig {
  /** Authored belt character; omitted yields the documented default. */
  type?: string;
  count: string;
  /** Base rock radius as a percentage of the drawable half-extent. */
  sizePercent: string;
  /** Band centre radius as a percentage of the drawable half-extent. */
  centrePercent: string;
  /** Band thickness as a percentage of the drawable half-extent. */
  thicknessPercent: string;
  period: string;
}

export type RawAsteroidBeltInput = RawAsteroidBeltConfig | false;

export interface RawPlanetInput {
  size: string;
  /** Transitional string compatibility plus the mounted scalar/custom model. */
  distance: string | RawOrbitInput;
  moon: RawMoonInput | false;
  ring?: RawRingInput;
}

export interface RawSceneInput {
  canvasWidth: string;
  canvasHeight: string;
  seed: string;
  palette: string;
  sunType?: string;
  planets: readonly RawPlanetInput[];
  asteroidBelt?: RawAsteroidBeltInput;
}

export type ValidationField =
  | BoundedField
  | 'palette'
  | 'sunType'
  | 'distanceForm'
  | 'ringType'
  | 'beltType';

export interface ValidationError {
  field: ValidationField;
  message: string;
  /** Zero-based planet index for errors owned by one planet instrument. */
  index?: number;
}

export type ValidationResult =
  | { ok: true; params: SceneParams; seed: number }
  | { ok: false; errors: ValidationError[] };

const LABELS: Record<BoundedField, string> = {
  canvasWidth: 'Canvas width',
  canvasHeight: 'Canvas height',
  planetSize: 'Planet size',
  orbitDistance: 'Orbital distance',
  orbitLeft: 'Left orbital distance',
  orbitTop: 'Top orbital distance',
  orbitRight: 'Right orbital distance',
  orbitBottom: 'Bottom orbital distance',
  moonSize: 'Moon size',
  moonDistance: 'Moon distance',
  moonPeriod: 'Moon period',
  ringSize: 'Ring size',
  ringInclination: 'Ring inclination',
  asteroidCount: 'Asteroid count',
  asteroidSize: 'Asteroid size',
  asteroidCentre: 'Belt centre radius',
  asteroidThickness: 'Belt thickness',
  asteroidPeriod: 'Asteroid rotation period',
  seed: 'Seed',
};

function parseBounded(
  raw: string,
  field: BoundedField,
  errors: ValidationError[],
  context = '',
): number | null {
  const bound = BOUNDS[field];
  const step = stepOf(field);
  const label = context === '' ? LABELS[field] : `${LABELS[field]} for ${context}`;
  const range = `${bound.min} to ${bound.max}`;

  // Validation is the boundary: a caller passing a shape that predates a
  // parameter rename must be REJECTED, never allowed to throw. Reading `.trim()`
  // off an absent field crashed the whole submission instead of reporting it.
  if (typeof raw !== 'string') {
    errors.push({ field, message: `${label} is required. Enter a value from ${range}.` });
    return null;
  }

  const trimmed = raw.trim();

  if (trimmed === '') {
    errors.push({ field, message: `${label} is required. Enter a value from ${range}.` });
    return null;
  }

  // A fractional step admits one decimal place; a whole step keeps the
  // integer-only grammar the absolute model used.
  const grammar = step < 1 ? /^-?\d+(\.\d)?$/ : /^-?\d+$/;

  if (!grammar.test(trimmed)) {
    const kind = step < 1
      ? `a number with at most one decimal place`
      : `a whole number`;

    errors.push({ field, message: `${label} must be ${kind} from ${range}.` });
    return null;
  }

  const value = Number(trimmed);

  if (value < bound.min || value > bound.max) {
    errors.push({ field, message: `${label} must be from ${range}.` });
    return null;
  }

  // Compare in integer tenths: 4.25 % 0.5 is not 0 in binary floating point,
  // but neither is 4.5 % 0.5 reliably.
  const tenths = Math.round(value * 10) - Math.round(bound.min * 10);

  if (tenths % Math.round(step * 10) !== 0) {
    errors.push({
      field,
      message: `${label} must be from ${range} in steps of ${step}.`,
    });
    return null;
  }

  return value;
}

/**
 * The drawable half-extent: the distance from the canvas centre to the nearest
 * edge (CTL-014). It is the reference length for orbital distance and planet
 * size, so the same authored percentage frames the same composition at every
 * canvas size.
 */
export function halfExtent(canvas: Canvas): number {
  return Math.min(canvas.width, canvas.height) / 2;
}

/**
 * Resolve an authored percentage against a reference length.
 *
 * Deliberately NOT rounded: the generator accepts fractional coordinates, and
 * rounding would place the smallest permitted moon distance on the surface of
 * the smallest permitted planet instead of outside it (CTL-015).
 */
export function resolvePercent(percent: number, reference: number): number {
  return percent * reference / 100;
}

function parseDistance(
  raw: string | RawOrbitInput,
  errors: ValidationError[],
  context: string,
  reference: number,
): OrbitDistance | null {
  const resolve = (value: number | null): number | null =>
    value === null ? null : resolvePercent(value, reference);

  if (typeof raw !== 'string') {
    if (raw.mode === 'scalar') {
      return resolve(parseBounded(raw.value, 'orbitDistance', errors, context));
    }

    const values = [
      resolve(parseBounded(raw.left, 'orbitLeft', errors, context)),
      resolve(parseBounded(raw.top, 'orbitTop', errors, context)),
      resolve(parseBounded(raw.right, 'orbitRight', errors, context)),
      resolve(parseBounded(raw.bottom, 'orbitBottom', errors, context)),
    ];

    if (values.some((value) => value === null)) {
      return null;
    }

    return values as [number, number, number, number];
  }

  const parts = raw.split(',').map((part) => part.trim());

  if (parts.length !== 1 && parts.length !== 4) {
    errors.push({
      field: 'distanceForm',
      message: `Orbital distance for ${context} must be one value, or four values separated by commas.`,
    });
    return null;
  }

  const values = parts.map((part) =>
    resolve(parseBounded(part, 'orbitDistance', errors, context)),
  );

  if (values.some((value) => value === null)) {
    return null;
  }

  const parsed = values as number[];
  return parsed.length === 1
    ? parsed[0]!
    : [parsed[0]!, parsed[1]!, parsed[2]!, parsed[3]!] as const;
}

function parseMoon(
  raw: RawMoonInput | false,
  errors: ValidationError[],
  context: string,
  planetRadius: number | null,
): MoonConfig | false | null {
  if (raw === false) {
    return false;
  }

  const size = parseBounded(raw.size, 'moonSize', errors, context);
  const distance = parseBounded(raw.distance, 'moonDistance', errors, context);
  const period = parseBounded(raw.period, 'moonPeriod', errors, context);

  // A moon is measured against the planet it orbits (CTL-014), so it cannot be
  // resolved when the parent size was itself rejected.
  if (size === null || distance === null || period === null || planetRadius === null) {
    return null;
  }

  return {
    size: resolvePercent(size, planetRadius),
    distance: resolvePercent(distance, planetRadius),
    period,
  };
}

function parseRing(
  raw: RawRingInput | undefined,
  errors: ValidationError[],
  context: string,
): RingConfig | false | undefined | null {
  if (raw === undefined || raw === false) {
    return raw;
  }

  const type = RING_TYPES.includes(raw.type as RingType) ? raw.type as RingType : null;

  if (type === null) {
    errors.push({
      field: 'ringType',
      message: `Ring type for ${context} must be ${RING_TYPES.join(', ')}.`,
    });
  }

  const sizePercent = parseBounded(raw.sizePercent, 'ringSize', errors, context);
  const inclinationDegrees = parseBounded(
    raw.inclinationDegrees,
    'ringInclination',
    errors,
    context,
  );

  return type === null || sizePercent === null || inclinationDegrees === null
    ? null
    : { type, sizePercent, inclinationDegrees };
}

/**
 * The drawable half-extent the belt's authored size and density are stated
 * against: the default 600x600 canvas. At this reference the authored values
 * render verbatim (CTL-019).
 */
const BELT_REFERENCE_HALF_EXTENT = 300;

/**
 * Damping exponent applied to belt rock size across canvas sizes.
 *
 * `1` would make a rock a fixed share of the scene, which is geometrically
 * consistent but reads wrong: a larger canvas is a WIDER VIEW of the system, so
 * it should show more asteroids, not bigger ones. At the maximum canvas a fully
 * proportional rock renders at 10.4px against 4.2px on the default canvas.
 * `0` is the retired absolute model, whose presence collapsed 6x (AB-D1).
 *
 * `0.5` is the same sublinear shape the ambient starfield already uses above
 * its damping knee: the rock grows to 6.6px while the count carries the rest of
 * the density.
 */
const BELT_SIZE_DAMPING = 0.5;

/**
 * Ceiling on rendered rocks.
 *
 * Rendered element count drives animation cadence, exactly as it does for the
 * ambient starfield. MEASURED in Chromium at 1500x1500 via
 * `e2e/browser/belt-cap-measure.spec.ts` against the 50fps budget:
 *
 * |    rocks | nodes   |  fps |
 * |---------:|--------:|-----:|
 * |      325 |   7,508 | 60.9 |
 * |    1,250 |   8,429 | 60.7 |
 * |    2,600 |   9,795 | 61.0 |  <- this cap
 * |    5,200 |  12,395 | 56.7 |
 * |   20,800 |  27,995 | 35.6 |  <- below budget
 * |  124,800 | 131,995 |  0.5 |
 *
 * The cap sits about a factor of two below the measured degradation point, so
 * the worst configuration the product can author still renders at ~61fps. It
 * MUST NOT be raised without repeating that sweep; node-count reasoning alone
 * is not evidence.
 */
export const BELT_RENDER_CAP = 2_600;

/**
 * Resolve the authored base rock radius, damped by `BELT_SIZE_DAMPING`.
 *
 * At the damping exponent `k` this is the weighted geometric mean of the
 * reference half-extent and the actual one, so `k = 0` yields the absolute
 * model and `k = 1` the fully proportional one.
 */
function resolveBeltRockRadius(sizePercent: number, reference: number): number {
  const damped =
    Math.pow(BELT_REFERENCE_HALF_EXTENT, 1 - BELT_SIZE_DAMPING) *
    Math.pow(reference, BELT_SIZE_DAMPING);

  return resolvePercent(sizePercent, damped);
}

/**
 * Resolve the authored count into the number of rocks actually rendered.
 *
 * The authored count expresses a density, not a literal element count, and it
 * carries whatever presence the damped rock size does not. Two terms:
 *
 * - Canvas. Coverage goes as `count * rockRadius^2 / halfExtent^2`, and the
 *   damped radius grows as `halfExtent^k`, so holding coverage fixed needs
 *   `count ∝ halfExtent^(2 - 2k)`. The exponent is DERIVED from the damping
 *   constant rather than written out, so the two cannot drift apart and
 *   silently break coverage.
 * - Band. The annulus area `(c + t/2)^2 - (c - t/2)^2` reduces exactly to
 *   `2ct`, so widening or moving the band scales the count by `c * t` against
 *   the shipped default band. Without this, a wide band thins out at a fixed
 *   count.
 */
function resolveBeltCount(
  count: number,
  centrePercent: number,
  thicknessPercent: number,
  reference: number,
): number {
  const canvasFactor = Math.pow(
    reference / BELT_REFERENCE_HALF_EXTENT,
    2 - 2 * BELT_SIZE_DAMPING,
  );
  const bandFactor =
    (centrePercent * thicknessPercent) /
    (BELT_DEFAULT_CENTRE_PERCENT * BELT_DEFAULT_THICKNESS_PERCENT);

  return Math.min(
    BELT_RENDER_CAP,
    Math.max(1, Math.round(count * canvasFactor * bandFactor)),
  );
}

/** The shipped default band, which the authored count is a density against. */
const BELT_DEFAULT_CENTRE_PERCENT = 84;
const BELT_DEFAULT_THICKNESS_PERCENT = 6;

/**
 * Belt geometry is proportional (CTL-017): size, centre, and thickness are
 * percentages of the drawable half-extent, resolved here so the generator keeps
 * receiving absolute units. The centre/thickness pair replaces the retired
 * inner/outer radii, and the CTL-018 bounds guarantee a well-formed band, so no
 * cross-field ordering relation is checked.
 */
function parseAsteroidBelt(
  raw: RawAsteroidBeltInput | undefined,
  errors: ValidationError[],
  reference: number | null,
): (AsteroidBeltConfig & { type: BeltType }) | false | undefined | null {
  if (raw === undefined || raw === false) {
    return raw;
  }

  const rawType = raw.type === undefined ? DEFAULT_BELT_TYPE : raw.type;
  const type = BELT_TYPES.includes(rawType as BeltType) ? rawType as BeltType : null;

  if (type === null) {
    errors.push({
      field: 'beltType',
      message: `Belt type must be ${BELT_TYPES.join(', ')}.`,
    });
  }

  const count = parseBounded(raw.count, 'asteroidCount', errors);
  const sizePercent = parseBounded(raw.sizePercent, 'asteroidSize', errors);
  const centrePercent = parseBounded(raw.centrePercent, 'asteroidCentre', errors);
  const thicknessPercent = parseBounded(
    raw.thicknessPercent,
    'asteroidThickness',
    errors,
  );
  const period = parseBounded(raw.period, 'asteroidPeriod', errors);

  if (
    count === null ||
    sizePercent === null ||
    centrePercent === null ||
    thicknessPercent === null ||
    period === null ||
    type === null ||
    reference === null
  ) {
    return null;
  }

  // Resolution is deliberately NOT rounded, consistent with CTL-015.
  const centreRadius = resolvePercent(centrePercent, reference);
  const halfThickness = resolvePercent(thicknessPercent, reference) / 2;

  return {
    type,
    count: resolveBeltCount(count, centrePercent, thicknessPercent, reference),
    baseRadius: resolveBeltRockRadius(sizePercent, reference),
    innerRadius: centreRadius - halfThickness,
    outerRadius: centreRadius + halfThickness,
    period,
  };
}

export function validateScene(input: RawSceneInput): ValidationResult {
  const errors: ValidationError[] = [];
  const width = parseBounded(input.canvasWidth, 'canvasWidth', errors);
  const height = parseBounded(input.canvasHeight, 'canvasHeight', errors);
  const seed = parseBounded(input.seed, 'seed', errors);

  const palette = input.palette === RANDOM_PALETTE
    ? undefined
    : PALETTE_NAMES.includes(input.palette as PaletteName)
      ? input.palette as PaletteName
      : null;

  if (palette === null) {
    errors.push({
      field: 'palette',
      message: `Palette must be ${RANDOM_PALETTE}, or one of ${PALETTE_NAMES.join(', ')}.`,
    });
  }

  const rawSunType = input.sunType === undefined ? DEFAULT_SUN_SELECTION : input.sunType;
  const sunType = SUN_TYPES.includes(rawSunType as SunType) ? rawSunType as SunType : null;

  if (sunType === null) {
    errors.push({
      field: 'sunType',
      message: `Sun type must be one of ${SUN_TYPES.join(', ')}.`,
    });
  }

  const planets: PlanetParams[] = [];

  // Authored percentages resolve against the canvas that was just validated
  // (CTL-014). An invalid canvas short-circuits before any dependent
  // resolution, so a rejected width never produces a bogus geometry.
  const reference = width === null || height === null
    ? null
    : halfExtent({ width, height });

  // The belt is proportional too (CTL-017), so it resolves against the same
  // reference and only after the canvas has been validated.
  const asteroidBelt = parseAsteroidBelt(input.asteroidBelt, errors, reference);

  input.planets.forEach((planet, index) => {
    const context = `planet ${index + 1}`;
    const errorStart = errors.length;
    const size = parseBounded(planet.size, 'planetSize', errors, context);
    const planetRadius = size === null || reference === null
      ? null
      : resolvePercent(size, reference);
    const distance = reference === null
      ? null
      : parseDistance(planet.distance, errors, context, reference);
    const moon = parseMoon(planet.moon, errors, context, planetRadius);
    const ring = parseRing(planet.ring, errors, context);

    for (let i = errorStart; i < errors.length; i += 1) {
      errors[i] = { ...errors[i]!, index };
    }

    if (planetRadius !== null && distance !== null && moon !== null && ring !== null) {
      const parsed: PlanetParams = { size: planetRadius, distance, moon };

      if (ring !== undefined) {
        parsed.ring = ring;
      }

      planets.push(parsed);
    }
  });

  if (
    errors.length > 0 ||
    width === null ||
    height === null ||
    seed === null ||
    palette === null ||
    sunType === null ||
    asteroidBelt === null
  ) {
    return { ok: false, errors };
  }

  const canvas: Canvas = { width, height };
  const params: SceneParams = { canvas, planets, sunType };

  if (palette !== undefined) {
    params.palette = palette;
  }

  if (asteroidBelt !== undefined) {
    params.asteroidBelt = asteroidBelt;
  }

  return { ok: true, params, seed };
}
