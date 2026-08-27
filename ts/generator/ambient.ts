import { CANVAS_MARGIN } from './document';
import { mix, rgba, shade, tint } from './color';
import type { IdGenerator } from './ids';
import type { Canvas } from './orbit';
import type { Palette } from './palette';
import type { Prng } from './prng';

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function randomInt(random: Prng, min: number, max: number): number {
  return min + Math.floor(random.next() * (max - min + 1));
}

/** Nebula spot positions, preserved from the baseline background layers. */
const NEBULA_SPOTS = [
  ['30%', '35%'],
  ['70%', '30%'],
  ['50%', '65%'],
] as const;

/**
 * Star tiers: divisor of the canvas area, scale, and opacity. Density is
 * therefore a function of area, so a larger canvas yields more stars (GEN-009).
 */
const STAR_TIERS = [
  { divisor: 90, scale: 0.35, opacity: '0.5' },
  { divisor: 220, scale: 0.7, opacity: '0.8' },
  { divisor: 900, scale: 1.2, opacity: '1.0' },
] as const;

/** The default 600px canvas plus the generator's five-unit ambient margin. */
const STAR_DAMPING_REFERENCE_AREA = 605 * 605;

/** Total rendered stars, including the four-to-seven bright foreground stars. */
const MAX_RENDERED_STARS = 7_000;

const STAR_DENSITY = STAR_TIERS.reduce((total, tier) => total + 1 / tier.divisor, 0);

/**
 * Allocate a fixed star budget across the legacy tiers by their original
 * relative densities. Largest-remainder tie breaking is tier order, so the
 * allocation remains deterministic without drawing extra random values.
 */
function allocateStarBudget(budget: number): number[] {
  const provisional = STAR_TIERS.map((tier, index) => {
    const exact = (budget * (1 / tier.divisor)) / STAR_DENSITY;

    return { index, count: Math.floor(exact), remainder: exact % 1 };
  });
  let remaining = budget - provisional.reduce((total, tier) => total + tier.count, 0);

  for (const tier of [...provisional].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
    if (remaining === 0) {
      break;
    }

    tier.count += 1;
    remaining -= 1;
  }

  return provisional.map((tier) => tier.count);
}

/**
 * Render the gradient background, the layered starfield, and the closing
 * vignette. Star counts and positions are drawn from the seeded generator.
 */
export function renderBackground(
  canvas: Canvas,
  palette: Palette,
  ids: IdGenerator,
  random: Prng,
): string {
  const width = canvas.width + CANVAS_MARGIN;
  const height = canvas.height + CANVAS_MARGIN;
  const area = width * height;
  const background = palette.background;
  const vignetteColor = background[3];

  const starSymbolId = ids.next('star');
  const glowId = ids.next('star-glow');
  const vignetteId = ids.next('vignette');
  const nebulaIds = NEBULA_SPOTS.map(() => ids.next('nebula'));

  let defs =
    `<defs>` +
    `<circle id="${starSymbolId}" cx="0" cy="0" r="1"/>` +
    `<radialGradient id="${glowId}">` +
    `<stop offset="0%" stop-color="#ffffff" stop-opacity="0.18"/>` +
    `<stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>` +
    `</radialGradient>` +
    `<radialGradient id="${vignetteId}" cx="50%" cy="50%" r="75%">` +
    `<stop offset="55%" stop-color="${rgba(vignetteColor, 0)}"/>` +
    `<stop offset="100%" stop-color="${rgba(shade(vignetteColor, 0.4), 0.85)}"/>` +
    `</radialGradient>`;

  NEBULA_SPOTS.forEach((spot, index) => {
    const isFirst = index === 0;

    defs +=
      `<radialGradient id="${nebulaIds[index]}" cx="${spot[0]}" cy="${spot[1]}" r="80%">` +
      `<stop offset="0%" stop-color="${background[0]}" stop-opacity="${isFirst ? '1' : '0.5'}"/>` +
      `<stop offset="45%" stop-color="${background[1]}" stop-opacity="${isFirst ? '1' : '0.35'}"/>` +
      `<stop offset="100%" stop-color="${background[3]}" stop-opacity="${isFirst ? '1' : '0'}"/>` +
      `</radialGradient>`;
  });

  defs += `</defs>`;

  let out = defs;

  nebulaIds.forEach((id) => {
    out += `<rect data-role="nebula" width="${width}" height="${height}" fill="url(#${id})"/>`;
  });

  // Preserve the legacy loop count and PRNG consumption at and below the
  // default canvas. Above it, density grows with sqrt(area) and has a firm
  // ceiling, preventing a permitted large canvas from overwhelming the SVG
  // compositor. Bright stars are included in the total budget.
  const boundedDensity = area > STAR_DAMPING_REFERENCE_AREA;
  const boundedBrightCount = boundedDensity ? randomInt(random, 4, 7) : null;
  const totalBudget = boundedDensity
    ? Math.min(
        MAX_RENDERED_STARS,
        Math.floor(STAR_DENSITY * Math.sqrt(area * STAR_DAMPING_REFERENCE_AREA)),
      )
    : null;
  const tierCounts = boundedDensity
    ? allocateStarBudget(totalBudget! - boundedBrightCount!)
    : STAR_TIERS.map((tier) => Math.trunc(area / tier.divisor));

  for (const [index, tier] of STAR_TIERS.entries()) {
    const count = tierCounts[index]!;

    for (let star = 0; star < count; star += 1) {
      const x = randomInt(random, 0, width * 10) / 10;
      const y = randomInt(random, 0, height * 10) / 10;
      const scale = round((tier.scale * randomInt(random, 70, 130)) / 100);
      const color = palette.stars[randomInt(random, 0, palette.stars.length - 1)]!;

      out +=
        `<use data-role="star" href="#${starSymbolId}" fill="${color}"` +
        ` opacity="${tier.opacity}" transform="translate(${x} ${y}) scale(${scale})"/>`;
    }
  }

  const brightCount = boundedBrightCount ?? randomInt(random, 4, 7);

  for (let bright = 0; bright < brightCount; bright += 1) {
    const x = randomInt(random, 0, width * 10) / 10;
    const y = randomInt(random, 0, height * 10) / 10;

    out +=
      `<circle data-role="star-glow" cx="${x}" cy="${y}"` +
      ` r="${randomInt(random, 15, 30) / 10}" fill="url(#${glowId})"/>` +
      `<use data-role="star" href="#${starSymbolId}" fill="#ffffff"` +
      ` opacity="1" transform="translate(${x} ${y}) scale(0.6)"/>`;
  }

  out += `<rect data-role="vignette" width="${width}" height="${height}" fill="url(#${vignetteId})"/>`;

  return out;
}

/** Asteroid count, preserved from the baseline. */
const BELT_COUNT = 130;

export interface AsteroidBeltConfig {
  count: number;
  innerRadiusPercent: number;
  outerRadiusPercent: number;
  size: number;
  period: number;
}

/** Derive the belt's rock tones from the palette (baseline `Theme::asteroid`). */
function asteroidColors(palette: Palette): { fill: string; stroke: string } {
  const rock = shade(
    mix(palette.planetHues[0], palette.stars[palette.stars.length - 1]!, 0.5),
    0.12,
  );

  return { fill: rock, stroke: shade(rock, 0.45) };
}

/**
 * Render the asteroid belt as one rigid group rotating indefinitely, seated
 * between the inner and outer orbital region.
 */
export function renderAsteroidBelt(
  canvas: Canvas,
  palette: Palette,
  ids: IdGenerator,
  random: Prng,
  config?: AsteroidBeltConfig,
): string {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const rx = canvas.width * 0.42;
  const ry = canvas.height * 0.42;
  const colors = asteroidColors(palette);

  const shapeA = ids.next('asteroid-a');
  const shapeB = ids.next('asteroid-b');

  let bodies = '';

  const count = config?.count ?? BELT_COUNT;

  for (let index = 0; index < count; index += 1) {
    const angle =
      (index / count) * 2 * Math.PI + randomInt(random, -30, 30) / 100;
    let x: number;
    let y: number;
    let scale: number;

    if (config === undefined) {
      const jitter = randomInt(random, -90, 90) / 10;

      x = round(cx + Math.cos(angle) * (rx + jitter));
      y = round(cy + Math.sin(angle) * (ry + jitter));
      scale = randomInt(random, 11, 26) / 10;
    } else {
      const radialPercent =
        config.innerRadiusPercent +
        (config.outerRadiusPercent - config.innerRadiusPercent) *
          randomInt(random, 0, 10_000) / 10_000;

      x = round(cx + Math.cos(angle) * cx * radialPercent / 100);
      y = round(cy + Math.sin(angle) * cy * radialPercent / 100);
      scale = round(config.size * randomInt(random, 55, 130) / 100);
    }
    const symbol = randomInt(random, 0, 1) === 1 ? shapeA : shapeB;
    const rotation = randomInt(random, 0, 360);
    const opacity = randomInt(random, 75, 100) / 100;

    bodies +=
      `<use data-role="asteroid" href="#${symbol}" fill="${colors.fill}"` +
      ` stroke="${colors.stroke}" stroke-width="0.15" opacity="${opacity}"` +
      ` transform="translate(${x} ${y}) scale(${scale}) rotate(${rotation})"/>`;
  }

  const duration = config?.period ?? randomInt(random, 120, 240);
  const beltId = ids.next('belt-group');

  return (
    `<defs>` +
    `<polygon id="${shapeA}" points="0.9,0 0.3,0.7 -0.6,0.6 -0.9,-0.2 -0.2,-0.8"/>` +
    `<polygon id="${shapeB}" points="0.8,0.2 0.1,0.9 -0.8,0.3 -0.5,-0.6 0.4,-0.7"/>` +
    `</defs>` +
    `<g data-role="asteroid-belt">` +
    `<animateTransform attributeName="transform" type="rotate"` +
    ` from="0 ${cx} ${cy}" to="360 ${cx} ${cy}" dur="${duration}s" repeatCount="indefinite"/>` +
    `<g id="${beltId}">${bodies}</g>` +
    `</g>`
  );
}

/** Distance beyond the canvas edge where comets enter and exit. */
const COMET_OVERSHOOT = 30;

/**
 * Render one to three comets, each crossing the full scene from off-screen to
 * off-screen with a teardrop tail aligned to its direction of travel.
 */
export function renderComets(
  canvas: Canvas,
  palette: Palette,
  ids: IdGenerator,
  random: Prng,
): string {
  const count = randomInt(random, 1, 3);
  let out = '';

  for (let index = 0; index < count; index += 1) {
    const tailId = ids.next('comet-tail');
    const headId = ids.next('comet-head');

    const startY = randomInt(random, 0, Math.trunc(canvas.height));
    const endY = randomInt(random, 0, Math.trunc(canvas.height));
    const path = `M ${-COMET_OVERSHOOT} ${startY} L ${canvas.width + COMET_OVERSHOOT} ${endY}`;

    const duration = randomInt(random, 9, 16);
    const begin = -1 * randomInt(random, 3, 8) * (index + 1);
    const length = randomInt(random, 26, 40);
    const halfWidth = round(length * 0.09);
    const headRadius = 2.2;
    const mid = round(-length * 0.5);

    const cometId = ids.next('comet-body');

    out +=
      `<defs>` +
      `<linearGradient id="${tailId}" x1="0" y1="0" x2="1" y2="0">` +
      `<stop offset="0%" stop-color="${rgba(palette.accent, 0)}"/>` +
      `<stop offset="60%" stop-color="${rgba(palette.accent, 0.4)}"/>` +
      `<stop offset="100%" stop-color="${rgba(palette.accent, 0.9)}"/>` +
      `</linearGradient>` +
      `<radialGradient id="${headId}">` +
      `<stop offset="0%" stop-color="${rgba(tint(palette.accent, 0.4), 0.95)}"/>` +
      `<stop offset="100%" stop-color="${rgba(tint(palette.accent, 0.4), 0)}"/>` +
      `</radialGradient>` +
      `</defs>` +
      `<g data-role="comet">` +
      `<g id="${cometId}">` +
      `<path data-role="comet-tail"` +
      ` d="M 0 0 Q ${mid} ${-halfWidth}, ${-length} 0 Q ${mid} ${halfWidth}, 0 0 Z"` +
      ` fill="url(#${tailId})"/>` +
      `<circle data-role="comet-glow" cx="0" cy="0" r="${round(headRadius * 3)}"` +
      ` fill="url(#${headId})"/>` +
      `<circle data-role="comet-head" cx="0" cy="0" r="${headRadius}"` +
      ` fill="${tint(palette.accent, 0.4)}"/>` +
      `</g>` +
      `<animateMotion dur="${duration}s" begin="${begin}s" repeatCount="indefinite"` +
      ` rotate="auto" path="${path}"/>` +
      `</g>`;
  }

  return out;
}
