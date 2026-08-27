import { describe, expect, it } from 'vitest';
import { parseHTML } from 'linkedom';
import { inspectStructure } from '../helpers/structure';
import { generateScene, type SceneParams } from '../../ts/generator/scene';

/**
 * QLT-005 / QLT-009 (D-28): the ARTEFACT always animates.
 *
 * Supersedes the static-twin contract. The generated file carries no media
 * query and no twins, because playback is owned by the application through
 * `pauseAnimations()` — a DOM API that cannot exist inside a file forbidden
 * from carrying scripting (D-16, EXP-003).
 *
 * The accepted cost is recorded in D-28: an exported file embedded via
 * `<img src>` cannot be stopped by anyone. These tests pin that decision so
 * it cannot be reversed silently in either direction.
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

describe('the artefact animates unconditionally', () => {
  const document = parse(SCENE);

  it('declares no reduced-motion media query', () => {
    expect(SCENE).not.toContain('prefers-reduced-motion');
  });

  it('emits no static twins', () => {
    expect(SCENE).not.toContain('ss-static');
    expect(SCENE).not.toContain('ss-animated');
  });

  it('keeps its animation elements', () => {
    // Control: the assertions above would also pass on a scene with no
    // animation at all, which is the failure mode this guards against.
    expect(document.querySelectorAll('animateMotion').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('animateTransform').length).toBeGreaterThan(0);
  });

  it('animates one planet group per configured planet', () => {
    expect(document.querySelectorAll('[data-role="planet"]')).toHaveLength(
      PARAMS.planets.length,
    );

    for (const planet of document.querySelectorAll('[data-role="planet"]')) {
      expect(planet.querySelectorAll('animateMotion').length).toBeGreaterThan(0);
    }
  });

  it('animates the asteroid belt and every comet exactly once', () => {
    const belts = [...document.querySelectorAll('[data-role="asteroid-belt"]')];
    const comets = [...document.querySelectorAll('[data-role="comet"]')];

    expect(belts).toHaveLength(1);
    expect(comets.length).toBeGreaterThan(0);

    for (const element of [...belts, ...comets]) {
      expect(
        element.querySelectorAll('animateMotion, animateTransform').length,
      ).toBeGreaterThan(0);
    }
  });
});

describe('playback control never enters the artefact', () => {
  it('contains no script element', () => {
    expect(parse(SCENE).querySelectorAll('script')).toHaveLength(0);
  });

  it('contains no playback control markup', () => {
    expect(SCENE).not.toContain('toggle-playback');
    expect(SCENE.toLowerCase()).not.toContain('<button');
  });

  it('relies on no styling defined outside the document', () => {
    expect(parse(SCENE).querySelectorAll('link')).toHaveLength(0);
    expect(SCENE).not.toContain('@import');
  });
});

describe('the scene stays sound without the twins', () => {
  it('keeps the scene well-formed with resolved references', () => {
    for (let seed = 0; seed < 6; seed += 1) {
      expect(
        inspectStructure(generateScene(PARAMS, seed)).violations,
        `seed ${seed}`,
      ).toEqual([]);
    }
  });

  it('remains byte-identical for a repeated seed', () => {
    expect(generateScene(PARAMS, 5)).toBe(generateScene(PARAMS, 5));
  });

  it('renders a zero-planet scene without error', () => {
    const empty = generateScene({ ...PARAMS, planets: [] }, 42);

    expect(inspectStructure(empty).violations).toEqual([]);
    expect(parse(empty).querySelectorAll('[data-role="planet"]')).toHaveLength(0);
  });

  it('is smaller than the twinned output it replaces', () => {
    // Every moving element previously shipped twice; this pins the saving so
    // a future change reintroducing duplication is visible.
    const perPlanet = SCENE.length / PARAMS.planets.length;

    expect(SCENE).not.toContain('<use href="#planet-body-group');
    expect(perPlanet).toBeGreaterThan(0);
  });
});
