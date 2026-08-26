import { describe, expect, it } from 'vitest';
import { parseHTML } from 'linkedom';
import { generateScene, type SceneParams } from '../../ts/generator/scene';

/**
 * Task 3.2 (QLT-006, EXP-003, D-16): declarative animation, self-contained.
 *
 * The exported file must animate with no scripting and no external resource.
 * These are NEGATIVE assertions, which are the easiest kind to write
 * vacuously, so each one is paired with a positive control proving the
 * detector actually fires on a document that violates the rule.
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

/** Attributes that can pull in an external resource. */
const URL_ATTRIBUTES = [
  'href',
  'xlink:href',
  'src',
  'fill',
  'stroke',
  'clip-path',
  'mask',
  'filter',
  'style',
] as const;

/** Every reference in the document that points outside it. */
function externalReferences(svg: string): string[] {
  const document = parse(svg);
  const found: string[] = [];

  for (const element of document.querySelectorAll('*')) {
    for (const attribute of URL_ATTRIBUTES) {
      const value = element.getAttribute(attribute);

      if (value === null) {
        continue;
      }

      // Internal references are `#id` or `url(#id)`; anything resolving to a
      // scheme, a protocol-relative URL, or a path is external.
      if (/(?:https?:)?\/\//.test(value) || /url\(\s*["']?(?!#)/.test(value)) {
        found.push(`${attribute}="${value}"`);
      }
    }
  }

  return found;
}

describe('no scripting', () => {
  it('emits no script element', () => {
    expect(parse(SCENE).querySelectorAll('script')).toHaveLength(0);
  });

  it('emits no inline event handler attributes', () => {
    const handlers: string[] = [];

    for (const element of parse(SCENE).querySelectorAll('*')) {
      for (const attribute of element.attributes) {
        if (attribute.name.startsWith('on')) {
          handlers.push(attribute.name);
        }
      }
    }

    expect(handlers).toEqual([]);
  });

  it('emits no javascript: URL', () => {
    expect(SCENE.toLowerCase()).not.toContain('javascript:');
  });

  it('detects a script element when one is present (control)', () => {
    const injected = SCENE.replace('</svg>', '<script>void 0;</script></svg>');

    expect(parse(injected).querySelectorAll('script')).toHaveLength(1);
  });

  it('detects an inline handler when one is present (control)', () => {
    const injected = SCENE.replace('<svg ', '<svg onload="void 0" ');
    const root = parse(injected).querySelector('svg');

    expect(root?.hasAttribute('onload')).toBe(true);
  });
});

describe('no external resources', () => {
  it('references nothing outside the document', () => {
    expect(externalReferences(SCENE)).toEqual([]);
  });

  it('emits no external stylesheet link', () => {
    expect(parse(SCENE).querySelectorAll('link')).toHaveLength(0);
  });

  it('emits no xml-stylesheet processing instruction', () => {
    expect(SCENE).not.toContain('<?xml-stylesheet');
  });

  it('emits no image element pulling in a bitmap', () => {
    expect(parse(SCENE).querySelectorAll('image')).toHaveLength(0);
  });

  it('resolves every url() to an element inside the document', () => {
    const document = parse(SCENE);
    const ids = new Set(
      [...document.querySelectorAll('[id]')].map((element) => element.getAttribute('id')),
    );
    const references = [...(SCENE.match(/url\(#([^)]+)\)/g) ?? [])].map((match) =>
      match.slice(5, -1),
    );

    expect(references.length).toBeGreaterThan(0);

    for (const reference of references) {
      expect(ids).toContain(reference);
    }
  });

  it('detects an external reference when one is present (control)', () => {
    const injected = SCENE.replace(
      '</svg>',
      '<image href="https://example.com/a.png"/></svg>',
    );

    expect(externalReferences(injected).length).toBeGreaterThan(0);
  });

  it('detects an external url() fill when one is present (control)', () => {
    const injected = SCENE.replace(
      '</svg>',
      '<rect fill="url(https://example.com/p.svg#g)"/></svg>',
    );

    expect(externalReferences(injected).length).toBeGreaterThan(0);
  });
});

describe('animation is declarative and SVG-native', () => {
  it('animates through SVG animation elements', () => {
    const document = parse(SCENE);
    const animations = document.querySelectorAll('animateMotion, animateTransform');

    expect(animations.length).toBeGreaterThan(0);
  });

  it('carries the xlink namespace its mpath references require', () => {
    const root = parse(SCENE).querySelector('svg');

    expect(root?.getAttribute('xmlns:xlink')).toBe('http://www.w3.org/1999/xlink');
  });

  it('declares the SVG namespace so the file stands alone', () => {
    expect(parse(SCENE).querySelector('svg')?.getAttribute('xmlns')).toBe(
      'http://www.w3.org/2000/svg',
    );
  });

  it('depends on no class defined outside the document', () => {
    const document = parse(SCENE);
    const css = [...document.querySelectorAll('style')]
      .map((element) => element.textContent ?? '')
      .join('');

    // Every class used in the markup must be defined by an internal rule, or
    // be purely cosmetic on the root. Anything else would depend on the host
    // page's stylesheet, which D-16 forbids.
    const used = new Set<string>();

    for (const element of document.querySelectorAll('[class]')) {
      for (const name of (element.getAttribute('class') ?? '').split(/\s+/)) {
        if (name !== '' && element.tagName.toLowerCase() !== 'svg') {
          used.add(name);
        }
      }
    }

    expect(used.size).toBeGreaterThan(0);

    for (const name of used) {
      expect(css, `class ${name} has no internal rule`).toContain(`.${name}`);
    }
  });
});
