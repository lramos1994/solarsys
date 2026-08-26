import type { Canvas } from './orbit';

/**
 * Margin added to the canvas in both axes so strokes near the outer orbits are
 * not clipped by the viewport edge. Preserved from the baseline (E-003, E-004).
 */
export const CANVAS_MARGIN = 5;

/** Offset applied to the content group: half the margin on each side. */
const CONTENT_OFFSET = CANVAS_MARGIN / 2;

/**
 * Wrap generated scene content in the root SVG element.
 *
 * The root deliberately carries no `width` or `height`, so the scene scales to
 * its container in both preview and download (D-05, EXP-005). No scripting is
 * ever emitted: the exported file must animate standalone (D-16, QLT-006).
 */
export function documentShell(canvas: Canvas, content: string): string {
  const viewBoxWidth = canvas.width + CANVAS_MARGIN;
  const viewBoxHeight = canvas.height + CANVAS_MARGIN;

  return (
    `<svg class="solarsys" viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}"` +
    ` xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">` +
    `<g transform="translate(${CONTENT_OFFSET} ${CONTENT_OFFSET})">${content}</g>` +
    `</svg>`
  );
}
