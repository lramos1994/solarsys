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
 * Task 2.1/2.2 (GEN-019): the belt renders from a per-type shape set of more
 * than two symbols, and the type also selects the rock colour treatment.
 *
 * The PRNG discipline is asserted structurally rather than by counting calls:
 * if the number of draws per rock changed with type, every rock after the
 * first would land somewhere else, so identical placement across types is the
 * observable consequence of an unchanged draw count.
 */

const PALETTE = paletteByName('Aurora');
const CANVAS = { width: 300, height: 300 };

const BASE: Omit<AsteroidBeltConfig, 'type'> = {
  count: 40,
  innerRadiusPercent: 40,
  outerRadiusPercent: 70,
  size: 3,
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

function symbolIds(markup: string): string[] {
  return [...parse(markup).querySelectorAll('defs g[data-role="asteroid-symbol"]')].map(
    (element) => element.getAttribute('id') as string,
  );
}

function asteroids(markup: string): Element[] {
  return [...parse(markup).querySelectorAll('use[data-role="asteroid"]')];
}

/** The emitted silhouette GEOMETRY, keyed by symbol id. */
function symbolGeometry(markup: string): Map<string, string> {
  const geometry = new Map<string, string>();

  for (const symbol of parse(markup).querySelectorAll('defs g[data-role="asteroid-symbol"]')) {
    const silhouette = symbol.querySelector('[data-role="asteroid-silhouette"]');

    geometry.set(
      symbol.getAttribute('id') as string,
      silhouette?.getAttribute('points') as string,
    );
  }

  return geometry;
}

/** The silhouette geometry actually referenced by each rendered rock. */
function renderedGeometry(markup: string): string[] {
  const geometry = symbolGeometry(markup);

  return asteroids(markup).map((rock) => {
    const href = (rock.getAttribute('href') ?? '').replace(/^#/, '');

    return geometry.get(href) as string;
  });
}

function asteroidSymbols(markup: string): Element[] {
  return [...parse(markup).querySelectorAll('defs g[data-role="asteroid-symbol"]')];
}

function symbolParts(symbol: Element, role: string): Element[] {
  return [...symbol.querySelectorAll(`[data-role="${role}"]`)];
}

describe('belt shape sets', () => {
  it('exposes the three authored belt types', () => {
    expect([...BELT_TYPES]).toEqual(['rocky', 'icy', 'metallic']);
  });

  for (const type of ['rocky', 'icy', 'metallic'] as const) {
    it(`defines more than two distinct symbols for the ${type} belt`, () => {
      const markup = belt({ type });
      const ids = symbolIds(markup);

      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBeGreaterThan(2);
    });

    it(`references only that type's symbols from every ${type} rock`, () => {
      const markup = belt({ type });
      const ids = new Set(symbolIds(markup));
      const rocks = asteroids(markup);

      expect(rocks.length).toBe(BASE.count);

      for (const rock of rocks) {
        const href = (rock.getAttribute('href') ?? '').replace(/^#/, '');

        expect(ids).toContain(href);
      }
    });

    it(`uses every ${type} symbol at least once across a populous belt`, () => {
      const markup = belt({ type, count: 300 });
      const used = new Set(
        asteroids(markup).map((rock) => (rock.getAttribute('href') ?? '').replace(/^#/, '')),
      );

      expect(used.size).toBe(symbolIds(markup).length);
    });
  }
});

describe('belt composite symbols', () => {
  for (const type of ['rocky', 'icy', 'metallic'] as const) {
    it(`emits composite ${type} asteroid symbols with silhouette, highlight, and shadow`, () => {
      const symbols = asteroidSymbols(belt({ type }));

      expect(symbols).toHaveLength(BELT_SHAPES[type].length);

      for (const symbol of symbols) {
        expect(symbolParts(symbol, 'asteroid-silhouette')).toHaveLength(1);
        expect(symbolParts(symbol, 'asteroid-highlight')).toHaveLength(1);
        expect(symbolParts(symbol, 'asteroid-shadow')).toHaveLength(1);
      }
    });
  }

  it('assigns each belt type a distinct material paint family', () => {
    const paintFamilies = (['rocky', 'icy', 'metallic'] as const).map((type) =>
      asteroidSymbols(belt({ type })).map((symbol) => ({
        silhouette: symbolParts(symbol, 'asteroid-silhouette')[0]?.getAttribute('fill'),
        highlight: symbolParts(symbol, 'asteroid-highlight')[0]?.getAttribute('fill'),
        shadow: symbolParts(symbol, 'asteroid-shadow')[0]?.getAttribute('fill'),
      })),
    );

    expect(new Set(paintFamilies.map((family) => JSON.stringify(family))).size).toBe(
      paintFamilies.length,
    );
  });

  it('emits only the authored silhouette shapes for each type', () => {
    for (const type of ['rocky', 'icy', 'metallic'] as const) {
      expect([...symbolGeometry(belt({ type })).values()]).toEqual(
        BELT_SHAPES[type].map((shape) => shape.silhouette),
      );
    }
  });

  it('shares no silhouette between any two belt types', () => {
    const points = (type: BeltType): Set<string> =>
      new Set(symbolGeometry(belt({ type })).values());

    const rocky = points('rocky');
    const icy = points('icy');
    const metallic = points('metallic');

    for (const [left, right, label] of [
      [rocky, icy, 'rocky/icy'],
      [rocky, metallic, 'rocky/metallic'],
      [icy, metallic, 'icy/metallic'],
    ] as const) {
      expect([...left].filter((shape) => right.has(shape)), label).toEqual([]);
    }
  });

  it('renders each rock with its own type silhouette across a populous belt', () => {
    const rocky = renderedGeometry(belt({ type: 'rocky', count: 300 }));
    const icy = renderedGeometry(belt({ type: 'icy', count: 300 }));
    const metallic = renderedGeometry(belt({ type: 'metallic', count: 300 }));

    expect(rocky).not.toContain(undefined);
    expect(icy).not.toEqual(rocky);
    expect(metallic).not.toEqual(rocky);
    expect(metallic).not.toEqual(icy);
  });
});

describe('belt symbol material treatment', () => {
  it('renders a different material paint family for each type', () => {
    const families = (['rocky', 'icy', 'metallic'] as const).map((type) => {
      const symbol = asteroidSymbols(belt({ type }))[0];

      return {
        silhouette: symbolParts(symbol!, 'asteroid-silhouette')[0]?.getAttribute('fill'),
        highlight: symbolParts(symbol!, 'asteroid-highlight')[0]?.getAttribute('fill'),
        shadow: symbolParts(symbol!, 'asteroid-shadow')[0]?.getAttribute('fill'),
      };
    });

    expect(new Set(families.map((family) => JSON.stringify(family))).size).toBe(families.length);
  });

  it('still derives the material family from the palette', () => {
    const materialFamily = (markup: string) => {
      const symbol = asteroidSymbols(markup)[0];

      return {
        silhouette: symbolParts(symbol!, 'asteroid-silhouette')[0]?.getAttribute('fill'),
        highlight: symbolParts(symbol!, 'asteroid-highlight')[0]?.getAttribute('fill'),
        shadow: symbolParts(symbol!, 'asteroid-shadow')[0]?.getAttribute('fill'),
      };
    };

    expect(materialFamily(belt({ type: 'rocky' }))).not.toEqual(
      materialFamily(
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
    const placement = (type: BeltType): string[] =>
      asteroids(belt({ type })).map((rock) => rock.getAttribute('transform') as string);

    expect(placement('icy')).toEqual(placement('rocky'));
    expect(placement('metallic')).toEqual(placement('rocky'));
  });

  it('keeps rock opacity identical across types', () => {
    const opacity = (type: BeltType): string[] =>
      asteroids(belt({ type })).map((rock) => rock.getAttribute('opacity') as string);

    expect(opacity('icy')).toEqual(opacity('rocky'));
    expect(opacity('metallic')).toEqual(opacity('rocky'));
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

  it('applies the default on the legacy no-config path and stays well-formed', () => {
    const legacy = belt(false);

    expect(asteroids(legacy).length).toBeGreaterThan(0);
    expect(new Set(symbolIds(legacy)).size).toBeGreaterThan(2);
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

  it('resolves every symbol reference for every type', () => {
    for (const type of ['rocky', 'icy', 'metallic'] as const) {
      const report = inspectStructure(
        `<svg xmlns="http://www.w3.org/2000/svg">${belt({ type })}</svg>`,
      );

      expect(report.violations, type).toEqual([]);
    }
  });
});
