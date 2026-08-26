import { controlsMarkup, DEFAULT_INPUT, DEFAULT_PLANET, readControls } from './controls';
import { createSceneStore } from './store';
import type { RawSceneInput } from './validation';

/**
 * Application shell (CTL-001, CTL-002, CTL-007).
 *
 * The generator stays DOM-free (D-18, D-21); this module owns the DOM. It
 * mounts the control surface, submits raw values to the store on every change,
 * and renders whatever the store decides — including leaving the preview alone
 * when a submission was rejected.
 */

export function mountApp(root: HTMLElement, initial: RawSceneInput = DEFAULT_INPUT): void {
  const store = createSceneStore();

  root.innerHTML =
    `<form id="controls" novalidate>${controlsMarkup(initial)}</form>` +
    `<ul data-role="errors"></ul>` +
    `<div id="preview"></div>`;

  const form = root.querySelector<HTMLFormElement>('#controls');
  const preview = root.querySelector<HTMLElement>('#preview');
  const errorList = root.querySelector<HTMLElement>('[data-role="errors"]');

  if (!form || !preview || !errorList) {
    throw new Error('Application shell failed to mount its own markup.');
  }

  let rendered: string | null = null;

  function render(): void {
    const state = store.getState();

    // Compare against what was last WRITTEN, not against `preview.innerHTML`:
    // the browser re-serialises markup on read, so that comparison never
    // matches and the preview would be rewritten on every rejection —
    // restarting every animation timeline (CTL-007).
    if (state.svg !== null && state.svg !== rendered) {
      preview!.innerHTML = state.svg;
      rendered = state.svg;
    }

    errorList!.innerHTML = state.errors
      .map((error) => `<li data-field="${error.field}">${error.message}</li>`)
      .join('');
  }

  store.subscribe(render);

  function submit(): void {
    store.submit(readControls(form!));
  }

  form.addEventListener('change', (event) => {
    // Moon fields are conditional. Rebuild the controls from the just-edited
    // raw input when the checkbox toggles, then use the same validated submit
    // path as every other field update.
    if (
      event.target instanceof HTMLInputElement &&
      event.target.dataset.control === 'moonEnabled'
    ) {
      form.innerHTML = controlsMarkup(readControls(form));
    }

    submit();
  });

  form.addEventListener('click', (event) => {
    const button = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>('button[data-action]')
      : null;

    if (!button) {
      return;
    }

    const input = readControls(form);
    let planets: readonly RawSceneInput['planets'][number][];

    if (button.dataset.action === 'add-planet') {
      planets = [...input.planets, { ...DEFAULT_PLANET }];
    } else if (button.dataset.action === 'remove-planet') {
      const index = Number(button.dataset.index);

      if (!Number.isInteger(index)) {
        return;
      }

      planets = input.planets.filter((_, candidate) => candidate !== index);
    } else {
      return;
    }

    form.innerHTML = controlsMarkup({
      ...input,
      planets,
    });
    submit();
  });

  submit();
  render();
}

const root = document.querySelector<HTMLElement>('#app');

if (root) {
  mountApp(root);
}
