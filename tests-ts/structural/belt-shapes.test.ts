import { describe, expect, it } from 'vitest';
import { parseHTML } from 'linkedom';
import { inspectStructure } from '../helpers/structure';
import { createIdGenerator } from '../../ts/generator/ids';
import { createPrng } from '../../ts/generator/prng';
import { paletteByName } from '../../ts/generator/palette';
import {
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
  return [...parse(markup).querySelectorAll('defs [id]')].map(
    (element) => element.getAttribute('id') as string,
  );
}

function asteroids(markup: string): Element[] {
  return [...parse(markup).querySelectorAll('use[data-role="asteroid"]')];
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

describe('belt type colour treatment', () => {
  it('renders a different rock fill for each type at identical params and seed', () => {
    const fills = (['rocky', 'icy', 'metallic'] as const).map((type) => {
      const first = asteroids(belt({ type }))[0];

      return first?.getAttribute('fill') as string;
    });

    expect(new Set(fills).size).toBe(fills.length);
  });

  it('renders a different rock stroke for each type', () => {
    const strokes = (['rocky', 'icy', 'metallic'] as const).map((type) => {
      const first = asteroids(belt({ type }))[0];

      return first?.getAttribute('stroke') as string;
    });

    expect(new Set(strokes).size).toBe(strokes.length);
  });

  it('still derives the rock tone from the palette', () => {
    const aurora = asteroids(belt({ type: 'rocky' }))[0]?.getAttribute('fill');
    const ember = asteroids(
      renderAsteroidBelt(
        CANVAS,
        paletteByName('Ember'),
        createIdGenerator(42),
        createPrng(42),
        { ...BASE, type: 'rocky' } as AsteroidBeltConfig,
      ),
    )[0]?.getAttribute('fill');

    expect(aurora).not.toBe(ember);
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
