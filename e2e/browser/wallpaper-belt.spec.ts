import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { generateScene, type SceneParams } from '../../ts/generator/scene';

/**
 * Task 3.3 (WAL-005): the belt annulus probe with its mandatory control arm.
 *
 * The belt is ONE group rotation over static rocks (E-019), so an N-fold
 * symmetric distribution looks identical to itself every 1/N turn. This test
 * measures, on the belt annulus only (radius 235..272 px, the default scene's
 * 81..87% band plus rock extent — planets and comets stay out of it), that:
 *
 *   - CONTROL (unmodified belt, t=0 vs t=163/16) MOVES (~5.81%, E-020) — this
 *     arm proves the probe actually measures belt motion, not a broken probe;
 *   - the symmetric belt MATCHES at the symmetry instant (~1.40%, E-021);
 *   - the symmetric belt still DIFFERS at the midpoint (~6.20%, E-021).
 *
 * If the control arm does not move, the probe is broken and the test must fail
 * rather than have its threshold lowered (the earlier probe reported 0% on the
 * control arm and would have passed silently).
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

/** A scene whose only moving body is the default belt: 130 rocks, 163s period. */
const BELT_PARAMS: SceneParams = {
  canvas: { width: 600, height: 600 },
  planets: [],
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

const BELT_SCENE = generateScene(BELT_PARAMS, 20260826);

/** The preset used to rasterize at the scene's native 600x600 (no cover crop). */
const NATIVE_PRESET = { id: 'android' as const, width: 600, height: 600 };

const BELT_AUTHORED_PERIOD = 163;

interface AnnulusProbe {
  control: number;
  symmetryMatch: number;
  symmetryMidpoint: number;
  symmetry: number;
  loopPeriod: number;
}

async function probeBelt(page: import('@playwright/test').Page): Promise<AnnulusProbe> {
  const source = await wallpaperSource;

  return page.evaluate(
    async (args: { src: string; scene: string; authoredPeriod: number }) => {
      const { src, scene, authoredPeriod } = args;
      const blob = new Blob([src], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      const module = await import(url);
      URL.revokeObjectURL(url);

      const { createWallpaperRenderer, findBeltLoop, WALLPAPER_LOOP_SECONDS } = module as {
        createWallpaperRenderer: (
          svg: string,
          preset: unknown,
          options?: { closeLoop?: boolean },
        ) => { renderFrame(timeSeconds: number): Promise<HTMLCanvasElement>; dispose(): void };
        findBeltLoop: (
          period: number,
          rockCount: number,
          loopSeconds: number,
        ) => { symmetry: number; loopPeriod: number };
        WALLPAPER_LOOP_SECONDS: number;
      };

      const preset = { id: 'android', width: 600, height: 600 };

      // Fraction of annulus (radius 235..272 px around the 600x600 centre)
      // pixels whose colour changed beyond an anti-aliasing threshold.
      function annulusDiff(a: HTMLCanvasElement, b: HTMLCanvasElement): number {
        const ctxA = a.getContext('2d');
        const ctxB = b.getContext('2d');

        if (ctxA === null || ctxB === null) {
          throw new Error('no 2d context');
        }

        const { width, height } = a;
        const da = ctxA.getImageData(0, 0, width, height).data;
        const db = ctxB.getImageData(0, 0, width, height).data;
        const cx = width / 2;
        const cy = height / 2;
        let changed = 0;
        let total = 0;

        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const dx = x - cx;
            const dy = y - cy;
            const radius = Math.sqrt(dx * dx + dy * dy);

            if (radius < 235 || radius > 272) {
              continue;
            }

            total += 1;
            const index = (y * width + x) * 4;
            const dr = Math.abs(da[index]! - db[index]!);
            const dg = Math.abs(da[index + 1]! - db[index + 1]!);
            const dbc = Math.abs(da[index + 2]! - db[index + 2]!);

            if (dr + dg + dbc > 30) {
              changed += 1;
            }
          }
        }

        return changed / total;
      }

      const plan = findBeltLoop(authoredPeriod, 130, WALLPAPER_LOOP_SECONDS);

      // CONTROL arm: the unmodified belt must move between t=0 and t=163/16.
      const control = createWallpaperRenderer(scene, preset, { closeLoop: false });
      const controlT0 = await control.renderFrame(0);
      const controlT1 = await control.renderFrame(authoredPeriod / 16);
      control.dispose();

      // SYMMETRIC arm: the loop-closed belt at the symmetry instant and the
      // midpoint between two symmetry instants.
      const symmetric = createWallpaperRenderer(scene, preset);
      const symT0 = await symmetric.renderFrame(0);
      const symInstant = await symmetric.renderFrame(plan.loopPeriod);
      const symMidpoint = await symmetric.renderFrame(plan.loopPeriod / 2);
      symmetric.dispose();

      return {
        control: annulusDiff(controlT0, controlT1),
        symmetryMatch: annulusDiff(symT0, symInstant),
        symmetryMidpoint: annulusDiff(symT0, symMidpoint),
        symmetry: plan.symmetry,
        loopPeriod: plan.loopPeriod,
      };
    },
    { src: source, scene: BELT_SCENE, authoredPeriod: BELT_AUTHORED_PERIOD },
  );
}

test('belt annulus probe keeps its control arm honest (WAL-005)', async ({ page }, testInfo) => {
  const result = await probeBelt(page);

  testInfo.annotations.push({
    type: 'belt annulus probe',
    description:
      `${testInfo.project.name}: control ${(result.control * 100).toFixed(2)}% ` +
      `(t=163/16), symmetric N=${result.symmetry} loopPeriod=${result.loopPeriod}s ` +
      `match ${(result.symmetryMatch * 100).toFixed(2)}% ` +
      `midpoint ${(result.symmetryMidpoint * 100).toFixed(2)}%`,
  });

  // 1. The control arm MUST move: an unmodified belt rotates 22.5° in 163/16s,
  //    changing a measurable fraction of the annulus (E-020: ~5.81%). If this
  //    fails the probe is broken — fail, do not lower the threshold.
  expect(
    result.control,
    `${testInfo.project.name}: control arm showed no belt motion — probe is broken`,
  ).toBeGreaterThan(0.02);

  // 2. At the symmetry instant the loop closes: far less change than a moving
  //    belt (E-021: ~1.40%).
  expect(
    result.symmetryMatch,
    `${testInfo.project.name}: symmetric belt did not match at the symmetry instant`,
  ).toBeLessThan(result.control / 2);

  // 3. Between symmetry instants the belt still animates: clearly more change
  //    than at the symmetry instant (E-021: ~6.20%).
  expect(
    result.symmetryMidpoint,
    `${testInfo.project.name}: symmetric belt was static at the midpoint`,
  ).toBeGreaterThan(result.symmetryMatch * 1.5);
});
