import type { AsteroidBeltConfig } from '../generator/ambient';
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
}

/** Both endpoints are accepted and source every matching native widget. */
export const BOUNDS = {
  canvasWidth: { min: 100, max: 1_500 },
  canvasHeight: { min: 100, max: 1_500 },
  planetSize: { min: 1, max: 100 },
  orbitDistance: { min: 0, max: 1_200 },
  orbitLeft: { min: 0, max: 1_200 },
  orbitTop: { min: 0, max: 1_200 },
  orbitRight: { min: 0, max: 1_200 },
  orbitBottom: { min: 0, max: 1_200 },
  moonSize: { min: 1, max: 40 },
  moonDistance: { min: 0, max: 1_000 },
  moonPeriod: { min: 1, max: 120 },
  ringSize: { min: 140, max: 300 },
  ringInclination: { min: 5, max: 60 },
  asteroidCount: { min: 10, max: 500 },
  asteroidInnerRadius: { min: 10, max: 99 },
  asteroidOuterRadius: { min: 11, max: 100 },
  asteroidSize: { min: 1, max: 10 },
  asteroidPeriod: { min: 30, max: 600 },
  seed: { min: 0, max: 4_294_967_295 },
} as const satisfies Record<string, Bound>;

export type BoundedField = keyof typeof BOUNDS;

/** UI-only selector value: the generator chooses a palette from the seed. */
export const RANDOM_PALETTE = 'Random';

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
  count: string;
  innerRadiusPercent: string;
  outerRadiusPercent: string;
  size: string;
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
  planets: readonly RawPlanetInput[];
  asteroidBelt?: RawAsteroidBeltInput;
}

export type ValidationField =
  | BoundedField
  | 'palette'
  | 'distanceForm'
  | 'ringType'
  | 'asteroidRadiusRelation';

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
  asteroidInnerRadius: 'Asteroid inner radius',
  asteroidOuterRadius: 'Asteroid outer radius',
  asteroidSize: 'Asteroid size',
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
  const label = context === '' ? LABELS[field] : `${LABELS[field]} for ${context}`;
  const range = `${bound.min} to ${bound.max}`;
  const trimmed = raw.trim();

  if (trimmed === '') {
    errors.push({ field, message: `${label} is required. Enter a value from ${range}.` });
    return null;
  }

  if (!/^-?\d+$/.test(trimmed)) {
    errors.push({ field, message: `${label} must be a whole number from ${range}.` });
    return null;
  }

  const value = Number(trimmed);

  if (value < bound.min || value > bound.max) {
    errors.push({ field, message: `${label} must be from ${range}.` });
    return null;
  }

  return value;
}

function parseDistance(
  raw: string | RawOrbitInput,
  errors: ValidationError[],
  context: string,
): OrbitDistance | null {
  if (typeof raw !== 'string') {
    if (raw.mode === 'scalar') {
      return parseBounded(raw.value, 'orbitDistance', errors, context);
    }

    const values = [
      parseBounded(raw.left, 'orbitLeft', errors, context),
      parseBounded(raw.top, 'orbitTop', errors, context),
      parseBounded(raw.right, 'orbitRight', errors, context),
      parseBounded(raw.bottom, 'orbitBottom', errors, context),
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

  const values = parts.map((part) => parseBounded(part, 'orbitDistance', errors, context));

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
): MoonConfig | false | null {
  if (raw === false) {
    return false;
  }

  const size = parseBounded(raw.size, 'moonSize', errors, context);
  const distance = parseBounded(raw.distance, 'moonDistance', errors, context);
  const period = parseBounded(raw.period, 'moonPeriod', errors, context);

  return size === null || distance === null || period === null
    ? null
    : { size, distance, period };
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

function parseAsteroidBelt(
  raw: RawAsteroidBeltInput | undefined,
  errors: ValidationError[],
): AsteroidBeltConfig | false | undefined | null {
  if (raw === undefined || raw === false) {
    return raw;
  }

  const count = parseBounded(raw.count, 'asteroidCount', errors);
  const innerRadiusPercent = parseBounded(
    raw.innerRadiusPercent,
    'asteroidInnerRadius',
    errors,
  );
  const outerRadiusPercent = parseBounded(
    raw.outerRadiusPercent,
    'asteroidOuterRadius',
    errors,
  );
  const size = parseBounded(raw.size, 'asteroidSize', errors);
  const period = parseBounded(raw.period, 'asteroidPeriod', errors);
  const invalidRelation = innerRadiusPercent !== null &&
    outerRadiusPercent !== null &&
    innerRadiusPercent >= outerRadiusPercent;

  if (invalidRelation) {
    errors.push({
      field: 'asteroidRadiusRelation',
      message: 'Asteroid inner radius must be less than asteroid outer radius.',
    });
  }

  return count === null ||
    innerRadiusPercent === null ||
    outerRadiusPercent === null ||
    size === null ||
    period === null ||
    invalidRelation
    ? null
    : { count, innerRadiusPercent, outerRadiusPercent, size, period };
}

export function validateScene(input: RawSceneInput): ValidationResult {
  const errors: ValidationError[] = [];
  const width = parseBounded(input.canvasWidth, 'canvasWidth', errors);
  const height = parseBounded(input.canvasHeight, 'canvasHeight', errors);
  const seed = parseBounded(input.seed, 'seed', errors);
  const asteroidBelt = parseAsteroidBelt(input.asteroidBelt, errors);

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

  const planets: PlanetParams[] = [];

  input.planets.forEach((planet, index) => {
    const context = `planet ${index + 1}`;
    const errorStart = errors.length;
    const size = parseBounded(planet.size, 'planetSize', errors, context);
    const distance = parseDistance(planet.distance, errors, context);
    const moon = parseMoon(planet.moon, errors, context);
    const ring = parseRing(planet.ring, errors, context);

    for (let i = errorStart; i < errors.length; i += 1) {
      errors[i] = { ...errors[i]!, index };
    }

    if (size !== null && distance !== null && moon !== null && ring !== null) {
      const parsed: PlanetParams = { size, distance, moon };

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
    asteroidBelt === null
  ) {
    return { ok: false, errors };
  }

  const canvas: Canvas = { width, height };
  const params: SceneParams = { canvas, planets };

  if (palette !== undefined) {
    params.palette = palette;
  }

  if (asteroidBelt !== undefined) {
    params.asteroidBelt = asteroidBelt;
  }

  return { ok: true, params, seed };
}
