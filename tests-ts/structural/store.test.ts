import { describe, expect, it } from 'vitest';
import { createSceneStore } from '../../ts/app/store';

/**
 * Task 3.5 (CTL-007): the last valid scene survives a rejection.
 *
 * This is the behavioural half of the requirement. Validation alone cannot
 * satisfy it: the baseline's failure mode was that invalid input replaced or
 * destroyed what the user was looking at (E-026..E-033).
 */

const VALID = {
  canvasWidth: '300',
  canvasHeight: '300',
  seed: '42',
  palette: 'Aurora',
  planets: [{ size: '10', distance: '120', moon: false as const }],
};

describe('scene store', () => {
  it('holds no scene and no errors before the first submission', () => {
    const store = createSceneStore();

    expect(store.getState().svg).toBeNull();
    expect(store.getState().errors).toEqual([]);
  });

  it('renders a scene from valid input', () => {
    const store = createSceneStore();

    store.submit(VALID);

    expect(store.getState().svg).toContain('<svg');
    expect(store.getState().errors).toEqual([]);
  });

  it('retains the previous scene when input is rejected', () => {
    const store = createSceneStore();

    store.submit(VALID);
    const before = store.getState().svg;

    store.submit({ ...VALID, canvasWidth: 'abc' });

    expect(store.getState().svg).toBe(before);
  });

  it('surfaces the rejection alongside the retained scene', () => {
    const store = createSceneStore();

    store.submit(VALID);
    store.submit({ ...VALID, canvasWidth: 'abc' });

    expect(store.getState().errors.length).toBeGreaterThan(0);
    expect(store.getState().svg).not.toBeNull();
  });

  it('clears earlier errors once valid input is submitted', () => {
    const store = createSceneStore();

    store.submit({ ...VALID, canvasWidth: 'abc' });
    expect(store.getState().errors.length).toBeGreaterThan(0);

    store.submit(VALID);
    expect(store.getState().errors).toEqual([]);
  });

  it('does not regenerate the scene from an invalid submission', () => {
    const store = createSceneStore();

    store.submit(VALID);
    const before = store.getState().svg;

    store.submit({ ...VALID, canvasWidth: '999999' });

    expect(store.getState().svg).toBe(before);
  });

  it('keeps the seed when other parameters change', () => {
    const store = createSceneStore();

    store.submit(VALID);
    store.submit({ ...VALID, canvasHeight: '400' });

    expect(store.getState().seed).toBe(42);
  });

  it('reproduces an identical scene from identical input', () => {
    const first = createSceneStore();
    const second = createSceneStore();

    first.submit(VALID);
    second.submit(VALID);

    expect(first.getState().svg).toBe(second.getState().svg);
  });

  it('notifies subscribers when the state changes', () => {
    const store = createSceneStore();
    let notifications = 0;

    store.subscribe(() => {
      notifications += 1;
    });

    store.submit(VALID);
    store.submit({ ...VALID, canvasWidth: 'abc' });

    expect(notifications).toBe(2);
  });

  it('serializes the scene exactly once per valid submission', () => {
    const store = createSceneStore();

    expect(store.getGenerationCount()).toBe(0);
    store.submit(VALID);
    expect(store.getGenerationCount()).toBe(1);

    store.submit({ ...VALID, canvasHeight: '400' });
    expect(store.getGenerationCount()).toBe(2);
  });

  it('does not regenerate on state reads', () => {
    const store = createSceneStore();

    store.submit(VALID);
    const initialState = store.getState();
    const storedSvg = initialState.svg;
    const count = store.getGenerationCount();

    // Preview and download consume the same stored string (D-19, EXP-002):
    // reading the state must never call the generator again, even though a
    // regeneration would be byte-identical and therefore invisible to a
    // byte comparison.
    expect(count).toBe(1);
    expect(storedSvg).toContain('<svg');

    const firstRead = store.getState();
    const secondRead = store.getState();

    expect(firstRead.svg).toBe(storedSvg);
    expect(secondRead.svg).toBe(storedSvg);

    expect(store.getGenerationCount()).toBe(count);
  });

  it('does not regenerate on a rejected submission', () => {
    const store = createSceneStore();

    store.submit(VALID);
    const beforeState = store.getState();
    const beforeSvg = beforeState.svg;
    const count = store.getGenerationCount();

    store.submit({ ...VALID, canvasWidth: 'abc' });
    store.submit({ ...VALID, canvasWidth: '999999' });

    expect(count).toBe(1);
    expect(beforeSvg).toContain('<svg');
    expect(store.getState().svg).toBe(beforeSvg);
    expect(store.getState().errors.length).toBeGreaterThan(0);
    expect(store.getGenerationCount()).toBe(count);
  });
});
