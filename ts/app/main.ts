import { controlsMarkup, DEFAULT_INPUT, readControls } from './controls';
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

  // `change` covers text commits and checkbox toggles alike.
  form.addEventListener('change', submit);

  submit();
  render();
}

const root = document.querySelector<HTMLElement>('#app');

if (root) {
  mountApp(root);
}
