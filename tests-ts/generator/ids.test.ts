import { describe, expect, it, vi } from 'vitest';
import { createIdGenerator } from '../../ts/generator/ids';

describe('seed-derived element identifiers', () => {
  it('produces identical ids for two generations under the same seed', () => {
    const first = createIdGenerator(42);
    const second = createIdGenerator(42);

    expect([
      first.next('orbit'),
      first.next('planet'),
      first.next('clip'),
      first.next('moon'),
    ]).toEqual([
      second.next('orbit'),
      second.next('planet'),
      second.next('clip'),
      second.next('moon'),
    ]);
  });

  it('does not obtain identity from wall-clock time', () => {
    const clock = vi.spyOn(Date, 'now');

    try {
      clock.mockReturnValueOnce(1_000);
      const atFirstTime = createIdGenerator(42);
      const firstId = atFirstTime.next('orbit');

      clock.mockReturnValueOnce(2_000);
      const atLaterTime = createIdGenerator(42);
      const laterId = atLaterTime.next('orbit');

      // A time-derived implementation (such as the PHP `uniqid` baseline)
      // turns red here because the two generations observe different clocks.
      expect(firstId).toBe(laterId);
    } finally {
      clock.mockRestore();
    }
  });

  it('keeps ids unique within one generation', () => {
    const ids = createIdGenerator(42);
    const generated = Array.from({ length: 1_000 }, () => ids.next('planet'));

    expect(new Set(generated)).toHaveLength(generated.length);
  });

  it('separates ids from different seeds', () => {
    expect(createIdGenerator(42).next('planet')).not.toBe(
      createIdGenerator(43).next('planet'),
    );
  });
});
