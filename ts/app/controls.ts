import { PALETTE_NAMES } from '../generator/palette';
import { BOUNDS, type BoundedField } from './validation';
import {
  RANDOM_PALETTE,
  type RawMoonInput,
  type RawPlanetInput,
  type RawSceneInput,
} from './validation';

/**
 * Control surface markup and reading (CTL-001, CTL-002, CX-001, CX-003).
 *
 * Controls are plain form elements carrying `data-control` so tests and the
 * change handler can find them without depending on layout. Values are read
 * back as raw strings and handed to the validator: nothing is coerced or
 * repaired here, because CTL-007 forbids silently repairing user input.
 *
 * Bounded numeric parameters render as `input[type=number]` with native
 * `min`/`max`/`step` sourced from the validator's BOUNDS (CX-001, D-31), so the
 * widget and the validator cannot drift. Orbital distance stays free text
 * because it accepts either a scalar or four comma-separated values (CX-002).
 */

export const DEFAULT_INPUT: RawSceneInput = {
  canvasWidth: '600',
  canvasHeight: '600',
  seed: '20260826',
  palette: RANDOM_PALETTE,
  planets: [
    { size: '12', distance: '110', moon: false },
    { size: '18', distance: '190', moon: { size: '5', distance: '32', period: '15' } },
    { size: '9', distance: '260', moon: false },
  ],
};

/** Defaults for a newly added planet (CTL-003). */
export const DEFAULT_PLANET: RawPlanetInput = {
  size: '10',
  distance: '150',
  moon: false,
};

/** Defaults applied when a user enables a moon (CTL-004, D-04). */
export const DEFAULT_MOON: RawMoonInput = {
  size: '5',
  distance: '32',
  period: '15',
};

/** Maps a `data-control` name to its BOUNDS key, where one exists. */
const CONTROL_BOUNDS: Record<string, BoundedField> = {
  canvasWidth: 'canvasWidth',
  canvasHeight: 'canvasHeight',
  planetSize: 'planetSize',
  planetDistance: 'orbitDistance',
  moonSize: 'moonSize',
  moonDistance: 'moonDistance',
  moonPeriod: 'moonPeriod',
  seed: 'seed',
};

/** Controls that must remain free text (they accept non-single-number forms). */
const TEXT_CONTROLS = new Set<string>(['planetDistance']);

function field(
  id: string,
  label: string,
  control: string,
  value: string,
): string {
  const bound = CONTROL_BOUNDS[control];

  let attributes: string;

  if (bound !== undefined && !TEXT_CONTROLS.has(control)) {
    const { min, max } = BOUNDS[bound];
    attributes = `type="number" min="${min}" max="${max}" step="1"`;
  } else {
    attributes = `type="text" inputmode="decimal"`;
  }

  return (
    `<div class="field">` +
    `<label for="${id}">${label}</label>` +
    `<input id="${id}" data-control="${control}" ${attributes} value="${value}"` +
    ` aria-describedby="${id}-error"/>` +
    `<span id="${id}-error" class="field-error"></span>` +
    `</div>`
  );
}

function planetFieldset(planet: RawPlanetInput, index: number): string {
  const moonEnabled = planet.moon !== false;
  const moon = planet.moon === false
    ? DEFAULT_MOON
    : planet.moon;

  return (
    `<fieldset data-planet="${index}" data-role="planet-instrument">` +
    `<legend>Planet ${index + 1}</legend>` +
    field(`planet-${index}-size`, 'Size', 'planetSize', planet.size) +
    field(`planet-${index}-distance`, 'Orbital distance', 'planetDistance', planet.distance) +
    `<div class="field">` +
    `<label for="planet-${index}-moon">Moon</label>` +
    `<input id="planet-${index}-moon" data-control="moonEnabled" type="checkbox"` +
    `${moonEnabled ? ' checked' : ''}/>` +
    `</div>` +
    (moonEnabled
      ? field(`planet-${index}-moon-size`, 'Moon size', 'moonSize', moon.size) +
        field(`planet-${index}-moon-distance`, 'Moon distance', 'moonDistance', moon.distance) +
        field(`planet-${index}-moon-period`, 'Moon period', 'moonPeriod', moon.period)
      : '') +
    `<button type="button" data-action="remove-planet" data-index="${index}">` +
    `Remove planet ${index + 1}</button>` +
    `</fieldset>`
  );
}

/** Render the full control surface for a given raw input. */
export function controlsMarkup(input: RawSceneInput): string {
  const paletteOptions = [RANDOM_PALETTE, ...PALETTE_NAMES].map(
    (name) =>
      `<option value="${name}"${name === input.palette ? ' selected' : ''}>${name}</option>`,
  ).join('');

  return (
    `<fieldset data-role="system-instrument">` +
    `<legend>Canvas</legend>` +
    field('canvas-width', 'Canvas width', 'canvasWidth', input.canvasWidth) +
    field('canvas-height', 'Canvas height', 'canvasHeight', input.canvasHeight) +
    `<div class="field">` +
    `<label for="palette">Palette</label>` +
    `<select id="palette" data-control="palette" aria-describedby="palette-error">` +
    `${paletteOptions}</select>` +
    `<span id="palette-error" class="field-error"></span>` +
    `</div>` +
    field('seed', 'Seed', 'seed', input.seed) +
    `<button type="button" data-action="new-seed">New seed</button>` +
    `</fieldset>` +
    input.planets.map(planetFieldset).join('') +
    `<button type="button" data-action="add-planet">Add planet</button>`
  );
}

/** Read the current control values back as raw strings. */
export function readControls(root: ParentNode): RawSceneInput {
  const value = (selector: string): string =>
    root.querySelector<HTMLInputElement>(selector)?.value ?? '';

  const planets: RawPlanetInput[] = [
    ...root.querySelectorAll<HTMLFieldSetElement>('[data-planet]'),
  ].map((fieldset) => {
    const read = (control: string, fallback = ''): string =>
      fieldset.querySelector<HTMLInputElement>(`[data-control="${control}"]`)?.value ?? fallback;
    const enabled =
      fieldset.querySelector<HTMLInputElement>('[data-control="moonEnabled"]')?.checked ??
      false;

    return {
      size: read('planetSize'),
      distance: read('planetDistance'),
      moon: enabled
        ? {
            size: read('moonSize', DEFAULT_MOON.size),
            distance: read('moonDistance', DEFAULT_MOON.distance),
            period: read('moonPeriod', DEFAULT_MOON.period),
          }
        : false,
    };
  });

  return {
    canvasWidth: value('[data-control="canvasWidth"]'),
    canvasHeight: value('[data-control="canvasHeight"]'),
    seed: value('[data-control="seed"]'),
    palette: value('[data-control="palette"]'),
    planets,
  };
}
