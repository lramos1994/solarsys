import type { Canvas } from './orbit';
import type { Palette } from './palette';

/** Escape text destined for XML character data. */
export function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export interface SceneSummary {
  canvas: Canvas;
  palette: Palette;
  planetCount: number;
  moonCount: number;
}

/** Human-readable title for the scene (QLT-004). */
export function sceneTitle(summary: SceneSummary): string {
  const { planetCount } = summary;

  if (planetCount === 0) {
    return 'Animated solar system with no planets';
  }

  return `Animated solar system with ${planetCount} ${
    planetCount === 1 ? 'planet' : 'planets'
  }`;
}

/**
 * Description of what the scene actually depicts.
 *
 * QLT-004 requires this to describe the scene's content rather than being a
 * fixed constant, so it reports the planet and moon counts, the governing
 * palette, and the canvas dimensions.
 */
export function sceneDescription(summary: SceneSummary): string {
  const { canvas, palette, planetCount, moonCount } = summary;

  const planets =
    planetCount === 0
      ? 'no planets'
      : `${planetCount} ${planetCount === 1 ? 'planet' : 'planets'}`;

  const moons =
    planetCount === 0
      ? ''
      : moonCount === 0
        ? ', none with a moon'
        : `, ${moonCount} of which ${moonCount === 1 ? 'has' : 'have'} a moon`;

  return (
    `A ${canvas.width} by ${canvas.height} scene in the ${palette.name} palette. ` +
    `A central sun is orbited by ${planets}${moons}. ` +
    `A starfield, a rotating asteroid belt and passing comets fill the background.`
  );
}
