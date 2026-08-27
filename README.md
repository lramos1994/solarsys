# SolarSys

A client-side web application that generates animated solar-system SVG scenes.
Planets orbit a sun along cubic Bezier paths using SVG `animateMotion`, with
optional moons, rings, a starfield, a rotating asteroid belt, and comets.

Everything runs in the browser. There is no server runtime, no database, and no
network request involved in generating, previewing, or downloading a scene.

## Requirements

- Node.js and npm

## Setup

```bash
npm install
```

## Running

```bash
npm run dev        # development server
npm run build      # static production build into build/
npm run preview    # serve the production build
```

`npm run build` emits plain static assets. Serving `build/` from any static host
is sufficient; nothing else is required.

## Using the application

The interface exposes every user-owned parameter:

- canvas width and height
- per-planet size and orbital distance
- orbital distance as a single value (circular) or four comma-separated values
  (`left,top,right,bottom`, asymmetric)
- per-planet moon: enable/disable, size, distance, and period (default 15s)
- palette: `Random` (default) or one of Aurora, Ember, Abissal, Amethyst,
  Verdant, Mono
- seed: displayed, editable, and regenerable

A **Pause/Play** control stops and resumes the previewed animation. If your
system asks for reduced motion, the scene starts paused and explains why; press
play to start it. Downloaded files always animate regardless.

Values that the generator owns are deliberately not exposed as controls: ring
presence and tilt, planet orbital periods, star counts and positions, asteroid
belt layout and rotation, comet count and paths, and planet surface detail.
They are derived from the seed, so a new seed changes them.

Invalid input is rejected with a message naming the control and its accepted
range. Nothing is silently clamped, and the last valid scene stays on screen.

### Determinism and sharing

A scene is fully determined by its parameters plus its seed. Entering the same
seed with the same parameters reproduces a byte-identical SVG, across reloads,
sessions, and machines.

### Download

`Download SVG` writes the exact bytes of the previewed scene to
`solarsys-<seed>.svg`. The scene is serialized once: preview and download always
consume the identical string.

The downloaded file is self-contained. It animates when opened directly and when
embedded via `<img src>`, contains no `<script>`, and references no external
stylesheet, image, or font. It carries `<title>` and `<desc>`.

The exported file animates unconditionally and carries no pause control, because
that would require scripting and the file is deliberately script-free. Reduced
motion is honoured by the application, not by the artefact.

The root `<svg>` carries a `viewBox` but no intrinsic `width`/`height`, so it
scales to its container.

## Testing

```bash
npm run test               # all headless layers (Vitest)
npm run test:geometry      # geometry parity against the PHP oracle fixture
npm run test:determinism   # byte-identical repeat and cross-session generation
npm run test:structural    # document structure, integrity, metadata
npm run test:browser       # Chromium, Firefox, WebKit render + animate
npm run test:interaction   # control surface, validation, export
npm run test:reduced-motion
npm run test:all           # headless + browser + interaction
npm run typecheck          # tsc, strict
```

Browser and interaction suites build the application and run Playwright against
the served static output.

## Architecture

```
ts/generator/   pure, DOM-free scene generation: params + seed -> SVG string
ts/app/         the DOM layer: controls, validation, store, preview, download
tests-ts/       headless suites (geometry parity, determinism, structural)
e2e/            Playwright suites (browser, interaction, reduced motion)
openspec/       the migration's specs, design, traceability, and tasks
```

The generator never imports UI code and never touches the DOM, which is what
makes most of the suite runnable without a browser. All randomness flows through
one explicitly threaded seeded PRNG, and element identifiers are seed-derived
counters — so **generation order is contractual**: reordering render calls
changes every downstream id and breaks reproducibility.

## Legacy PHP implementation

SolarSys began as a PHP SVG generator. That implementation is preserved on the
`legacy/php-generator` branch and has been removed from the main line.

The geometry parity suite reads a committed fixture
(`tests-ts/fixtures/geometry-oracle.json`) captured from the PHP renderer, so
parity remains verifiable without PHP installed. To regenerate the fixture:

```bash
git worktree add /tmp/solarsys-legacy legacy/php-generator
composer install --working-dir=/tmp/solarsys-legacy
php tests-ts/fixtures/generate_geometry_oracle.php <output-path>
```
