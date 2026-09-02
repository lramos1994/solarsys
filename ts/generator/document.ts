import type { Canvas } from './orbit';

/**
 * Margin added to the canvas in both axes so strokes near the outer orbits are
 * not clipped by the viewport edge. Preserved from the baseline (E-003, E-004).
 */
export const CANVAS_MARGIN = 5;

/** Offset applied to the content group: half the margin on each side. */
const CONTENT_OFFSET = CANVAS_MARGIN / 2;

/**
 * Compositing hint carried by the artefact itself (QLT-012).
 *
 * Firefox paints SMIL-driven motion with visible per-frame jitter — measured
 * on Windows 11, worst on large planets moving along an `animateMotion`
 * mpath — unless the moving group gets its own composited layer. Promoting the
 * animated groups removes the shake. Chromium is unaffected either way.
 *
 * This ships inside the SVG's own `<style>` because the artefact must be
 * smooth STANDALONE, including via `<img src>`: application CSS never reaches
 * a downloaded file. CSS is an explicitly permitted mechanism — D-16 forbids
 * scripting, not styling.
 *
 * It is deliberately `will-change: transform` and NOT `transform:
 * translateZ(0)`, even though both fix the jitter. A CSS transform overrides
 * the SVG `transform` ATTRIBUTE, and a DOM-layer consumer bakes each animated
 * node's SMIL-resolved `transform="matrix(...)"` onto a static clone.
 * `translateZ(0)` would win over that matrix and collapse every animated body
 * onto its base position. `will-change` applies no transform, so the baked
 * matrix keeps winning. Do not "simplify" this to a transform hack.
 */
const COMPOSITING_STYLE =
  `<style>` +
  `g[data-role="planet"],g[data-role="moon"],g[data-role="comet"],` +
  `g[data-role="asteroid-belt"],g[data-role="sun-spots"]{will-change:transform}` +
  `</style>`;

/**
 * Wrap generated scene content in the root SVG element.
 *
 * The root deliberately carries no `width` or `height`, so the scene scales to
 * its container in both preview and download (D-05, EXP-005). Its explicit
 * `overflow="hidden"` clips entering comets and any overflowing orbit geometry
 * to the viewBox even in standalone SVG renderers. No scripting is ever
 * emitted: the exported file must animate standalone (D-16, QLT-006).
 *
 * `metadata` (a `<title>`/`<desc>` pair) is placed directly on the root rather
 * than inside the translated content group, so assistive technology reads the
 * scene summary before any geometry (QLT-004).
 */
export function documentShell(
  canvas: Canvas,
  content: string,
  metadata = '',
): string {
  const viewBoxWidth = canvas.width + CANVAS_MARGIN;
  const viewBoxHeight = canvas.height + CANVAS_MARGIN;

  return (
    `<svg class="solarsys" viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}" overflow="hidden"` +
    ` xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">` +
    metadata +
    COMPOSITING_STYLE +
    `<g transform="translate(${CONTENT_OFFSET} ${CONTENT_OFFSET})">${content}</g>` +
    `</svg>`
  );
}
