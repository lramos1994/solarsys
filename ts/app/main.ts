import './styles.css';
import {
  CANVAS_PRESETS,
  controlsMarkup,
  CUSTOM_PRESET,
  DEFAULT_INPUT,
  DEFAULT_PLANET,
  presetFor,
  readControls,
  type RawSceneControls,
} from './controls';
import { downloadSvg } from './download';
import { icon } from './icons';
import {
  applyPlayback,
  playbackActionLabel,
  prefersReducedMotion,
  type PlaybackState,
} from './playback';
import { createSceneStore } from './store';
import type { RawSceneInput } from './validation';

/** Scene identity is intentionally fixed until a future seed-control change. */
const FIXED_SCENE_SEED = 20_260_826;

function withFixedSeed(controls: RawSceneControls): RawSceneInput {
  return { ...controls, seed: String(FIXED_SCENE_SEED) };
}

/**
 * Maps a validator error field to its `data-control` name (CX-004). Planet
 * distance errors carry field `orbitDistance` (the bound) or `distanceForm`
 * (the arity check); both resolve to the single `planetDistance` control.
 */
const CONTROL_FOR_FIELD: Record<string, string> = {
  canvasWidth: 'canvasWidth',
  canvasHeight: 'canvasHeight',
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

  /**
   * Collapsed planet indices (CD-002, D-204, D-211).
   *
   * This lives here rather than in the DOM because the form is rebuilt
   * wholesale with `innerHTML` on every structural change — a moon toggle, a
   * planet add or remove, a new seed. State held in a `<details open>`
   * attribute would be destroyed by each of those rebuilds, silently expanding
   * every group. It is presentation-only: it never enters `RawSceneInput`,
   * never reaches the validator, and never reaches the generator.
   *
   * The deck OPENS with the first planet expanded and the rest collapsed
   * (D-211). Measured with every planet expanded the form is 960px, still over
   * the 620px budget; the collapse mechanism only pays for itself if the
   * default state uses it. The first planet stays open so the surface is
   * self-explanatory — a user sees what a planet instrument contains without
   * having to discover the disclosure first.
   */
  const collapsedPlanets = new Set<number>(
    initial.planets.map((_, index) => index).filter((index) => index > 0),
  );

  root.innerHTML =
    `<div class="app-shell">` +
    `<aside class="controls-pane" data-role="instrument-controls" aria-label="Instrument configuration">` +
    `<header class="pane-heading">` +
    `<p class="eyebrow">SolarSys / Control deck</p>` +
    `<h1>Scene instruments</h1>` +
    `<p>Calibrate the system, then observe the generated artefact.</p>` +
    `</header>` +
    `<form id="controls" novalidate>` +
    `${controlsMarkup(initial, { collapsed: collapsedPlanets })}</form>` +
    `<ul data-role="errors" aria-live="polite"></ul>` +
    `</aside>` +
    `<section class="preview-pane" data-role="instrument-stage" aria-label="Observatory preview stage">` +
    `<header class="stage-heading">` +
    `<div><p class="eyebrow">Live observatory</p><h2>Generated scene</h2></div>` +
    `<div class="stage-actions" data-role="instrument-actions" aria-label="Scene actions">` +
    `<button type="button" data-action="toggle-playback">` +
    `${icon('pause')}<span data-role="playback-label">Pause animation</span></button>` +
    `<button type="button" data-action="download-svg">` +
    `${icon('download')}<span>Download SVG</span></button>` +
    `</div>` +
    `</header>` +
    `<div id="preview"></div>` +
    `<p data-role="reduced-motion-notice" hidden>` +
    `Your system asks for reduced motion, so the scene starts paused. ` +
    `Downloaded files always animate.` +
    `</p>` +
    `</section>` +
    `</div>`;

  const form = root.querySelector<HTMLFormElement>('#controls');
  const preview = root.querySelector<HTMLElement>('#preview');
  const errorList = root.querySelector<HTMLElement>('[data-role="errors"]');

  const downloadButton = root.querySelector<HTMLButtonElement>('[data-action="download-svg"]');
  const playbackButton = root.querySelector<HTMLButtonElement>('[data-action="toggle-playback"]');
  const notice = root.querySelector<HTMLElement>('[data-role="reduced-motion-notice"]');

  if (!form || !preview || !errorList || !downloadButton || !playbackButton || !notice) {
    throw new Error('Application shell failed to mount its own markup.');
  }

  let rendered: string | null = null;

  /** Planet indices currently carrying a validation error (CD-004). */
  let erroringPlanets: ReadonlySet<number> = new Set<number>();

  // Reduced motion decides only the STARTING state; the user owns it after
  // that. The notice explains the pause and retires once it is acted upon.
  const startsPaused = prefersReducedMotion();
  let playback: PlaybackState = startsPaused ? 'paused' : 'running';
  let explained = startsPaused;

  /** Re-render the form, preserving collapse state across the rebuild. */
  function rebuild(input: RawSceneControls): void {
    form!.innerHTML = controlsMarkup(input, { collapsed: collapsedPlanets });
  }

  function renderPlayback(): void {
    const label = playbackButton!.querySelector<HTMLElement>('[data-role="playback-label"]');

    // Write into the label span, never the button: the button also contains an
    // icon element that `textContent` would destroy.
    if (label !== null) {
      label.textContent = playbackActionLabel(playback);
    }

    const glyph = playback === 'running' ? 'pause' : 'play';
    const existing = playbackButton!.querySelector('svg');

    if (existing !== null) {
      existing.outerHTML = icon(glyph);
    }

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

    // A rejection must never be announced from inside a collapsed group
    // (CD-004). Two mechanisms cover this, and mutation testing showed only
    // ONE of them is load-bearing:
    //
    //  - the disclosure handler REFUSES to collapse a group holding an error.
    //    Disabling it turns the CD-004 tests RED; this is the real guard.
    //  - the expansion below re-opens a group that is somehow closed while
    //    erroring. Disabling it leaves the suite GREEN, because the guard
    //    above means the state never arises: a user cannot type into a closed
    //    group, and a group cannot be closed while it errors.
    //
    // It is kept as a cheap invariant backstop for future code paths that
    // might populate `collapsedPlanets` directly, and is documented as
    // defensive rather than claimed as verified behaviour.
    const withErrors = new Set<number>();

    for (const error of state.errors) {
      if (error.index !== undefined) {
        withErrors.add(error.index);
      }
    }

    erroringPlanets = withErrors;

    for (const index of withErrors) {
      collapsedPlanets.delete(index);
      form!
        .querySelector<HTMLDetailsElement>(`[data-planet="${index}"]`)
        ?.setAttribute('open', '');
    }

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

    renderDerived();
    renderPlayback();
  }

  /**
   * Refresh display that is DERIVED from control values rather than typed into
   * them: each collapsed group's summary (CD-003) and the canvas preset state
   * (CX-010).
   *
   * These cannot wait for the next wholesale form rebuild. An ordinary edit —
   * typing a size, dragging a range — never rebuilds the form, so without this
   * the summary would keep showing a stale value and the preset would keep
   * claiming a size the user has since changed.
   */
  function renderDerived(): void {
    const current = readControls(form!);

    current.planets.forEach((planet, index) => {
      const scope = form!.querySelector(`[data-planet="${index}"]`);

      if (scope === null) {
        return;
      }

      const size = scope.querySelector<HTMLElement>('[data-role="summary-size"]');
      const distance = scope.querySelector<HTMLElement>('[data-role="summary-distance"]');

      if (size !== null) {
        size.textContent = `r${planet.size}`;
      }

      if (distance !== null) {
        distance.textContent = `d${planet.distance}`;
      }
    });

    const preset = form!.querySelector<HTMLSelectElement>('[data-preset="canvas"]');

    if (preset !== null) {
      preset.value = presetFor(current.canvasWidth, current.canvasHeight);
    }
  }

  store.subscribe(render);

  function submit(): void {
    store.submit(withFixedSeed(readControls(form!)));
  }

  form.addEventListener('change', (event) => {
    const target = event.target;

    /*
     * Canvas dimension presets (CX-010, D-208). The preset writes into the
     * existing width and height controls and is never read as a parameter, so
     * `readControls` and the validator are untouched by its existence.
     *
     * This is handled HERE, ahead of the generic submit, rather than in a
     * second `change` listener: a separate listener runs after this one, and
     * this one's `submit()` re-renders derived display — which resets the
     * select back to the value it had before the user changed it. The second
     * listener would then read the reset value and do nothing.
     */
    if (target instanceof HTMLSelectElement && target.dataset.preset === 'canvas') {
      if (target.value === CUSTOM_PRESET) {
        return;
      }

      const preset = CANVAS_PRESETS.find((candidate) => candidate.id === target.value);

      if (preset === undefined) {
        return;
      }

      rebuild({
        ...readControls(form),
        canvasWidth: preset.width,
        canvasHeight: preset.height,
      });
      submit();

      return;
    }

    // Moon fields are conditional. Rebuild the controls from the just-edited
    // raw input when the checkbox toggles, then use the same validated submit
    // path as every other field update.
    if (target instanceof HTMLInputElement && target.dataset.control === 'moonEnabled') {
      rebuild(readControls(form));
    }

    submit();
  });

  /**
   * Live synchronization for the paired controls (CX-001, CX-010).
   *
   * `input` rather than `change` so dragging a range updates the scene as it
   * moves. Both branches write into the authoritative `data-control` element
   * and then go through the ordinary validated submit path — neither clamps,
   * and neither bypasses the validator.
   */
  form.addEventListener('input', (event) => {
    const target = event.target;

    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    // Range moved: write its value into the number input that owns the hook.
    const partnerId = target.dataset.rangeFor;

    if (partnerId !== undefined) {
      const partner = form.querySelector<HTMLInputElement>(`#${CSS.escape(partnerId)}`);

      if (partner !== null && partner.value !== target.value) {
        partner.value = target.value;
        submit();
      }

      return;
    }

    // Number typed: move its range partner, but only when the typed value is
    // representable. An out-of-range value must still reach the validator
    // (CTL-007), so it is submitted regardless of what the range can show.
    if (target.dataset.control !== undefined && target.id !== '') {
      const range = form.querySelector<HTMLInputElement>(
        `[data-range-for="${CSS.escape(target.id)}"]`,
      );

      if (range !== null) {
        range.value = target.value;
      }
    }
  });

  /**
   * Disclosure (CD-002, D-210). Toggling a group is presentation only: it does
   * NOT resubmit and does NOT regenerate, so the previewed scene and the seed
   * are byte-identical across a toggle.
   *
   * `toggle` is used rather than `click` because `<details>` fires it for both
   * pointer and keyboard actuation, and it reports the state the element has
   * actually reached rather than the gesture that was attempted.
   */
  form.addEventListener(
    'toggle',
    (event) => {
      const group = event.target;

      if (!(group instanceof HTMLDetailsElement)) {
        return;
      }

      const index = Number(group.dataset.planet);

      if (!Number.isInteger(index)) {
        return;
      }

      // A group holding a validation error stays open (CD-004): its inline
      // message must never be announced from inside a collapsed group.
      if (!group.open && erroringPlanets.has(index)) {
        group.open = true;

        return;
      }

      if (group.open) {
        collapsedPlanets.delete(index);
      } else {
        collapsedPlanets.add(index);
      }
    },
    // `toggle` does not bubble, so the listener must capture.
    true,
  );

  form.addEventListener('click', (event) => {
    const button = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>('button[data-action]')
      : null;

    if (!button) {
      return;
    }

    const input = readControls(form);

    let planets: readonly RawSceneControls['planets'][number][];

    if (button.dataset.action === 'add-planet') {
      planets = [...input.planets, { ...DEFAULT_PLANET }];
      // A newly added planet is always expanded (CX-003), so focus lands on a
      // visible control rather than inside a collapsed group.
      collapsedPlanets.delete(planets.length - 1);
    } else if (button.dataset.action === 'remove-planet') {
      const index = Number(button.dataset.index);

      if (!Number.isInteger(index)) {
        return;
      }

      planets = input.planets.filter((_, candidate) => candidate !== index);

      // Removing planet `index` shifts every later planet down one slot.
      // Without this remap the collapse state would slide onto a DIFFERENT
      // planet than the one the user collapsed (D-204).
      const remapped = [...collapsedPlanets]
        .filter((collapsed) => collapsed !== index)
        .map((collapsed) => (collapsed < index ? collapsed : collapsed - 1));

      collapsedPlanets.clear();

      for (const collapsed of remapped) {
        collapsedPlanets.add(collapsed);
      }
    } else {
      return;
    }

    rebuild({
      ...input,
      planets,
    });
    submit();

    // Focus management (CX-006): the form was just rebuilt, so re-query fresh
    // nodes in the next frame. On add, land on the new card's first control;
    // on remove, land on the group that shifted into the removed slot, or the
    // add button when none remain.
    //
    // A control inside a COLLAPSED `<details>` is not rendered and therefore
    // cannot take focus, so on remove the target is the disclosure summary of
    // the shifted group rather than a control inside it. The summary is always
    // rendered, always focusable, and is the group's own entry point — so the
    // user lands on the planet that took the removed one's place either way.
    const addedIndex = planets.length - 1;
    const removedIndex = Number(button.dataset.index);
    const focusSelector =
      button.dataset.action === 'add-planet'
        ? `[data-planet="${addedIndex}"] [data-control="planetSize"]`
        : `[data-planet="${removedIndex}"] [data-action="toggle-planet"]`;

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
          .querySelector<HTMLElement>(`[data-planet="${planets.length - 1}"] [data-action="toggle-planet"]`)
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
