import { describe, expect, it } from 'vitest';

// Geometry parity layer harness check (task 1.3).
// The parity suite itself is written in task 2.4 against the PHP oracle
// fixtures captured in task 1.2. This asserts only that the layer's comparison
// primitive — numeric equality within a tolerance, never pixel comparison
// (D-03) — is available and behaves as expected.
const TOLERANCE_DIGITS = 6;

describe('geometry parity layer', () => {
  it('compares coordinates within a tolerance', () => {
    expect(52.500001).toBeCloseTo(52.5, TOLERANCE_DIGITS - 1);
    expect(52.5).not.toBeCloseTo(52.6, TOLERANCE_DIGITS);
  });
});
