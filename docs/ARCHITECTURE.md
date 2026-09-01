# Architecture

SolarSys is a client-side TypeScript web application that generates animated
solar-system SVG scenes. Users adjust parameters, see a live preview, and
download the previewed scene as a self-contained SVG file. There is no server
runtime, no database, and no network request in the generate/preview/download
path.

## Layout

```
ts/generator/  pure, DOM-free: generateScene(params, seed) -> SVG string
ts/app/        DOM layer: controls, validation, store, preview host, download
tests-ts/      headless suites: geometry, determinism, structural
e2e/           Playwright suites: browser, interaction, reduced-motion,
               presentation, density
openspec/      specs, design decisions, traceability, tasks
```

**The generator is pure.** It never imports UI code and never touches the DOM.
Given identical `(params, seed)` it returns an identical string — no clock
reads, no ambient entropy, no global mutable state. This is why most of the
suite runs without a browser.

**One serialization per scene.** `SceneStore` generates once and keeps the
string; the preview renders it and the download writes those same bytes.
Preview/download byte equality is structural, not a convention to remember.

**Validation lives at the UI boundary** (`ts/app/validation.ts`). The generator
assumes valid input and does not defensively re-check. `ts/app/store.ts` owns
the separate rule that a rejection leaves the displayed scene untouched.

**The presentation layer is chrome, not behaviour.** `ts/app/styles.css` plus
the `ts/app/` DOM modules style the stage, controls, telemetry, actions,
status, and focus without ever styling the generated scene. The responsive
layout keeps the stage first on narrow screens and beside a scrollable control
deck on desktop. Native number widgets source `min`/`max`/`step` from `BOUNDS`,
and inline errors are associated through `aria-invalid` / `aria-describedby`.

## Invariants that break things if violated

- **Generation order is contractual.** Element ids are seed-derived counters,
  so reordering render calls in `generateScene` changes every downstream id and
  breaks byte-identical reproduction. Treat any reordering as a breaking
  change.
- **Never regenerate on download.** The download path must consume the stored
  string; calling the generator again reintroduces nondeterminism.
- **Rasterizing an animated SVG via `drawImage` silently freezes at frame 0.**
  A raster export must seek-and-bake: `pauseAnimations()` + `setCurrentTime(t)`
  on a live inlined SVG, copy each animated node's resolved local matrix onto a
  clone as an explicit `transform`, strip the `<animate*>` elements, then
  rasterize the clone. Measured in both Chromium and Firefox.
- **No scripting in output.** The exported SVG must animate standalone and via
  `<img src>`. An embedded `<script>` does not run in `<img>` — measured, not
  assumed. Permitted mechanisms: SMIL, and CSS inside the SVG's own `<style>`.
- **The artefact always animates; the app owns playback.** The generated SVG
  carries no `prefers-reduced-motion` media query and no static twins. The
  application pauses and resumes via `SVGSVGElement.pauseAnimations()`. Under
  an active reduced-motion preference the preview starts paused and says why.
  The media query inside the artefact made the piece look broken on any machine
  with OS animations disabled, which is why it was removed. Accepted cost: an
  exported file embedded via `<img src>` cannot be stopped.
- **Re-assert playback after regenerating the preview, deferred one frame.** A
  freshly injected SVG always starts running, so `applyPlayback` must run again
  via `requestAnimationFrame`, not synchronously: pausing in the same task as
  the `innerHTML` injection freezes the SMIL timeline before `animateMotion`
  `mpath` positions resolve, collapsing every animated body to its base
  position.
- **Continuous edits are debounced; commits are immediate.** A range `input`
  event coalesces into one regeneration after a 150ms quiet period; `change`
  commits (blur, toggle, select, preset) and the initial mount submit
  immediately.
- **Hover-pause targets editable controls, never disclosure summaries.**
  Pausing SMIL during a `<details>` summary hover races Chromium's toggle and
  flakes the collapse in headless Chromium.
- **Canvas overflow is intended.** Planets whose orbital distance exceeds the
  canvas clip at the edge. This is an accepted aesthetic decision. Do not
  "fix" it.
- **No intrinsic `width`/`height` on the root `<svg>`.** The `viewBox` alone
  makes the artefact scale to its container.
- **Application CSS may size but never restyle the generated SVG.** The only
  permitted chrome selector into `#preview` is the root SVG sizing rule needed
  for responsive containment.
- **The application seed is fixed and not surfaced.** The app always submits
  `20260826`; no seed field, telemetry, URL override, or random-source call.
  The generator's direct `(params, seed)` API remains explicit for the
  determinism suites.
- **The authored belt is baked geometry.** The belt rotates as one rigid
  group, so per-rock `<use>` elements buy nothing and cost re-rasterization of
  ~10,400 primitives per frame: at 6x stress the `<use>` form fell to 43.7fps
  while identical baked geometry held 60. `renderBakedBelt` merges rocks into
  one path per material tone per opacity cluster and stamps `data-count` on the
  belt group; tests count silhouette subpaths independently. Belt performance
  claims require frame-time DISTRIBUTION evidence (p95, worst, frames over
  25ms); an average fps figure hid this exact defect.
- **The belt count is a density, and it is capped.** The authored count renders
  verbatim only on the default 600x600 canvas with the default band; elsewhere
  it resolves by canvas and band factors, with rock size damped (`k=0.5`).
  `BELT_RENDER_CAP` is 2,600, measured in Chromium at 1500x1500 (2,600 rocks =
  61fps; degradation starts around 5,200). Do not raise it without repeating
  that sweep.
- **Ambient stars are bounded for playback.** Above the default 600px canvas,
  star density grows sublinearly and the total rendered star count is capped at
  7,000, backed by measured `requestAnimationFrame` cadence at 1500px.
- **Stars serialize as one `<circle>` each, not merged paths.** Merging stars
  into shared paths removes ~96% of the document's nodes but barely moves frame
  times (the starfield is static; only the belt re-rasterizes), makes the
  gzipped artefact larger, and shifts rendered pixels versus a self-control
  that must read exactly 0. The per-`<circle>` form is a raw-byte win
  (-25.2% at 1500x1500) because the download is uncompressed.
- **Scene geometry is proportional, not absolute.** Orbital distance and planet
  size are percentages of the drawable half-extent
  `min(canvasWidth, canvasHeight) / 2`; moon size/distance are percentages of
  the parent planet's resolved radius; belt values are percentages of the
  half-extent. `validateScene` resolves them to absolute units BEFORE calling
  the generator, which must keep receiving absolute SVG units. Resolution is
  deliberately not rounded: at the smallest canvas the smallest planet has
  radius 0.5, and rounding would place the minimum moon distance on the
  planet's surface.
- **`aria-describedby` on a control is a token LIST.** Code resolving the error
  target must select the `-error` token rather than treating the whole
  attribute as one id.
- **Collapse state lives in the app, never in the DOM.** The form is rebuilt
  wholesale with `innerHTML` on every structural change, so a `<details open>`
  attribute would be destroyed. Collapse state must also be remapped when a
  planet is removed.
- **A control inside a collapsed `<details>` cannot take focus.** Focus
  management across planet groups must target the group's `<summary>`.
- **Icons accompany text; they never replace it.** Every icon is `aria-hidden`
  by default; no state may be carried by an icon or a colour alone.

## Testing discipline

Environment-simulating tests must prove their own mechanism works before
asserting anything:

- reduced-motion flags invert between raw Chrome and Playwright's
  chromium-headless-shell, so the reduced-motion suite uses Playwright's
  `reducedMotion` context option and re-measures at runtime;
- `linkedom` is HTML-lenient and silently accepts malformed XML, so
  well-formedness is validated by `fast-xml-parser` first, and `linkedom` is
  used only for id and reference queries;
- reduced-motion behaviour is measured positionally (element displacement over
  time), never by asserting markup, and every suppression assertion is paired
  with a control run that must move.

**Rebuild before mutation-testing the browser layers.** Playwright's
`reuseExistingServer` keeps serving the previously built bundle, so a mutation
to `ts/` appears to pass while never reaching the browser. Run `npm run build`
between the mutation and the test run, and kill any stale `vite preview`
process holding the port.

The control deck has a measured vertical budget: with the default three-planet
scene the form must stay at or under 560px at 1440x900 with no internal pane
scroll, and the document at or under 1250px at 390x844. `npm run test:density`
measures rendered geometry, never class names.
