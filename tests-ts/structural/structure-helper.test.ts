import { describe, expect, it } from 'vitest';
import { assertStructure, inspectStructure } from '../helpers/structure';

// Task 1.5 (REQ QLT-003): the structural assertion helper must be proven to
// FAIL on deliberately malformed fixtures BEFORE it is relied on anywhere.
// A helper that only ever sees valid input is indistinguishable from one that
// asserts nothing — the same class of defect E-052 found in the reduced-motion
// flag. Every negative case below therefore asserts a specific violation kind.

const VALID_SCENE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 105 105">
  <defs>
    <clipPath id="body-0"><circle cx="10" cy="10" r="5"/></clipPath>
  </defs>
  <path id="orbit-0" d="M 0 0 L 10 10" fill="none" stroke="#fff"/>
  <circle cx="10" cy="10" r="5" clip-path="url(#body-0)"/>
  <circle r="2">
    <animateMotion dur="8s"><mpath href="#orbit-0"/></animateMotion>
  </circle>
</svg>`;

describe('structural assertion helper — negative cases', () => {
  it('fails on an unclosed tag', () => {
    const report = inspectStructure(
      '<svg xmlns="http://www.w3.org/2000/svg"><circle r="2"></svg>',
    );

    expect(report.valid).toBe(false);
    expect(report.violations.map((v) => v.kind)).toContain('not-well-formed');
  });

  it('fails on mismatched tags', () => {
    const report = inspectStructure(
      '<svg xmlns="http://www.w3.org/2000/svg"><g></defs></svg>',
    );

    expect(report.valid).toBe(false);
    expect(report.violations.map((v) => v.kind)).toContain('not-well-formed');
  });

  it('fails on an unquoted attribute value', () => {
    const report = inspectStructure(
      '<svg xmlns="http://www.w3.org/2000/svg"><circle r=2 /></svg>',
    );

    expect(report.valid).toBe(false);
    expect(report.violations.map((v) => v.kind)).toContain('not-well-formed');
  });

  it('fails on an unescaped ampersand', () => {
    const report = inspectStructure(
      '<svg xmlns="http://www.w3.org/2000/svg"><desc>a & b</desc></svg>',
    );

    expect(report.valid).toBe(false);
    expect(report.violations.map((v) => v.kind)).toContain('not-well-formed');
  });

  it('fails on duplicate identifiers', () => {
    const report = inspectStructure(
      '<svg xmlns="http://www.w3.org/2000/svg"><path id="orbit-0"/><path id="orbit-0"/></svg>',
    );

    expect(report.valid).toBe(false);
    expect(report.violations.map((v) => v.kind)).toContain('duplicate-id');
  });

  it('fails on a dangling href reference', () => {
    const report = inspectStructure(
      '<svg xmlns="http://www.w3.org/2000/svg"><circle r="2">' +
        '<animateMotion dur="8s"><mpath href="#missing"/></animateMotion>' +
        '</circle></svg>',
    );

    expect(report.valid).toBe(false);
    expect(report.violations.map((v) => v.kind)).toContain('dangling-reference');
  });

  it('fails on a dangling funcIRI reference', () => {
    const report = inspectStructure(
      '<svg xmlns="http://www.w3.org/2000/svg"><circle r="2" clip-path="url(#gone)"/></svg>',
    );

    expect(report.valid).toBe(false);
    expect(report.violations.map((v) => v.kind)).toContain('dangling-reference');
  });

  it('reports every violation rather than stopping at the first', () => {
    const report = inspectStructure(
      '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<path id="a"/><path id="a"/><circle clip-path="url(#gone)"/>' +
        '</svg>',
    );

    expect(report.violations.length).toBeGreaterThanOrEqual(2);
  });

  it('throws through assertStructure with a descriptive message', () => {
    expect(() => assertStructure('<svg><circle r="2"></svg>')).toThrow(
      /Structural assertions failed/,
    );
  });
});

describe('structural assertion helper — positive cases', () => {
  it('accepts a well-formed scene with unique ids and resolved references', () => {
    const report = inspectStructure(VALID_SCENE);

    expect(report.violations).toEqual([]);
    expect(report.valid).toBe(true);
  });

  it('collects the ids and references it checked', () => {
    const report = inspectStructure(VALID_SCENE);

    expect(report.ids).toEqual(['body-0', 'orbit-0']);
    expect(report.references).toEqual(['body-0', 'orbit-0']);
  });

  it('does not throw through assertStructure on a valid scene', () => {
    expect(() => assertStructure(VALID_SCENE)).not.toThrow();
  });

  // Regression: the first version of the helper treated a bare `#` value in ANY
  // referencing attribute as an element reference, so `stroke="#fff"` was
  // reported as a dangling reference to an element named `fff`. Bare `#id` is
  // only a reference in the href family; paint attributes reference elements
  // exclusively through `url(#id)`.
  it('treats hex colours in paint attributes as colours, not references', () => {
    const report = inspectStructure(
      '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M 0 0 L 1 1" fill="#0af" stroke="#fff"/>' +
        '</svg>',
    );

    expect(report.violations).toEqual([]);
    expect(report.references).toEqual([]);
  });

  it('still resolves paint attributes that do use funcIRI references', () => {
    const report = inspectStructure(
      '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<defs><radialGradient id="glow"/></defs>' +
        '<circle r="5" fill="url(#glow)" stroke="#fff"/>' +
        '</svg>',
    );

    expect(report.violations).toEqual([]);
    expect(report.references).toEqual(['glow']);
  });
});
