import { describe, expect, it } from 'vitest';
import { parseHTML } from 'linkedom';
import { inspectStructure } from '../helpers/structure';
import { orbitPath } from '../../ts/generator/orbit';
import { generateScene, type SceneParams } from '../../ts/generator/scene';

/**
 * Task 3.3 (QLT-005): reduced-motion suppression via an internal style rule.
 *
 * E-054 established that CSS cannot stop a running SMIL animation — putting
 * `display:none` on `<animateMotion>` leaves it running. Re-measured before
 * implementing, along with `animation-play-state` and a transform override:
 * all three failed. The only technique that suppressed motion was hiding the
 * ANIMATED SUBTREE and revealing a static twin in its place.
 *
 * So every animated element is emitted twice: an `.ss-animated` variant and
 * an `.ss-static` twin resting on the same orbit, toggled by one media query.
 */

const PARAMS: SceneParams = {
  canvas: { width: 300, height: 300 },
  planets: [
    { size: 10, distance: 120, moon: { size: 3, distance: 25 } },
    { size: 6, distance: 55, moon: false },
  ],
  palette: 'Aurora',
};

const SCENE = generateScene(PARAMS, 42);

function parse(svg: string): Document {
  const { document } = parseHTML(`<html><body>${svg}</body></html>`);

  return document as unknown as Document;
}

describe('reduced-motion style rule', () => {
  const document = parse(SCENE);

  it('emits an internal style element', () => {
    expect(document.querySelectorAll('style').length).toBeGreaterThan(0);
  });

  it('declares a prefers-reduced-motion media query', () => {
    const css = [...document.querySelectorAll('style')]
      .map((element) => element.textContent ?? '')
      .join('');

    expect(css).toContain('prefers-reduced-motion');
    expect(css).toContain('reduce');
  });

  it('hides the static twins by default', () => {
    const css = document.querySelector('style')?.textContent ?? '';

    expect(css).toMatch(/\.ss-static\s*\{[^}]*display\s*:\s*none/);
  });

  it('swaps the variants inside the media query', () => {
    const css = document.querySelector('style')?.textContent ?? '';
    const query = css.slice(css.indexOf('@media'));

    expect(query).toMatch(/\.ss-animated\s*\{[^}]*display\s*:\s*none/);
    expect(query).toMatch(/\.ss-static\s*\{[^}]*display\s*:\s*inline/);
  });

  it('does not rely on styling defined outside the document', () => {
    expect(document.querySelectorAll('link')).toHaveLength(0);
    expect(SCENE).not.toContain('@import');
  });
});

describe('static twins preserve the composition', () => {
  const document = parse(SCENE);

  it('emits a static twin for every animated planet', () => {
    expect(document.querySelectorAll('[data-role="planet"].ss-animated')).toHaveLength(
      PARAMS.planets.length,
    );
    expect(document.querySelectorAll('[data-role="planet"].ss-static')).toHaveLength(
      PARAMS.planets.length,
    );
  });

  it('emits a static twin for the asteroid belt', () => {
    expect(
      document.querySelectorAll('[data-role="asteroid-belt"].ss-static').length,
    ).toBe(1);
  });

  it('emits a static twin for every comet', () => {
    const animated = document.querySelectorAll('[data-role="comet"].ss-animated').length;
    const still = document.querySelectorAll('[data-role="comet"].ss-static').length;

    expect(animated).toBeGreaterThan(0);
    expect(still).toBe(animated);
  });

  it('rests each planet twin on a point of its own orbit', () => {
    const twins = [...document.querySelectorAll('[data-role="planet"].ss-static')];

    twins.forEach((twin, index) => {
      const transform = twin.getAttribute('transform') ?? '';
      const [x, y] = (transform.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
      const path = orbitPath(PARAMS.canvas, PARAMS.planets[index]!.distance);
      const start = (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

      // The orbit path starts at (cx - left, cy), which is the t=0 rest point.
      expect(x, `planet ${index} twin x`).toBeCloseTo(start[0]!, 6);
      expect(y, `planet ${index} twin y`).toBeCloseTo(start[1]!, 6);
    });
  });

  it('carries no animation element inside a static twin', () => {
    for (const twin of document.querySelectorAll('.ss-static')) {
      expect(twin.querySelectorAll('animateMotion, animateTransform')).toHaveLength(0);
    }
  });

  it('shares body markup by reference rather than duplicating it', () => {
    // Twins reference the same defs content, so the file does not double.
    expect(document.querySelectorAll('use[href^="#"]').length).toBeGreaterThan(0);
  });
});

describe('reduced-motion handling stays self-contained', () => {
  it('keeps the scene well-formed with resolved references', () => {
    for (let seed = 0; seed < 6; seed += 1) {
      expect(inspectStructure(generateScene(PARAMS, seed)).violations, `seed ${seed}`).toEqual(
        [],
      );
    }
  });

  it('introduces no script element', () => {
    expect(parse(SCENE).querySelectorAll('script')).toHaveLength(0);
  });

  it('remains byte-identical for a repeated seed', () => {
    expect(generateScene(PARAMS, 5)).toBe(generateScene(PARAMS, 5));
  });

  it('still renders twins in a zero-planet scene without error', () => {
    const empty = generateScene({ ...PARAMS, planets: [] }, 42);

    expect(inspectStructure(empty).violations).toEqual([]);
    expect(parse(empty).querySelectorAll('[data-role="planet"]')).toHaveLength(0);
  });
});
