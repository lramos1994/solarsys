export interface Prng {
  /** Returns the next deterministic pseudo-random value in [0, 1). */
  next(): number;
}

/**
 * Create a seed-threaded Mulberry32 generator.
 *
 * Its mutable state is private to this closure: generators never read or write
 * global state, so scene generation can be reproduced and safely composed by
 * explicitly passing one PRNG through the renderer (D-20).
 */
export function createPrng(seed: number): Prng {
  let state = seed >>> 0;

  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;

      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

      return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
    },
  };
}
