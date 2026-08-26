export interface IdGenerator {
  /** Returns the next unique, seed-derived identifier for `kind`. */
  next(kind: string): string;
}

/**
 * Create a deterministic identifier sequence for one scene generation.
 *
 * The generator deliberately has no clock, random source, or module-level
 * counter. Recreating it with the same seed and generation order therefore
 * recreates every id byte-for-byte (QLT-002, D-20).
 */
export function createIdGenerator(seed: number): IdGenerator {
  const seedToken = (seed >>> 0).toString(36);
  let counter = 0;

  return {
    next(kind: string): string {
      const id = `${kind}-${seedToken}-${counter.toString(36)}`;
      counter += 1;

      return id;
    },
  };
}
