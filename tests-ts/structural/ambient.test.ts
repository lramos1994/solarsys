import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { inspectStructure } from '../helpers/structure';
import { createIdGenerator } from '../../ts/generator/ids';
import { DEFAULT_INPUT } from '../../ts/app/controls';
import { validateScene } from '../../ts/app/validation';
import { generateScene } from '../../ts/generator/scene';
import { createPrng } from '../../ts/generator/prng';
import { paletteByName } from '../../ts/generator/palette';
import {
  renderAsteroidBelt,
  renderBackground,
  renderComets,
} from '../../ts/generator/ambient';

/**
 * Task 2.11 (GEN-009): ambient elements.
 *
 * Counts, positions and periods are generator-owned: every assertion below
 * either drives the seeded PRNG or checks a structural property, never a
 * user-supplied value (CTL-009).
 */

const PALETTE = paletteByName('Aurora');
const RETIRED_FIXTURE = JSON.parse(
  readFileSync(new URL('../fixtures/retired-starfield-300x300-seed42.json', import.meta.url), 'utf8'),
) as {
  starCount: number;
  stars: Array<{ fill: string; opacity: string; x: string; y: string; r: string }>;
};
const CIRCLE_STAR = /<circle data-role="star" cx="([^"]+)" cy="([^"]+)" r="([^"]+)" fill="([^"]+)" opacity="([^"]+)"\/>/g;

function parse(markup: string): Document {
  const { document } = parseHTML(
    `<html><body><svg xmlns="http://www.w3.org/2000/svg">${markup}</svg></body></html>`,
  );

  return document as unknown as Document;
}

function background(width = 300, height = 300, seed = 42): string {
  return renderBackground(
    { width, height },
    PALETTE,
    createIdGenerator(seed),
    createPrng(seed),
  );
}

function parseCircleStars(markup: string): Array<{
  cx: string;
  cy: string;
  r: string;
  fill: string;
  opacity: string;
}> {
  return [...markup.matchAll(CIRCLE_STAR)].map((match) => ({
    cx: match[1]!,
    cy: match[2]!,
    r: match[3]!,
    fill: match[4]!,
    opacity: match[5]!,
  }));
}

function belt(seed = 42, config?: unknown): string {
  return renderAsteroidBelt(
    { width: 300, height: 300 },
    PALETTE,
    createIdGenerator(seed),
    createPrng(seed),
    config as never,
  );
}

function comets(seed = 42): string {
  return renderComets(
    { width: 300, height: 300 },
    PALETTE,
    createIdGenerator(seed),
    createPrng(seed),
  );
}

describe('background and starfield', () => {
  it('renders gradient layers, stars and a vignette', () => {
    const document = parse(background());

    expect(document.querySelectorAll('rect[data-role="nebula"]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-role="star"]').length).toBeGreaterThan(0);
    expect(document.querySelector('rect[data-role="vignette"]')).not.toBeNull();
  });

  it('renders more stars on a larger canvas under the same seed', () => {
    const small = parse(background(200, 200)).querySelectorAll('[data-role="star"]').length;
    const large = parse(background(600, 600)).querySelectorAll('[data-role="star"]').length;

    expect(large).toBeGreaterThan(small);
  });

  it('preserves the default-canvas ambient bytes at the damping knee', () => {
    const digest = createHash('sha256').update(background(600, 600, 42)).digest('hex');

    expect(digest).toBe('56011da565ee47eea1629013bc3d450942390626b43f4f6fb7c427f96caba1f7');
  });

  it('bounds large-canvas star count while keeping it above the default', () => {
    const defaultCount = parse(background(600, 600, 42)).querySelectorAll('[data-role="star"]').length;
    const maximumCount = parse(background(1500, 1500, 42)).querySelectorAll('[data-role="star"]').length;

    expect(maximumCount).toBeGreaterThan(defaultCount);
    expect(maximumCount).toBeLessThanOrEqual(7_000);
  });

  it('never reduces the star count as permitted canvas area increases', () => {
    const counts = [100, 300, 600, 900, 1200, 1500].map(
      (size) => parse(background(size, size, 42)).querySelectorAll('[data-role="star"]').length,
    );

    expect(counts.every((count, index) => index === 0 || count >= counts[index - 1]!)).toBe(true);
  });

  it('varies star opacity across the field', () => {
    const opacities = new Set(
      [...parse(background()).querySelectorAll('[data-role="star"]')].map((element) =>
        element.getAttribute('opacity'),
      ),
    );

    expect(opacities.size).toBeGreaterThan(1);
  });

  it('serializes each retired star as a direct circle with the same resolved geometry', () => {
    const stars = parseCircleStars(background());

    expect(stars).toHaveLength(RETIRED_FIXTURE.starCount);
    expect(stars).toEqual(
      RETIRED_FIXTURE.stars.map((star) => ({
        cx: star.x,
        cy: star.y,
        r: star.r,
        fill: star.fill,
        opacity: star.opacity,
      })),
    );
  });

  it('keeps the retired opacity set readable per star', () => {
    const current = new Set(parseCircleStars(background()).map((star) => star.opacity));
    const retired = new Set(RETIRED_FIXTURE.stars.map((star) => star.opacity));

    expect(current.size).toBeGreaterThan(1);
    expect([...current].sort()).toEqual([...retired].sort());
  });

  it('preserves the retired background PRNG draw count', () => {
    const base = createPrng(42);
    let draws = 0;

    renderBackground(
      { width: 300, height: 300 },
      PALETTE,
      createIdGenerator(42),
      {
        next() {
          draws += 1;
          return base.next();
        },
      },
    );

    expect(draws).toBe(6248);
  });

  it('removes the retired unit-circle symbol while preserving the downstream id sequence', () => {
    const report = inspectStructure(`<svg xmlns="http://www.w3.org/2000/svg">${background()}</svg>`);

    expect(report.violations).toEqual([]);
    expect(report.ids).not.toContain('star-16-0');
    expect(report.ids.slice(0, 5)).toEqual([
      'star-glow-16-1',
      'vignette-16-2',
      'nebula-16-3',
      'nebula-16-4',
      'nebula-16-5',
    ]);
  });

  it('produces a structurally sound fragment', () => {
    const report = inspectStructure(
      `<svg xmlns="http://www.w3.org/2000/svg">${background()}</svg>`,
    );

    expect(report.violations).toEqual([]);
  });

  // GEN-028: no element may represent more than one star. The rejected merged
  // forms are the ones this catches — they collapse thousands of stars into a
  // handful of shared paths, which is measurably NOT rendering-equivalent
  // (SF-011/SF-012: max channel delta 53-77 against a ceiling of 16) and is
  // larger under compression (SF-014/SF-015: +1.65% and +1.98% gzip).
  it('represents every star with its own element rather than shared geometry', () => {
    const markup = background();
    const document = parse(markup);
    const starElements = [...document.querySelectorAll('[data-role="star"]')];

    expect(starElements.length).toBeGreaterThan(0);
    expect(parseCircleStars(markup)).toHaveLength(starElements.length);

    for (const element of starElements) {
      expect(element.tagName.toLowerCase()).toBe('circle');
      expect(element.getAttribute('cx')).not.toBeNull();
      expect(element.getAttribute('cy')).not.toBeNull();
      expect(element.getAttribute('r')).not.toBeNull();
      expect(element.getAttribute('fill')).not.toBeNull();
      expect(element.getAttribute('opacity')).not.toBeNull();
    }
  });
});

// GEN-027: the raw serialized size is the one genuinely user-visible gain,
// because the download path writes the string uncompressed (SF-017/SF-D10).
// The gzip figure is RECORDED but deliberately NOT asserted as an improvement:
// it moved only -1.36% and presenting it as a benefit is the claim SF-D4
// forbids.
describe('serialized scene size (GEN-027)', () => {
  function scene(size: number): string {
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

  it('cuts the 1500x1500 raw byte count at least 20% below the SF-001 baseline', () => {
    const markup = scene(1500);
    const raw = Buffer.byteLength(markup);
    const stars = (markup.match(/data-role="star"/g) ?? []).length;

    // Mechanism guard: an empty or starless document would trivially satisfy a
    // byte ceiling, so prove the scene is the one that was measured first.
    expect(stars).toBe(7_000);
    expect(
      raw,
      `1500x1500 raw bytes ${raw}, baseline 945260, reduction ${(((945_260 - raw) / 945_260) * 100).toFixed(2)}%`,
    ).toBeLessThanOrEqual(945_260 * 0.8);
  });

  it('keeps the 7,000 rendered-star cap while shrinking the default canvas output', () => {
    const markup = scene(600);
    const raw = Buffer.byteLength(markup);
    const stars = (markup.match(/data-role="star"/g) ?? []).length;

    expect(stars).toBe(6_139);
    expect(stars).toBeLessThanOrEqual(7_000);
    expect(raw, `600x600 raw bytes ${raw}, baseline 784790`).toBeLessThan(784_790);
  });
});

describe('asteroid belt', () => {
  it('honours authored count, size band, radial band, and period', () => {
    const markup = belt(42, {
      count: 12,
      // Absolute units: the control boundary resolves percentages (CTL-017).
      innerRadius: 60,
      outerRadius: 90,
      baseRadius: 4,
      period: 77,
    });
    const document = parse(markup);
    const rotation = document.querySelector('[data-role="asteroid-belt"] animateTransform');

    // Baked form (GEN-026): rocks are silhouette subpaths, one per rock.
    const silhouettes = [...document.querySelectorAll('[data-role="asteroid-silhouettes"]')]
      .flatMap((path) => (path.getAttribute('d') ?? '').match(/M[^M]+/g) ?? []);

    expect(silhouettes).toHaveLength(12);
    expect(rotation?.getAttribute('dur')).toBe('77s');

    for (const subpath of silhouettes) {
      const vertices = [...subpath.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)]
        .map((m) => [Number(m[1]), Number(m[2])] as const);
      const cx = vertices.reduce((sum, [x]) => sum + x, 0) / vertices.length;
      const cy = vertices.reduce((sum, [, y]) => sum + y, 0) / vertices.length;
      const meanRadius = vertices
        .reduce((sum, [x, y]) => sum + Math.hypot(x - cx, y - cy), 0) / vertices.length;

      // The size band spans 40..180 percent of baseRadius 4 (GEN-009). The
      // silhouette's mean vertex radius is scale * ~0.85 (rocky unit shapes),
      // so the rendered bound is scale 1.6..7.2 times 0.73..0.99 unit radius.
      expect(meanRadius).toBeGreaterThanOrEqual(1.6 * 0.7);
      expect(meanRadius).toBeLessThanOrEqual(7.2 * 1.0);
    }
  });

  it('renders asteroid bodies on both serializations', () => {
    // Legacy no-config path keeps the historical <use>-per-rock form.
    expect(
      parse(belt()).querySelectorAll('use[data-role="asteroid"]').length,
    ).toBeGreaterThan(0);

    // The authored path is baked (GEN-026): silhouette subpaths are the rocks.
    const baked = parse(
      belt(42, {
        count: 12,
        innerRadius: 60,
        outerRadius: 90,
        baseRadius: 4,
        period: 77,
      }),
    );
    const subpaths = [...baked.querySelectorAll('[data-role="asteroid-silhouettes"]')]
      .flatMap((path) => (path.getAttribute('d') ?? '').match(/M/g) ?? []);

    expect(subpaths.length).toBe(12);
  });

  it('rotates as a single rigid group', () => {
    const document = parse(belt());
    const group = document.querySelector('g[data-role="asteroid-belt"]');
    const rotation = group?.querySelector('animateTransform');

    expect(rotation?.getAttribute('type')).toBe('rotate');
    expect(rotation?.getAttribute('repeatCount')).toBe('indefinite');
  });

  it('places every asteroid inside the rotating group', () => {
    const document = parse(belt());

    for (const asteroid of document.querySelectorAll('use[data-role="asteroid"]')) {
      expect(asteroid.closest('g[data-role="asteroid-belt"]')).not.toBeNull();
    }

    // Baked form: every cluster sits inside the rotating belt group too.
    const baked = parse(
      belt(42, { count: 12, innerRadius: 60, outerRadius: 90, baseRadius: 4, period: 77 }),
    );
    const clusters = [...baked.querySelectorAll('[data-role="asteroid-cluster"]')];

    expect(clusters.length).toBeGreaterThan(0);
    for (const cluster of clusters) {
      expect(cluster.closest('g[data-role="asteroid-belt"]')).not.toBeNull();
    }
  });

  it('produces a structurally sound fragment with resolved references', () => {
    const report = inspectStructure(
      `<svg xmlns="http://www.w3.org/2000/svg">${belt()}</svg>`,
    );

    expect(report.violations).toEqual([]);
  });
});

describe('comets', () => {
  it('renders at least one comet', () => {
    expect(parse(comets()).querySelectorAll('g[data-role="comet"]').length).toBeGreaterThan(
      0,
    );
  });

  it('crosses the full scene from off-screen to off-screen', () => {
    const path = parse(comets())
      .querySelector('g[data-role="comet"] animateMotion')
      ?.getAttribute('path');
    const numbers = (path?.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

    expect(numbers[0]).toBeLessThan(0);
    expect(numbers[2]).toBeGreaterThan(300);
  });

  it('aligns each comet to its direction of travel', () => {
    expect(
      parse(comets())
        .querySelector('g[data-role="comet"] animateMotion')
        ?.getAttribute('rotate'),
    ).toBe('auto');
  });

  it('renders a head and a tail per comet', () => {
    const comet = parse(comets()).querySelector('g[data-role="comet"]');

    expect(comet?.querySelector('[data-role="comet-head"]')).not.toBeNull();
    expect(comet?.querySelector('[data-role="comet-tail"]')).not.toBeNull();
  });

  it('produces a structurally sound fragment with resolved references', () => {
    const report = inspectStructure(
      `<svg xmlns="http://www.w3.org/2000/svg">${comets()}</svg>`,
    );

    expect(report.violations).toEqual([]);
  });
});

describe('ambient determinism', () => {
  it('renders identical ambient markup for a repeated seed', () => {
    expect(background(300, 300, 7)).toBe(background(300, 300, 7));
    expect(belt(7)).toBe(belt(7));
    expect(comets(7)).toBe(comets(7));
  });

  it('varies ambient markup across seeds', () => {
    expect(background(300, 300, 7)).not.toBe(background(300, 300, 8));
    expect(belt(7)).not.toBe(belt(8));
  });
});
