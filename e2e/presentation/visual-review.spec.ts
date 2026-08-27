import { writeFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const VIEWPORTS = {
  narrow: { width: 400, height: 800 },
  desktop: { width: 1200, height: 800 },
  wide: { width: 1440, height: 900 },
} as const;

const STATES = ['initial', 'dense-valid', 'validation-error', 'reduced-motion'] as const;

type ReviewState = (typeof STATES)[number];

async function prepareState(page: Page, state: ReviewState): Promise<boolean> {
  if (state === 'reduced-motion') {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  }

  await page.goto('/');
  await expect(page.locator('#preview svg')).toBeVisible();
  const initialPreview = await page.locator('#preview').innerHTML();

  if (state === 'dense-valid') {
    for (let count = 0; count < 3; count += 1) {
      await page.locator('[data-action="add-planet"]').click();
    }
  }

  if (state === 'validation-error') {
    const width = page.locator('[data-control="canvasWidth"]');
    await width.fill('5');
    await width.blur();
    await expect(width).toHaveAttribute('aria-invalid', 'true');
  }

  if (state === 'reduced-motion') {
    await expect(page.locator('[data-role="reduced-motion-notice"]')).toBeVisible();
  }

  return state !== 'validation-error' || (await page.locator('#preview').innerHTML()) === initialPreview;
}

for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
  for (const state of STATES) {
    test(`visual matrix: ${viewportName} / ${state}`, async ({ page }, testInfo: TestInfo) => {
      test.skip(testInfo.project.name !== 'chromium', 'Durable review evidence is captured once in Chromium.');
      await page.setViewportSize(viewport);
      const retainedPreview = await prepareState(page, state);

      const focusTarget = page.locator('[data-control="canvasWidth"]');
      await focusTarget.focus();

      const evidence = await page.evaluate(({ expectedWidth, stateName }) => {
        const box = (selector: string): { x: number; y: number; width: number; height: number } | null => {
          const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();

          return rect === undefined
            ? null
            : { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        };
        const controls = [...document.querySelectorAll<HTMLElement>('[data-control]')];
        const scene = document.querySelector<SVGSVGElement>('#preview > svg');
        const focused = document.activeElement instanceof HTMLElement
          ? getComputedStyle(document.activeElement)
          : null;

        return {
          viewportWidth: innerWidth,
          viewportHeight: innerHeight,
          expectedWidth,
          state: stateName,
          desktopMediaMatches: matchMedia('(min-width: 720px)').matches,
          sceneComputedWidth: scene === null ? null : getComputedStyle(scene).width,
          horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
          stage: box('[data-role="instrument-stage"]'),
          controls: box('[data-role="instrument-controls"]'),
          actions: box('[data-role="instrument-actions"]'),
          preview: box('#preview'),
          previewVisible: box('#preview svg') !== null,
          actionsVisible: box('[data-role="instrument-actions"]') !== null,
          telemetryVisible: box('[data-role="scene-telemetry"]') !== null,
          planetCount: document.querySelectorAll('[data-role="planet-instrument"]').length,
          invalidCount: document.querySelectorAll('[aria-invalid="true"]').length,
          allControlsLabelled: controls.every((control) => {
            const id = control.id;
            return id !== '' && document.querySelector(`label[for="${CSS.escape(id)}"]`) !== null;
          }),
          inlineErrorsAssociated: [...document.querySelectorAll<HTMLElement>('[aria-invalid="true"]')]
            .every((control) => {
              const id = control.getAttribute('aria-describedby');
              return id !== null && document.getElementById(id)?.textContent?.trim() !== '';
            }),
          focus: focused === null
            ? null
            : {
                outlineStyle: focused.outlineStyle,
                outlineWidth: focused.outlineWidth,
                outlineColor: focused.outlineColor,
              },
          reducedNoticeVisible: !document.querySelector<HTMLElement>(
            '[data-role="reduced-motion-notice"]',
          )?.hidden,
          transitionDuration: getComputedStyle(
            document.querySelector<HTMLElement>('[data-action="toggle-playback"]')!,
          ).transitionDuration,
        };
      }, { expectedWidth: viewport.width, stateName: state });

      expect(evidence.viewportWidth).toBe(viewport.width);
      expect(evidence.horizontalOverflow).toBeLessThanOrEqual(1);
      expect(evidence.stage).not.toBeNull();
      expect(evidence.controls).not.toBeNull();
      expect(evidence.actions).not.toBeNull();
      expect(evidence.previewVisible).toBe(true);
      expect(evidence.actionsVisible).toBe(true);
      expect(evidence.telemetryVisible).toBe(false);
      expect(evidence.allControlsLabelled).toBe(true);
      expect(evidence.inlineErrorsAssociated).toBe(true);
      expect(evidence.focus?.outlineStyle).toBe('solid');
      expect(parseFloat(evidence.focus?.outlineWidth ?? '0')).toBeGreaterThan(0);
      expect(retainedPreview).toBe(true);
      expect(
        evidence.actions!.y + evidence.actions!.height,
        JSON.stringify({
          viewportHeight: evidence.viewportHeight,
          desktopMediaMatches: evidence.desktopMediaMatches,
          sceneComputedWidth: evidence.sceneComputedWidth,
        }),
      ).toBeLessThanOrEqual(viewport.height + 1);
      expect(evidence.preview).not.toBeNull();
      expect(evidence.actions!.y + evidence.actions!.height).toBeLessThanOrEqual(
        evidence.preview!.y,
      );

      if (viewport.width === VIEWPORTS.narrow.width) {
        expect(evidence.stage!.y).toBeLessThan(evidence.controls!.y);
      } else {
        expect(evidence.controls!.x).toBeLessThan(evidence.stage!.x);
        expect(evidence.stage!.width).toBeGreaterThan(evidence.controls!.width);
      }

      expect(evidence.planetCount).toBe(state === 'dense-valid' ? 6 : 3);
      expect(evidence.invalidCount).toBe(state === 'validation-error' ? 1 : 0);
      expect(evidence.reducedNoticeVisible).toBe(state === 'reduced-motion');
      if (state === 'reduced-motion') {
        expect(evidence.transitionDuration).toBe('0s');
      }

      const screenshot = testInfo.outputPath(`${viewportName}-${state}.png`);
      const domEvidence = testInfo.outputPath(`${viewportName}-${state}.json`);
      await page.screenshot({ path: screenshot, fullPage: true });
      await writeFile(domEvidence, JSON.stringify({ ...evidence, retainedPreview }, null, 2));
      await testInfo.attach('dom-evidence', {
        path: domEvidence,
        contentType: 'application/json',
      });
    });
  }
}
