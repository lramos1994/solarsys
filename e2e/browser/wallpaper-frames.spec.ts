import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { generateScene, type SceneParams } from '../../ts/generator/scene';

/**
 * Task 2.3 (WAL-002): the two fixed presets and the cover-crop.
 *
 * The exported frame must carry the exact coded dimensions of its preset and
 * must cover the full tall frame with no empty (letterbox) margin on any edge.
 * The scene is square and the presets are ~19.5:9, so
 * `preserveAspectRatio="xMidYMid slice"` fills the frame and overflows (D-07).
 *
 * Note on the measured edge: the generated scene carries a deliberate 2.5px
 * margin (half of `CANVAS_MARGIN`) so orbit strokes near the edge are not
 * clipped, which appears as a thin transparent strip at the frame's top. This
 * is a scene property (present in the preview too), not a letterbox. The test
 * therefore measures the empty band height and requires it to be negligible —
 * far smaller than the ~27% band that `meet` letterboxing would produce.
 */

const WALLPAPER_PATH = fileURLToPath(new URL('../../ts/app/wallpaper.ts', import.meta.url));

const wallpaperSource: Promise<string> = (async () => {
  const bundle = await rolldown({ input: WALLPAPER_PATH });

  try {
    const { output } = await bundle.generate({ format: 'esm' });
    return output[0]!.code;
  } finally {
    await bundle.close();
  }
})();

/** A small square scene: opaque background plus animated bodies, generated for real. */
const SQUARE_PARAMS: SceneParams = {
  canvas: { width: 300, height: 300 },
  planets: [
    { size: 10, distance: 120, moon: false },
    { size: 6, distance: 55, moon: false },
  ],
  palette: 'Aurora',
};

const SQUARE_SCENE = generateScene(SQUARE_PARAMS, 20260826);

interface RasterProbe {
  width: number;
  height: number;
  /** Fully-transparent rows counted from the top edge (the letterbox, if any). */
  topEmpty: number;
  /** Fully-transparent rows counted from the bottom edge. */
  bottomEmpty: number;
}

async function probeFrame(
  page: import('@playwright/test').Page,
  presetId: 'android' | 'iphone',
): Promise<RasterProbe> {
  const source = await wallpaperSource;

  return page.evaluate(
    async (args: { src: string; scene: string; id: 'android' | 'iphone' }) => {
      const { src, scene, id } = args;
      const blob = new Blob([src], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      const module = await import(url);
      URL.revokeObjectURL(url);

      const { renderWallpaperFrame, wallpaperPreset } = module as {
        renderWallpaperFrame: (svg: string, preset: unknown, timeSeconds: number) => Promise<HTMLCanvasElement>;
        wallpaperPreset: (id: string) => { width: number; height: number };
      };

      const preset = wallpaperPreset(id);
      const canvas = await renderWallpaperFrame(scene, preset, 0);
      const context = canvas.getContext('2d');

      if (context === null) {
        throw new Error('no 2d context');
      }

      const { width, height } = canvas;
      // One centre-column profile: the scene's background is uniform in x
      // within the visible (non-cropped) band, so a single column is
      // representative of the vertical fill.
      const column = context.getImageData(Math.floor(width / 2), 0, 1, height).data;

      let topEmpty = 0;

      while (topEmpty < height && column[topEmpty * 4 + 3] === 0) {
        topEmpty += 1;
      }

      let bottomEmpty = 0;

      while (bottomEmpty < height && column[(height - 1 - bottomEmpty) * 4 + 3] === 0) {
        bottomEmpty += 1;
      }

      return { width, height, topEmpty, bottomEmpty };
    },
    { src: source, scene: SQUARE_SCENE, id: presetId },
  );
}

test('android preset codes 1080x2400 and fills the frame', async ({ page }, testInfo) => {
  const result = await probeFrame(page, 'android');

  testInfo.annotations.push({
    type: 'android frame probe',
    description: `${testInfo.project.name}: ${result.width}x${result.height}, top empty ${result.topEmpty}, bottom empty ${result.bottomEmpty}`,
  });

  expect(result.width).toBe(1080);
  expect(result.height).toBe(2400);
  expect(result.topEmpty, `${testInfo.project.name} top edge was letterboxed`).toBeLessThan(result.height * 0.05);
  expect(result.bottomEmpty, `${testInfo.project.name} bottom edge was letterboxed`).toBeLessThan(result.height * 0.05);
});

test('iphone preset codes 1179x2556 and fills the frame', async ({ page }, testInfo) => {
  const result = await probeFrame(page, 'iphone');

  testInfo.annotations.push({
    type: 'iphone frame probe',
    description: `${testInfo.project.name}: ${result.width}x${result.height}, top empty ${result.topEmpty}, bottom empty ${result.bottomEmpty}`,
  });

  expect(result.width).toBe(1179);
  expect(result.height).toBe(2556);
  expect(result.topEmpty, `${testInfo.project.name} top edge was letterboxed`).toBeLessThan(result.height * 0.05);
  expect(result.bottomEmpty, `${testInfo.project.name} bottom edge was letterboxed`).toBeLessThan(result.height * 0.05);
});
