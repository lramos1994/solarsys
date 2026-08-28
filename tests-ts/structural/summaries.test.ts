import { describe, expect, it } from 'vitest';
import { parseHTML } from 'linkedom';
import { controlsMarkup, type RawSceneControls } from '../../ts/app/controls';
import type { RawAsteroidBeltConfig, RawPlanetInput } from '../../ts/app/validation';

/**
 * Task 4.1 (CX-021) + 4.3 (CX-020, CTL-012, UI-011): readable summaries and
 * the per-planet dialog markup.
 *
 * The collapsed planet summary must read as labelled values rather than raw
 * `r<num>`/`d<num>` codes, a custom orbit must render as a range rather than a
 * comma-joined list, moon presence must be carried by text or ARIA, and the
 * belt summary must describe the belt including its type. Task 4.3 adds the
 * per-planet `<dialog>` (size, moon, ring, preview, remove) and the belt type
 * select, with orbital distance remaining in the deck.
 */

function parse(markup: string): Document {
  const { document } = parseHTML(`<html><body>${markup}</body></html>`);

  return document as unknown as Document;
}

function scalarPlanet(size: string, value: string): RawPlanetInput {
  return { size, distance: { mode: 'scalar', value }, moon: false, ring: false };
}

function customPlanet(
  size: string,
  extents: [string, string, string, string],
): RawPlanetInput {
  const [left, top, right, bottom] = extents;

  return {
    size,
    distance: { mode: 'custom', left, top, right, bottom },
    moon: false,
    ring: false,
  };
}

const ICY_BELT: RawAsteroidBeltConfig = {
  type: 'icy',
  count: '130',
  innerRadiusPercent: '81',
  outerRadiusPercent: '87',
  size: '2',
  period: '163',
};

function scene(
  planets: RawPlanetInput[],
  asteroidBelt: RawAsteroidBeltConfig | false = false,
): RawSceneControls {
  return {
    canvasWidth: '600',
    canvasHeight: '600',
    palette: 'Aurora',
    planets,
    asteroidBelt,
  };
}

function planetSummary(markup: string, index = 0): Element {
  const summary = parse(markup).querySelector(
    `[data-action="toggle-planet"][data-index="${index}"]`,
  );

  if (summary === null) {
    throw new Error(`planet ${index} summary not found`);
  }

  return summary;
}

describe('planet summary readability', () => {
  it('carries no r<number>/d<number> raw code', () => {
    const markup = controlsMarkup(scene([scalarPlanet('17', '110')]));
    const text = planetSummary(markup).textContent ?? '';

    expect(text).not.toMatch(/(^|[^A-Za-z])[rd]\d/);
  });

  it('labels the size and orbit values', () => {
    const markup = controlsMarkup(scene([scalarPlanet('17', '110')]));
    const summary = planetSummary(markup);

    const size = summary.querySelector('[data-role="summary-size"]')?.textContent ?? '';
    const orbit = summary.querySelector('[data-role="summary-distance"]')?.textContent ?? '';

    expect(size).toContain('Size');
    expect(size).toContain('17');
    expect(orbit).toContain('Orbit');
    expect(orbit).toContain('110');
  });

  it('carries an explanatory description on each abbreviated value', () => {
    const markup = controlsMarkup(scene([scalarPlanet('17', '110')]));
    const summary = planetSummary(markup);

    const size = summary.querySelector('[data-role="summary-size"]');
    const orbit = summary.querySelector('[data-role="summary-distance"]');

    const sizeDescription =
      size?.getAttribute('aria-label') ?? size?.getAttribute('title') ?? '';
    const orbitDescription =
      orbit?.getAttribute('aria-label') ?? orbit?.getAttribute('title') ?? '';

    expect(sizeDescription.toLowerCase()).toContain('size');
    expect(sizeDescription).toContain('17');
    expect(orbitDescription.toLowerCase()).toContain('orbit');
    expect(orbitDescription).toContain('110');
  });

  it('describes a custom orbit as a range, not a comma-joined list', () => {
    const markup = controlsMarkup(scene([customPlanet('17', ['62', '219', '79', '103'])]));
    const orbit =
      planetSummary(markup).querySelector('[data-role="summary-distance"]')?.textContent ?? '';

    expect(orbit).toContain('Orbit');
    expect(orbit).toContain('62');
    expect(orbit).toContain('219');
    expect(orbit).toContain('–');
    expect(orbit).not.toContain(',');
  });

  it('conveys moon presence with an ARIA label, not colour alone', () => {
    const markup = controlsMarkup(
      scene([{ ...scalarPlanet('17', '110'), moon: { size: '5', distance: '32', period: '15' } }]),
    );

    const badge = planetSummary(markup).querySelector('.summary-moon');
    const label = badge?.querySelector('[aria-label]')?.getAttribute('aria-label') ?? '';

    expect(badge).not.toBeNull();
    expect(label).toBe('Has a moon');
  });

  it('omits the moon indicator when the planet has no moon', () => {
    const markup = controlsMarkup(scene([scalarPlanet('17', '110')]));

    expect(planetSummary(markup).querySelector('.summary-moon')).toBeNull();
  });
});

describe('belt summary', () => {
  it('describes the belt including its type', () => {
    const markup = controlsMarkup(scene([scalarPlanet('17', '110')], ICY_BELT));
    const text = parse(markup).querySelector('[data-role="belt-summary"]')?.textContent ?? '';

    expect(text).toContain('icy');
    expect(text).toContain('belt');
    expect(text).toContain('130');
  });

  it('states the belt is off when disabled', () => {
    const markup = controlsMarkup(scene([scalarPlanet('17', '110')], false));
    const text = parse(markup).querySelector('[data-role="belt-summary"]')?.textContent ?? '';

    expect(text.toLowerCase()).toContain('off');
  });

  it('renders a belt type select with each option name as text', () => {
    const markup = controlsMarkup(scene([scalarPlanet('17', '110')], ICY_BELT));
    const select = parse(markup).querySelector('[data-control="beltType"]');

    expect(select).not.toBeNull();
    expect([...select!.querySelectorAll('option')].map((option) => option.textContent)).toEqual([
      'rocky',
      'icy',
      'metallic',
    ]);
  });
});

describe('per-planet dialog', () => {
  const planet: RawPlanetInput = {
    ...scalarPlanet('17', '110'),
    moon: { size: '5', distance: '32', period: '15' },
    ring: { type: 'Banded', sizePercent: '210', inclinationDegrees: '16' },
  };

  it('hosts size, moon, ring, the preview container, and Remove planet', () => {
    const markup = controlsMarkup(scene([planet]));
    const dialog = parse(markup).querySelector('dialog[data-role="planet-dialog"]');

    expect(dialog).not.toBeNull();
    expect(dialog!.querySelector('[data-control="planetSize"]')).not.toBeNull();
    expect(dialog!.querySelector('[data-control="moonEnabled"]')).not.toBeNull();
    expect(dialog!.querySelector('[data-control="ringEnabled"]')).not.toBeNull();
    expect(dialog!.querySelector('[data-role="planet-preview"]')).not.toBeNull();
    expect(dialog!.querySelector('[data-action="remove-planet"]')).not.toBeNull();
  });

  it('leaves orbital distance in the deck, not the dialog', () => {
    const markup = controlsMarkup(scene([planet]));
    const document = parse(markup);
    const deck = document.querySelector('[data-planet="0"]');
    const dialog = document.querySelector('dialog[data-role="planet-dialog"]');

    expect(deck!.querySelector('[data-control="planetDistance"]')).not.toBeNull();
    expect(dialog!.querySelector('[data-control="planetDistance"]')).toBeNull();
    expect(dialog!.querySelector('[data-orbit-mode="custom"]')).toBeNull();
  });
});
