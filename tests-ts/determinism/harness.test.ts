import { describe, expect, it } from 'vitest';

// Determinism layer harness check (task 1.3).
// The real sweep lands in tasks 2.2, 2.3 and 2.15. This asserts only that the
// layer's primitive — byte equality of two generated strings — is exercised,
// so the recorded command is runnable from the moment it is written down.
describe('determinism layer', () => {
  it('asserts byte equality of repeated output', () => {
    const generate = (seed: string): string => `scene:${seed}`;

    expect(generate('abc')).toBe(generate('abc'));
    expect(generate('abc')).not.toBe(generate('abd'));
  });
});
