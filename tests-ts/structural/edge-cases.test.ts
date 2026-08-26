import { describe, expect, it } from 'vitest';
import { parseHTML } from 'linkedom';
import { inspectStructure } from '../helpers/structure';
import { orbitPath } from '../../ts/generator/orbit';
import { generateScene, type SceneParams } from '../../ts/generator/scene';

/**
 * Task 2.13 (GEN-013, GEN-014): degenerate and overflowing scenes.
 *
 * Overflow is ACCEPTED behaviour, not a defect (D-07). These tests exist so a
 * future contributor cannot "fix" edge clipping by clamping the distance or
 * auto-fitting the viewBox without turning the suite red.
 */

const BASE: SceneParams = {
  canvas: { width: 300, height: 300 },
  planets: [],
  palette: 'Aurora',
};

function parse(svg: string): Document {
  const { document } = parseHTML(`<html><body>${svg}</body></html>`);

  return document as unknown as Document;
}

describe('zero-planet scene', () => {
  const svg = generateScene(BASE, 42);
  const document = parse(svg);

  it('renders a valid scene with no planets configured', () => {
    expect(inspectStructure(svg).violations).toEqual([]);
  });

  it('renders no orbit paths', () => {
    expect(document.querySelectorAll('path[data-role="orbit"]')).toHaveLength(0);
  });

  it('renders no planets', () => {
    expect(document.querySelectorAll('g[data-role="planet"]')).toHaveLength(0);
  });

  it('still renders the background, sun and ambient elements', () => {
    expect(document.querySelectorAll('[data-role="nebula"]').length).toBeGreaterThan(0);
    expect(document.querySelector('[data-sun-body]')).not.toBeNull();
    expect(document.querySelectorAll('[data-role="asteroid"]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-role="comet"]').length).toBeGreaterThan(0);
  });

  it('keeps the canvas viewBox unchanged', () => {
    expect(document.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 305 305');
  });

  it('remains byte-identical for a repeated seed', () => {
    expect(generateScene(BASE, 3)).toBe(generateScene(BASE, 3));
  });
});

describe('overflowing orbital distance', () => {
  const OVERFLOW = 5_000;
  const params: SceneParams = {
    ...BASE,
    planets: [{ size: 10, distance: OVERFLOW, moon: false }],
  };
  const svg = generateScene(params, 42);
  const document = parse(svg);

  it('emits the overflowing geometry unmodified', () => {
    const rendered = document
      .querySelector('path[data-role="orbit"]')
      ?.getAttribute('d');

    expect(rendered).toBe(orbitPath(BASE.canvas, OVERFLOW));
  });

  it('does not clamp the orbit to the canvas', () => {
    const numbers = (
      document.querySelector('path[data-role="orbit"]')?.getAttribute('d') ?? ''
    )
      .match(/-?\d+(?:\.\d+)?/g)
      ?.map(Number) ?? [];

    expect(Math.min(...numbers)).toBeLessThan(0);
    expect(Math.max(...numbers)).toBeGreaterThan(BASE.canvas.width);
  });

  it('leaves the viewBox derived from the canvas, not from the content bounds', () => {
    expect(document.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 305 305');
  });

  it('produces the same viewBox as an equivalent non-overflowing scene', () => {
    const contained = parse(
      generateScene({ ...BASE, planets: [{ size: 10, distance: 50, moon: false }] }, 42),
    );

    expect(document.querySelector('svg')?.getAttribute('viewBox')).toBe(
      contained.querySelector('svg')?.getAttribute('viewBox'),
    );
  });

  it('remains structurally valid despite overflowing', () => {
    expect(inspectStructure(svg).violations).toEqual([]);
  });
});
