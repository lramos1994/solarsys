import type { MoonConfig } from '../generator/moon';
import type { Canvas, OrbitDistance } from '../generator/orbit';
import { PALETTE_NAMES, type PaletteName } from '../generator/palette';
import type { PlanetParams, SceneParams } from '../generator/scene';

/**
 * Validation at the UI boundary (CTL-007, CTL-008, D-21).
 *
 * The generator assumes valid input and never re-checks defensively, so this
 * is the single place responsible for rejecting bad values and for the
 * user-facing message that explains why. Nothing here clamps silently or
 * substitutes a default: the baseline's `ValueError`/`TypeError` leakage and
 * warning-then-render degradation (E-026..E-033) are replaced by explicit
 * rejection.
 */

export interface Bound {
  min: number;
  max: number;
}

/** Concrete bounds fixed in task 1.7. Both endpoints are accepted. */
export const BOUNDS = {
  canvasWidth: { min: 100, max: 2_000 },
  canvasHeight: { min: 100, max: 2_000 },
  planetSize: { min: 1, max: 250 },
  orbitDistance: { min: 0, max: 5_000 },
  moonSize: { min: 1, max: 100 },
  moonDistance: { min: 0, max: 1_000 },
  moonPeriod: { min: 1, max: 120 },
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

export interface RawPlanetInput {
  size: string;
  /** A single value, or four comma-separated values. */
  distance: string;
  moon: RawMoonInput | false;
}

export interface RawSceneInput {
  canvasWidth: string;
  canvasHeight: string;
  seed: string;
  palette: string;
  planets: readonly RawPlanetInput[];
}

export interface ValidationError {
  field: BoundedField | 'palette' | 'distanceForm';
  message: string;
}

export type ValidationResult =
  | { ok: true; params: SceneParams; seed: number }
  | { ok: false; errors: ValidationError[] };

/** Human-readable label for each control, used in rejection messages. */
const LABELS: Record<BoundedField, string> = {
  canvasWidth: 'Canvas width',
  canvasHeight: 'Canvas height',
  planetSize: 'Planet size',
  orbitDistance: 'Orbital distance',
  moonSize: 'Moon size',
  moonDistance: 'Moon distance',
  moonPeriod: 'Moon period',
  seed: 'Seed',
};

/**
 * Parse one bounded integer.
 *
 * Rejects blank, non-numeric, non-finite and fractional input as well as
 * out-of-range values, and always names the control and its accepted range.
 */
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

  // `Number` accepts 'Infinity' and leading '+', so check the shape first.
  if (!/^-?\d+$/.test(trimmed)) {
    errors.push({
      field,
      message: `${label} must be a whole number from ${range}.`,
    });

    return null;
  }

  const value = Number(trimmed);

  if (value < bound.min || value > bound.max) {
    errors.push({
      field,
      message: `${label} must be from ${range}.`,
    });

    return null;
  }

  return value;
}

/** Parse a scalar or four-value orbital distance. */
function parseDistance(
  raw: string,
  errors: ValidationError[],
  context: string,
): OrbitDistance | null {
  const parts = raw.split(',').map((part) => part.trim());

  if (parts.length !== 1 && parts.length !== 4) {
    errors.push({
      field: 'distanceForm',
      message:
        `Orbital distance for ${context} must be one value, ` +
        `or four values separated by commas.`,
    });

    return null;
  }

  const values = parts.map((part) =>
    parseBounded(part, 'orbitDistance', errors, context),
  );

  if (values.some((value) => value === null)) {
    return null;
  }

  const parsed = values as number[];

  return parsed.length === 1
    ? parsed[0]!
    : ([parsed[0]!, parsed[1]!, parsed[2]!, parsed[3]!] as const);
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

  if (size === null || distance === null || period === null) {
    return null;
  }

  return { size, distance, period };
}

/**
 * Validate raw control input, returning generator-ready parameters or the
 * complete list of rejections.
 *
 * Every invalid field is reported, not just the first, so the user can correct
 * a form in one pass rather than one error at a time.
 */
export function validateScene(input: RawSceneInput): ValidationResult {
  const errors: ValidationError[] = [];

  const width = parseBounded(input.canvasWidth, 'canvasWidth', errors);
  const height = parseBounded(input.canvasHeight, 'canvasHeight', errors);
  const seed = parseBounded(input.seed, 'seed', errors);

  const palette =
    input.palette === RANDOM_PALETTE
      ? undefined
      : PALETTE_NAMES.includes(input.palette as PaletteName)
        ? (input.palette as PaletteName)
        : null;

  if (palette === null) {
    errors.push({
      field: 'palette',
      message: `Palette must be ${RANDOM_PALETTE}, or one of ${PALETTE_NAMES.join(', ')}.`,
    });
  }

  const planets: PlanetParams[] = [];

  input.planets.forEach((planet, index) => {
    // Planets are numbered from 1 in messages, matching what the user sees.
    const context = `planet ${index + 1}`;
    const size = parseBounded(planet.size, 'planetSize', errors, context);
    const distance = parseDistance(planet.distance, errors, context);
    const moon = parseMoon(planet.moon, errors, context);

    if (size !== null && distance !== null && moon !== null) {
      planets.push({ size, distance, moon });
    }
  });

  if (errors.length > 0 || width === null || height === null || seed === null || palette === null) {
    return { ok: false, errors };
  }

  const canvas: Canvas = { width, height };
  const params: SceneParams = { canvas, planets };

  if (palette !== undefined) {
    params.palette = palette;
  }

  return { ok: true, params, seed };
}
