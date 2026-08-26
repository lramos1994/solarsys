import { expect, test, type Page } from '@playwright/test';

/**
 * Task 3.1 (QLT-007, D-17): cross-browser animation spike.
 *
 * This resolves the open question of whether Safari's SMIL implementation
 * supports the baseline animation set. The audit only had Chrome available
 * (E-008, D-09), so SMIL viability was assumed rather than verified.
 *
 * The decisive measurement is POSITIONAL: sample an animated element's
 * screen position at two moments and require it to have moved. Asserting the
 * presence of an <animateMotion> element would pass in a browser that parses
 * SMIL and ignores it — exactly the failure mode this spike must detect.
 */

/** A minimal self-contained scene using the baseline's animation mechanism. */
const SMIL_SCENE = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 200 200">
  <path id="probe-orbit" fill="none" stroke="#333" d="M 20 100 C 20 55.8, 55.8 20, 100 20 C 144.2 20, 180 55.8, 180 100 C 180 144.2, 144.2 180, 100 180 C 55.8 180, 20 144.2, 20 100 Z"/>
  <circle id="probe-body" r="8" fill="#c33">
    <animateMotion dur="2s" repeatCount="indefinite">
      <mpath xlink:href="#probe-orbit"/>
    </animateMotion>
  </circle>
  <g id="probe-group">
    <rect x="90" y="10" width="6" height="6" fill="#3c3"/>
    <animateTransform attributeName="transform" type="rotate"
      from="0 100 100" to="360 100 100" dur="3s" repeatCount="indefinite"/>
  </g>
</svg>`;

/** Position of an element's rendered box, read from the live layout. */
async function boxOf(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(selector).boundingBox();

  if (box === null) {
    throw new Error(`${selector} has no bounding box`);
  }

  return { x: box.x, y: box.y };
}

function moved(
  first: { x: number; y: number },
  second: { x: number; y: number },
): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

async function loadStandalone(page: Page): Promise<void> {
  await page.setContent(
    `<!doctype html><html><body style="margin:0">${SMIL_SCENE}</body></html>`,
  );
  await page.waitForTimeout(100);
}

test.describe('SMIL animation support', () => {
  test('animateMotion moves an element along an mpath', async ({ page }, testInfo) => {
    await loadStandalone(page);

    const first = await boxOf(page, '#probe-body');
    await page.waitForTimeout(600);
    const second = await boxOf(page, '#probe-body');

    const distance = moved(first, second);

    testInfo.annotations.push({
      type: 'animateMotion displacement',
      description: `${testInfo.project.name}: ${distance.toFixed(2)}px`,
    });

    expect(distance, `${testInfo.project.name} did not animate animateMotion`).toBeGreaterThan(1);
  });

  test('animateTransform rotates a group', async ({ page }, testInfo) => {
    await loadStandalone(page);

    const first = await boxOf(page, '#probe-group rect');
    await page.waitForTimeout(600);
    const second = await boxOf(page, '#probe-group rect');

    const distance = moved(first, second);

    testInfo.annotations.push({
      type: 'animateTransform displacement',
      description: `${testInfo.project.name}: ${distance.toFixed(2)}px`,
    });

    expect(distance, `${testInfo.project.name} did not animate animateTransform`).toBeGreaterThan(1);
  });

  test('the scene renders at all', async ({ page }) => {
    await loadStandalone(page);

    await expect(page.locator('#probe-body')).toBeVisible();
    await expect(page.locator('#probe-orbit')).toBeVisible();
  });

  test('animation survives embedding via img src', async ({ page }, testInfo) => {
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(SMIL_SCENE).toString('base64')}`;

    await page.setContent(
      `<!doctype html><html><body style="margin:0">` +
        `<img id="embedded" src="${dataUrl}" width="200" height="200">` +
        `</body></html>`,
    );
    await page.waitForTimeout(100);

    // An <img> is an opaque replaced element: its DOM is unreachable, so
    // movement is measured by comparing rendered pixels rather than layout.
    const first = await page.locator('#embedded').screenshot();
    await page.waitForTimeout(600);
    const second = await page.locator('#embedded').screenshot();

    const identical = Buffer.compare(first, second) === 0;

    testInfo.annotations.push({
      type: 'img embedding',
      description: `${testInfo.project.name}: ${identical ? 'STATIC' : 'animated'}`,
    });

    expect(identical, `${testInfo.project.name} did not animate via <img src>`).toBe(false);
  });
});
