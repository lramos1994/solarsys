import './styles.css';
import { controlsMarkup, DEFAULT_INPUT, DEFAULT_PLANET, readControls } from './controls';
import { downloadSvg } from './download';
import {
  applyPlayback,
  playbackActionLabel,
  prefersReducedMotion,
  type PlaybackState,
} from './playback';
import { createSceneStore } from './store';
import type { RawSceneInput } from './validation';

/**
 * Pick browser entropy for a new user-requested seed, never for generation.
 * The generator remains pure and deterministic: this only chooses its next
 * input. Incrementing the one collision guarantees the requested seed differs.
 */
function newSeedExcluding(current: number | null): number {
  const candidate = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;

  return candidate === current ? (candidate + 1) >>> 0 : candidate;
}

/**
 * Maps a validator error field to its `data-control` name (CX-004). Planet
 * distance errors carry field `orbitDistance` (the bound) or `distanceForm`
 * (the arity check); both resolve to the single `planetDistance` control.
 */
const CONTROL_FOR_FIELD: Record<string, string> = {
  canvasWidth: 'canvasWidth',
  canvasHeight: 'canvasHeight',
  seed: 'seed',
  palette: 'palette',
  planetSize: 'planetSize',
  orbitDistance: 'planetDistance',
  distanceForm: 'planetDistance',
  moonSize: 'moonSize',
  moonDistance: 'moonDistance',
  moonPeriod: 'moonPeriod',
};

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
    `<div class="app-shell">` +
    `<aside class="controls-pane">` +
    `<form id="controls" novalidate>${controlsMarkup(initial)}</form>` +
    `<p class="seed-line">Current scene seed: <output data-role="current-seed"></output></p>` +
    `<ul data-role="errors" aria-live="polite"></ul>` +
    `</aside>` +
    `<section class="preview-pane">` +
    `<div id="preview"></div>` +
    `<p data-role="reduced-motion-notice" hidden>` +
    `Your system asks for reduced motion, so the scene starts paused. ` +
    `Downloaded files always animate.` +
    `</p>` +
    `<div class="preview-actions">` +
    `<button type="button" data-action="toggle-playback">Pause animation</button>` +
    `<button type="button" data-action="download-svg">Download SVG</button>` +
    `</div>` +
    `</section>` +
    `</div>`;

  const form = root.querySelector<HTMLFormElement>('#controls');
  const preview = root.querySelector<HTMLElement>('#preview');
  const errorList = root.querySelector<HTMLElement>('[data-role="errors"]');
  const seedDisplay = root.querySelector<HTMLOutputElement>('[data-role="current-seed"]');
  const downloadButton = root.querySelector<HTMLButtonElement>('[data-action="download-svg"]');
  const playbackButton = root.querySelector<HTMLButtonElement>('[data-action="toggle-playback"]');
  const notice = root.querySelector<HTMLElement>('[data-role="reduced-motion-notice"]');

  if (!form || !preview || !errorList || !seedDisplay || !downloadButton || !playbackButton || !notice) {
    throw new Error('Application shell failed to mount its own markup.');
  }

  let rendered: string | null = null;

  // Reduced motion decides only the STARTING state; the user owns it after
  // that. The notice explains the pause and retires once it is acted upon.
  const startsPaused = prefersReducedMotion();
  let playback: PlaybackState = startsPaused ? 'paused' : 'running';
  let explained = startsPaused;

  function renderPlayback(): void {
    playbackButton!.textContent = playbackActionLabel(playback);
    playbackButton!.setAttribute('aria-pressed', String(playback === 'paused'));
    notice!.hidden = !explained;
  }

  function render(): void {
    const state = store.getState();

    // Compare against what was last WRITTEN, not against `preview.innerHTML`:
    // the browser re-serialises markup on read, so that comparison never
    // matches and the preview would be rewritten on every rejection —
    // restarting every animation timeline (CTL-007).
    if (state.svg !== null && state.svg !== rendered) {
      preview!.innerHTML = state.svg;
      rendered = state.svg;
      // A fresh scene always starts running, so re-assert the chosen state.
      applyPlayback(preview!, playback);
    }

    // Clear previous inline errors and their association (CX-004).
    for (const element of form!.querySelectorAll('[aria-invalid]')) {
      element.removeAttribute('aria-invalid');
    }
    for (const slot of form!.querySelectorAll('.field-error')) {
      slot.textContent = '';
    }

    // Summary list (the aria-live region that announces the rejections).
    errorList!.innerHTML = state.errors
      .map((error) => `<li data-field="${error.field}">${error.message}</li>`)
      .join('');

    // Inline messages, programmatically associated with their control.
    for (const error of state.errors) {
      const control = CONTROL_FOR_FIELD[error.field];

      if (control === undefined) {
        continue;
      }

      const selector =
        error.index !== undefined
          ? `[data-planet="${error.index}"] [data-control="${control}"]`
          : `[data-control="${control}"]`;
      const input = form!.querySelector<HTMLInputElement>(selector);

      if (input === null) {
        continue;
      }

      input.setAttribute('aria-invalid', 'true');

      const describedBy = input.getAttribute('aria-describedby');
      const slot = describedBy
        ? form!.querySelector<HTMLElement>(`#${describedBy}`)
        : null;

      if (slot !== null) {
        slot.textContent = error.message;
      }
    }

    seedDisplay!.value = state.seed === null ? '' : String(state.seed);
    renderPlayback();
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

    if (button.dataset.action === 'new-seed') {
      form.innerHTML = controlsMarkup({
        ...input,
        seed: String(newSeedExcluding(store.getState().seed)),
      });
      submit();

      return;
    }

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

    // Focus management (CX-006): the form was just rebuilt, so re-query fresh
    // nodes in the next frame. On add, land on the new card's first control;
    // on remove, land on the group that shifted into the removed slot, or the
    // add button when none remain.
    const addedIndex = planets.length - 1;
    const focusSelector =
      button.dataset.action === 'add-planet'
        ? `[data-planet="${addedIndex}"] [data-control="planetSize"]`
        : `[data-planet="${Number(button.dataset.index)}"] [data-action="remove-planet"]`;

    requestAnimationFrame(() => {
      const target = form!.querySelector<HTMLElement>(focusSelector);

      if (target !== null) {
        target.focus();

        return;
      }

      // Removed the last planet (or the trailing slot is now empty): land on
      // the last remaining group, or the add button when the list is empty.
      if (button.dataset.action === 'remove-planet' && planets.length > 0) {
        form!
          .querySelector<HTMLElement>(`[data-planet="${planets.length - 1}"] [data-action="remove-planet"]`)
          ?.focus();
      } else {
        form!.querySelector<HTMLElement>('[data-action="add-planet"]')?.focus();
      }
    });
  });

  downloadButton.addEventListener('click', () => {
    const { seed, svg } = store.getState();

    if (svg !== null && seed !== null) {
      downloadSvg(svg, seed);
    }
  });

  playbackButton.addEventListener('click', () => {
    playback = playback === 'running' ? 'paused' : 'running';
    // Once the user has taken control, the explanation has served its purpose.
    explained = false;
    applyPlayback(preview!, playback);
    renderPlayback();
  });

  submit();
  render();
}

const root = document.querySelector<HTMLElement>('#app');

if (root) {
  mountApp(root);
}
