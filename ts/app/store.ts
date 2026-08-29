import { generateScene } from '../generator/scene';
import { validateScene, type RawSceneInput, type ValidationError } from './validation';

/**
 * Scene state for the UI (CTL-007, CTL-008).
 *
 * The store owns the rule that a rejected submission must not disturb what the
 * user is looking at: invalid input produces errors while the previously
 * rendered scene stays exactly as it was.
 */

export interface SceneState {
  /** Serialized SVG of the last VALID scene, or null before the first one. */
  svg: string | null;
  /** Seed of the last valid scene. */
  seed: number | null;
  /** Rejections from the most recent submission; empty when it succeeded. */
  errors: readonly ValidationError[];
}

export interface SceneStore {
  getState(): SceneState;
  submit(input: RawSceneInput): void;
  subscribe(listener: () => void): () => void;
  /** Number of times the generator has been invoked (WAL-006 instrumentation). */
  getGenerationCount(): number;
}

export function createSceneStore(): SceneStore {
  let state: SceneState = { svg: null, seed: null, errors: [] };
  const listeners = new Set<() => void>();

  // WAL-006: the export path must read the stored string, never regenerate it.
  // Because a regeneration with a fixed seed and unchanged parameters produces
  // byte-identical output, byte comparison alone cannot detect it — so the
  // store counts actual `generateScene` invocations and exposes the tally.
  let generationCount = 0;

  function setState(next: SceneState): void {
    state = next;

    for (const listener of listeners) {
      listener();
    }
  }

  return {
    getState: () => state,

    submit(input) {
      const result = validateScene(input);

      if (!result.ok) {
        // Retain svg and seed untouched: a rejection must never blank or
        // alter the scene the user is currently viewing.
        setState({ svg: state.svg, seed: state.seed, errors: result.errors });

        return;
      }

      // Generate once and keep the string: preview and download must consume
      // byte-identical output (D-19, EXP-002).
      const svg = generateScene(result.params, result.seed);
      generationCount += 1;
      setState({ svg, seed: result.seed, errors: [] });
    },

    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },

    getGenerationCount: () => generationCount,
  };
}
