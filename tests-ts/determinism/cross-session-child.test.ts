import { writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { generateScene, type SceneParams } from '../../ts/generator/scene';

const output = process.env.SOLARSYS_CROSS_SESSION_OUTPUT;

const params: SceneParams = {
  canvas: { width: 640, height: 360 },
  palette: 'Verdant',
  planets: [
    { size: 12, distance: 110, moon: false },
    { size: 18, distance: [190, 80, 170, 70], moon: { size: 5, distance: 32 } },
  ],
};

it.skipIf(output === undefined)('writes one deterministic scene for the parent process', () => {
  writeFileSync(output!, generateScene(params, 4_294_967_295), 'utf8');
  expect(output).toBeDefined();
});
