import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { generateScene, type SceneParams } from '../../ts/generator/scene';

/**
 * Task 5.5 (WAL-010): pre-rasterizing the static starfield cuts the per-frame
 * render cost below the 116 ms/frame baseline (E-012) without changing what a
 * frame looks like.
 *
 * The default scene at 1080x2400 is rasterized two ways: with background reuse
 * (the production path — `reuseBackground` defaults to true) and without it
 * (`reuseBackground: false`, the pre-optimization path). Three assertions:
 *
 *   1. REUSE ENGAGEMENT (deterministic) — the starfield is rasterized once
 *      into the cached background and stripped from the per-frame foreground,
 *      so the reused path's foreground clone carries zero `use[data-role="star"]`
 *      elements while the non-reused control clones the full starfield. This is
 *      a STRUCTURAL check, not a timing one: wall-clock `after < before` flaked
 *      between runs (GC noise made two identical full-render passes differ by
 *      ~27%), so it cannot be the reuse detector.
 *   2. PER-FRAME COST — the reused path must land under the 116 ms/frame
 *      baseline measured in E-012.
 *   3. VISUAL EQUIVALENCE — a frame rendered with reuse must match the same
 *      frame rendered without it, within anti-aliasing tolerance.
 *
 * All three are measured in the browser (`wallpaper.ts` is DOM-dependent),
 * compiled with rolldown and injected as a blob module, mirroring the other
 * wallpaper specs. The cost baseline was established in Chromium (E-012), so
 * the tests are skipped in the other engines.
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
 * The application's default scene — `DEFAULT_INPUT` passed through
 * `validateScene`, the exact scene E-011/E-012 measured at 763,020 bytes.
 * Reconstructed here as plain `SceneParams` so the spec stays self-contained,
 * mirroring the loop spec (palette omitted so the seed chooses it, as
 * `RANDOM_PALETTE` does).
 */
const DEFAULT_PARAMS: SceneParams = {
  canvas: { width: 600, height: 600 },
  planets: [
    { size: 12, distance: 110, moon: false, ring: false },
    {
      size: 18,
      distance: 190,
      moon: { size: 5, distance: 32, period: 15 },
      ring: { type: 'Banded', sizePercent: 210, inclinationDegrees: 16 },
    },
    { size: 9, distance: 260, moon: false, ring: false },
  ],
  asteroidBelt: {
    type: 'rocky',
    count: 130,
    // Absolute units against the scene's own half-extent (CTL-017).
    innerRadius: 243,
    outerRadius: 261,
    baseRadius: 2.1,
    period: 163,
  },
};

const DEFAULT_SCENE = generateScene(DEFAULT_PARAMS, 20260826);

/** Frames measured per path: enough to amortize the one-time background
 * rasterization and average out per-frame jitter. */
const TIMING_FRAMES = 24;

/** The 116 ms/frame baseline recorded in E-012. */
const BASELINE_MS_PER_FRAME = 116;

interface WallpaperModule {
  createWallpaperRenderer: (
    svg: string,
    preset: unknown,
    options?: { closeLoop?: boolean; reuseBackground?: boolean },
  ) => {
    renderFrame(timeSeconds: number): Promise<HTMLCanvasElement>;
    dispose(): void;
    foregroundStarCount: number;
  };
}

interface CostProbe {
  sceneBytes: number;
  beforeMsPerFrame: number;
  afterMsPerFrame: number;
  /** `use[data-role="star"]` elements in the non-reused foreground clone. */
  beforeForegroundStarCount: number;
  /** `use[data-role="star"]` elements in the reused foreground clone. */
  afterForegroundStarCount: number;
}

async function measureCost(page: import('@playwright/test').Page): Promise<CostProbe> {
  const source = await wallpaperSource;

  return page.evaluate(
    async (args: { src: string; scene: string; frames: number }) => {
      const { src, scene, frames } = args;
      const blob = new Blob([src], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      const module = (await import(url)) as WallpaperModule;
      URL.revokeObjectURL(url);

      const preset = { id: 'android', width: 1080, height: 2400 };

      async function measure(
        reuseBackground: boolean,
      ): Promise<{ msPerFrame: number; foregroundStarCount: number }> {
        const renderer = module.createWallpaperRenderer(scene, preset, { reuseBackground });

        // The star count is fixed at creation: background reuse strips the
        // starfield from the live working copy once, before any frame renders.
        const foregroundStarCount = renderer.foregroundStarCount;

        // Warm up: prime the rasterizer/JIT (and, for the reuse path, the
        // one-time background rasterization) so the timed frames measure
        // steady-state cost rather than cold start. The full-document path has
        // a measured ~12-frame cold start; without a warm-up the second
        // measurement would look faster even if reuse were a no-op.
        for (let warm = 0; warm < 20; warm += 1) {
          await renderer.renderFrame(warm / 30);
        }

        const startedAt = performance.now();

        for (let frame = 0; frame < frames; frame += 1) {
          await renderer.renderFrame(frame / 30);
        }

        const elapsed = performance.now() - startedAt;
        renderer.dispose();

        return { msPerFrame: elapsed / frames, foregroundStarCount };
      }

      // Order matters for the timing figures. The full-document path has a
      // slow, multi-second warm-up (measured cold start above), so it is timed
      // LAST: by then the engine is fully warm and the full path is at steady
      // state. The structural star counts are independent of order.
      const after = await measure(true);
      const before = await measure(false);

      return {
        sceneBytes: scene.length,
        beforeMsPerFrame: before.msPerFrame,
        afterMsPerFrame: after.msPerFrame,
        beforeForegroundStarCount: before.foregroundStarCount,
        afterForegroundStarCount: after.foregroundStarCount,
      };
    },
    { src: source, scene: DEFAULT_SCENE, frames: TIMING_FRAMES },
  );
}

test('background reuse engages and stays below the baseline (WAL-010)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Cost baseline is established in Chromium (E-012).');

  const result = await measureCost(page);

  testInfo.annotations.push({
    type: 'wallpaper per-frame cost',
    description:
      `${testInfo.project.name}: scene ${result.sceneBytes}B, ` +
      `without reuse ${result.beforeMsPerFrame.toFixed(1)} ms/frame ` +
      `(${result.beforeForegroundStarCount} stars), ` +
      `with reuse ${result.afterMsPerFrame.toFixed(1)} ms/frame ` +
      `(${result.afterForegroundStarCount} stars)`,
  });

  // DETERMINISTIC reuse engagement. The starfield is rasterized once into the
  // cached background and stripped from the live working copy, so the reused
  // path's per-frame foreground clone carries zero stars while the non-reused
  // control clones the full starfield every frame. This is structural, not
  // wall-clock timing (which flaked ~27% between identical full-render passes),
  // so a reuse path that silently falls back to full re-rasterization fails
  // this assertion regardless of GC noise.
  expect(
    result.afterForegroundStarCount,
    `${testInfo.project.name}: reuse did not engage — the reused foreground still contains ${result.afterForegroundStarCount} star(s)`,
  ).toBe(0);
  expect(
    result.beforeForegroundStarCount,
    `${testInfo.project.name}: the non-reused control cloned no starfield (expected > 0 stars)`,
  ).toBeGreaterThan(0);

  // WAL-010 requirement (E-012): the reused per-frame cost stays below the
  // 116 ms/frame baseline.
  expect(
    result.afterMsPerFrame,
    `${testInfo.project.name}: reused per-frame cost ${result.afterMsPerFrame.toFixed(1)} ms is not below the ${BASELINE_MS_PER_FRAME} ms baseline`,
  ).toBeLessThan(BASELINE_MS_PER_FRAME);
});

test('reused and non-reused frames are visually equivalent (WAL-010)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Cost baseline is established in Chromium (E-012).');

  const source = await wallpaperSource;

  const worstMeanDiff = await page.evaluate(
    async (args: { src: string; scene: string }) => {
      const { src, scene } = args;
      const blob = new Blob([src], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      const module = (await import(url)) as WallpaperModule;
      URL.revokeObjectURL(url);

      const preset = { id: 'android', width: 1080, height: 2400 };

      // Mean per-channel RGB difference between two frames, over every pixel.
      function meanAbsDiff(a: HTMLCanvasElement, b: HTMLCanvasElement): number {
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

        return sum / (width * height * 3);
      }

      const withReuse = module.createWallpaperRenderer(scene, preset, {});
      const withoutReuse = module.createWallpaperRenderer(scene, preset, {
        reuseBackground: false,
      });

      let worst = 0;

      for (const timeSeconds of [0, 1.25, 2.5]) {
        const reused = await withReuse.renderFrame(timeSeconds);
        const plain = await withoutReuse.renderFrame(timeSeconds);
        worst = Math.max(worst, meanAbsDiff(reused, plain));
      }

      withReuse.dispose();
      withoutReuse.dispose();

      return worst;
    },
    { src: source, scene: DEFAULT_SCENE },
  );

  testInfo.annotations.push({
    type: 'wallpaper reuse equivalence',
    description: `${testInfo.project.name}: worst mean |ΔRGB| = ${worstMeanDiff.toFixed(4)}`,
  });

  // A reused frame must be indistinguishable from its non-reused twin. Only
  // edge anti-aliasing (composited coverage vs direct blend) may differ, which
  // is a fraction of a unit per channel on a handful of pixels — far below 1.
  // A dropped layer (e.g. the starfield missing from the composite) would push
  // this into the tens.
  expect(
    worstMeanDiff,
    `${testInfo.project.name}: reused frame differs from non-reused by mean |ΔRGB| ${worstMeanDiff.toFixed(4)}`,
  ).toBeLessThan(1);
});
