/**
 * Circle-approximation constant used to place cubic Bezier control points.
 * Preserved verbatim from the PHP baseline (E-007, GEN-002).
 */
export const BEZIER_CONSTANT = 0.5522847498;

export interface Canvas {
  width: number;
  height: number;
}

/**
 * Orbital extent from the canvas centre. A scalar yields a circular orbit;
 * the tuple form is `[left, top, right, bottom]` (E-006, CTL-002).
 */
export type OrbitDistance = number | readonly [number, number, number, number];

/** Expand a scalar distance into its four-extent form. */
function extents(
  distance: OrbitDistance,
): readonly [number, number, number, number] {
  return typeof distance === 'number'
    ? [distance, distance, distance, distance]
    : distance;
}

/**
 * Build the closed four-segment cubic Bezier ellipse used as both the visible
 * orbit stroke and the motion path, centred on the canvas centre.
 *
 * Overflowing extents are emitted unmodified: edge clipping is an accepted
 * aesthetic outcome, not a defect to correct (D-07, GEN-014).
 */
export function orbitPath(canvas: Canvas, distance: OrbitDistance): string {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const [left, top, right, bottom] = extents(distance);

  const kLeft = left * BEZIER_CONSTANT;
  const kTop = top * BEZIER_CONSTANT;
  const kRight = right * BEZIER_CONSTANT;
  const kBottom = bottom * BEZIER_CONSTANT;

  return (
    `M ${cx - left} ${cy}` +
    ` C ${cx - left} ${cy - kTop}, ${cx - kLeft} ${cy - top}, ${cx} ${cy - top}` +
    ` C ${cx + kRight} ${cy - top}, ${cx + right} ${cy - kTop}, ${cx + right} ${cy}` +
    ` C ${cx + right} ${cy + kBottom}, ${cx + kRight} ${cy + bottom}, ${cx} ${cy + bottom}` +
    ` C ${cx - kLeft} ${cy + bottom}, ${cx - left} ${cy + kBottom}, ${cx - left} ${cy} Z`
  );
}
