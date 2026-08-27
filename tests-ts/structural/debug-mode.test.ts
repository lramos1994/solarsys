import { describe, expect, it } from 'vitest';
import { parseHTML } from 'linkedom';
import { inspectStructure } from '../helpers/structure';
import { generateScene, type SceneParams } from '../../ts/generator/scene';

/**
 * Task 2.14 (GEN-015): internal debug rendering mode.
 *
 * Debug is an internal development tool, not a product feature (D-11). It is
 * reached through the generator's own options, never through a user control —
 * task 3.11 asserts the absence of any UI affordance for it.
 */

const PARAMS: SceneParams = {
  canvas: { width: 300, height: 300 },
  planets: [
    { size: 10, distance: 120, moon: { size: 3, distance: 25 } },
    { size: 6, distance: 55, moon: false },
  ],
  palette: 'Aurora',
};

function parse(svg: string): Document {
  const { document } = parseHTML(`<html><body>${svg}</body></html>`);

  return document as unknown as Document;
}

/** Effective visibility of a stroked path: alpha times width. */
function strokeVisibility(element: Element | null): number {
  const stroke = element?.getAttribute('stroke') ?? '';
  const width = Number(element?.getAttribute('stroke-width') ?? '0');

  if (stroke === 'none' || stroke === '') {
    return 0;
  }

  const alpha = Number(stroke.match(/rgba\([^)]*,\s*([\d.]+)\)/)?.[1] ?? '1');

  return alpha * width;
}

describe('debug mode suppresses ambience', () => {
  const document = parse(generateScene(PARAMS, 42, { debug: true }));

  it('renders no starfield', () => {
    expect(document.querySelectorAll('[data-role="star"]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-role="nebula"]')).toHaveLength(0);
  });

  it('renders no asteroid belt', () => {
    expect(document.querySelectorAll('[data-role="asteroid"]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-role="asteroid-belt"]')).toHaveLength(0);
  });

  it('renders no comets', () => {
    expect(document.querySelectorAll('[data-role="comet"]')).toHaveLength(0);
  });

  it('still renders the sun and the planets', () => {
    expect(document.querySelector('[data-sun-body]')).not.toBeNull();
    expect(document.querySelectorAll('g[data-role="planet"]')).toHaveLength(2);
  });
});

describe('debug mode exposes geometry', () => {
  const normal = parse(generateScene(PARAMS, 42));
  const debug = parse(generateScene(PARAMS, 42, { debug: true }));

  it('renders orbit paths more visibly than in normal mode', () => {
    const normalVisibility = strokeVisibility(
      normal.querySelector('path[data-role="orbit"]'),
    );
    const debugVisibility = strokeVisibility(
      debug.querySelector('path[data-role="orbit"]'),
    );

    expect(debugVisibility).toBeGreaterThan(normalVisibility);
  });

  it('renders moon orbit paths, which are invisible in normal mode', () => {
    expect(
      strokeVisibility(normal.querySelector('path[data-role="moon-orbit"]')),
    ).toBe(0);
    expect(
      strokeVisibility(debug.querySelector('path[data-role="moon-orbit"]')),
    ).toBeGreaterThan(0);
  });
});

describe('debug mode integrity', () => {
  it('produces a well-formed scene with resolved references', () => {
    expect(
      inspectStructure(generateScene(PARAMS, 42, { debug: true })).violations,
    ).toEqual([]);
  });

  it('remains byte-identical for a repeated seed', () => {
    expect(generateScene(PARAMS, 9, { debug: true })).toBe(
      generateScene(PARAMS, 9, { debug: true }),
    );
  });

  it('defaults to normal mode when no options are supplied', () => {
    expect(generateScene(PARAMS, 42)).toBe(
      generateScene(PARAMS, 42, { debug: false }),
    );
  });

  it('differs from normal mode output', () => {
    expect(generateScene(PARAMS, 42, { debug: true })).not.toBe(
      generateScene(PARAMS, 42),
    );
  });

  it('keeps the canvas viewBox unchanged', () => {
    expect(
      parse(generateScene(PARAMS, 42, { debug: true }))
        .querySelector('svg')
        ?.getAttribute('viewBox'),
    ).toBe('0 0 305 305');
  });
});
