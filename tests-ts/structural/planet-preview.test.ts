import { describe, expect, it } from 'vitest';
import { XMLValidator } from 'fast-xml-parser';
import { parseHTML } from 'linkedom';
import { inspectStructure } from '../helpers/structure';
import { generatePlanetPreview, PREVIEW_ID_PREFIX } from '../../ts/generator/preview';
import { generateScene, type SceneParams } from '../../ts/generator/scene';

/**
 * Task 2.3/2.4 (GEN-020): the isolated planet preview.
 *
 * The preview is a SEPARATE pure artefact, not a crop of the scene. Its most
 * important property is the last one asserted here: calling it must leave the
 * full scene's bytes untouched, which is what keeps the contractual generation
 * order (RB-002) intact by construction.
 */

const SEED = 20260826;

const PARAMS: SceneParams = {
  canvas: { width: 600, height: 600 },
  planets: [
    {
      size: 14,
      distance: 110,
      moon: { size: 4, distance: 26, period: 12 },
      ring: { type: 'Banded', sizePercent: 210, inclinationDegrees: 18 },
    },
    { size: 9, distance: 190, moon: false, ring: false },
    { size: 11, distance: 260, moon: { size: 3, distance: 20 }, ring: false },
  ],
  palette: 'Aurora',
  asteroidBelt: false,
};

function parse(svg: string): Document {
  const { document } = parseHTML(`<html><body>${svg}</body></html>`);

  return document as unknown as Document;
}

describe('isolated planet preview — determinism', () => {
  it('produces byte-identical output for a repeated call', () => {
    expect(generatePlanetPreview(PARAMS, SEED, 0)).toBe(
      generatePlanetPreview(PARAMS, SEED, 0),
    );
  });

  it('produces byte-identical output regardless of call order', () => {
    const first = generatePlanetPreview(PARAMS, SEED, 2);

    generatePlanetPreview(PARAMS, SEED, 0);
    generatePlanetPreview(PARAMS, SEED, 1);

    expect(generatePlanetPreview(PARAMS, SEED, 2)).toBe(first);
  });

  it('varies with the planet index and with the seed', () => {
    expect(generatePlanetPreview(PARAMS, SEED, 0)).not.toBe(
      generatePlanetPreview(PARAMS, SEED, 1),
    );
    expect(generatePlanetPreview(PARAMS, SEED, 0)).not.toBe(
      generatePlanetPreview(PARAMS, SEED + 1, 0),
    );
  });

  it('reflects an edited planet size', () => {
    const edited: SceneParams = {
      ...PARAMS,
      planets: [{ ...PARAMS.planets[0]!, size: 22 }, ...PARAMS.planets.slice(1)],
    };

    expect(generatePlanetPreview(edited, SEED, 0)).not.toBe(
      generatePlanetPreview(PARAMS, SEED, 0),
    );
  });
});

describe('isolated planet preview — well-formed and scriptless', () => {
  const preview = generatePlanetPreview(PARAMS, SEED, 0);

  it('validates as well-formed XML', () => {
    expect(XMLValidator.validate(preview)).toBe(true);
  });

  it('has unique ids and resolves every internal reference', () => {
    expect(inspectStructure(preview).violations).toEqual([]);
  });

  it('emits no script element and no javascript: URL', () => {
    expect(parse(preview).querySelectorAll('script')).toHaveLength(0);
    expect(preview.toLowerCase()).not.toContain('javascript:');
  });

  it('emits no inline event handler attribute', () => {
    const handlers: string[] = [];

    for (const element of parse(preview).querySelectorAll('*')) {
      for (const attribute of element.attributes) {
        if (attribute.name.startsWith('on')) {
          handlers.push(attribute.name);
        }
      }
    }

    expect(handlers).toEqual([]);
  });

  it('carries both namespaces and no intrinsic width or height', () => {
    const root = parse(preview).querySelector('svg');

    expect(root?.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg');
    expect(root?.getAttribute('xmlns:xlink')).toBe('http://www.w3.org/1999/xlink');
    expect(root?.hasAttribute('width')).toBe(false);
    expect(root?.hasAttribute('height')).toBe(false);
  });

  it('animates declaratively through SMIL', () => {
    expect(
      parse(preview).querySelectorAll('animateMotion, animateTransform').length,
    ).toBeGreaterThan(0);
  });

  it('describes itself for assistive technology', () => {
    const document = parse(preview);

    expect(document.querySelector('title')?.textContent ?? '').not.toBe('');
    expect(document.querySelector('desc')?.textContent ?? '').not.toBe('');
  });
});

describe('isolated planet preview — isolation', () => {
  it('renders exactly one planet body', () => {
    const document = parse(generatePlanetPreview(PARAMS, SEED, 0));

    expect(document.querySelectorAll('[data-role="planet-body"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-role="planet"]')).toHaveLength(1);
  });

  it('renders no starfield, sun, comet, belt or orbit', () => {
    const document = parse(generatePlanetPreview(PARAMS, SEED, 0));

    for (const role of [
      'star',
      'nebula',
      'vignette',
      'sun-band',
      'sun-glow',
      'comet',
      'asteroid',
      'asteroid-belt',
      'orbit',
    ]) {
      expect(
        document.querySelectorAll(`[data-role="${role}"]`),
        role,
      ).toHaveLength(0);
    }
  });

  it('includes the ring when the planet has one and omits it when it does not', () => {
    const ringed = parse(generatePlanetPreview(PARAMS, SEED, 0));
    const bare = parse(generatePlanetPreview(PARAMS, SEED, 1));

    expect(ringed.querySelectorAll('[data-role="ring-front"]').length).toBeGreaterThan(0);
    expect(bare.querySelectorAll('[data-role="ring-front"]')).toHaveLength(0);
  });

  it('keeps the whole planet inside the viewBox', () => {
    const root = parse(generatePlanetPreview(PARAMS, SEED, 0)).querySelector('svg');
    const [minX, minY, width, height] = (root?.getAttribute('viewBox') ?? '')
      .split(/\s+/)
      .map(Number);

    // Planet size 14 with a 210% ring spans +/-29.4 from the centre.
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    expect(minX! + width!).toBeGreaterThanOrEqual(30);
    expect(minY! + height!).toBeGreaterThanOrEqual(30);
    expect(minX).toBeLessThanOrEqual(-30);
    expect(minY).toBeLessThanOrEqual(-30);
  });

  it('throws for an index outside the planet set', () => {
    expect(() => generatePlanetPreview(PARAMS, SEED, 3)).toThrow();
    expect(() => generatePlanetPreview(PARAMS, SEED, -1)).toThrow();
  });
});

describe('isolated planet preview — moon awareness', () => {
  it('renders a moon body for a planet whose moon is enabled', () => {
    const document = parse(generatePlanetPreview(PARAMS, SEED, 0));

    expect(document.querySelectorAll('[data-role="moon-body"]')).toHaveLength(1);
    expect(document.querySelector('[data-role="moon"] animateMotion')).not.toBeNull();
  });

  it('renders no moon body for a planet whose moon is disabled', () => {
    const document = parse(generatePlanetPreview(PARAMS, SEED, 1));

    expect(document.querySelectorAll('[data-role="moon-body"]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-role="moon-orbit"]')).toHaveLength(0);
  });

  it('honours the authored moon period', () => {
    const period = parse(generatePlanetPreview(PARAMS, SEED, 0))
      .querySelector('[data-role="moon"] animateMotion')
      ?.getAttribute('dur');

    expect(period).toBe('12s');
  });

  it('reserves room for the moon orbit in the viewBox', () => {
    const far: SceneParams = {
      ...PARAMS,
      planets: [
        { ...PARAMS.planets[0]!, moon: { size: 4, distance: 90, period: 12 } },
        ...PARAMS.planets.slice(1),
      ],
    };
    const extent = (svg: string): number =>
      Number((parse(svg).querySelector('svg')?.getAttribute('viewBox') ?? '').split(/\s+/)[2]);

    expect(extent(generatePlanetPreview(far, SEED, 0))).toBeGreaterThan(
      extent(generatePlanetPreview(PARAMS, SEED, 0)),
    );
  });
});

describe('isolated planet preview — the main scene is untouched', () => {
  it('leaves the full scene byte-identical when a preview is generated first', () => {
    const control = generateScene(PARAMS, SEED);

    generatePlanetPreview(PARAMS, SEED, 0);
    generatePlanetPreview(PARAMS, SEED, 1);
    generatePlanetPreview(PARAMS, SEED, 2);

    expect(generateScene(PARAMS, SEED)).toBe(control);
  });

  it('leaves the full scene byte-identical when previews are interleaved', () => {
    const control = generateScene(PARAMS, SEED);
    const interleaved = [0, 1, 2].map((index) => {
      generatePlanetPreview(PARAMS, SEED, index);

      return generateScene(PARAMS, SEED);
    });

    for (const scene of interleaved) {
      expect(scene).toBe(control);
    }
  });

  it('shares no identifier with the full scene it was previewed from', () => {
    const sceneIds = new Set(inspectStructure(generateScene(PARAMS, SEED)).ids);
    const previewIds = inspectStructure(generatePlanetPreview(PARAMS, SEED, 0)).ids;

    expect(previewIds.length).toBeGreaterThan(0);

    for (const id of previewIds) {
      expect(sceneIds.has(id), `id ${id} collides with the scene`).toBe(false);
    }
  });

  it('namespaces every preview identifier so a collision is impossible', () => {
    const previewIds = inspectStructure(generatePlanetPreview(PARAMS, SEED, 0)).ids;

    expect(previewIds.length).toBeGreaterThan(0);

    for (const id of previewIds) {
      expect(id.startsWith(PREVIEW_ID_PREFIX), `id ${id} is not namespaced`).toBe(true);
    }

    for (const id of inspectStructure(generateScene(PARAMS, SEED)).ids) {
      expect(id.startsWith(PREVIEW_ID_PREFIX), `scene id ${id} is namespaced`).toBe(false);
    }
  });

  it('draws from its own stream, not the scene position for that index', () => {
    // A preview that reused the scene's seed would replay the scene's first
    // draws, so the previewed body's surface blobs would match planet 0's.
    const blobs = (svg: string): string[] =>
      [...parse(svg).querySelectorAll('[data-role="planet-blob"]')].map(
        (element) => element.getAttribute('d') as string,
      );
    const sceneBlobs = blobs(generateScene(PARAMS, SEED));
    const previewBlobs = blobs(generatePlanetPreview(PARAMS, SEED, 0));

    expect(previewBlobs.length).toBeGreaterThan(0);
    expect(sceneBlobs.slice(0, previewBlobs.length)).not.toEqual(previewBlobs);
  });
});
