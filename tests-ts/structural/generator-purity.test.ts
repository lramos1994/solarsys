import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Task 1.3 (WAL-006): the generator stays free of export concerns.
 *
 * The export pipeline (seek-and-bake, loop closure, MP4 encoding) lives in
 * `ts/app/wallpaper.ts`; nothing under `ts/generator/` may reference it. This
 * is a STATIC assertion: it reads every generator source file and fails on any
 * token that would indicate an export concern — video export, loop length,
 * frame rate, or output resolution (WAL-006 "Generator remains free of export
 * concerns"). The bare `export` keyword is excluded by construction: every
 * module uses it for its public surface, so it cannot be a discriminator.
 */

const GENERATOR_DIR = fileURLToPath(new URL('../../ts/generator', import.meta.url));

/** Export-concern vocabulary the generator must never contain. */
const FORBIDDEN: ReadonlyArray<{ token: string; concept: string }> = [
  { token: 'wallpaper', concept: 'video export (feature name)' },
  { token: 'MediaRecorder', concept: 'video export (platform encoder)' },
  { token: 'VideoEncoder', concept: 'video export (platform encoder)' },
  { token: 'captureStream', concept: 'video export (frame capture)' },
  { token: 'requestFrame', concept: 'video export (frame capture)' },
  { token: 'encodeWallpaper', concept: 'video export (encode entry point)' },
  { token: 'fps', concept: 'frame rate' },
  { token: 'frameRate', concept: 'frame rate' },
  { token: 'loopSeconds', concept: 'loop length' },
  { token: 'loopLength', concept: 'loop length' },
  { token: 'loopPeriod', concept: 'loop length' },
  { token: 'closeLoop', concept: 'loop closure' },
  { token: 'resolution', concept: 'output resolution' },
];

function listTsFiles(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((entry) => {
      const path = join(dir, entry);

      return statSync(path).isDirectory() ? listTsFiles(path) : [path];
    })
    .filter((path) => path.endsWith('.ts'));
}

describe('generator purity (WAL-006)', () => {
  const files = listTsFiles(GENERATOR_DIR);

  it('scans every generator source file', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('no generator file references export, loop, fps, or resolution concerns', () => {
    const violations: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');

      for (const { token, concept } of FORBIDDEN) {
        if (source.includes(token)) {
          violations.push(`${file}: references "${token}" (${concept})`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
