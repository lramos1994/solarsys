import { describe, expect, it } from 'vitest';
import { createSvgDownload } from '../../ts/app/download';
import { createSceneStore } from '../../ts/app/store';

const VALID = {
  canvasWidth: '300',
  canvasHeight: '300',
  seed: '42',
  palette: 'Aurora',
  planets: [{ size: '10', distance: '120', moon: false as const }],
};

describe('SVG download', () => {
  it('uses the exact serialized scene held for preview', async () => {
    const store = createSceneStore();
    store.submit(VALID);
    const previewedSvg = store.getState().svg;

    expect(previewedSvg).not.toBeNull();
    const download = createSvgDownload(previewedSvg!, 42);

    expect(download.filename).toBe('solarsys-42.svg');
    expect(download.blob.type).toBe('image/svg+xml;charset=utf-8');
    await expect(download.blob.text()).resolves.toBe(previewedSvg);
  });

  it('creates byte-identical files for repeated downloads of one preview', async () => {
    const store = createSceneStore();
    store.submit(VALID);
    const previewedSvg = store.getState().svg!;

    const first = createSvgDownload(previewedSvg, 42);
    const second = createSvgDownload(previewedSvg, 42);

    await expect(first.blob.text()).resolves.toBe(previewedSvg);
    await expect(second.blob.text()).resolves.toBe(previewedSvg);
    await expect(first.blob.arrayBuffer()).resolves.toEqual(
      await second.blob.arrayBuffer(),
    );
  });

  it('distinguishes files generated from different seeds', () => {
    expect(createSvgDownload('<svg/>', 42).filename).toBe('solarsys-42.svg');
    expect(createSvgDownload('<svg/>', 43).filename).toBe('solarsys-43.svg');
  });
});
