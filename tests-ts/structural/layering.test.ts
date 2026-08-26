import { describe, expect, it } from 'vitest';
import { parseHTML } from 'linkedom';
import { inspectStructure } from '../helpers/structure';
import { generateScene, type SceneParams } from '../../ts/generator/scene';

/**
 * Task 2.10 (GEN-004): scene layering order.
 *
 * SVG has no z-index, so depth IS document order. Each assertion compares the
 * position of the first element of each layer within the flattened element
 * list, which is exactly what determines what paints over what.
 */

const PARAMS: SceneParams = {
  canvas: { width: 300, height: 300 },
  planets: [
    { size: 10, distance: 120, moon: { size: 3, distance: 25 } },
    { size: 6, distance: 55, moon: false },
  ],
  palette: 'Aurora',
};

/** Index of the first element matching `selector` in document order. */
function firstIndex(elements: Element[], selector: string): number {
  const index = elements.findIndex((element) => element.matches(selector));

  if (index < 0) {
    throw new Error(`no element matched ${selector}`);
  }

  return index;
}

function layerOrder(svg: string): Record<string, number> {
  const { document } = parseHTML(`<html><body>${svg}</body></html>`);
  const elements = [...document.querySelectorAll('*')] as unknown as Element[];

  return {
    background: firstIndex(elements, '[data-role="nebula"]'),
    belt: firstIndex(elements, '[data-role="asteroid-belt"]'),
    orbit: firstIndex(elements, '[data-role="orbit"]'),
    sun: firstIndex(elements, '[data-sun-body]'),
    planet: firstIndex(elements, '[data-role="planet"]'),
    comet: firstIndex(elements, '[data-role="comet"]'),
  };
}

describe('scene layering order', () => {
  const order = layerOrder(generateScene(PARAMS, 42));

  it('paints the background before the asteroid belt', () => {
    expect(order.background).toBeLessThan(order.belt!);
  });

  it('paints the asteroid belt before the orbit paths', () => {
    expect(order.belt).toBeLessThan(order.orbit!);
  });

  it('paints the orbit paths before the sun', () => {
    expect(order.orbit).toBeLessThan(order.sun!);
  });

  it('paints the sun before the planets', () => {
    expect(order.sun).toBeLessThan(order.planet!);
  });

  it('paints the planets before the comets', () => {
    expect(order.planet).toBeLessThan(order.comet!);
  });

  it('holds the full ordering as one monotonic sequence', () => {
    const sequence = [
      order.background,
      order.belt,
      order.orbit,
      order.sun,
      order.planet,
      order.comet,
    ];

    expect(sequence).toEqual([...sequence].sort((a, b) => a! - b!));
  });

  it('holds the ordering across seeds', () => {
    for (let seed = 0; seed < 12; seed += 1) {
      const seeded = layerOrder(generateScene(PARAMS, seed));

      expect(seeded.background, `seed ${seed}`).toBeLessThan(seeded.belt!);
      expect(seeded.belt, `seed ${seed}`).toBeLessThan(seeded.orbit!);
      expect(seeded.orbit, `seed ${seed}`).toBeLessThan(seeded.sun!);
      expect(seeded.sun, `seed ${seed}`).toBeLessThan(seeded.planet!);
      expect(seeded.planet, `seed ${seed}`).toBeLessThan(seeded.comet!);
    }
  });
});

describe('complete scene integrity', () => {
  it('renders every layer in a full scene', () => {
    const { document } = parseHTML(
      `<html><body>${generateScene(PARAMS, 42)}</body></html>`,
    );

    expect(document.querySelectorAll('[data-role="nebula"]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-role="star"]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-role="asteroid"]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-role="orbit"]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-role="planet"].ss-animated')).toHaveLength(2);
    expect(document.querySelectorAll('[data-role="planet"].ss-static')).toHaveLength(2);
    expect(document.querySelectorAll('[data-role="comet"]').length).toBeGreaterThan(0);
  });

  it('keeps the full scene well-formed with unique ids and resolved references', () => {
    for (let seed = 0; seed < 8; seed += 1) {
      const report = inspectStructure(generateScene(PARAMS, seed));

      expect(report.violations, `seed ${seed}`).toEqual([]);
    }
  });

  it('remains byte-identical for a repeated seed with ambient elements present', () => {
    expect(generateScene(PARAMS, 5)).toBe(generateScene(PARAMS, 5));
  });
});
