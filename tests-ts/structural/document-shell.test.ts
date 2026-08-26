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
 *   - the root carries no intrinsic width/height (D-05, EXP-005).
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
