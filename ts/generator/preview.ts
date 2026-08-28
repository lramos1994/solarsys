import { createIdGenerator, type IdGenerator } from './ids';
import { escapeText } from './metadata';
import { renderMoon } from './moon';
import {
  PALETTE_NAMES,
  paletteByName,
  type Palette,
} from './palette';
import { createPrng, type Prng } from './prng';
import { renderPlanetWithRing, ringAssignment } from './ring';
import type { PlanetParams, SceneParams } from './scene';

/**
 * Isolated single-planet preview (GEN-020).
 *
 * This is a SEPARATE artefact, not a crop of the scene and not a second
 * serialization of it. It composes the existing planet/ring/moon renderers
 * into a standalone SVG with no starfield, sun, comets, sibling planets or
 * orbit path.
 *
 * The critical property is isolation: the entry allocates its OWN PRNG and id
 * generator, so calling it can never consume or perturb the main scene's
 * stream. That is what keeps the contractual generation order (D-20) intact by
 * construction, and it is asserted directly — a full scene generated after any
 * number of preview calls must be byte-identical to one generated before them.
 *
 * Like every generator entry it is pure and DOM-free: no clock, no ambient
 * entropy, no module-level mutable state.
 */

/** Default ring extent used by the legacy seed-assigned ring path. */
const DEFAULT_RING_SIZE_PERCENT = 210;

/** Proportion of the content extent left as breathing room around the body. */
const PREVIEW_PADDING = 1.15;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function randomInt(random: Prng, min: number, max: number): number {
  return min + Math.floor(random.next() * (max - min + 1));
}

/**
 * Derive the preview's own seed from the scene seed and the planet index, so
 * two previews of the same scene do not replay one another's stream.
 */
function previewSeed(seed: number, index: number): number {
  return (Math.imul(seed ^ 0x9e37_79b9, index + 1) ^ 0x85eb_ca6b) >>> 0;
}

/**
 * Namespace every identifier the preview mints.
 *
 * Seed derivation alone would leave collision-freedom to luck: the counters
 * are shared shapes and only the `kind` prefixes happen to differ. Prefixing
 * makes it structural, so a preview injected beside a scene can never capture
 * one of the scene's `url(#id)` references.
 */
function namespacedIds(seed: number): IdGenerator {
  const base = createIdGenerator(seed);

  return { next: (kind: string): string => base.next(`${PREVIEW_ID_PREFIX}${kind}`) };
}

/** Prefix applied to every preview-minted identifier. */
export const PREVIEW_ID_PREFIX = 'preview-';

/**
 * Resolve the palette exactly as the scene does, without touching the scene's
 * generator: an explicit name wins, otherwise a throwaway PRNG replays the
 * scene's first draw so the preview shows the same palette the user sees.
 */
function previewPalette(params: SceneParams, seed: number): Palette {
  if (params.palette !== undefined) {
    return paletteByName(params.palette);
  }

  return paletteByName(
    PALETTE_NAMES[randomInt(createPrng(seed), 0, PALETTE_NAMES.length - 1)]!,
  );
}

/** Half-extent the planet body and its ring occupy around the origin. */
function bodyExtent(planet: PlanetParams): number {
  const r = planet.size;
  // The drop shadow is the widest body element: offset (0.18r, 0.28r), r*1.5.
  const shadow = r * 1.5 + r * 0.28;
  const atmosphere = r * 1.18 + r * 0.08;
  const ringPercent =
    planet.ring === false
      ? 0
      : planet.ring === undefined
        ? DEFAULT_RING_SIZE_PERCENT
        : planet.ring.sizePercent;

  return Math.max(shadow, atmosphere, (r * ringPercent) / 100);
}

/** Half-extent the moon's orbit occupies around the origin, zero when absent. */
function moonExtent(planet: PlanetParams): number {
  return planet.moon === false ? 0 : planet.moon.distance + planet.moon.size * 1.2;
}

/**
 * Render an isolated preview of one planet, with its ring and its moon.
 *
 * `index` is the planet's position in `params.planets`; it also selects the
 * planet's hue, so the preview matches the body in the scene.
 */
export function generatePlanetPreview(
  params: SceneParams,
  seed: number,
  index: number,
): string {
  const planet = params.planets[index];

  if (planet === undefined) {
    throw new RangeError(
      `planet index ${index} is outside the scene's ${params.planets.length} planets`,
    );
  }

  const previewOwnSeed = previewSeed(seed, index);
  const random = createPrng(previewOwnSeed);
  const ids = namespacedIds(previewOwnSeed);
  const palette = previewPalette(params, seed);

  const bodyOptions = {
    size: planet.size,
    index,
    palette,
    ids,
    random,
  };
  const body =
    planet.ring === undefined
      ? renderPlanetWithRing({
          ...bodyOptions,
          ...ringAssignment(random, planet.size),
        })
      : renderPlanetWithRing({ ...bodyOptions, ring: planet.ring });

  const moon =
    planet.moon === false
      ? null
      : renderMoon({ moon: planet.moon, index, palette, ids, random });

  const bodyId = ids.next('preview-body-group');

  const content =
    `<g data-role="planet">` +
    `<g id="${bodyId}">${body}</g>` +
    (moon === null ? '' : moon.markup) +
    `</g>`;

  const extent = round(Math.max(bodyExtent(planet), moonExtent(planet)) * PREVIEW_PADDING);
  const span = round(extent * 2);

  const ordinal = index + 1;
  const title = `Planet ${ordinal}`;
  const description =
    `Planet ${ordinal} of ${params.planets.length}, radius ${planet.size}, ` +
    (planet.ring === false || planet.ring === undefined
      ? 'shown on its own'
      : `with a ${planet.ring.type.toLowerCase()} ring`) +
    (planet.moon === false ? ' and no moon.' : ' and an orbiting moon.');

  const metadata =
    `<title>${escapeText(title)}</title>` +
    `<desc>${escapeText(description)}</desc>`;

  // The body renderers all draw around the origin, so the viewBox is simply
  // centred there. `documentShell` is deliberately not reused: it sizes the
  // viewBox from a canvas and offsets content by the scene's ambient margin,
  // neither of which applies to a body-centred preview.
  return (
    `<svg class="solarsys solarsys-planet-preview"` +
    ` viewBox="${-extent} ${-extent} ${span} ${span}"` +
    ` xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">` +
    metadata +
    content +
    `</svg>`
  );
}
