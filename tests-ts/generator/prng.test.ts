import { describe, expect, it } from 'vitest';
import { createPrng } from '../../ts/generator/prng';

describe('seeded PRNG', () => {
  it('returns an identical sequence for identical seeds', () => {
    const first = createPrng(42);
    const second = createPrng(42);

    expect(Array.from({ length: 12 }, () => first.next())).toEqual(
      Array.from({ length: 12 }, () => second.next()),
    );
  });

  it('returns a divergent sequence for distinct seeds', () => {
    const first = createPrng(42);
    const second = createPrng(43);

    expect(Array.from({ length: 12 }, () => first.next())).not.toEqual(
      Array.from({ length: 12 }, () => second.next()),
    );
  });

  it('keeps each generated value within [0, 1)', () => {
    const random = createPrng(0);

    for (let index = 0; index < 1_000; index += 1) {
      const value = random.next();

      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('does not share state between instances', () => {
    const first = createPrng(7);
    const second = createPrng(7);

    first.next();
    first.next();

    expect(second.next()).toBe(createPrng(7).next());
  });
});
