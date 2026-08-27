import { PALETTE_NAMES, paletteByName, type PaletteName } from '../generator/palette';
import { icon } from './icons';
import { BOUNDS, type BoundedField } from './validation';
import {
  RANDOM_PALETTE,
  type RawMoonInput,
  type RawPlanetInput,
  type RawSceneInput,
} from './validation';

/**
 * Control surface markup and reading (CTL-001, CTL-002, CX-001, CX-003,
 * CX-010..CX-012, CD-002..CD-006).
 *
 * Controls are plain form elements carrying `data-control` so tests and the
 * change handler can find them without depending on layout. Values are read
 * back as raw strings and handed to the validator: nothing is coerced or
 * repaired here, because CTL-007 forbids silently repairing user input.
 *
 * Bounded magnitude parameters render as a paired `input[type=range]` plus
 * `input[type=number]` (D-205). The NUMBER input is authoritative: it carries
 * `data-control`, so the validator still receives exactly what the user typed,
 * including an out-of-range value that must be rejected rather than clamped.
 * The range only offers direct manipulation and writes into its partner.
 *
 * Two bounded parameters are deliberately exempt from direct manipulation:
 * orbital distance, which accepts either a scalar or four comma-separated
 * values (CX-002), and the seed, which is an identity rather than a magnitude —
 * dragging across four billion values communicates nothing.
 *
 * Planet groups are native `<details>` elements (D-203) so disclosure keyboard
 * behaviour and expanded/collapsed state come from the platform. Collapsed
 * groups keep their controls in the DOM, which is why `readControls` still
 * reads them (CD-002).
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

/**
 * Presentation-only view state (D-204). It is never part of `RawSceneInput`,
 * never submitted, and never reaches the validator or the generator. It lives
 * in `mountApp` because the form is rebuilt wholesale with `innerHTML`, which
 * would destroy any state held in the DOM.
 */
export interface ControlView {
  collapsed?: ReadonlySet<number>;
}

/** Canvas dimension presets (CX-010). UI-only: they write width and height. */
export const CANVAS_PRESETS = [
  { id: 'square', label: 'Square 600 x 600', width: '600', height: '600' },
  { id: 'portrait', label: 'Portrait 600 x 900', width: '600', height: '900' },
  { id: 'landscape', label: 'Landscape 900 x 600', width: '900', height: '600' },
  { id: 'wide', label: 'Wide 1200 x 675', width: '1200', height: '675' },
] as const;

/** Value used when the current dimensions match no preset. */
export const CUSTOM_PRESET = 'custom';

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

/**
 * Bounded controls that are NOT offered as a range. `seed` is an identity, not
 * a magnitude; `planetDistance` is already text because of its dual form.
 */
const NO_RANGE_CONTROLS = new Set<string>(['seed', 'planetDistance']);

/** Which preset, if any, the current dimensions correspond to (CX-010). */
export function presetFor(width: string, height: string): string {
  const match = CANVAS_PRESETS.find(
    (preset) => preset.width === width && preset.height === height,
  );

  return match === undefined ? CUSTOM_PRESET : match.id;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

interface FieldOptions {
  /** Icon rendered beside the label. Decorative; the label carries meaning. */
  glyph?: Parameters<typeof icon>[0];
  /** Marks the field as part of a compact multi-column sub-group. */
  compact?: boolean;
}

/**
 * A single parameter field: label, editable value, and its error slot.
 *
 * The error slot always exists so `aria-describedby` has a stable target, but
 * it is hidden by `:empty` in CSS and therefore contributes no height while no
 * message is present (CD-006, D-209).
 */
function field(
  id: string,
  label: string,
  control: string,
  value: string,
  options: FieldOptions = {},
): string {
  const bound = CONTROL_BOUNDS[control];
  const isBounded = bound !== undefined && !TEXT_CONTROLS.has(control);
  const wantsRange = isBounded && !NO_RANGE_CONTROLS.has(control);
  const glyph = options.glyph === undefined ? '' : icon(options.glyph);
  const classes = ['field', options.compact === true ? 'field--compact' : '']
    .filter((name) => name !== '')
    .join(' ');

  let numeric: string;
  let range = '';

  if (isBounded) {
    const { min, max } = BOUNDS[bound];

    numeric =
      `<input id="${id}" data-control="${control}" type="number"` +
      ` min="${min}" max="${max}" step="1" value="${escapeAttribute(value)}"` +
      ` aria-describedby="${id}-error"/>`;

    if (wantsRange) {
      // The range is a second view of the same value. It is labelled by the
      // same visible label, and it never carries `data-control`: the number
      // input remains the single value the validator reads (D-205).
      range =
        `<input class="field-range" data-range-for="${id}" type="range"` +
        ` min="${min}" max="${max}" step="1" value="${escapeAttribute(value)}"` +
        ` aria-labelledby="${id}-label"/>`;
    }
  } else {
    numeric =
      `<input id="${id}" data-control="${control}" type="text" inputmode="decimal"` +
      ` value="${escapeAttribute(value)}" aria-describedby="${id}-error"/>`;
  }

  return (
    `<div class="${classes}">` +
    `<label id="${id}-label" for="${id}">${glyph}<span>${label}</span></label>` +
    `<span class="field-value">${range}${numeric}</span>` +
    `<span id="${id}-error" class="field-error"></span>` +
    `</div>`
  );
}

/** The moon sub-group: a switch plus, when enabled, three compact controls. */
function moonGroup(planet: RawPlanetInput, index: number): string {
  const enabled = planet.moon !== false;
  const moon = planet.moon === false ? DEFAULT_MOON : planet.moon;

  const controls = enabled
    ? `<div class="moon-controls">` +
      field(`planet-${index}-moon-size`, 'Moon size', 'moonSize', moon.size, {
        glyph: 'moon',
        compact: true,
      }) +
      field(
        `planet-${index}-moon-distance`,
        'Moon distance',
        'moonDistance',
        moon.distance,
        { glyph: 'distance', compact: true },
      ) +
      field(`planet-${index}-moon-period`, 'Moon period', 'moonPeriod', moon.period, {
        glyph: 'moonPeriod',
        compact: true,
      }) +
      `</div>`
    : '';

  return (
    `<div class="moon-group">` +
    `<div class="switch-field">` +
    `<input id="planet-${index}-moon" data-control="moonEnabled" type="checkbox"` +
    ` class="switch-input"${enabled ? ' checked' : ''}/>` +
    `<label for="planet-${index}-moon">${icon('moon')}<span>Moon</span></label>` +
    `</div>` +
    controls +
    `</div>`
  );
}

/**
 * Collapsed summary (CD-003). Identity, size, and distance are text, and moon
 * presence is announced through an icon that carries an explicit label —
 * never through colour alone (UI-008).
 */
function planetSummary(planet: RawPlanetInput, index: number): string {
  const hasMoon = planet.moon !== false;
  const moonBadge = hasMoon
    ? `<span class="summary-moon">${icon('moon', { label: 'Has a moon' })}</span>`
    : '';

  return (
    `<summary data-action="toggle-planet" data-index="${index}">` +
    `<span class="summary-marker">${icon('disclosure')}</span>` +
    `<span class="summary-title">${icon('planet')}<span>Planet ${index + 1}</span></span>` +
    `<span class="summary-facts">` +
    `<span data-role="summary-size">r${escapeAttribute(planet.size)}</span>` +
    `<span data-role="summary-distance">d${escapeAttribute(planet.distance)}</span>` +
    moonBadge +
    `</span>` +
    `</summary>`
  );
}

function planetInstrument(
  planet: RawPlanetInput,
  index: number,
  collapsed: ReadonlySet<number>,
): string {
  const open = collapsed.has(index) ? '' : ' open';

  return (
    `<details data-planet="${index}" data-role="planet-instrument"${open}>` +
    planetSummary(planet, index) +
    `<div class="planet-body">` +
    field(`planet-${index}-size`, 'Size', 'planetSize', planet.size, { glyph: 'size' }) +
    field(
      `planet-${index}-distance`,
      'Orbital distance',
      'planetDistance',
      planet.distance,
      { glyph: 'distance' },
    ) +
    moonGroup(planet, index) +
    `<button type="button" data-action="remove-planet" data-index="${index}">` +
    `${icon('remove')}<span>Remove planet ${index + 1}</span></button>` +
    `</div>` +
    `</details>`
  );
}

/** Palette swatch group (CX-011): every option shows its colours AND its name. */
function paletteGroup(selected: string): string {
  const option = (name: string, swatches: readonly string[]): string => {
    const id = `palette-${name.toLowerCase()}`;
    const chips = swatches
      .map((colour) => `<span class="swatch-chip" style="background:${colour}"></span>`)
      .join('');

    return (
      `<div class="swatch">` +
      `<input id="${id}" data-control="palette" type="radio" name="palette"` +
      ` value="${escapeAttribute(name)}"${name === selected ? ' checked' : ''}/>` +
      `<label for="${id}">` +
      `<span class="swatch-chips" aria-hidden="true">${chips}</span>` +
      `<span class="swatch-name">${name}</span>` +
      `</label>` +
      `</div>`
    );
  };

  const named = PALETTE_NAMES.map((name: PaletteName) => {
    const palette = paletteByName(name);

    return option(name, [palette.sun, ...palette.planetHues.slice(0, 3)]);
  }).join('');

  // The seed-chosen option is visually distinguishable from a named palette:
  // its chips are the neutral chrome tones, and its name states the behaviour.
  const random = option(RANDOM_PALETTE, ['#4a5a68', '#5f7183', '#3b4956', '#2a343e']);

  return (
    `<fieldset class="swatch-group" data-role="palette-group">` +
    `<legend>${icon('palette')}<span>Palette</span></legend>` +
    `<div class="swatch-grid">${random}${named}</div>` +
    `<span id="palette-error" class="field-error"></span>` +
    `</fieldset>`
  );
}

/** Canvas dimension presets (CX-010). Carries no `data-control` (CTL-009). */
function canvasPresets(width: string, height: string): string {
  const current = presetFor(width, height);
  const options = CANVAS_PRESETS.map(
    (preset) =>
      `<option value="${preset.id}"${preset.id === current ? ' selected' : ''}>` +
      `${preset.label}</option>`,
  ).join('');

  return (
    `<div class="field">` +
    `<label id="canvas-preset-label" for="canvas-preset">` +
    `${icon('preset')}<span>Preset</span></label>` +
    `<span class="field-value">` +
    `<select id="canvas-preset" data-preset="canvas">` +
    `<option value="${CUSTOM_PRESET}"${current === CUSTOM_PRESET ? ' selected' : ''}>` +
    `Custom</option>` +
    options +
    `</select>` +
    `</span>` +
    `</div>`
  );
}

/** Render the full control surface for a given raw input and view state. */
export function controlsMarkup(input: RawSceneInput, view: ControlView = {}): string {
  const collapsed = view.collapsed ?? new Set<number>();

  return (
    `<fieldset data-role="system-instrument">` +
    `<legend>${icon('canvas')}<span>Canvas</span></legend>` +
    canvasPresets(input.canvasWidth, input.canvasHeight) +
    field('canvas-width', 'Canvas width', 'canvasWidth', input.canvasWidth, {
      glyph: 'size',
    }) +
    field('canvas-height', 'Canvas height', 'canvasHeight', input.canvasHeight, {
      glyph: 'size',
    }) +
    `</fieldset>` +
    paletteGroup(input.palette) +
    `<fieldset data-role="seed-instrument">` +
    `<legend>${icon('seed')}<span>Seed</span></legend>` +
    field('seed', 'Seed', 'seed', input.seed, { glyph: 'seed' }) +
    `<button type="button" data-action="new-seed">` +
    `${icon('newSeed')}<span>New seed</span></button>` +
    `</fieldset>` +
    input.planets
      .map((planet, index) => planetInstrument(planet, index, collapsed))
      .join('') +
    `<button type="button" data-action="add-planet">` +
    `${icon('add')}<span>Add planet</span></button>`
  );
}

/** Read the current control values back as raw strings. */
export function readControls(root: ParentNode): RawSceneInput {
  const value = (selector: string): string =>
    root.querySelector<HTMLInputElement>(selector)?.value ?? '';

  // Collapsed planet groups keep their controls in the DOM, so a collapsed
  // planet is still read and still submitted (CD-002).
  const planets: RawPlanetInput[] = [
    ...root.querySelectorAll<HTMLElement>('[data-planet]'),
  ].map((group) => {
    const read = (control: string, fallback = ''): string =>
      group.querySelector<HTMLInputElement>(`[data-control="${control}"]`)?.value ?? fallback;
    const enabled =
      group.querySelector<HTMLInputElement>('[data-control="moonEnabled"]')?.checked ??
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

  // The palette is a radio group, so the selected value is the checked input
  // rather than a select's value (D-207).
  const palette =
    root.querySelector<HTMLInputElement>('[data-control="palette"]:checked')?.value ?? '';

  return {
    canvasWidth: value('[data-control="canvasWidth"]'),
    canvasHeight: value('[data-control="canvasHeight"]'),
    seed: value('[data-control="seed"]'),
    palette,
    planets,
  };
}
