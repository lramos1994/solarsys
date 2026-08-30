import { RING_TYPES, type RingType } from '../generator/ring';
import { PALETTE_NAMES, paletteByName, type PaletteName } from '../generator/palette';
import { SUN_TYPES, type SunType } from '../generator/bodies';
import { icon } from './icons';
import {
  BELT_TYPES,
  BOUNDS,
  DEFAULT_BELT_TYPE,
  stepOf,
  type BoundedField,
} from './validation';
import {
  DEFAULT_SUN_SELECTION,
  RANDOM_PALETTE,
  type RawAsteroidBeltConfig,
  type RawMoonInput,
  type RawOrbitInput,
  type RawPlanetInput,
  type RawRingConfig,
  type RawSceneInput,
} from './validation';

/**
 * Control surface markup and reading (CTL-001, CTL-002, CX-001, CX-003,
 * CX-010..CX-014, CD-002..CD-007).
 *
 * Controls are plain form elements carrying `data-control` so tests and the
 * change handler can find them without depending on layout. Values are read
 * back as raw strings and handed to the validator: nothing is coerced or
 * repaired here, because CTL-007 forbids silently repairing user input.
 *
 * Bounded magnitude parameters render as a paired `input[type=range]` plus
 * `input[type=number]`. The NUMBER input is authoritative: it carries
 * `data-control`, so the validator still receives exactly what the user typed.
 * The range only offers direct manipulation and writes into its partner.
 *
 * Orbital distance is scalar by default (one pair) and custom mode renders four
 * directional pairs (CX-014). Planet groups are native `<details>` elements
 * (D-203); the Ring group is a nested `<details>` inside each planet and the
 * Asteroid Belt is a scene-level nested `<details>`.
 */

/** Values the mounted control surface may submit; scene identity is app-owned. */
export type RawSceneControls = Omit<RawSceneInput, 'seed'>;

export const DEFAULT_MOON: RawMoonInput = {
  size: '28',
  distance: '180',
  period: '15',
};

/** Ring defaults applied when a user enables a ring on any planet. */
export const DEFAULT_RING_CONFIG: RawRingConfig = {
  type: 'Banded',
  sizePercent: '210',
  inclinationDegrees: '16',
};

/** Asteroid belt defaults applied when the belt is enabled. */
export const DEFAULT_BELT: RawAsteroidBeltConfig = {
  type: DEFAULT_BELT_TYPE,
  count: '130',
  innerRadiusPercent: '81',
  outerRadiusPercent: '87',
  size: '2',
  period: '163',
};

export const DEFAULT_INPUT: RawSceneInput = {
  canvasWidth: '600',
  canvasHeight: '600',
  seed: '20260826',
  palette: RANDOM_PALETTE,
  sunType: DEFAULT_SUN_SELECTION,
  planets: [
    { size: '4', distance: { mode: 'scalar', value: '37' }, moon: false, ring: false },
    {
      size: '6',
      distance: { mode: 'scalar', value: '63' },
      moon: { size: '28', distance: '180', period: '15' },
      ring: { type: 'Banded', sizePercent: '210', inclinationDegrees: '16' },
    },
    { size: '3', distance: { mode: 'scalar', value: '87' }, moon: false, ring: false },
  ],
  asteroidBelt: DEFAULT_BELT,
};

/** Defaults for a newly added planet (CTL-003). */
export const DEFAULT_PLANET: RawPlanetInput = {
  size: '10',
  distance: { mode: 'scalar', value: '50' },
  moon: false,
  ring: false,
};

/**
 * Presentation-only view state (D-204, CD-007). It is never part of
 * `RawSceneInput`, never submitted, and never reaches the validator or the
 * generator. It lives in `mountApp` because the form is rebuilt wholesale with
 * `innerHTML`, which would destroy any state held in the DOM.
 */
export interface ControlView {
  collapsed?: ReadonlySet<number>;
  /** Planet indices whose Ring detail group is expanded. */
  ringOpen?: ReadonlySet<number>;
  /** Whether the scene-level Asteroid Belt detail group is expanded. */
  beltOpen?: boolean;
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
  orbitLeft: 'orbitLeft',
  orbitTop: 'orbitTop',
  orbitRight: 'orbitRight',
  orbitBottom: 'orbitBottom',
  moonSize: 'moonSize',
  moonDistance: 'moonDistance',
  moonPeriod: 'moonPeriod',
  ringSize: 'ringSize',
  ringInclination: 'ringInclination',
  asteroidCount: 'asteroidCount',
  asteroidInnerRadius: 'asteroidInnerRadius',
  asteroidOuterRadius: 'asteroidOuterRadius',
  asteroidSize: 'asteroidSize',
  asteroidPeriod: 'asteroidPeriod',
};

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

/**
 * Compact, comma-free distance text for the collapsed summary. Scalar and
 * legacy string forms render the single value; a custom orbit renders the
 * min–max extent range so the summary reads as a description rather than a
 * bare comma-joined list of four numbers (CX-021, RB-025).
 */
function distanceText(distance: RawPlanetInput['distance']): string {
  if (typeof distance === 'string') {
    return distance;
  }

  if (distance.mode === 'scalar') {
    return distance.value;
  }

  const extents = [distance.left, distance.top, distance.right, distance.bottom].map(Number);
  const min = Math.min(...extents);
  const max = Math.max(...extents);

  return `${min}–${max}`;
}

interface FieldOptions {
  glyph?: Parameters<typeof icon>[0];
  compact?: boolean;
  /** Full accessible name; overrides the concise visible label for AT. */
  ariaLabel?: string;
  /**
   * Reference length an authored percentage is measured against (CX-022).
   * Supplying it marks the field proportional: a `%` suffix is shown and the
   * reference is announced through `aria-describedby`.
   */
  reference?: 'scene' | 'planet';
}

/** What a proportional control's percentage is a share of (CX-022). */
const REFERENCE_TEXT = {
  scene: 'percent of the scene radius, the distance from the centre to the nearest canvas edge',
  planet: 'percent of the planet radius',
} as const;

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
  const glyph = options.glyph === undefined ? '' : icon(options.glyph);
  const classes = ['field', options.compact === true ? 'field--compact' : '']
    .filter((name) => name !== '')
    .join(' ');
  const reference = options.reference;
  const describedBy = reference === undefined
    ? `${id}-error`
    : `${id}-unit ${id}-error`;
  // The unit belongs in the accessible name too: a screen-reader user editing
  // "Distance" must hear that it is a percentage, not a pixel count.
  const accessibleName = options.ariaLabel === undefined
    ? undefined
    : reference === undefined
      ? options.ariaLabel
      : `${options.ariaLabel} in percent`;
  const ariaLabel = accessibleName === undefined
    ? ''
    : ` aria-label="${escapeAttribute(accessibleName)}"`;

  let numeric: string;
  let range = '';

  if (bound !== undefined) {
    const { min, max } = BOUNDS[bound];
    const step = stepOf(bound);

    numeric =
      `<input id="${id}" data-control="${control}" type="number"` +
      ` min="${min}" max="${max}" step="${step}" value="${escapeAttribute(value)}"` +
      `${ariaLabel} aria-describedby="${describedBy}"/>`;

    range =
      `<input class="field-range" data-range-for="${id}" type="range"` +
      ` min="${min}" max="${max}" step="${step}" value="${escapeAttribute(value)}"` +
      ` aria-labelledby="${id}-label"/>`;
  } else {
    numeric =
      `<input id="${id}" data-control="${control}" type="text" inputmode="decimal"` +
      ` value="${escapeAttribute(value)}"${ariaLabel} aria-describedby="${describedBy}"/>`;
  }

  const unit = reference === undefined
    ? ''
    : `<span id="${id}-unit" class="field-unit" data-reference="${reference}"` +
      ` title="${escapeAttribute(REFERENCE_TEXT[reference])}">%</span>`;

  return (
    `<div class="${classes}">` +
    `<label id="${id}-label" for="${id}">${glyph}<span>${label}</span></label>` +
    `<span class="field-value">${range}${numeric}${unit}</span>` +
    `<span id="${id}-error" class="field-error"></span>` +
    `</div>`
  );
}

/** A labelled select field, used for the ring type allow-list. */
function selectField(
  id: string,
  label: string,
  control: string,
  value: string,
  options: readonly string[],
): string {
  const optionMarkup = options
    .map((option) => `<option value="${option}"${option === value ? ' selected' : ''}>${option}</option>`)
    .join('');

  return (
    `<div class="field">` +
    `<label id="${id}-label" for="${id}"><span>${label}</span></label>` +
    `<span class="field-value">` +
    `<select id="${id}" data-control="${control}" aria-describedby="${id}-error">` +
    optionMarkup +
    `</select>` +
    `</span>` +
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
      field(`planet-${index}-moon-size`, 'Size', 'moonSize', moon.size, {
        glyph: 'moon',
        compact: true,
        ariaLabel: 'Moon size',
        reference: 'planet',
      }) +
      field(`planet-${index}-moon-distance`, 'Distance', 'moonDistance', moon.distance, {
        glyph: 'distance',
        compact: true,
        ariaLabel: 'Moon distance',
        reference: 'planet',
      }) +
      field(`planet-${index}-moon-period`, 'Period', 'moonPeriod', moon.period, {
        glyph: 'moonPeriod',
        compact: true,
        ariaLabel: 'Moon period',
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

/** Scalar/custom orbital-distance controls (CX-014, CTL-002). */
function orbitGroup(planet: RawPlanetInput, index: number): string {
  const distance = planet.distance;
  const isCustom = typeof distance === 'object' && distance.mode === 'custom';
  const scalarValue = typeof distance === 'string'
    ? distance
    : distance.mode === 'scalar'
      ? distance.value
      : distance.left;

  const modeMarkup =
    `<div class="orbit-mode" role="radiogroup" aria-label="Orbital distance form">` +
    `<label><input type="radio" name="planet-${index}-orbit-mode"` +
    ` data-orbit-mode="scalar"${isCustom ? '' : ' checked'}/><span>Scalar</span></label>` +
    `<label><input type="radio" name="planet-${index}-orbit-mode"` +
    ` data-orbit-mode="custom"${isCustom ? ' checked' : ''}/><span>Custom</span></label>` +
    `</div>`;

  const controls = isCustom
    ? field(`planet-${index}-orbit-left`, 'Left', 'orbitLeft', distance.left, {
        glyph: 'distance',
        ariaLabel: 'Left orbital distance',
        reference: 'scene',
      }) +
      field(`planet-${index}-orbit-top`, 'Top', 'orbitTop', distance.top, {
        glyph: 'distance',
        ariaLabel: 'Top orbital distance',
        reference: 'scene',
      }) +
      field(`planet-${index}-orbit-right`, 'Right', 'orbitRight', distance.right, {
        glyph: 'distance',
        ariaLabel: 'Right orbital distance',
        reference: 'scene',
      }) +
      field(`planet-${index}-orbit-bottom`, 'Bottom', 'orbitBottom', distance.bottom, {
        glyph: 'distance',
        ariaLabel: 'Bottom orbital distance',
        reference: 'scene',
      })
    : field(`planet-${index}-distance`, 'Orbital distance', 'planetDistance', scalarValue, {
        glyph: 'distance',
        ariaLabel: 'Orbital distance',
        reference: 'scene',
      });

  return modeMarkup + controls;
}

/** Per-planet ring toggle plus, when enabled, a nested detail group. */
function ringGroup(planet: RawPlanetInput, index: number, open: boolean): string {
  const enabled = planet.ring !== false && planet.ring !== undefined;
  const ring = enabled && planet.ring !== undefined && planet.ring !== false
    ? planet.ring
    : DEFAULT_RING_CONFIG;

  const details = enabled
    ? `<details class="authored-group"${open ? ' open' : ''}>` +
      `<summary><span>Ring details</span><span class="authored-summary">${ring.type} · ${ring.sizePercent}%</span></summary>` +
      `<div class="authored-body">` +
      selectField(`planet-${index}-ring-type`, 'Ring type', 'ringType', ring.type, [...RING_TYPES]) +
      field(`planet-${index}-ring-size`, 'Ring size', 'ringSize', ring.sizePercent, {
        glyph: 'size',
      }) +
      field(`planet-${index}-ring-inclination`, 'Ring inclination', 'ringInclination', ring.inclinationDegrees, {
        glyph: 'size',
      }) +
      `</div>` +
      `</details>`
    : '';

  return (
    `<div class="authored-toggle">` +
    `<div class="switch-field">` +
    `<input id="planet-${index}-ring" data-control="ringEnabled" type="checkbox"` +
    ` class="switch-input"${enabled ? ' checked' : ''}/>` +
    `<label for="planet-${index}-ring"><span>Ring</span></label>` +
    `</div>` +
    details +
    `</div>`
  );
}

/** Scene-level asteroid belt toggle plus, when enabled, a nested detail group. */
function beltGroup(input: RawSceneControls, open: boolean): string {
  const enabled = input.asteroidBelt !== false && input.asteroidBelt !== undefined;
  const belt = enabled && input.asteroidBelt !== undefined && input.asteroidBelt !== false
    ? input.asteroidBelt
    : DEFAULT_BELT;
  const type = belt.type ?? DEFAULT_BELT_TYPE;

  const body = enabled
    ? `<div class="belt-body"${open ? '' : ' hidden'}>` +
      selectField('belt-type', 'Belt type', 'beltType', type, BELT_TYPES) +
      field('asteroid-count', 'Asteroid count', 'asteroidCount', belt.count, { glyph: 'size' }) +
      field('asteroid-inner-radius', 'Inner radius', 'asteroidInnerRadius', belt.innerRadiusPercent, {
        glyph: 'distance',
        ariaLabel: 'Asteroid inner radius',
      }) +
      field('asteroid-outer-radius', 'Outer radius', 'asteroidOuterRadius', belt.outerRadiusPercent, {
        glyph: 'distance',
        ariaLabel: 'Asteroid outer radius',
      }) +
      field('asteroid-size', 'Asteroid size', 'asteroidSize', belt.size, {
        glyph: 'size',
        ariaLabel: 'Asteroid base size',
      }) +
      field('asteroid-period', 'Rotation period', 'asteroidPeriod', belt.period, {
        glyph: 'moonPeriod',
        ariaLabel: 'Asteroid rotation period',
      }) +
      `</div>`
    : '';

  const chevron = enabled
    ? `<button type="button" class="belt-chevron" data-action="toggle-belt-details"` +
      ` aria-expanded="${open}">${open ? '▾' : '▸'}</button>`
    : '';

  const summary = enabled ? `${type} belt · ${belt.count} rocks` : 'off';

  return (
    `<div class="belt-group" data-role="asteroid-belt-group">` +
    `<div class="belt-row">` +
    `<input id="asteroid-belt-enabled" data-control="beltEnabled" type="checkbox"` +
    ` class="switch-input"${enabled ? ' checked' : ''}/>` +
    `<label for="asteroid-belt-enabled"><span>Asteroid belt</span></label>` +
    `<span class="authored-summary" data-role="belt-summary">${escapeAttribute(summary)}</span>` +
    chevron +
    `</div>` +
    body +
    `</div>`
  );
}

/**
 * Collapsed summary (CD-003, CX-021). Identity, size, and distance are short
 * LABELLED values — never the raw `r<num>`/`d<num>` generator codes. Each
 * abbreviated value carries the full sentence as `title` (pointer convenience)
 * and `aria-label` (the normative carrier for assistive technology). Moon
 * presence is announced through an icon that carries an explicit label, not
 * colour alone.
 */
function planetSummary(planet: RawPlanetInput, index: number): string {
  const hasMoon = planet.moon !== false;
  const distance = distanceText(planet.distance);
  const sizeDescription = `Planet size: ${planet.size}% of the scene radius`;
  const orbitDescription = `Orbital distance: ${distance}% of the scene radius`;
  const moonBadge = hasMoon
    ? `<span class="summary-moon">${icon('moon', { label: 'Has a moon' })}</span>`
    : '';

  return (
    `<summary data-action="toggle-planet" data-index="${index}">` +
    `<span class="summary-marker">${icon('disclosure')}</span>` +
    `<span class="summary-title">${icon('planet')}<span>Planet ${index + 1}</span></span>` +
    `<span class="summary-facts">` +
    `<span class="summary-fact" data-role="summary-size"` +
    ` title="${escapeAttribute(sizeDescription)}" aria-label="${escapeAttribute(sizeDescription)}">` +
    `Size ${escapeAttribute(planet.size)}%</span>` +
    `<span class="summary-fact" data-role="summary-distance"` +
    ` title="${escapeAttribute(orbitDescription)}" aria-label="${escapeAttribute(orbitDescription)}">` +
    `Orbit ${escapeAttribute(distance)}%</span>` +
    moonBadge +
    `</span>` +
    `</summary>`
  );
}

/**
 * Per-planet editing dialog (CX-020). Hosts the visual edits — size, moon,
 * ring — plus the isolated preview container and Remove planet. Orbital
 * distance deliberately stays in the deck (design §5), so no orbit control is
 * rendered here. The dialog is a child of the planet's `data-planet` group so
 * `readControls` reads the relocated controls through the same group scope.
 * Its lifecycle (`showModal`, focus trap, focus return, remap on removal) is
 * owned by the app layer (`ts/app/main.ts`); this only renders the markup.
 */
function planetDialog(planet: RawPlanetInput, index: number, ringOpen: boolean): string {
  return (
    `<dialog class="planet-dialog" data-role="planet-dialog" data-index="${index}"` +
    ` aria-labelledby="planet-${index}-dialog-title">` +
    `<div class="dialog-header">` +
    `<h2 class="dialog-title" id="planet-${index}-dialog-title">` +
    `${icon('planet')}<span>Planet ${index + 1}</span></h2>` +
    `<button type="button" class="dialog-close" data-action="close-planet-dialog"` +
    ` data-index="${index}"><span>Close</span></button>` +
    `</div>` +
    `<div class="dialog-preview" data-role="planet-preview"></div>` +
    `<div class="dialog-body">` +
    field(`planet-${index}-size`, 'Size', 'planetSize', planet.size, {
      glyph: 'size',
      ariaLabel: 'Planet size',
      reference: 'scene',
    }) +
    moonGroup(planet, index) +
    ringGroup(planet, index, ringOpen) +
    `</div>` +
    `<div class="dialog-actions">` +
    `<button type="button" data-action="remove-planet" data-index="${index}">` +
    `${icon('remove')}<span>Remove planet ${index + 1}</span></button>` +
    `</div>` +
    `</dialog>`
  );
}

function planetInstrument(
  planet: RawPlanetInput,
  index: number,
  collapsed: ReadonlySet<number>,
  ringOpen: ReadonlySet<number>,
): string {
  const open = collapsed.has(index) ? '' : ' open';

  return (
    `<details data-planet="${index}" data-role="planet-instrument"${open}>` +
    planetSummary(planet, index) +
    `<div class="planet-body">` +
    orbitGroup(planet, index) +
    `<button type="button" class="planet-edit" data-action="open-planet-dialog"` +
    ` data-index="${index}">${icon('size')}<span>Edit planet ${index + 1}</span></button>` +
    `</div>` +
    planetDialog(planet, index, ringOpen.has(index)) +
    `</details>`
  );
}

/** Sun type label + option markup, matching the belt/ring selector style. */
const SUN_TYPE_LABELS: Record<SunType, string> = {
  YellowDwarf: 'Yellow Dwarf',
  RedGiant: 'Red Giant',
  WhiteDwarf: 'White Dwarf',
};

/** Sun class selector (scene-level, alongside palette). */
function sunGroup(selected: string): string {
  const options = SUN_TYPES.map(
    (type) =>
      `<option value="${type}"${type === selected ? ' selected' : ''}>` +
      `${SUN_TYPE_LABELS[type]}</option>`,
  ).join('');

  return (
    `<div class="field">` +
    `<label id="sun-type-label" for="sun-type">${icon('sun')}<span>Sun type</span></label>` +
    `<span class="field-value">` +
    `<select id="sun-type" data-control="sunType" aria-describedby="sun-type-error">` +
    options +
    `</select>` +
    `</span>` +
    `<span id="sun-type-error" class="field-error"></span>` +
    `</div>`
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
export function controlsMarkup(input: RawSceneControls, view: ControlView = {}): string {
  const collapsed = view.collapsed ?? new Set<number>();
  const ringOpen = view.ringOpen ?? new Set<number>();

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
    sunGroup(input.sunType ?? DEFAULT_SUN_SELECTION) +
    beltGroup(input, view.beltOpen ?? false) +
    input.planets
      .map((planet, index) => planetInstrument(planet, index, collapsed, ringOpen))
      .join('') +
    `<button type="button" data-action="add-planet">` +
    `${icon('add')}<span>Add planet</span></button>`
  );
}

/** Read the current control values back as raw strings. */
export function readControls(root: ParentNode): RawSceneControls {
  const value = (selector: string): string =>
    root.querySelector<HTMLInputElement>(selector)?.value ?? '';

  const planets: RawPlanetInput[] = [
    ...root.querySelectorAll<HTMLElement>('[data-planet]'),
  ].map((group) => {
    const read = (control: string, fallback = ''): string =>
      group.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-control="${control}"]`)
        ?.value ?? fallback;
    const customMode = group.querySelector<HTMLInputElement>('[data-orbit-mode="custom"]')
      ?.checked ?? false;
    const distance: RawOrbitInput = customMode
      ? {
          mode: 'custom',
          left: read('orbitLeft'),
          top: read('orbitTop'),
          right: read('orbitRight'),
          bottom: read('orbitBottom'),
        }
      : { mode: 'scalar', value: read('planetDistance') };

    const moonEnabled =
      group.querySelector<HTMLInputElement>('[data-control="moonEnabled"]')?.checked ?? false;
    const ringEnabled =
      group.querySelector<HTMLInputElement>('[data-control="ringEnabled"]')?.checked ?? false;

    return {
      size: read('planetSize'),
      distance,
      moon: moonEnabled
        ? {
            size: read('moonSize', DEFAULT_MOON.size),
            distance: read('moonDistance', DEFAULT_MOON.distance),
            period: read('moonPeriod', DEFAULT_MOON.period),
          }
        : false,
      ring: ringEnabled
        ? {
            type: read('ringType', DEFAULT_RING_CONFIG.type),
            sizePercent: read('ringSize', DEFAULT_RING_CONFIG.sizePercent),
            inclinationDegrees: read('ringInclination', DEFAULT_RING_CONFIG.inclinationDegrees),
          }
        : false,
    };
  });

  const palette =
    root.querySelector<HTMLInputElement>('[data-control="palette"]:checked')?.value ?? '';
  const sunType =
    root.querySelector<HTMLSelectElement>('[data-control="sunType"]')?.value ??
    DEFAULT_SUN_SELECTION;
  const beltEnabled =
    root.querySelector<HTMLInputElement>('[data-control="beltEnabled"]')?.checked ?? false;
  const readBelt = (control: string, fallback = ''): string =>
    root.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-control="${control}"]`)?.value ??
    fallback;

  return {
    canvasWidth: value('[data-control="canvasWidth"]'),
    canvasHeight: value('[data-control="canvasHeight"]'),
    palette,
    sunType,
    planets,
    asteroidBelt: beltEnabled
      ? {
          type: readBelt('beltType', DEFAULT_BELT_TYPE),
          count: readBelt('asteroidCount', DEFAULT_BELT.count),
          innerRadiusPercent: readBelt('asteroidInnerRadius', DEFAULT_BELT.innerRadiusPercent),
          outerRadiusPercent: readBelt('asteroidOuterRadius', DEFAULT_BELT.outerRadiusPercent),
          size: readBelt('asteroidSize', DEFAULT_BELT.size),
          period: readBelt('asteroidPeriod', DEFAULT_BELT.period),
        }
      : false,
  };
}
