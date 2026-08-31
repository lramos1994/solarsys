import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { parseHTML } from 'linkedom';
import { inspectStructure } from '../helpers/structure';
import { createIdGenerator } from '../../ts/generator/ids';
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

    expect(digest).toBe('57a65564a6634b87ad510fbcae8d68b6adadbcba1cf6c0591a1a212a4270362a');
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

  it('produces a structurally sound fragment', () => {
    const report = inspectStructure(
      `<svg xmlns="http://www.w3.org/2000/svg">${background()}</svg>`,
    );

    expect(report.violations).toEqual([]);
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
