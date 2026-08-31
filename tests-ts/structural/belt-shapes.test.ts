import { describe, expect, it } from 'vitest';
import { parseHTML } from 'linkedom';
import { inspectStructure } from '../helpers/structure';
import { createIdGenerator } from '../../ts/generator/ids';
import { createPrng } from '../../ts/generator/prng';
import { paletteByName } from '../../ts/generator/palette';
import {
  BELT_SHAPES,
  BELT_TYPES,
  renderAsteroidBelt,
  type AsteroidBeltConfig,
  type BeltType,
} from '../../ts/generator/ambient';

/**
 * GEN-019 / GEN-026: the belt renders from per-type shape sets and a per-type
 * material family, serialized in BAKED form — opacity clusters of three tone
 * paths whose subpaths are rocks — rather than as `<use>`-instanced symbols.
 *
 * The PRNG discipline is asserted structurally rather than by counting calls:
 * if the number of draws per rock changed with type, every rock after the
 * first would land somewhere else, so identical placement across types is the
 * observable consequence of an unchanged draw count. Under the baked form the
 * observable is subpath VERTEX data instead of a transform attribute, and
 * placement equality is asserted on centroids, which are shape-independent
 * only for matching shape sets — so cross-type equality is asserted on the
 * rock's baked cluster membership (opacity) and count instead, plus centroid
 * equality within a type.
 */

const PALETTE = paletteByName('Aurora');
const CANVAS = { width: 300, height: 300 };

const BASE: Omit<AsteroidBeltConfig, 'type'> = {
  count: 40,
  // Absolute units: the generator receives resolved values (CTL-017).
  innerRadius: 60,
  outerRadius: 105,
  baseRadius: 3,
  period: 90,
};

function belt(config?: Partial<AsteroidBeltConfig> | false, seed = 42): string {
  return renderAsteroidBelt(
    CANVAS,
    PALETTE,
    createIdGenerator(seed),
    createPrng(seed),
    config === false || config === undefined
      ? undefined
      : ({ ...BASE, ...config } as AsteroidBeltConfig),
  );
}

function parse(markup: string): Document {
  const { document } = parseHTML(
    `<html><body><svg xmlns="http://www.w3.org/2000/svg">${markup}</svg></body></html>`,
  );

  return document as unknown as Document;
}

const TONES = ['silhouettes', 'highlights', 'shadows'] as const;
type Tone = (typeof TONES)[number];

interface Cluster {
  opacity: string;
  paths: Record<Tone, Element | null>;
}

function clustersOf(markup: string): Cluster[] {
  return [...parse(markup).querySelectorAll('[data-role="asteroid-cluster"]')].map(
    (cluster) => ({
      opacity: cluster.getAttribute('opacity') ?? '',
      paths: {
        silhouettes: cluster.querySelector('[data-role="asteroid-silhouettes"]'),
        highlights: cluster.querySelector('[data-role="asteroid-highlights"]'),
        shadows: cluster.querySelector('[data-role="asteroid-shadows"]'),
      },
    }),
  );
}

function subpathsOf(path: Element | null): string[] {
  return (path?.getAttribute('d') ?? '').match(/M[^M]+/g) ?? [];
}

/** Every silhouette subpath across all clusters — one per rock. */
function rockSilhouettes(markup: string): string[] {
  return clustersOf(markup).flatMap((cluster) => subpathsOf(cluster.paths.silhouettes));
}

function rockCount(markup: string): number {
  return rockSilhouettes(markup).length;
}

/** A rock's silhouette centroid: its baked position, shape factored out. */
function centroidOf(subpath: string): [number, number] {
  const vertices = [...subpath.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);
  const x = vertices.reduce((sum, [vx]) => sum + (vx ?? 0), 0) / vertices.length;
  const y = vertices.reduce((sum, [, vy]) => sum + (vy ?? 0), 0) / vertices.length;

  return [x, y];
}

/**
 * A rock's vertex count is decided by which silhouette shape it drew, so the
 * per-rock vertex-count sequence is a shape-selection fingerprint.
 */
function vertexCounts(markup: string): number[] {
  return rockSilhouettes(markup).map(
    (subpath) => [...subpath.matchAll(/[ML]/g)].length,
  );
}

describe('baked belt structure (GEN-026)', () => {
  it('renders every rock as a subpath triple inside an opacity cluster', () => {
    const clusters = clustersOf(belt({ type: 'rocky' }));

    expect(clusters.length).toBeGreaterThan(0);

    let total = 0;

    for (const cluster of clusters) {
      const silhouettes = subpathsOf(cluster.paths.silhouettes);

      expect(silhouettes.length).toBeGreaterThan(0);
      // Tone paths pair one-to-one: each rock contributes one subpath to each.
      expect(subpathsOf(cluster.paths.highlights)).toHaveLength(silhouettes.length);
      expect(subpathsOf(cluster.paths.shadows)).toHaveLength(silhouettes.length);
      total += silhouettes.length;
    }

    expect(total).toBe(BASE.count);
  });

  it('stamps the rendered count and keeps it honest', () => {
    const markup = belt({ type: 'rocky' });
    const stamped = /data-role="asteroid-belt" data-count="(\d+)"/.exec(markup);

    expect(stamped).not.toBeNull();
    expect(Number(stamped![1])).toBe(rockCount(markup));
  });

  it('keeps the tone paint order silhouette, highlight, shadow in every cluster', () => {
    for (const cluster of parse(belt({ type: 'icy' })).querySelectorAll(
      '[data-role="asteroid-cluster"]',
    )) {
      const roles = [...cluster.children].map((child) => child.getAttribute('data-role'));

      expect(roles).toEqual([
        'asteroid-silhouettes',
        'asteroid-highlights',
        'asteroid-shadows',
      ]);
    }
  });

  it('preserves per-rock opacity variation across clusters', () => {
    const clusters = clustersOf(belt({ type: 'rocky', count: 300 }));
    const opacities = clusters.map((cluster) => Number(cluster.opacity));

    // The seeded draw spans 0.75..1.00 in steps of 0.01; a populous belt must
    // realise many distinct values, or variation was flattened.
    expect(new Set(opacities).size).toBeGreaterThan(10);
    for (const opacity of opacities) {
      expect(opacity).toBeGreaterThanOrEqual(0.75);
      expect(opacity).toBeLessThanOrEqual(1);
    }
  });
});

describe('belt shape sets', () => {
  it('exposes the three authored belt types', () => {
    expect([...BELT_TYPES]).toEqual(['rocky', 'icy', 'metallic']);
  });

  for (const type of ['rocky', 'icy', 'metallic'] as const) {
    it(`draws from more than two distinct silhouettes for the ${type} belt`, () => {
      expect(BELT_SHAPES[type].length).toBeGreaterThan(2);

      // Distinct shapes have distinct vertex-count-and-geometry signatures; a
      // populous belt must realise more than two distinct silhouette shapes,
      // normalised to their centroid so position and rotation drop out of the
      // comparison only via count (rotation preserves vertex count).
      const counts = new Set(vertexCounts(belt({ type, count: 300 })));

      expect(counts.size).toBeGreaterThanOrEqual(
        new Set(BELT_SHAPES[type].map((shape) => shape.silhouette.trim().split(/\s+/).length))
          .size,
      );
    });

    it(`renders exactly the authored count of ${type} rocks`, () => {
      expect(rockCount(belt({ type }))).toBe(BASE.count);
    });
  }

  it('bakes each rock\'s seeded rotation into its vertices', () => {
    // Two rocks that drew the same shape must not be mere translations of one
    // another: the seeded per-rock rotation orients each one differently.
    // Normalise every silhouette by its centroid and compare vertex offsets;
    // a generator that dropped the rotation would emit congruent offset sets
    // for same-shape same-scale rocks. Mutation MUT4 (rotation not baked)
    // survived the suite before this test existed.
    const offsets = rockSilhouettes(belt({ type: 'metallic', count: 200 })).map((subpath) => {
      const vertices = [...subpath.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => [
        Number(m[1]),
        Number(m[2]),
      ]);
      const cx = vertices.reduce((sum, [x]) => sum + (x ?? 0), 0) / vertices.length;
      const cy = vertices.reduce((sum, [, y]) => sum + (y ?? 0), 0) / vertices.length;

      // Direction of the first vertex from the centroid, quantised to degrees:
      // rotation-free baking collapses this to a handful of values (one per
      // shape), while baked rotation spreads it across the circle.
      const first = vertices[0]!;

      return Math.round(
        (Math.atan2((first[1] ?? 0) - cy, (first[0] ?? 0) - cx) * 180) / Math.PI,
      );
    });

    expect(new Set(offsets).size).toBeGreaterThan(20);
  });

  it('gives different types different silhouette vertex signatures', () => {
    // rocky is pentagon-heavy (5-6 vertices), icy 7-8, metallic 4-6; the
    // realised vertex-count multiset must differ across types under one seed.
    const signature = (type: BeltType): string =>
      JSON.stringify(vertexCounts(belt({ type, count: 300 })));

    expect(signature('icy')).not.toBe(signature('rocky'));
    expect(signature('metallic')).not.toBe(signature('rocky'));
    expect(signature('metallic')).not.toBe(signature('icy'));
  });
});

describe('belt material treatment', () => {
  const familyOf = (markup: string) => {
    const cluster = clustersOf(markup)[0]!;

    return {
      silhouette: cluster.paths.silhouettes?.getAttribute('fill'),
      highlight: cluster.paths.highlights?.getAttribute('fill'),
      shadow: cluster.paths.shadows?.getAttribute('fill'),
    };
  };

  it('assigns each belt type a distinct material paint family', () => {
    const families = (['rocky', 'icy', 'metallic'] as const).map((type) =>
      JSON.stringify(familyOf(belt({ type }))),
    );

    expect(new Set(families).size).toBe(families.length);
  });

  it('keeps the silhouette stroked and the overlays fill-only', () => {
    const cluster = clustersOf(belt({ type: 'rocky' }))[0]!;

    expect(cluster.paths.silhouettes?.getAttribute('stroke-width')).toBe('0.15');
    expect(cluster.paths.highlights?.getAttribute('stroke')).toBeNull();
    expect(cluster.paths.shadows?.getAttribute('stroke')).toBeNull();
  });

  it('still derives the material family from the palette', () => {
    expect(familyOf(belt({ type: 'rocky' }))).not.toEqual(
      familyOf(
        renderAsteroidBelt(
          CANVAS,
          paletteByName('Ember'),
          createIdGenerator(42),
          createPrng(42),
          { ...BASE, type: 'rocky' } as AsteroidBeltConfig,
        ),
      ),
    );
  });
});

describe('belt PRNG discipline', () => {
  it('draws the same number of values per rock whatever the type', () => {
    // If the per-rock draw count varied with type, every rock after the first
    // would land elsewhere. Centroids differ across types because the SHAPES
    // differ, but the draw-sequence-derived observables that are shape-free —
    // cluster membership (opacity) and rock count per cluster — must match.
    const clusterShape = (type: BeltType): string =>
      JSON.stringify(
        clustersOf(belt({ type })).map((cluster) => [
          cluster.opacity,
          subpathsOf(cluster.paths.silhouettes).length,
        ]),
      );

    expect(clusterShape('icy')).toBe(clusterShape('rocky'));
    expect(clusterShape('metallic')).toBe(clusterShape('rocky'));
  });

  it('keeps rock placement identical across types', () => {
    // Same draw sequence means same translate origin per rock. The centroid
    // carries a shape-dependent offset from that origin, but the offset is
    // bounded by the rock's scale; across the whole belt, per-rock centroids
    // of two types must agree within that bound.
    const centroids = (type: BeltType): Array<[number, number]> =>
      rockSilhouettes(belt({ type })).map(centroidOf);

    const rocky = centroids('rocky');
    const icy = centroids('icy');

    expect(icy).toHaveLength(rocky.length);

    // Max rock radius: baseRadius 3 * 1.8 multiplier ceiling.
    const bound = BASE.baseRadius * 1.8 * 2;

    for (let index = 0; index < rocky.length; index += 1) {
      const [rx, ry] = rocky[index]!;
      const [ix, iy] = icy[index]!;

      expect(Math.hypot(rx - ix, ry - iy)).toBeLessThan(bound);
    }
  });

  it('renders byte-identical belts for a repeated type and seed', () => {
    expect(belt({ type: 'icy' }, 7)).toBe(belt({ type: 'icy' }, 7));
  });
});

describe('omitted belt type', () => {
  it('applies the documented rocky default when the field is absent', () => {
    const withoutType = renderAsteroidBelt(
      CANVAS,
      PALETTE,
      createIdGenerator(42),
      createPrng(42),
      { ...BASE } as AsteroidBeltConfig,
    );

    expect(withoutType).toBe(belt({ type: 'rocky' }));
  });

  it('keeps the legacy no-config path on the retired use-per-rock form', () => {
    const legacy = belt(false);

    // Direct generator callers that omit the belt keep the historical
    // serialization: symbols in defs, one <use> per rock.
    expect(
      parse(legacy).querySelectorAll('use[data-role="asteroid"]').length,
    ).toBeGreaterThan(0);
    expect(
      parse(legacy).querySelectorAll('defs g[data-role="asteroid-symbol"]').length,
    ).toBeGreaterThan(2);
    expect(
      inspectStructure(`<svg xmlns="http://www.w3.org/2000/svg">${legacy}</svg>`).violations,
    ).toEqual([]);
  });
});

describe('belt motion stays scriptless SMIL', () => {
  for (const type of ['rocky', 'icy', 'metallic'] as const) {
    it(`emits no script and animates the ${type} belt with SMIL`, () => {
      const markup = belt({ type });
      const document = parse(markup);
      const rotation = document.querySelector('[data-role="asteroid-belt"] animateTransform');

      expect(document.querySelectorAll('script')).toHaveLength(0);
      expect(markup.toLowerCase()).not.toContain('javascript:');
      expect(rotation?.getAttribute('type')).toBe('rotate');
      expect(rotation?.getAttribute('repeatCount')).toBe('indefinite');
      expect(rotation?.getAttribute('dur')).toBe('90s');
    });
  }

  it('emits no inline event handler on any belt element', () => {
    const handlers: string[] = [];

    for (const element of parse(belt({ type: 'metallic' })).querySelectorAll('*')) {
      for (const attribute of element.attributes) {
        if (attribute.name.startsWith('on')) {
          handlers.push(attribute.name);
        }
      }
    }

    expect(handlers).toEqual([]);
  });

  it('stays structurally well-formed for every type', () => {
    for (const type of ['rocky', 'icy', 'metallic'] as const) {
      const report = inspectStructure(
        `<svg xmlns="http://www.w3.org/2000/svg">${belt({ type })}</svg>`,
      );

      expect(report.violations, type).toEqual([]);
    }
  });
});
