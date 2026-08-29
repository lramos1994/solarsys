import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';

/**
 * Task 1.2 / 2.1 (WAL-003): the wallpaper frame pipeline animates.
 *
 * This pins the defect E-005 and verifies the fix E-007 positionally. The
 * naive path — drawing an animated SVG through an <img> — must stay STATIC in
 * the raster output, and the seek-and-bake path must reproduce the motion the
 * SMIL timeline computed. Both are asserted by measuring the rendered body's
 * white-pixel centroid, never by markup or file size.
 *
 * The `wallpaper.ts` module is DOM-dependent, so it is compiled to a single
 * self-contained ES module (rolldown, the same toolchain `npm run build`
 * uses) and loaded into the page with a blob-URL dynamic import. Reading the
 * source at test time is what makes the task-2.2 mutation observable: a
 * mutation to `wallpaper.ts` changes the injected module without a rebuild.
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

/**
 * A minimal self-contained scene: one white body moving vertically along a
 * straight `animateMotion` path on a black background. Vertical motion keeps
 * the body inside the tall frame even though the square scene is cover-cropped
 * horizontally (`xMidYMid slice`).
 */
const PROBE_SCENE = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 200 200" width="200" height="200">
  <rect x="0" y="0" width="200" height="200" fill="#000000"/>
  <g id="probe-mover">
    <circle id="probe-body" cx="0" cy="0" r="10" fill="#ffffff"/>
    <animateMotion dur="4s" repeatCount="indefinite" path="M 100 10 L 100 190"/>
  </g>
</svg>`;

test('drawImage of an animated SVG does not advance (E-005)', async ({ page }, testInfo) => {
  // One loaded animated image, drawn at three wall-clock moments. The raster
  // must be identical every time: the <img> timeline never advances.
  const centroids = await page.evaluate(async (scene) => {
    function centroid(canvas: HTMLCanvasElement): { x: number; y: number } {
      const context = canvas.getContext('2d');

      if (context === null) {
        throw new Error('no 2d context');
      }

      const { width, height } = canvas;
      const data = context.getImageData(0, 0, width, height).data;
      let sumX = 0;
      let sumY = 0;
      let count = 0;

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const index = (y * width + x) * 4;

          if (data[index]! + data[index + 1]! + data[index + 2]! > 300) {
            sumX += x;
            sumY += y;
            count += 1;
          }
        }
      }

      if (count === 0) {
        throw new Error('no bright pixels in raster');
      }

      return { x: sumX / count, y: sumY / count };
    }

    const url = `data:image/svg+xml;base64,${btoa(scene)}`;
    const image = new Image();

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('naive image failed to load'));
      image.src = url;
    });

    const draw = (): { x: number; y: number } => {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 200;
      const context = canvas.getContext('2d');

      if (context === null) {
        throw new Error('no 2d context');
      }

      context.drawImage(image, 0, 0, 200, 200);

      return centroid(canvas);
    };

    const first = draw();
    await new Promise((resolve) => setTimeout(resolve, 400));
    const second = draw();
    await new Promise((resolve) => setTimeout(resolve, 400));
    const third = draw();

    return [first, second, third];
  }, PROBE_SCENE);

  const ys = centroids.map((point) => point.y);

  testInfo.annotations.push({
    type: 'naive raster centroid',
    description: `${testInfo.project.name}: y=${ys.map((value) => value.toFixed(2)).join(' / ')}`,
  });

  expect(Math.abs(ys[0]! - ys[1]!), `${testInfo.project.name} naive path advanced between samples`).toBeLessThan(0.5);
  expect(Math.abs(ys[1]! - ys[2]!), `${testInfo.project.name} naive path advanced between samples`).toBeLessThan(0.5);
});

test('seek-and-bake reproduces motion (WAL-003, E-007)', async ({ page }, testInfo) => {
  const source = await wallpaperSource;

  const centroids = await page.evaluate(
    async (args: { src: string; scene: string }) => {
      const { src, scene } = args;
      const blob = new Blob([src], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      const module = await import(url);
      URL.revokeObjectURL(url);

      const { createWallpaperRenderer, WALLPAPER_PRESETS } = module as {
        createWallpaperRenderer: (svg: string, preset: unknown) => {
          renderFrame(timeSeconds: number): Promise<HTMLCanvasElement>;
          dispose(): void;
        };
        WALLPAPER_PRESETS: readonly { width: number; height: number }[];
      };

      function centroid(canvas: HTMLCanvasElement): { x: number; y: number } {
        const context = canvas.getContext('2d');

        if (context === null) {
          throw new Error('no 2d context');
        }

        const { width, height } = canvas;
        const data = context.getImageData(0, 0, width, height).data;
        let sumX = 0;
        let sumY = 0;
        let count = 0;

        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const index = (y * width + x) * 4;

            if (data[index]! + data[index + 1]! + data[index + 2]! > 300) {
              sumX += x;
              sumY += y;
              count += 1;
            }
          }
        }

        if (count === 0) {
          throw new Error('no bright pixels in raster');
        }

        return { x: sumX / count, y: sumY / count };
      }

      const renderer = createWallpaperRenderer(scene, WALLPAPER_PRESETS[0]);
      const frames: Array<{ x: number; y: number }> = [];

      for (const timeSeconds of [0, 1, 2]) {
        const canvas = await renderer.renderFrame(timeSeconds);
        frames.push(centroid(canvas));
      }

      renderer.dispose();

      return frames;
    },
    { src: source, scene: PROBE_SCENE },
  );

  const displacement01 = Math.abs(centroids[1]!.y - centroids[0]!.y);
  const displacement12 = Math.abs(centroids[2]!.y - centroids[1]!.y);

  testInfo.annotations.push({
    type: 'baked centroid displacement',
    description: `${testInfo.project.name}: ${displacement01.toFixed(2)}px then ${displacement12.toFixed(2)}px`,
  });

  expect(
    displacement01,
    `${testInfo.project.name} seek-and-bake produced a frozen frame`,
  ).toBeGreaterThan(1);
  expect(
    displacement12,
    `${testInfo.project.name} seek-and-bake produced a frozen frame`,
  ).toBeGreaterThan(1);
});
