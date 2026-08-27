/**
 * Preview playback control (QLT-005, QLT-009, D-28).
 *
 * Playback lives here, in the DOM layer, and never in the generated markup:
 * pausing SMIL requires `SVGSVGElement.pauseAnimations()`, and the exported
 * file is forbidden from carrying scripting (D-16, EXP-003). So the artefact
 * always animates and the application decides whether it is running.
 */

export type PlaybackState = 'running' | 'paused';

/** True when the environment asks for reduced motion. */
export function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * Apply a playback state to the previewed scene.
 *
 * Returns false when there is no SVG to drive yet, so callers can tell "not
 * applied" from "applied", rather than assuming success.
 */
export function applyPlayback(preview: ParentNode, state: PlaybackState): boolean {
  const svg = preview.querySelector('svg');

  if (svg === null || !('pauseAnimations' in svg)) {
    return false;
  }

  const scene = svg as SVGSVGElement;

  if (state === 'paused') {
    scene.pauseAnimations();
  } else {
    scene.unpauseAnimations();
  }

  return true;
}

/** Label for the action the control will perform next. */
export function playbackActionLabel(state: PlaybackState): string {
  return state === 'running' ? 'Pause animation' : 'Play animation';
}
