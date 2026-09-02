import { describe, expect, it } from 'vitest';
import { parseHTML } from 'linkedom';
import { inspectStructure } from '../helpers/structure';
import { documentShell } from '../../ts/generator/document';

/**
 * Task 2.5 (GEN-001, QLT-001): the document shell.
 *
 * Three properties are contractual and each is asserted directly:
 *   - viewBox is the canvas plus 5 in both axes (the margin convention),
 *   - all content sits in a group translated by 2.5,
 *   - the root carries no intrinsic width/height (D-05, EXP-005),
 *   - the root clips animated geometry to its canvas viewport.
 */

function root(svg: string): Element {
  const { document } = parseHTML(`<html><body>${svg}</body></html>`);
  const element = document.querySelector('svg');

  if (element === null) {
    throw new Error('no root svg element was produced');
  }

  return element as unknown as Element;
}

describe('document shell', () => {
  it('sizes the viewBox to the canvas plus 5 in both axes', () => {
    const element = root(documentShell({ width: 300, height: 300 }, ''));

    expect(element.getAttribute('viewBox')).toBe('0 0 305 305');
  });

  it('preserves the margin convention on a non-square canvas', () => {
    const element = root(documentShell({ width: 640, height: 360 }, ''));

    expect(element.getAttribute('viewBox')).toBe('0 0 645 365');
  });

  it('wraps content in a group translated by half the margin', () => {
    const element = root(documentShell({ width: 300, height: 300 }, ''));
    const group = element.querySelector('g');

    expect(group?.getAttribute('transform')).toBe('translate(2.5 2.5)');
  });

  it('places the supplied content inside the translated group', () => {
    const element = root(
      documentShell({ width: 300, height: 300 }, '<circle id="probe" r="1"/>'),
    );
    const probe = element.querySelector('#probe');

    expect(probe).not.toBeNull();
    expect(probe?.parentElement?.getAttribute('transform')).toBe('translate(2.5 2.5)');
  });

  it('declares no intrinsic width on the root element', () => {
    expect(root(documentShell({ width: 300, height: 300 }, '')).hasAttribute('width')).toBe(
      false,
    );
  });

  it('declares no intrinsic height on the root element', () => {
    expect(
      root(documentShell({ width: 300, height: 300 }, '')).hasAttribute('height'),
    ).toBe(false);
  });

  it('clips content at the canvas viewport', () => {
    expect(root(documentShell({ width: 300, height: 300 }, '')).getAttribute('overflow')).toBe(
      'hidden',
    );
  });

  /**
   * QLT-012 — Firefox renders SMIL-driven motion with visible per-frame
   * jitter unless the moving group is promoted to its own composited layer.
   * Measured on Windows 11 / Firefox: a planet moving along an `animateMotion`
   * mpath shakes, worse at larger radii, and `will-change: transform` on the
   * moving group removes it. Verified against a control arm (a stationary
   * body) that must not shake, and against an unmodified arm that must.
   *
   * The hint ships INSIDE the artefact's own `<style>`, which is a permitted
   * mechanism (D-16 forbids scripting, not CSS), so the downloaded file is
   * smooth standalone — application CSS could not do this.
   *
   * It must be `will-change`, never `transform: translateZ(0)`: a CSS
   * transform overrides the SVG `transform` ATTRIBUTE, and the wallpaper bake
   * (`ts/app/wallpaper.ts`) writes the resolved `transform="matrix(...)"` onto
   * each animated node. `translateZ(0)` would win over that matrix and
   * collapse every planet to its base position in the exported wallpaper.
   */
  it('promotes animated groups to their own layer without applying a transform', () => {
    const svg = documentShell({ width: 300, height: 300 }, '');
    const style = root(svg).querySelector('style');

    expect(style, 'the shell must carry a <style> block').not.toBeNull();

    const css = style!.textContent ?? '';

    expect(css).toContain('will-change');
    // The bake step depends on the SVG transform attribute winning.
    expect(css).not.toContain('translateZ');
  });

  it('emits no scripting', () => {
    expect(documentShell({ width: 300, height: 300 }, '')).not.toContain('<script');
  });

  it('declares the SVG namespace', () => {
    expect(root(documentShell({ width: 300, height: 300 }, '')).getAttribute('xmlns')).toBe(
      'http://www.w3.org/2000/svg',
    );
  });

  it('produces a well-formed document with resolved references', () => {
    const report = inspectStructure(
      documentShell(
        { width: 300, height: 300 },
        '<defs><clipPath id="c"><circle r="1"/></clipPath></defs>' +
          '<circle r="1" clip-path="url(#c)"/>',
      ),
    );

    expect(report.violations).toEqual([]);
  });

  it('contains no script element', () => {
    expect(root(documentShell({ width: 300, height: 300 }, '')).querySelector('script')).toBeNull();
  });
});
