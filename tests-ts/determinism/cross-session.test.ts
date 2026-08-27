import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const childTest = 'tests-ts/determinism/cross-session-child.test.ts';

function generateInFreshSession(output: string): void {
  execFileSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vitest', 'run', childTest],
    {
      cwd: process.cwd(),
      env: { ...process.env, SOLARSYS_CROSS_SESSION_OUTPUT: output },
      stdio: 'pipe',
    },
  );
}

describe('cross-session reproduction (EXP-006)', () => {
  it('produces byte-identical SVG files in separate Vitest processes', () => {
    const directory = mkdtempSync(join(tmpdir(), 'solarsys-cross-session-'));
    const first = join(directory, 'first.svg');
    const second = join(directory, 'second.svg');

    try {
      generateInFreshSession(first);
      generateInFreshSession(second);

      expect(readFileSync(first)).toEqual(readFileSync(second));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
