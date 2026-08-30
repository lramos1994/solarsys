import { describe, expect, it } from 'vitest';
import { parseHTML } from 'linkedom';
import { generateScene, type SceneParams } from '../../ts/generator/scene';

/**
 * Composition-level assertions for the assembled scene.
 *
 * The per-module tests verify fragments in isolation. These assert the
 * properties that only exist once the fragments are combined — in particular
 * that a moon really is nested inside the group its planet's animateMotion
 * drives, which the isolated moon test could not prove.
 */

const PARAMS: SceneParams = {
  canvas: { width: 300, height: 300 },
  planets: [
    { size: 10, distance: 100, moon: { size: 3, distance: 25 } },
    { size: 6, distance: 55, moon: false },
  ],
  palette: 'Aurora',
};

function parse(svg: string): Document {
  const { document } = parseHTML(`<html><body>${svg}</body></html>`);

  return document as unknown as Document;
}

describe('scene composition', () => {
  it('nests each moon inside its planet group', () => {
    const moonBody = parse(generateScene(PARAMS, 42)).querySelector(
      '[data-role="moon-body"]',
    );

    expect(moonBody?.closest('g[data-role="planet"]')).not.toBeNull();
  });

  it('drives that planet group with its own animateMotion', () => {
    const document = parse(generateScene(PARAMS, 42));
    const group = document
      .querySelector('[data-role="moon-body"]')
      ?.closest('g[data-role="planet"]');

    expect(group?.querySelector('animateMotion')).not.toBeNull();
  });

  it('gives the moon a motion path distinct from its planet motion path', () => {
    const document = parse(generateScene(PARAMS, 42));
    const references = [...document.querySelectorAll('mpath')].map((element) =>
      element.getAttribute('xlink:href'),
    );

    expect(new Set(references).size).toBe(references.length);
  });

  it('points every planet at the orbit that is actually rendered', () => {
    const document = parse(generateScene(PARAMS, 42));
    const orbitIds = [...document.querySelectorAll('path[data-role="orbit"]')].map(
      (element) => `#${element.getAttribute('id')}`,
    );
    // `:scope >` matters: a descendant selector would match the MOON's
    // animateMotion first, since it is nested inside the planet group. Every
    // planet group owns its animateMotion directly (the moon's lives inside a
    // nested `g[data-role="moon"]`), so this is the real planet selection.
    const planets = [...document.querySelectorAll('g[data-role="planet"]')];
    const planetRefs = planets.map((element) =>
      element
        .querySelector(':scope > animateMotion > mpath')
        ?.getAttribute('xlink:href'),
    );

    // Cardinality before the loop: the assertions below must actually run,
    // never silently skip because the planet selector matched nothing.
    expect(planetRefs).toHaveLength(PARAMS.planets.length);

    for (const reference of planetRefs) {
      expect(orbitIds).toContain(reference);
    }
  });

  it('renders one orbit per planet', () => {
    const document = parse(generateScene(PARAMS, 42));

    expect(document.querySelectorAll('path[data-role="orbit"]')).toHaveLength(
      PARAMS.planets.length,
    );
  });

  it('associates every orbit with its zero-based planet index', () => {
    const indices = [...parse(generateScene(PARAMS, 42)).querySelectorAll('path[data-role="orbit"]')]
      .map((orbit) => orbit.getAttribute('data-planet-index'));

    expect(indices).toEqual(['0', '1']);
  });

  it('honours explicit ring and belt presence instead of seed assignment', () => {
    const authored = {
      ...PARAMS,
      planets: PARAMS.planets.map((planet, index) => ({
        ...planet,
        ring: index === 0
          ? { type: 'Banded', sizePercent: 210, inclinationDegrees: 16 }
          : false,
      })),
      asteroidBelt: false,
    } as unknown as SceneParams;
    const document = parse(generateScene(authored, 42));

    expect(document.querySelectorAll('[data-role="ring-back"]')).toHaveLength(1);
    expect(document.querySelector('[data-role="asteroid-belt"]')).toBeNull();
  });

  it('omits moon markup for a planet configured without one', () => {
    const document = parse(
      generateScene(
        { ...PARAMS, planets: [{ size: 10, distance: 100, moon: false }] },
        42,
      ),
    );

    expect(document.querySelector('[data-role="moon-body"]')).toBeNull();
  });

  it('produces byte-identical output for a repeated seed', () => {
    expect(generateScene(PARAMS, 7)).toBe(generateScene(PARAMS, 7));
  });

  it('produces different output for a different seed', () => {
    expect(generateScene(PARAMS, 7)).not.toBe(generateScene(PARAMS, 8));
  });
});
