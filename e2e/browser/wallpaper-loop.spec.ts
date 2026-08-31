import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { generateScene, type SceneParams } from '../../ts/generator/scene';

/**
 * Task 3.5 (WAL-004): loop continuity. The last exported frame must be as
 * close to the first as any two consecutive frames are to each other, so the
 * repeat shows no visible jump.
 *
 * A raw capture of the default scene would fail this: the belt's 163s period
 * shares no usable common multiple with the other periods (E-015), so at
 * t = T - dt the belt is far from its t=0 orientation. Loop closure (period
 * quantization + belt symmetry) makes every animated element complete a whole
 * number of cycles in T, so the state just before the wrap is one frame-step
 * away from the state at t=0 — indistinguishable from ordinary motion.
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

/** A scene with planets, a moon, and the default belt — real motion to measure. */
const LOOP_PARAMS: SceneParams = {
  canvas: { width: 600, height: 600 },
  planets: [
    { size: 12, distance: 110, moon: false, ring: false },
    { size: 18, distance: 190, moon: { size: 5, distance: 32, period: 15 }, ring: false },
  ],
  palette: 'Aurora',
  asteroidBelt: {
    count: 130,
    // Absolute units against the scene's own half-extent (CTL-017).
    innerRadius: 243,
    outerRadius: 261,
    baseRadius: 2.1,
    period: 163,
  },
};

const LOOP_SCENE = generateScene(LOOP_PARAMS, 20260826);

test('first-vs-last frame is as continuous as consecutive frames (WAL-004)', async ({ page }, testInfo) => {
  const source = await wallpaperSource;

  const result = await page.evaluate(
    async (args: { src: string; scene: string }) => {
      const { src, scene } = args;
      const blob = new Blob([src], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      const module = await import(url);
      URL.revokeObjectURL(url);

      const { createWallpaperRenderer, WALLPAPER_LOOP_SECONDS } = module as {
        createWallpaperRenderer: (
          svg: string,
          preset: unknown,
        ) => { renderFrame(timeSeconds: number): Promise<HTMLCanvasElement>; dispose(): void };
        WALLPAPER_LOOP_SECONDS: number;
      };

      const preset = { id: 'android', width: 600, height: 600 };
      const loop = WALLPAPER_LOOP_SECONDS;
      const dt = 1 / 30;

      // Sum of per-pixel RGB differences between two frames.
      function totalDiff(a: HTMLCanvasElement, b: HTMLCanvasElement): number {
        const ctxA = a.getContext('2d');
        const ctxB = b.getContext('2d');

        if (ctxA === null || ctxB === null) {
          throw new Error('no 2d context');
        }

        const { width, height } = a;
        const da = ctxA.getImageData(0, 0, width, height).data;
        const db = ctxB.getImageData(0, 0, width, height).data;
        let sum = 0;

        for (let index = 0; index < da.length; index += 4) {
          sum +=
            Math.abs(da[index]! - db[index]!) +
            Math.abs(da[index + 1]! - db[index + 1]!) +
            Math.abs(da[index + 2]! - db[index + 2]!);
        }

        return sum;
      }

      const renderer = createWallpaperRenderer(scene, preset);
      const first = await renderer.renderFrame(0);
      const second = await renderer.renderFrame(dt);
      const last = await renderer.renderFrame(loop - dt);
      renderer.dispose();

      return {
        consecutive: totalDiff(first, second),
        wrap: totalDiff(first, last),
      };
    },
    { src: source, scene: LOOP_SCENE },
  );

  testInfo.annotations.push({
    type: 'loop continuity',
    description:
      `${testInfo.project.name}: consecutive ${result.consecutive.toFixed(0)} ` +
      `vs first-vs-last ${result.wrap.toFixed(0)}`,
  });

  // The jump at the loop boundary must be no worse than an ordinary frame
  // step. The 1.25 factor absorbs anti-aliasing/rounding noise; a broken loop
  // (e.g. a non-dividing belt period) pushes `wrap` many times larger.
  expect(
    result.wrap,
    `${testInfo.project.name}: loop does not close — first vs last differs far more than consecutive frames`,
  ).toBeLessThanOrEqual(result.consecutive * 1.25);
});
