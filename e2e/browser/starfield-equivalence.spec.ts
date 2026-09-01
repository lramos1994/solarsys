import { expect, test } from '@playwright/test';
import { DEFAULT_INPUT } from '../../ts/app/controls';
import { validateScene } from '../../ts/app/validation';
import { generateScene } from '../../ts/generator/scene';

/**
 * QLT-011 — measured rendering-tolerance contract for the starfield.
 *
 * Methodology is fixed by design.md "Decision 3" and reference-behavior.md
 * SF-010/SF-011 and must not drift:
 *
 * - Scene: application DEFAULT_INPUT at canvas 1500x1500, seed 20260826, the
 *   WHOLE generated document (not an ambient-only slice).
 * - Variants are built IN NODE from `generateScene`'s output string. Scraping a
 *   live DOM's re-serialized markup is the exact mistake SF-020 records.
 * - Rasterization is `Image` + `drawImage` + `getImageData` at 900x900
 *   (810,000 sampled pixels), frame 0. An `<img>`-hosted SVG renders at its
 *   initial time and never advances (E-005), which is precisely the frame-0
 *   sample this contract wants; the starfield carries no animation, so the
 *   seek-and-bake pipeline (E-006/E-007) is not needed here.
 * - Both mandatory guards run before any pixel is compared: a self-control arm
 *   that MUST report exactly zero, and a mechanism guard proving non-zero star
 *   counts and non-identical document strings.
 *
 * The ceilings below are the contract, not tuning parameters. If an engine
 * exceeds one, escalate — do not widen it (tasks 3.1/3.2).
 */

const CANVAS_SIZE = 1500;
const SAMPLE_SIZE = 900;
const ENGINE_LIMITS = {
  chromium: { proportion: 0.0005, maxDelta: 16 },
  firefox: { proportion: 0.01, maxDelta: 16 },
  webkit: { proportion: 0.0005, maxDelta: 16 },
} as const;
const NORMALIZED_STAR_SYMBOL_ID = 'star-equivalence-probe';

const CIRCLE_STAR = /<circle data-role="star" cx="([^"]+)" cy="([^"]+)" r="([^"]+)" fill="([^"]+)" opacity="([^"]+)"\/>/g;
const USE_STAR = /<use data-role="star" href="#([^"]+)" fill="([^"]+)" opacity="([^"]+)" transform="translate\(([^ )]+) ([^ )]+)\) scale\(([^)]+)\)"\/>/g;

type Star = {
  raw: string;
  cx: string;
  cy: string;
  r: string;
  fill: string;
  opacity: string;
};

type Variant = { svg: string; starCount: number };

type DiffReport = {
  changedPixels: number;
  totalPixels: number;
  changedProportion: number;
  maxChannelDelta: number;
};

function sampleScene(size = CANVAS_SIZE): string {
  const validated = validateScene({
    ...DEFAULT_INPUT,
    canvasWidth: String(size),
    canvasHeight: String(size),
  });

  if (!validated.ok) {
    throw new Error(`default scene failed validation: ${JSON.stringify(validated.errors)}`);
  }

  return generateScene(validated.params, validated.seed);
}

/** Parses the shipped circle-per-star form into resolved geometry. */
function parseStars(svg: string): Star[] {
  return [...svg.matchAll(CIRCLE_STAR)].map((match) => ({
    raw: match[0],
    cx: match[1]!,
    cy: match[2]!,
    r: match[3]!,
    fill: match[4]!,
    opacity: match[5]!,
  }));
}

/** Parses the retired `<use>` form into the same resolved geometry. */
function parseRetiredStars(svg: string): Star[] {
  return [...svg.matchAll(USE_STAR)].map((match) => ({
    raw: match[0],
    cx: match[4]!,
    cy: match[5]!,
    r: match[6]!,
    fill: match[2]!,
    opacity: match[3]!,
  }));
}

function adopted(svg: string): Variant {
  return { svg, starCount: parseStars(svg).length };
}

/**
 * Reconstructs the retired `<use>`-of-a-unit-circle form from the shipped
 * output. The reconstruction is exact: the retired emission wrote
 * `translate(x y) scale(r)` from the same strings the current form writes as
 * `cx`/`cy`/`r`, so no rounding or reformatting is introduced here.
 */
function retired(svg: string): Variant {
  const stars = parseStars(svg);

  if (stars.length === 0) {
    return { svg, starCount: parseRetiredStars(svg).length };
  }

  let next = svg.replace(
    '<defs>',
    `<defs><circle id="${NORMALIZED_STAR_SYMBOL_ID}" cx="0" cy="0" r="1"/>`,
  );

  for (const star of stars) {
    next = next.replace(
      star.raw,
      `<use data-role="star" href="#${NORMALIZED_STAR_SYMBOL_ID}" fill="${star.fill}"` +
        ` opacity="${star.opacity}" transform="translate(${star.cx} ${star.cy}) scale(${star.r})"/>`,
    );
  }

  return { svg: next, starCount: stars.length };
}

function circlePath(cx: string, cy: string, r: string): string {
  const left = `${Number(cx) - Number(r)}`;
  const right = `${Number(cx) + Number(r)}`;

  return `M${left} ${cy}A${r} ${r} 0 1 0 ${right} ${cy}A${r} ${r} 0 1 0 ${left} ${cy}Z`;
}

/** The rejected merged form, kept as the harness's discrimination arm. */
function merged(svg: string): Variant {
  const stars = parseStars(svg);

  if (stars.length === 0) {
    throw new Error('merged-star arm found no circle stars to merge');
  }

  const grouped = new Map<string, string[]>();
  for (const star of stars) {
    const key = `${star.fill}__${star.opacity}`;
    const paths = grouped.get(key) ?? [];
    paths.push(circlePath(star.cx, star.cy, star.r));
    grouped.set(key, paths);
  }

  const mergedMarkup = [...grouped.entries()]
    .map(([key, paths]) => {
      const [fill, opacity] = key.split('__');
      return `<path data-role="star-group" fill="${fill}" opacity="${opacity}" d="${paths.join('')}"/>`;
    })
    .join('');

  let next = svg.replace(stars[0]!.raw, `__STARFIELD_GROUP__`);
  for (const star of stars.slice(1)) {
    next = next.replace(star.raw, '');
  }

  return { svg: next.replace('__STARFIELD_GROUP__', mergedMarkup), starCount: stars.length };
}

async function rasterDiff(
  page: import('@playwright/test').Page,
  baselineSvg: string,
  candidateSvg: string,
): Promise<DiffReport> {
  return page.evaluate(
    async ({ baselineSvg, candidateSvg, sampleSize }) => {
      async function rasterize(svg: string): Promise<Uint8ClampedArray> {
        const image = new Image(sampleSize, sampleSize);

        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error('svg image failed to load'));
          image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        });

        const canvas = document.createElement('canvas');
        canvas.width = sampleSize;
        canvas.height = sampleSize;
        const context = canvas.getContext('2d', { willReadFrequently: true });

        if (context === null) {
          throw new Error('no 2d context');
        }

        context.drawImage(image, 0, 0, sampleSize, sampleSize);
        return context.getImageData(0, 0, sampleSize, sampleSize).data;
      }

      const a = await rasterize(baselineSvg);
      const b = await rasterize(candidateSvg);
      const totalPixels = sampleSize * sampleSize;
      let changedPixels = 0;
      let maxChannelDelta = 0;

      for (let index = 0; index < a.length; index += 4) {
        const pixelDelta = Math.max(
          Math.abs(a[index]! - b[index]!),
          Math.abs(a[index + 1]! - b[index + 1]!),
          Math.abs(a[index + 2]! - b[index + 2]!),
        );

        if (pixelDelta > 0) {
          changedPixels += 1;
          maxChannelDelta = Math.max(maxChannelDelta, pixelDelta);
        }
      }

      return {
        changedPixels,
        totalPixels,
        changedProportion: changedPixels / totalPixels,
        maxChannelDelta,
      };
    },
    { baselineSvg, candidateSvg, sampleSize: SAMPLE_SIZE },
  );
}

const SOURCE = sampleScene();
const ADOPTED = adopted(SOURCE);
const RETIRED = retired(SOURCE);
const MERGED = merged(SOURCE);

function report(name: string, diff: DiffReport): string {
  return (
    `${name}: ${diff.changedPixels}/${diff.totalPixels} changed ` +
    `(${(diff.changedProportion * 100).toFixed(4)}%), max channel delta ${diff.maxChannelDelta}`
  );
}

test.describe('starfield rendering tolerance (QLT-011)', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.setContent('<!doctype html><html><body style="margin:0"></body></html>');
  });

  test('comparison harness sees real differences and self-control stays zero', async ({
    page,
  }, testInfo) => {
    expect(RETIRED.starCount, 'retired document must contain stars').toBeGreaterThan(6_000);
    expect(ADOPTED.starCount, 'adopted document must contain stars').toBeGreaterThan(6_000);
    expect(MERGED.starCount, 'merged document must represent stars').toBeGreaterThan(6_000);
    expect(RETIRED.svg, 'compared documents must differ').not.toBe(ADOPTED.svg);
    expect(MERGED.svg, 'compared documents must differ').not.toBe(ADOPTED.svg);

    const selfControl = await rasterDiff(page, RETIRED.svg, RETIRED.svg);

    testInfo.annotations.push({
      type: 'starfield self-control',
      description: report(`${testInfo.project.name} self-control`, selfControl),
    });

    expect(selfControl.changedPixels, report(`${testInfo.project.name} self-control`, selfControl)).toBe(0);
    expect(selfControl.maxChannelDelta, report(`${testInfo.project.name} self-control`, selfControl)).toBe(0);
  });

  test('adopted circle-per-star output stays within the measured tolerance', async ({
    page,
  }, testInfo) => {
    const limit = ENGINE_LIMITS[testInfo.project.name as keyof typeof ENGINE_LIMITS];

    expect(limit, `no declared tolerance for project ${testInfo.project.name}`).toBeDefined();
    expect(RETIRED.starCount).toBeGreaterThan(6_000);
    expect(ADOPTED.starCount).toBeGreaterThan(6_000);
    expect(RETIRED.svg).not.toBe(ADOPTED.svg);

    const diff = await rasterDiff(page, RETIRED.svg, ADOPTED.svg);
    const line = report(`${testInfo.project.name} adopted`, diff);

    testInfo.annotations.push({ type: 'starfield adopted diff', description: line });

    expect(diff.changedProportion, line).toBeLessThanOrEqual(limit.proportion);
    expect(diff.maxChannelDelta, line).toBeLessThanOrEqual(limit.maxDelta);
  });

  test('merged star paths fail the contract', async ({ page }, testInfo) => {
    expect(MERGED.starCount).toBeGreaterThan(6_000);
    expect(RETIRED.svg).not.toBe(MERGED.svg);

    const diff = await rasterDiff(page, RETIRED.svg, MERGED.svg);
    const line = report(`${testInfo.project.name} merged`, diff);

    testInfo.annotations.push({ type: 'starfield merged diff', description: line });

    expect(diff.maxChannelDelta, line).toBeGreaterThan(16);
  });
});
