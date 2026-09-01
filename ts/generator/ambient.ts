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

  // Preserve the retired star-symbol draw so every downstream id remains
  // byte-identical even though stars no longer reference the unit circle.
  ids.next('star');
  const glowId = ids.next('star-glow');
  const vignetteId = ids.next('vignette');
  const nebulaIds = NEBULA_SPOTS.map(() => ids.next('nebula'));

  let defs =
    `<defs>` +
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
        `<circle data-role="star" cx="${x}" cy="${y}" r="${scale}" fill="${color}"` +
        ` opacity="${tier.opacity}"/>`;
    }
  }

  const brightCount = boundedBrightCount ?? randomInt(random, 4, 7);

  for (let bright = 0; bright < brightCount; bright += 1) {
    const x = randomInt(random, 0, width * 10) / 10;
    const y = randomInt(random, 0, height * 10) / 10;

    out +=
      `<circle data-role="star-glow" cx="${x}" cy="${y}"` +
      ` r="${randomInt(random, 15, 30) / 10}" fill="url(#${glowId})"/>` +
      `<circle data-role="star" cx="${x}" cy="${y}" r="0.6" fill="#ffffff" opacity="1"/>`;
  }

  out += `<rect data-role="vignette" width="${width}" height="${height}" fill="url(#${vignetteId})"/>`;

  return out;
}

/** Asteroid count, preserved from the baseline. */
const BELT_COUNT = 130;


/** The authored belt types (GEN-019, CTL-012). */
export const BELT_TYPES = ['rocky', 'icy', 'metallic'] as const;
export type BeltType = (typeof BELT_TYPES)[number];

/**
 * Default applied when a direct generator caller omits the type, chosen so the
 * legacy path keeps the baseline's rock character (design §3).
 */
export const DEFAULT_BELT_TYPE: BeltType = 'rocky';

type AsteroidShapeDescriptor = Readonly<{
  silhouette: string;
  highlight: string;
  shadow: string;
}>;

function transformPoints(
  points: string,
  scale: number,
  offsetX: number,
  offsetY: number,
): string {
  return points
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [xText, yText] = pair.split(',');
      const x = Number(xText);
      const y = Number(yText);
      const transformedX = round(x * scale + offsetX);
      const transformedY = round(y * scale + offsetY);

      return `${transformedX},${transformedY}`;
    })
    .join(' ');
}

function makeAsteroidShape(silhouette: string): AsteroidShapeDescriptor {
  return {
    silhouette,
    highlight: transformPoints(silhouette, 0.62, -0.1, -0.18),
    shadow: transformPoints(silhouette, 0.68, 0.14, 0.16),
  };
}

/**
 * Per-type rock silhouettes. Each set holds more than two symbols so a belt
 * reads as a field of distinct bodies rather than two repeated stamps
 * (GEN-019). Points are unit-scale: the per-rock `scale()` sizes them.
 *
 * The first two rocky shapes are the baseline pair, preserved so the default
 * type keeps its familiar character.
 */
export const BELT_SHAPES: Record<BeltType, readonly AsteroidShapeDescriptor[]> = {
  rocky: [
    makeAsteroidShape('0.9,0 0.3,0.7 -0.6,0.6 -0.9,-0.2 -0.2,-0.8'),
    makeAsteroidShape('0.8,0.2 0.1,0.9 -0.8,0.3 -0.5,-0.6 0.4,-0.7'),
    makeAsteroidShape('0.95,-0.15 0.45,0.55 -0.25,0.9 -0.85,0.15 -0.55,-0.65 0.2,-0.85'),
    makeAsteroidShape('0.7,0.35 -0.05,0.8 -0.75,0.45 -0.9,-0.35 -0.15,-0.9 0.6,-0.5'),
  ],
  icy: [
    makeAsteroidShape('1,0 0.2,0.45 -0.35,0.95 -0.55,0.2 -0.95,-0.35 -0.2,-0.5 0.35,-0.95'),
    makeAsteroidShape('0.55,0.15 0.15,1 -0.3,0.35 -1,0.1 -0.35,-0.4 0.1,-0.95 0.5,-0.35'),
    makeAsteroidShape('0.85,-0.35 0.4,0.25 0.6,0.8 -0.2,0.6 -0.8,0.85 -0.6,0.05 -0.9,-0.55 -0.1,-0.4'),
    makeAsteroidShape('0.9,0.45 0.05,0.55 -0.45,1 -0.55,0.25 -1,-0.2 -0.3,-0.6 0.35,-0.9 0.45,-0.2'),
  ],
  metallic: [
    makeAsteroidShape('0.85,-0.5 0.85,0.5 0,0.9 -0.85,0.5 -0.85,-0.5 0,-0.9'),
    makeAsteroidShape('0.75,-0.75 0.9,0.2 0.2,0.9 -0.75,0.75 -0.9,-0.2 -0.2,-0.9'),
    makeAsteroidShape('0.9,-0.25 0.65,0.65 -0.25,0.9 -0.9,0.25 -0.65,-0.65 0.25,-0.9'),
    makeAsteroidShape('0.7,-0.7 0.7,0.7 -0.7,0.7 -0.7,-0.7'),
  ],
};

export interface AsteroidBeltConfig {
  count: number;
  /** Absolute inner edge radius, resolved by the control boundary (CTL-017). */
  innerRadius: number;
  /** Absolute outer edge radius, resolved by the control boundary (CTL-017). */
  outerRadius: number;
  /** Absolute base rock radius, resolved by the control boundary (CTL-017). */
  baseRadius: number;
  period: number;
  /** Omitted applies `DEFAULT_BELT_TYPE`, keeping the legacy rock character. */
  type?: BeltType;
}

function rockTone(
  palette: Palette,
  type: BeltType = DEFAULT_BELT_TYPE,
): { base: string; highlight: string; shadow: string } {
  const base = shade(
    mix(palette.planetHues[0], palette.stars[palette.stars.length - 1]!, 0.5),
    0.12,
  );

  if (type === 'icy') {
    const pale = tint(mix(base, palette.stars[1], 0.55), 0.15);

    return {
      base: pale,
      highlight: tint(mix(pale, palette.stars[2] ?? palette.stars[1], 0.45), 0.18),
      shadow: shade(mix(pale, palette.stars[0], 0.55), 0.42),
    };
  }

  if (type === 'metallic') {
    const metal = shade(mix(base, shade(palette.stars[0], 0.4), 0.6), 0.08);

    return {
      base: metal,
      highlight: tint(mix(metal, palette.stars[2] ?? palette.stars[1], 0.5), 0.26),
      shadow: shade(mix(metal, palette.stars[0], 0.6), 0.5),
    };
  }

  return {
    base,
    highlight: tint(mix(base, palette.stars[2] ?? palette.stars[1], 0.4), 0.2),
    shadow: shade(base, 0.45),
  };
}

/**
 * Tone paint order for the baked belt, matching the order the `<use>` shadow
 * trees painted each rock's layers: silhouette under highlight under shadow.
 */
const BAKED_TONES = ['silhouette', 'highlight', 'shadow'] as const;
type BakedTone = (typeof BAKED_TONES)[number];

/**
 * Parse a shape's unit-scale point list once, at module shape rather than per
 * rock, would be nicer — but shapes are tiny and the belt renders once per
 * scene, so a simple parse here keeps the code local.
 */
function parsePoints(points: string): ReadonlyArray<readonly [number, number]> {
  return points
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [x = 0, y = 0] = pair.split(',').map(Number);

      return [x, y] as const;
    });
}

/**
 * Bake one rock layer into an absolute subpath: rotate, scale, then translate
 * each unit-scale vertex — the same order the retired per-rock
 * `translate() scale() rotate()` transform applied.
 */
function bakedSubpath(
  points: ReadonlyArray<readonly [number, number]>,
  x: number,
  y: number,
  scale: number,
  rotationDegrees: number,
): string {
  const radians = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return points
    .map(([px, py], index) => {
      const vx = round(x + (px * cos - py * sin) * scale);
      const vy = round(y + (px * sin + py * cos) * scale);

      return `${index === 0 ? 'M' : 'L'}${vx} ${vy}`;
    })
    .join('') + 'Z';
}

export function renderAsteroidBelt(
  canvas: Canvas,
  palette: Palette,
  ids: IdGenerator,
  random: Prng,
  config?: AsteroidBeltConfig,
): string {
  // The legacy seed-assigned belt keeps its exact historical serialization:
  // the geometry parity oracle compares its bytes against the PHP baseline.
  return config === undefined
    ? renderLegacyBelt(canvas, palette, ids, random)
    : renderBakedBelt(canvas, palette, ids, random, config);
}

/**
 * The pre-authored belt path, byte-for-byte as the migration shipped it:
 * per-type `<defs>` symbols instanced by one `<use>` per rock. Only direct
 * generator callers that omit `asteroidBelt` reach this.
 */
function renderLegacyBelt(
  canvas: Canvas,
  palette: Palette,
  ids: IdGenerator,
  random: Prng,
): string {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const rx = canvas.width * 0.42;
  const ry = canvas.height * 0.42;
  const type = DEFAULT_BELT_TYPE;
  const colors = rockTone(palette, type);

  const shapes = BELT_SHAPES[type];
  const shapeIds = shapes.map(() => ids.next('asteroid'));

  let bodies = '';

  const count = BELT_COUNT;

  for (let index = 0; index < count; index += 1) {
    const angle =
      (index / count) * 2 * Math.PI + randomInt(random, -30, 30) / 100;
    const jitter = randomInt(random, -90, 90) / 10;

    const x = round(cx + Math.cos(angle) * (rx + jitter));
    const y = round(cy + Math.sin(angle) * (ry + jitter));
    const scale = randomInt(random, 11, 26) / 10;
    // Exactly one draw selects the symbol, whatever the shape set's size, so
    // the number of PRNG draws per rock never varies with belt type (GEN-019).
    const symbol = shapeIds[randomInt(random, 0, shapeIds.length - 1)]!;
    const rotation = randomInt(random, 0, 360);
    const opacity = randomInt(random, 75, 100) / 100;

    bodies +=
      `<use data-role="asteroid" href="#${symbol}" opacity="${opacity}"` +
      ` transform="translate(${x} ${y}) scale(${scale}) rotate(${rotation})"/>`;
  }

  const duration = randomInt(random, 120, 240);
  const beltId = ids.next('belt-group');
  const symbols = shapes
    .map((shape, index) => {
      const symbolId = shapeIds[index];

      return (
        `<g id="${symbolId}" data-role="asteroid-symbol">` +
        `<polygon data-role="asteroid-silhouette" points="${shape.silhouette}" fill="${colors.base}" stroke="${shade(colors.base, 0.45)}" stroke-width="0.15"/>` +
        `<polygon data-role="asteroid-highlight" points="${shape.highlight}" fill="${colors.highlight}"/>` +
        `<polygon data-role="asteroid-shadow" points="${shape.shadow}" fill="${colors.shadow}"/>` +
        `</g>`
      );
    })
    .join('');

  return (
    `<defs>` +
    symbols +
    `</defs>` +
    `<g data-role="asteroid-belt">` +
    `<animateTransform attributeName="transform" type="rotate"` +
    ` from="0 ${cx} ${cy}" to="360 ${cx} ${cy}" dur="${duration}s" repeatCount="indefinite"/>` +
    `<g id="${beltId}">${bodies}</g>` +
    `</g>`
  );
}

/**
 * The authored belt, baked (GEN-026).
 *
 * The belt rotates as ONE rigid group, so no rock ever animates independently
 * and per-rock structure buys nothing at render time — while costing dearly: at
 * the 2,600-rock cap the `<use>`-per-rock form put ~10,400 primitives under a
 * SMIL rotate, which re-rasterizes every one of them each frame. Measured in
 * Chromium at a 6x stress multiple, that form lost roughly a quarter of its
 * delivered frame cadence while this baked form held the display's full rate
 * on identical geometry.
 *
 * Baking applies each rock's translate/scale/rotate to its unit-scale polygon
 * vertices at generation time and merges rocks into one `<path>` of many
 * subpaths per material tone. Rocks are grouped into clusters by their seeded
 * opacity (26 possible values), so per-rock opacity variation survives exactly;
 * within a cluster the three tone paths keep the silhouette-under-highlight-
 * under-shadow paint order the `<use>` shadow trees had. The whole belt now
 * serializes to ~a hundred nodes instead of thousands.
 *
 * The per-rock PRNG draw sequence (angular jitter, radial position, scale,
 * symbol, rotation, opacity) is IDENTICAL to the retired `<use>` form, so
 * determinism and the one-symbol-draw-per-rock invariant are unchanged.
 *
 * The rendered rock count is carried on the belt group as `data-count`. It is
 * kept honest by the structural suite, which independently counts silhouette
 * subpaths and asserts the two agree.
 */
function renderBakedBelt(
  canvas: Canvas,
  palette: Palette,
  ids: IdGenerator,
  random: Prng,
  config: AsteroidBeltConfig,
): string {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const type = config.type ?? DEFAULT_BELT_TYPE;
  const colors = rockTone(palette, type);

  const shapes = BELT_SHAPES[type];
  const parsedShapes = shapes.map((shape) => ({
    silhouette: parsePoints(shape.silhouette),
    highlight: parsePoints(shape.highlight),
    shadow: parsePoints(shape.shadow),
  }));

  // `count` arrives already resolved: the control boundary owns every
  // proportional rule, including the density compensation (CTL-017).
  const count = config.count;

  /** Subpaths per tone, keyed by the rock's exact seeded opacity. */
  const clusters = new Map<number, Record<BakedTone, string[]>>();

  for (let index = 0; index < count; index += 1) {
    const angle =
      (index / count) * 2 * Math.PI + randomInt(random, -30, 30) / 100;

    // Area-uniform radial placement (GEN-023): a uniform draw in radius
    // over-fills the inner edge, because equal radial slices carry unequal
    // area. One draw, so the per-rock sequence length is unchanged.
    const unit = randomInt(random, 0, 10_000) / 10_000;
    const inner = config.innerRadius;
    const outer = config.outerRadius;
    const radius = Math.sqrt(inner * inner + (outer * outer - inner * inner) * unit);

    // One radius on both axes: the band is a circular annulus anchored to
    // the drawable half-extent, not a per-axis ellipse (GEN-023).
    const x = round(cx + Math.cos(angle) * radius);
    const y = round(cy + Math.sin(angle) * radius);
    const scale = round(config.baseRadius * randomInt(random, 40, 180) / 100);
    // Exactly one draw selects the symbol, whatever the shape set's size, so
    // the number of PRNG draws per rock never varies with belt type (GEN-019).
    const shape = parsedShapes[randomInt(random, 0, parsedShapes.length - 1)]!;
    const rotation = randomInt(random, 0, 360);
    const opacity = randomInt(random, 75, 100) / 100;

    let cluster = clusters.get(opacity);

    if (cluster === undefined) {
      cluster = { silhouette: [], highlight: [], shadow: [] };
      clusters.set(opacity, cluster);
    }

    cluster.silhouette.push(bakedSubpath(shape.silhouette, x, y, scale, rotation));
    cluster.highlight.push(bakedSubpath(shape.highlight, x, y, scale, rotation));
    cluster.shadow.push(bakedSubpath(shape.shadow, x, y, scale, rotation));
  }

  const duration = config.period;
  const beltId = ids.next('belt-group');

  const toneAttributes: Record<BakedTone, string> = {
    silhouette: `fill="${colors.base}" stroke="${shade(colors.base, 0.45)}" stroke-width="0.15"`,
    highlight: `fill="${colors.highlight}"`,
    shadow: `fill="${colors.shadow}"`,
  };

  // Ascending opacity gives a stable, readable order; the PRNG already fixes
  // the content deterministically.
  const bodies = [...clusters.entries()]
    .sort(([a], [b]) => a - b)
    .map(([opacity, cluster]) =>
      `<g data-role="asteroid-cluster" opacity="${opacity}">` +
      BAKED_TONES
        .map((tone) =>
          `<path data-role="asteroid-${tone}s" ${toneAttributes[tone]}` +
          ` d="${cluster[tone].join('')}"/>`,
        )
        .join('') +
      `</g>`,
    )
    .join('');

  return (
    `<g data-role="asteroid-belt" data-count="${count}">` +
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
