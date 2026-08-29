import {
  ChevronRight,
  Dices,
  Download,
  Frame,
  Maximize,
  Moon,
  Orbit,
  Palette,
  Pause,
  Play,
  Plus,
  Radius,
  Ruler,
  Smartphone,
  Sparkles,
  Sun,
  Timer,
  Trash2,
} from 'lucide';

/**
 * Iconography (UI-002, UI-008).
 *
 * Lucide ships each icon as plain data — an array of `[tag, attributes]` pairs
 * — so an icon can be serialized to markup without a framework runtime and
 * without touching the DOM. That matters here because `controlsMarkup` composes
 * an HTML string; Lucide's own `createElement` returns a DOM node and would
 * force a second mount phase (D-201).
 *
 * Icons are DECORATIVE BY DEFAULT (D-202): `aria-hidden="true"` and
 * `focusable="false"` unless a caller passes an explicit label. UI-008 requires
 * that an icon never be the sole carrier of meaning, so the failure mode of
 * forgetting a label is a silent icon beside existing text — not a duplicated
 * or missing announcement.
 *
 * Sizing and colour resolve through the chrome token set: the SVG inherits
 * `currentColor` and is sized in `em`, so an icon can never introduce a colour
 * outside the declared semantic roles.
 */

/** Lucide's on-disk shape: a list of `[tagName, attributes]` pairs. */
type IconAttributes = Record<string, string | number | undefined>;
type IconNode = readonly [string, IconAttributes];

const ICONS = {
  canvas: Frame,
  preset: Maximize,
  palette: Palette,
  seed: Sparkles,
  newSeed: Dices,
  planet: Orbit,
  size: Ruler,
  distance: Radius,
  moon: Moon,
  moonPeriod: Timer,
  sun: Sun,
  add: Plus,
  remove: Trash2,
  disclosure: ChevronRight,
  play: Play,
  pause: Pause,
  download: Download,
  smartphone: Smartphone,
} as const satisfies Record<string, readonly IconNode[]>;

export type IconName = keyof typeof ICONS;

export interface IconOptions {
  /**
   * Accessible name. Supply this ONLY when the icon carries meaning no adjacent
   * text already conveys; the icon is then exposed as `role="img"`. Omit it for
   * the normal case, where the icon accompanies a visible label.
   */
  label?: string;
  /** Extra class names appended to the base `icon` class. */
  className?: string;
}

/** Minimal attribute-value escaping for serialized markup. */
function escapeAttribute(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function serializeAttributes(attributes: IconAttributes): string {
  return Object.entries(attributes)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([name, value]) => `${name}="${escapeAttribute(value)}"`)
    .join(' ');
}

/**
 * Render an icon as an SVG string.
 *
 * The stroke geometry is Lucide's; the presentation attributes below mirror
 * Lucide's own defaults, restated here because we serialize rather than calling
 * its DOM factory.
 */
export function icon(name: IconName, options: IconOptions = {}): string {
  const nodes = ICONS[name] as readonly IconNode[];
  const className = options.className === undefined
    ? 'icon'
    : `icon ${options.className}`;

  // Decorative by default; announced only on explicit opt-in (UI-008).
  const accessibility = options.label === undefined
    ? 'aria-hidden="true" focusable="false"'
    : `role="img" aria-label="${escapeAttribute(options.label)}" focusable="false"`;

  const children = nodes
    .map(([tag, attributes]) => `<${tag} ${serializeAttributes(attributes)}/>`)
    .join('');

  return (
    `<svg class="${className}" ${accessibility}` +
    ` xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"` +
    ` stroke="currentColor" stroke-width="2" stroke-linecap="round"` +
    ` stroke-linejoin="round">${children}</svg>`
  );
}
