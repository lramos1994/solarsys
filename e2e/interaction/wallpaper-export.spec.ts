import { expect, test, type Download, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/**
 * Task 4.2 / 4.3 / 4.4 (WAL-001, WAL-002, WAL-006): the wallpaper export
 * action encodes the STORED scene as an MP4 and downloads it, without ever
 * regenerating the scene or mutating the preview, the stored string, or the
 * SVG download.
 *
 * Every test drives the real, built application. A full production loop is
 * 1350 frames (45 s at 30 fps), so the export frame budget is bounded through
 * the `__WALLPAPER_FRAME_COUNT__` test seam injected before the app loads
 * (main.ts reads it in the export handler). The seam changes only how many
 * frames are encoded, never the code path under test.
 *
 * The timeline test uses a 30-frame budget: the encoder stamps each frame with
 * an explicit presentation timestamp (WebCodecs `VideoEncoder` + `mp4-muxer`),
 * so 30 frames MUST decode as 1.0 s at ~30 fps. The wall-clock-paced
 * `MediaRecorder` + `captureStream(0)` + `requestFrame()` pipeline this
 * replaced timed frames at capture time (~116 ms/frame), so the same 30 frames
 * decoded as ~4.6 s at ~6.5 fps — a difference the 6-frame budget the other
 * tests use could not expose.
 */

const FRAME_RATE = 30;

/** Frame budget for the cheap structural/isolation tests. */
const DEFAULT_FRAME_BUDGET = 6;

/** Frame budget for the timeline test: 30 frames = 1.0 s, discriminates. */
const TIMELINE_FRAME_BUDGET = 30;

/** Read the bytes Playwright captured for a browser download. */
async function downloadedBytes(download: Download): Promise<Buffer> {
  const path = await download.path();

  expect(path).not.toBeNull();

  return readFile(path!);
}

/**
 * Decode an MP4 in-page and return its coded dimensions and duration. This is
 * the "decode the produced bytes as a video" verification (task 4.2): a real
 * `<video>` element must parse the bytes and report the preset dimensions and
 * presentation timeline, which a non-video, corrupt, or mis-timed payload
 * could never do.
 */
async function decodeVideo(
  page: Page,
  bytes: Buffer,
): Promise<{ width: number; height: number; duration: number }> {
  return page.evaluate(async (base64) => {
    const binary = atob(base64);
    const raw = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      raw[index] = binary.charCodeAt(index);
    }

    const blob = new Blob([raw], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);

    try {
      const video = document.createElement('video');
      video.muted = true;
      video.preload = 'metadata';
      video.src = url;

      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('video failed to decode'));
        video.load();
      });

      return { width: video.videoWidth, height: video.videoHeight, duration: video.duration };
    } finally {
      URL.revokeObjectURL(url);
    }
  }, bytes.toString('base64'));
}

/** Coded dimensions only; kept for the dimension assertions. */
async function decodeVideoDimensions(
  page: Page,
  bytes: Buffer,
): Promise<{ width: number; height: number }> {
  const { width, height } = await decodeVideo(page, bytes);

  return { width, height };
}

/**
 * Compare two PNG screenshots pixel-by-pixel and return the mean absolute
 * channel difference (0..255). Two captures of a FROZEN scene with no export in
 * between are byte-identical (mean 0), but the export's own rasterization work
 * (offscreen 1080x2400 canvas + VideoEncoder) shifts the preview's sub-pixel
 * anti-aliasing by a measured mean of ~0.01 — visually imperceptible, but enough
 * to defeat a naive byte comparison. A moving or mutated scene, by contrast,
 * displaces bodies by tens of pixels and produces a mean in the hundreds.
 */
async function screenshotMeanDifference(
  page: Page,
  first: Buffer,
  second: Buffer,
): Promise<number> {
  return page.evaluate(
    async ({ firstB64, secondB64 }) => {
      const load = (base64: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error('could not decode screenshot'));
          image.src = `data:image/png;base64,${base64}`;
        });

      const [firstImage, secondImage] = await Promise.all([load(firstB64), load(secondB64)]);
      const width = Math.min(firstImage.width, secondImage.width);
      const height = Math.min(firstImage.height, secondImage.height);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');

      if (context === null) {
        throw new Error('no 2d context');
      }

      context.drawImage(firstImage, 0, 0);
      const firstData = context.getImageData(0, 0, width, height).data;
      context.clearRect(0, 0, width, height);
      context.drawImage(secondImage, 0, 0);
      const secondData = context.getImageData(0, 0, width, height).data;

      let total = 0;

      for (let index = 0; index < firstData.length; index += 1) {
        total += Math.abs(firstData[index]! - secondData[index]!);
      }

      return total / firstData.length;
    },
    { firstB64: first.toString('base64'), secondB64: second.toString('base64') },
  );
}

/**
 * Bound the export frame budget and open the app. The seam is injected before
 * the application loads so `main.ts` reads it in the export handler.
 */
async function openWallpaperApp(page: Page, frames: number): Promise<void> {
  await page.addInitScript((budget) => {
    (window as unknown as { __WALLPAPER_FRAME_COUNT__?: number }).__WALLPAPER_FRAME_COUNT__ =
      budget;
  }, frames);

  await page.goto('/');
  await expect(page.locator('#preview svg')).toBeVisible();
}

test('the export action yields a download that decodes as a video at the preset size and timeline', async ({
  page,
}) => {
  await openWallpaperApp(page, TIMELINE_FRAME_BUDGET);

  const wallpaper = page.waitForEvent('download');
  await page.locator('[data-action="download-wallpaper"]').click();
  const download = await wallpaper;

  // The export path stays in flight until the button is re-enabled; wait so a
  // later assertion reads a settled state.
  await expect(page.locator('[data-action="download-wallpaper"]')).toBeEnabled();

  expect(download.suggestedFilename()).toBe('solarsys-20260826-android.mp4');

  const { width, height, duration } = await decodeVideo(page, await downloadedBytes(download));

  expect(width).toBe(1080);
  expect(height).toBe(2400);

  // Timeline (WAL-001, WAL-005): N frames at explicit 30 fps timestamps decode
  // as N/30 seconds. The wall-clock-paced encoder this replaced decoded the
  // same 30 frames as ~4.6 s, so the window below is what actually
  // discriminates correct pacing from wall-clock pacing.
  const expectedSeconds = TIMELINE_FRAME_BUDGET / FRAME_RATE;
  const impliedFps = TIMELINE_FRAME_BUDGET / duration;

  expect(duration).toBeGreaterThan(expectedSeconds * 0.9);
  expect(duration).toBeLessThan(expectedSeconds * 1.1);
  expect(impliedFps).toBeGreaterThan(27);
  expect(impliedFps).toBeLessThan(33);
});

test('the export reads the stored scene and never regenerates it', async ({ page }) => {
  await openWallpaperApp(page, DEFAULT_FRAME_BUDGET);

  const before = await page.evaluate(
    () => (window as unknown as { __solarsysGenerationCount: () => number }).__solarsysGenerationCount(),
  );

  expect(before).toBeGreaterThan(0);

  const wallpaper = page.waitForEvent('download');
  await page.locator('[data-action="download-wallpaper"]').click();
  await wallpaper;
  await expect(page.locator('[data-action="download-wallpaper"]')).toBeEnabled();

  const after = await page.evaluate(
    () => (window as unknown as { __solarsysGenerationCount: () => number }).__solarsysGenerationCount(),
  );

  expect(after).toBe(before);
});

test('an export leaves the stored scene, preview, and SVG download unchanged', async ({ page }) => {
  await openWallpaperApp(page, DEFAULT_FRAME_BUDGET);

  // Freeze the preview so a before/after screenshot comparison is meaningful:
  // the export must not be the thing that changes the picture.
  await page.locator('[data-action="toggle-playback"]').click();
  await page.waitForTimeout(300);

  const beforeHtml = await page.locator('#preview').innerHTML();
  // Screenshot the preview (the generated scene), not the surrounding chrome:
  // clicking the export/download actions moves focus between the stage buttons,
  // which is app chrome and not the "preview is unchanged" guarantee.
  const beforeShot = await page.locator('#preview').screenshot();

  const svgBeforePromise = page.waitForEvent('download');
  await page.locator('[data-action="download-svg"]').click();
  const beforeSvgBytes = await downloadedBytes(await svgBeforePromise);

  const wallpaper = page.waitForEvent('download');
  await page.locator('[data-action="download-wallpaper"]').click();
  await wallpaper;
  await expect(page.locator('[data-action="download-wallpaper"]')).toBeEnabled();

  const afterHtml = await page.locator('#preview').innerHTML();
  const afterShot = await page.locator('#preview').screenshot();

  const svgAfterPromise = page.waitForEvent('download');
  await page.locator('[data-action="download-svg"]').click();
  const afterSvgBytes = await downloadedBytes(await svgAfterPromise);

  expect(afterHtml).toBe(beforeHtml);
  // Tolerant pixel comparison: a frozen scene re-captured with no export is
  // byte-identical, but the export's rasterization work shifts sub-pixel
  // anti-aliasing by a measured mean of ~0.01. Anything below 0.5 is visually
  // identical; a mutated or still-animating scene would register in the tens.
  expect(await screenshotMeanDifference(page, beforeShot, afterShot)).toBeLessThan(0.5);
  expect(afterSvgBytes.equals(beforeSvgBytes)).toBe(true);
});

test('the iPhone preset encodes at its coded size', async ({ page }) => {
  await openWallpaperApp(page, DEFAULT_FRAME_BUDGET);

  await page.locator('[data-role="wallpaper-preset"]').selectOption('iphone');

  const wallpaper = page.waitForEvent('download');
  await page.locator('[data-action="download-wallpaper"]').click();
  const download = await wallpaper;
  await expect(page.locator('[data-action="download-wallpaper"]')).toBeEnabled();

  expect(download.suggestedFilename()).toBe('solarsys-20260826-iphone.mp4');

  const dimensions = await decodeVideoDimensions(page, await downloadedBytes(download));

  expect(dimensions).toEqual({ width: 1179, height: 2556 });
});
