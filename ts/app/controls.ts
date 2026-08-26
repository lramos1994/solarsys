import { PALETTE_NAMES } from '../generator/palette';
import type { RawPlanetInput, RawSceneInput } from './validation';

/**
 * Control surface markup and reading (CTL-001, CTL-002).
 *
 * Controls are plain form elements carrying `data-control` so tests and the
 * change handler can find them without depending on layout. Values are read
 * back as raw strings and handed to the validator: nothing is coerced or
 * repaired here, because CTL-007 forbids silently repairing user input.
 */

export const DEFAULT_INPUT: RawSceneInput = {
  canvasWidth: '600',
  canvasHeight: '600',
  seed: '20260826',
  palette: 'Aurora',
  planets: [
    { size: '12', distance: '110', moon: false },
    { size: '18', distance: '190', moon: { size: '5', distance: '32', period: '15' } },
    { size: '9', distance: '260', moon: false },
  ],
};

function field(
  id: string,
  label: string,
  control: string,
  value: string,
): string {
  return (
    `<div class="field">` +
    `<label for="${id}">${label}</label>` +
    `<input id="${id}" data-control="${control}" type="text" value="${value}"/>` +
    `</div>`
  );
}

function planetFieldset(planet: RawPlanetInput, index: number): string {
  const moonEnabled = planet.moon !== false;
  const moon = planet.moon === false
    ? { size: '5', distance: '32', period: '15' }
    : planet.moon;

  return (
    `<fieldset data-planet="${index}">` +
    `<legend>Planet ${index + 1}</legend>` +
    field(`planet-${index}-size`, 'Size', 'planetSize', planet.size) +
    field(`planet-${index}-distance`, 'Orbital distance', 'planetDistance', planet.distance) +
    `<div class="field">` +
    `<label for="planet-${index}-moon">Moon</label>` +
    `<input id="planet-${index}-moon" data-control="moonEnabled" type="checkbox"` +
    `${moonEnabled ? ' checked' : ''}/>` +
    `</div>` +
    field(`planet-${index}-moon-size`, 'Moon size', 'moonSize', moon.size) +
    field(`planet-${index}-moon-distance`, 'Moon distance', 'moonDistance', moon.distance) +
    field(`planet-${index}-moon-period`, 'Moon period', 'moonPeriod', moon.period) +
    `<button type="button" data-action="remove-planet" data-index="${index}">` +
    `Remove planet ${index + 1}</button>` +
    `</fieldset>`
  );
}

/** Render the full control surface for a given raw input. */
export function controlsMarkup(input: RawSceneInput): string {
  const paletteOptions = PALETTE_NAMES.map(
    (name) =>
      `<option value="${name}"${name === input.palette ? ' selected' : ''}>${name}</option>`,
  ).join('');

  return (
    `<fieldset>` +
    `<legend>Canvas</legend>` +
    field('canvas-width', 'Canvas width', 'canvasWidth', input.canvasWidth) +
    field('canvas-height', 'Canvas height', 'canvasHeight', input.canvasHeight) +
    `<div class="field">` +
    `<label for="palette">Palette</label>` +
    `<select id="palette" data-control="palette">${paletteOptions}</select>` +
    `</div>` +
    field('seed', 'Seed', 'seed', input.seed) +
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
    const read = (control: string): string =>
      fieldset.querySelector<HTMLInputElement>(`[data-control="${control}"]`)?.value ?? '';
    const enabled =
      fieldset.querySelector<HTMLInputElement>('[data-control="moonEnabled"]')?.checked ??
      false;

    return {
      size: read('planetSize'),
      distance: read('planetDistance'),
      moon: enabled
        ? {
            size: read('moonSize'),
            distance: read('moonDistance'),
            period: read('moonPeriod'),
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
