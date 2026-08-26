import { describe, expect, it } from 'vitest';
import { parseHTML } from 'linkedom';
import { orbitPath } from '../../ts/generator/orbit';
import { generateScene, type SceneParams } from '../../ts/generator/scene';

/**
 * Task 2.12 (GEN-003, GEN-010): visible orbits and desynchronised motion.
 *
 * The decisive assertion is that the path a planet is ANIMATED along and the
 * path RENDERED as its visible orbit are the same geometry — not merely that
 * both exist. A generator that drew one ellipse and animated along another
 * would satisfy every "element is present" check while looking wrong.
 */

const PARAMS: SceneParams = {
  canvas: { width: 300, height: 300 },
  planets: [
    { size: 10, distance: 120, moon: false },
    { size: 6, distance: 55, moon: false },
    { size: 8, distance: 90, moon: { size: 2, distance: 12 } },
    { size: 7, distance: [140, 70, 140, 70], moon: false },
  ],
  palette: 'Aurora',
};

function parse(svg: string): Document {
  const { document } = parseHTML(`<html><body>${svg}</body></html>`);

  return document as unknown as Document;
}

/** The animateMotion each planet group owns directly, not its moon's. */
function planetMotions(document: Document): Element[] {
  return [...document.querySelectorAll('g[data-role="planet"]')]
    .map((group) => group.querySelector(':scope > animateMotion'))
    .filter((motion): motion is Element => motion !== null);
}

describe('visible orbit strokes', () => {
  const document = parse(generateScene(PARAMS, 42));

  it('renders one stroked, unfilled path per planet', () => {
    const orbits = document.querySelectorAll('path[data-role="orbit"]');

    expect(orbits).toHaveLength(PARAMS.planets.length);

    for (const orbit of orbits) {
      expect(orbit.getAttribute('fill')).toBe('none');
      expect(orbit.getAttribute('stroke')).not.toBeNull();
    }
  });

  it('strokes orbits faintly so they read as a guide', () => {
    for (const orbit of document.querySelectorAll('path[data-role="orbit"]')) {
      const stroke = orbit.getAttribute('stroke') ?? '';
      const alpha = Number(stroke.match(/rgba\([^)]*,\s*([\d.]+)\)/)?.[1] ?? '1');

      expect(alpha).toBeLessThan(0.2);
    }
  });
});

describe('rendered orbit is the motion path', () => {
  const document = parse(generateScene(PARAMS, 42));

  it('points every planet at an orbit that exists in the document', () => {
    const orbitIds = new Set(
      [...document.querySelectorAll('path[data-role="orbit"]')].map((orbit) =>
        orbit.getAttribute('id'),
      ),
    );

    for (const motion of planetMotions(document)) {
      const reference = motion
        .querySelector('mpath')
        ?.getAttribute('xlink:href')
        ?.slice(1);

      expect(orbitIds).toContain(reference);
    }
  });

  it('gives each planet its own distinct orbit', () => {
    const references = planetMotions(document).map((motion) =>
      motion.querySelector('mpath')?.getAttribute('xlink:href'),
    );

    expect(new Set(references).size).toBe(PARAMS.planets.length);
  });

  it('renders each referenced orbit with the geometry computed for that planet', () => {
    const motions = planetMotions(document);

    PARAMS.planets.forEach((planet, index) => {
      const reference = motions[index]
        ?.querySelector('mpath')
        ?.getAttribute('xlink:href')
        ?.slice(1);
      const rendered = document
        .querySelector(`path[id="${reference}"]`)
        ?.getAttribute('d');

      expect(rendered, `planet ${index}`).toBe(
        orbitPath(PARAMS.canvas, planet.distance),
      );
    });
  });
});

describe('animation timing', () => {
  const document = parse(generateScene(PARAMS, 42));

  it('repeats every animated element indefinitely', () => {
    const animations = [
      ...document.querySelectorAll('animateMotion, animateTransform'),
    ];

    expect(animations.length).toBeGreaterThan(0);

    for (const animation of animations) {
      expect(animation.getAttribute('repeatCount')).toBe('indefinite');
    }
  });

  it('desynchronises planets with differing start offsets', () => {
    const offsets = planetMotions(document).map((motion) =>
      motion.getAttribute('begin'),
    );

    expect(new Set(offsets).size).toBeGreaterThan(1);
  });

  it('starts every planet mid-cycle with a negative offset', () => {
    for (const motion of planetMotions(document)) {
      expect(motion.getAttribute('begin')).toMatch(/^-/);
    }
  });

  it('assigns each planet a period within the bounded range', () => {
    for (const motion of planetMotions(document)) {
      const duration = Number(motion.getAttribute('dur')?.replace('s', ''));

      expect(duration).toBeGreaterThanOrEqual(20);
      expect(duration).toBeLessThanOrEqual(60);
    }
  });

  it('varies planet periods rather than assigning one shared value', () => {
    const durations = new Set(
      planetMotions(document).map((motion) => motion.getAttribute('dur')),
    );

    expect(durations.size).toBeGreaterThan(1);
  });

  it('derives periods from the seed', () => {
    const durationsFor = (seed: number): string[] =>
      planetMotions(parse(generateScene(PARAMS, seed))).map(
        (motion) => motion.getAttribute('dur') ?? '',
      );

    expect(durationsFor(11)).toEqual(durationsFor(11));
    expect(durationsFor(11)).not.toEqual(durationsFor(12));
  });
});
