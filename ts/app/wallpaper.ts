/**
 * Animated wallpaper frame pipeline (WAL-002, WAL-003).
 *
 * Rasterizing an animated SVG by drawing it through an <img>/Image produces a
 * STATIC frame in every engine measured (E-005): the rasterizer renders the
 * document at its initial time and the image timeline never advances. A naive
 * capture pipeline therefore yields a frozen video that still passes any
 * "file is non-empty" check.
 *
 * The working mechanism (E-006, E-007) is seek-and-bake:
 *
 *   1. inline the stored scene as a live SVG,
 *   2. `pauseAnimations()` then `setCurrentTime(t)`,
 *   3. for every animated node — the host element of an `<animateMotion>` or
 *      `<animateTransform>` — resolve its local transform as
 *      `inverse(parentCTM) * getCTM()`, which captures the motion/rotation the
 *      SMIL engine computed at time t, and copy it onto a clone as an explicit
 *      `transform="matrix(...)"`,
 *   4. strip every `<animate*>` element from the clone,
 *   5. rasterize the now-static clone through an Image.
 *
 * Animated hosts are walked GENERICALLY (`querySelectorAll` over
 * `animateMotion` / `animateTransform`, then their `parentElement`). Nothing
 * here hard-codes a `data-role`, so a newly introduced animated element is
 * handled without changes.
 *
 * This module lives in the DOM layer (mirroring `playback.ts`) and reads the
 * already-stored scene string; it never regenerates a scene (E-003, E-004,
 * E-018). The generator stays pure and DOM-free.
 */

import { ArrayBufferTarget, Muxer } from 'mp4-muxer';

export interface WallpaperPreset {
  id: 'android' | 'iphone';
  width: number;
  height: number;
}

/** The two fixed phone-wallpaper output sizes (WAL-002). */
export const WALLPAPER_PRESETS: readonly WallpaperPreset[] = [
  { id: 'android', width: 1080, height: 2400 },
  { id: 'iphone', width: 1179, height: 2556 },
];

export function wallpaperPreset(id: WallpaperPreset['id']): WallpaperPreset {
  const preset = WALLPAPER_PRESETS.find((candidate) => candidate.id === id);

  if (preset === undefined) {
    throw new Error(`wallpaper: unknown preset "${id}"`);
  }

  return preset;
}

/**
 * Cover-crop alignment applied to every working copy (WAL-002, D-07). The
 * scene is square and the presets are ~19.5:9, so `slice` fills the frame and
 * overflows — the accepted canvas-overflow behaviour, not a defect to fix.
 */
export const WALLPAPER_PRESERVE_ASPECT_RATIO = 'xMidYMid slice';

/* ----------------------------------------------------------------------------
 * Loop closure (WAL-004, WAL-005).
 *
 * The generated periods share no usable common multiple (E-015: ~97 days for
 * the default scene), so a raw capture would visibly jump on repeat. Loop
 * closure rewrites the working copy so every animated element completes a
 * whole number of cycles within the loop length, then hands the closed copy to
 * the existing seek-and-bake pipeline.
 *
 * Two levers, exactly as design.md specifies:
 *
 *   1. Quantization (non-belt). Snap each authored period `p` to
 *      `T / round(T/p)`. `round` is half-to-even so the default scene
 *      reproduces the authored loop table (10s -> 11.25s = 4 cycles, not 9s).
 *   2. Belt symmetry. The belt is one group rotation over static rocks (E-019),
 *      so an N-fold symmetric rock distribution looks identical every 1/N turn.
 *      Its effective period becomes `P/N` with no speed change, and a tiny
 *      fine-tune snaps it to `T/k` (0.6% for the default scene, versus 63%
 *      under pure quantization).
 *
 * The arithmetic below is pure (DOM-free) so headless Vitest can assert the
 * geometry; the DOM application lives in `closeLoop` further down.
 * -------------------------------------------------------------------------- */

/** The fixed wallpaper loop length in seconds (design.md, resolved decision). */
export const WALLPAPER_LOOP_SECONDS = 45;

/**
 * Number of whole cycles an element completes in the loop: the integer nearest
 * to `loopSeconds / period`. Ties (x.5) round to the even integer — the
 * rounding the authored loop table assumes — and the result never drops below
 * one cycle.
 */
function snapCycles(ratio: number): number {
  const lower = Math.floor(ratio);
  const fraction = ratio - lower;
  const nearest =
    fraction === 0.5 ? (lower % 2 === 0 ? lower : lower + 1) : Math.round(ratio);

  return Math.max(1, nearest);
}

/** Snap an authored period to the nearest whole-cycle divisor of the loop. */
export function quantizePeriod(
  authoredSeconds: number,
  loopSeconds: number = WALLPAPER_LOOP_SECONDS,
): number {
  return loopSeconds / snapCycles(loopSeconds / authoredSeconds);
}

/** A resolved belt loop plan: the symmetry fold plus the residual fine-tune. */
export interface BeltLoopPlan {
  /** Rotational symmetry fold (N). */
  symmetry: number;
  /** Symmetry intervals completed in one loop (k). */
  cyclesPerLoop: number;
  /** Effective period before fine-tuning: `period / symmetry`. */
  effectivePeriod: number;
  /** Fine-tuned effective period: `loopSeconds / cyclesPerLoop`. */
  loopPeriod: number;
  /** Relative residual adjustment `|loopPeriod - effectivePeriod| / effectivePeriod`. */
  adjustment: number;
  /** Rock count after redistribution: `symmetry * round(rockCount / symmetry)`. */
  redistributedCount: number;
}

/**
 * Minimum distinct rocks a symmetry sector must retain. Below this the N-fold
 * repeat becomes perceptible — E-022 measured that 8 rocks per sector masks the
 * 22.5° repeat (N=16) — so this floor, together with the ±5% density budget
 * (WAL-005), bounds N. For the default scene (130 rocks) N=18 minimizes the
 * residual at 0.61%.
 */
const MIN_SECTOR_ROCKS = 6;

/**
 * Search (N, k) for the belt loop plan with the smallest residual period
 * adjustment, subject to the WAL-005 density budget (rock count within five
 * percent) and the `MIN_SECTOR_ROCKS` variety floor.
 */
export function findBeltLoop(
  period: number,
  rockCount: number,
  loopSeconds: number = WALLPAPER_LOOP_SECONDS,
): BeltLoopPlan {
  const minSector = Math.min(MIN_SECTOR_ROCKS, rockCount);
  let best: BeltLoopPlan | null = null;

  for (let symmetry = 1; symmetry <= rockCount; symmetry += 1) {
    const sector = Math.round(rockCount / symmetry);

    if (sector < minSector) {
      continue;
    }

    const redistributedCount = symmetry * sector;

    if (Math.abs(redistributedCount - rockCount) / rockCount > 0.05) {
      continue;
    }

    const effectivePeriod = period / symmetry;
    const cyclesPerLoop = snapCycles((loopSeconds * symmetry) / period);
    const loopPeriod = loopSeconds / cyclesPerLoop;
    const adjustment = Math.abs(loopPeriod - effectivePeriod) / effectivePeriod;

    if (best === null || adjustment < best.adjustment) {
      best = { symmetry, cyclesPerLoop, effectivePeriod, loopPeriod, adjustment, redistributedCount };
    }
  }

  if (best !== null) {
    return best;
  }

  // No symmetry improves the loop: fall back to a single fold and plain
  // quantization of the belt's own period.
  const cyclesPerLoop = snapCycles(loopSeconds / period);
  const loopPeriod = loopSeconds / cyclesPerLoop;

  return {
    symmetry: 1,
    cyclesPerLoop,
    effectivePeriod: period,
    loopPeriod,
    adjustment: Math.abs(loopPeriod - period) / period,
    redistributedCount: rockCount,
  };
}

interface WorkingCopy {
  container: HTMLElement;
  svg: SVGSVGElement;
}

/**
 * Parse the stored scene into a live, offscreen SVG. It is positioned
 * offscreen rather than `display:none`, because `getCTM()` returns null for
 * non-rendered nodes and the bake step depends on it.
 */
function createWorkingCopy(svg: string): WorkingCopy {
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-99999px';
  container.style.top = '0';
  container.style.width = '600px';
  container.style.height = '600px';
  container.style.overflow = 'hidden';
  container.setAttribute('aria-hidden', 'true');
  container.innerHTML = svg;

  const root = container.querySelector('svg');

  if (root === null || !('setCurrentTime' in root)) {
    throw new Error('wallpaper: stored scene did not parse into a live SVG');
  }

  document.body.appendChild(container);

  return { container, svg: root as SVGSVGElement };
}

/** Resolve on the browser's next rendered frame. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

/**
 * Freeze the SMIL timeline and move the document clock to the wanted time,
 * then let the SMIL engine commit the animated values before the caller reads
 * them back through `getCTM()`.
 *
 * `setCurrentTime` advances the document clock, but the animated values are
 * committed lazily on the next style/layout update. Reading `getCTM()` in the
 * same task as the seek can therefore return the pre-seek transform under
 * parallel load — the belt control arm flaked to 0% exactly this way (a t=0
 * rotation read back at t=163/16, all three engines at once). A synchronous
 * geometry flush (`getBBox`) commits the sample in engines that update on
 * reflow, and two rendered frames guarantee the sample has landed everywhere:
 * a single `requestAnimationFrame` resolves BEFORE that frame's render (and
 * its animation update), so a second one is what brackets one full render
 * cycle after the seek.
 */
async function seekTo(live: SVGSVGElement, timeSeconds: number): Promise<void> {
  live.pauseAnimations();
  live.setCurrentTime(timeSeconds);
  live.getBBox();
  await nextFrame();
  await nextFrame();
}

/** A fresh DOMMatrix carrying the same six coefficients. */
function normalize(matrix: DOMMatrix): DOMMatrix {
  return new DOMMatrix([matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f]);
}

/** Return the node as an SVG graphics element, or null when it is not one. */
function asGraphics(node: Element | null): SVGGraphicsElement | null {
  if (node === null || typeof (node as unknown as SVGGraphicsElement).getCTM !== 'function') {
    return null;
  }

  return node as unknown as SVGGraphicsElement;
}

/**
 * Resolve an animated host's LOCAL transform at the current document time:
 * the matrix that maps the host's own user space into its parent's user
 * space. `inverse(parentCTM) * getCTM()` cancels the viewBox scale and every
 * ancestor transform, leaving exactly the motion/rotation SMIL applied.
 */
function localTransform(host: Element): DOMMatrix | null {
  const hostGraphics = asGraphics(host);
  const parentGraphics = asGraphics(host.parentElement);

  if (hostGraphics === null || parentGraphics === null) {
    return null;
  }

  const hostMatrix = hostGraphics.getCTM();
  const parentMatrix = parentGraphics.getCTM();

  if (hostMatrix === null || parentMatrix === null) {
    return null;
  }

  return normalize(parentMatrix).inverse().multiply(normalize(hostMatrix));
}

function matrixAttribute(matrix: DOMMatrix): string {
  return `matrix(${matrix.a} ${matrix.b} ${matrix.c} ${matrix.d} ${matrix.e} ${matrix.f})`;
}

/**
 * Bake the live SVG's resolved animation state onto a clone: copy each
 * animated host's local matrix into an explicit `transform` and strip every
 * `<animate*>` element, leaving a static clone that rasterizes at the exact
 * requested time. Hosts are matched by document order, which `cloneNode(true)`
 * preserves.
 */
function bake(live: SVGSVGElement, clone: SVGSVGElement): void {
  const liveAnimations = Array.from(live.querySelectorAll('animateMotion, animateTransform'));
  const cloneAnimations = Array.from(clone.querySelectorAll('animateMotion, animateTransform'));

  if (liveAnimations.length !== cloneAnimations.length) {
    throw new Error('wallpaper: working copy drifted from the live scene while baking');
  }

  for (let index = 0; index < liveAnimations.length; index += 1) {
    const liveAnimation = liveAnimations[index]!;
    const cloneAnimation = cloneAnimations[index]!;
    const liveHost = liveAnimation.parentElement;
    const cloneHost = cloneAnimation.parentElement;

    if (liveHost === null || cloneHost === null) {
      continue;
    }

    const local = localTransform(liveHost);

    if (local !== null) {
      cloneHost.setAttribute('transform', matrixAttribute(local));
    }

    cloneAnimation.remove();
  }
}

/* ----------------------------------------------------------------------------
 * Loop closure DOM application.
 *
 * `closeLoop` mutates a live working copy (never the stored scene string) so
 * the durations the SMIL engine reads at `setCurrentTime` are already the
 * loop-closed ones. Mutating `dur` after parse is effective across Chromium,
 * Firefox and WebKit (verified positionally before this module adopted the
 * approach), so no string rewrite or re-parse is needed.
 * -------------------------------------------------------------------------- */

/** Loop-closure result, surfaced for tests and callers to inspect. */
export interface CloseLoopResult {
  /** Authored -> exported period pairs for every quantized non-belt element. */
  quantized: ReadonlyArray<{ authored: number; exported: number }>;
  /** The belt plan, or null when the scene has no belt. */
  belt: BeltLoopPlan | null;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/** Parse a `dur="123.4s"` attribute into seconds, or null when it doesn't. */
function parseSeconds(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const match = /^([0-9]*\.?[0-9]+)s$/.exec(value.trim());

  return match === null ? null : Number(match[1]);
}

/** Extract the rotation centre from `from`/`to` shaped like "0 300 300". */
function rotationCenter(rotation: Element): { x: number; y: number } | null {
  const to = rotation.getAttribute('to') ?? rotation.getAttribute('from');

  if (to === null) {
    return null;
  }

  const parts = to.trim().split(/\s+/).map(Number);

  if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }

  return { x: parts[1]!, y: parts[2]! };
}

/**
 * Rebuild the baked belt with `symmetry`-fold rotational symmetry (E-021).
 *
 * The belt serializes as opacity clusters of three tone paths whose subpaths
 * are rocks (GEN-026), so the per-element slice the `<use>` form allowed is
 * gone. Instead each rock is recovered as a subpath TRIPLE (silhouette,
 * highlight, shadow share an index within their cluster), its angle about the
 * rotation centre is computed from its silhouette's first vertex, and the
 * first `round(count / symmetry)` rocks BY ANGLE are kept — the same angular
 * sector the index-ordered slice used to keep. The kept rocks are re-clustered
 * and replicated under `rotate(k * 360 / symmetry)` wrappers, producing a
 * rigid group that maps onto itself every 1/N turn.
 */
function redistributeRocks(
  beltInner: Element,
  symmetry: number,
  cx: number,
  cy: number,
): void {
  interface BakedRock {
    opacity: string;
    silhouette: string;
    highlight: string;
    shadow: string;
    angle: number;
  }

  const TONES = ['silhouettes', 'highlights', 'shadows'] as const;
  const rocks: BakedRock[] = [];

  for (const cluster of beltInner.querySelectorAll('[data-role="asteroid-cluster"]')) {
    const opacity = cluster.getAttribute('opacity') ?? '1';
    const byTone = TONES.map((tone) => {
      const path = cluster.querySelector(`[data-role="asteroid-${tone}"]`);
      const d = path?.getAttribute('d') ?? '';

      return d.match(/M[^M]+/g) ?? [];
    });

    const [silhouettes = [], highlights = [], shadows = []] = byTone;

    for (let index = 0; index < silhouettes.length; index += 1) {
      const silhouette = silhouettes[index]!;
      const vertex = /M(-?[\d.]+) (-?[\d.]+)/.exec(silhouette);

      if (vertex === null) {
        continue;
      }

      const angle = Math.atan2(Number(vertex[2]) - cy, Number(vertex[1]) - cx);

      rocks.push({
        opacity,
        silhouette,
        highlight: highlights[index] ?? '',
        shadow: shadows[index] ?? '',
        angle: angle < 0 ? angle + 2 * Math.PI : angle,
      });
    }
  }

  if (rocks.length === 0) {
    return;
  }

  rocks.sort((a, b) => a.angle - b.angle);

  const sectorCount = Math.max(1, Math.round(rocks.length / symmetry));
  const base = rocks.slice(0, sectorCount);

  // Re-cluster the kept sector by opacity, preserving tone paint order and the
  // template cluster's tone attributes (fills and the silhouette stroke).
  const template = beltInner.querySelector('[data-role="asteroid-cluster"]');

  if (template === null) {
    return;
  }

  const toneAttributes = TONES.map((tone) => {
    const path = template.querySelector(`[data-role="asteroid-${tone}"]`);

    return [...(path?.attributes ?? [])]
      .filter((attribute) => attribute.name !== 'd' && attribute.name !== 'data-role')
      .map((attribute) => `${attribute.name}="${attribute.value}"`)
      .join(' ');
  });

  const byOpacity = new Map<string, BakedRock[]>();

  for (const rock of base) {
    const group = byOpacity.get(rock.opacity);

    if (group === undefined) {
      byOpacity.set(rock.opacity, [rock]);
    } else {
      group.push(rock);
    }
  }

  const sector = [...byOpacity.entries()]
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([opacity, group]) =>
      `<g data-role="asteroid-cluster" opacity="${opacity}">` +
      `<path data-role="asteroid-silhouettes" ${toneAttributes[0]} d="${group.map((rock) => rock.silhouette).join('')}"/>` +
      `<path data-role="asteroid-highlights" ${toneAttributes[1]} d="${group.map((rock) => rock.highlight).join('')}"/>` +
      `<path data-role="asteroid-shadows" ${toneAttributes[2]} d="${group.map((rock) => rock.shadow).join('')}"/>` +
      `</g>`,
    )
    .join('');

  const owner = beltInner.ownerDocument;
  const wrappers: SVGGElement[] = [];

  for (let k = 0; k < symmetry; k += 1) {
    const wrapper = owner.createElementNS(SVG_NAMESPACE, 'g');

    wrapper.setAttribute('transform', `rotate(${(k * 360) / symmetry} ${cx} ${cy})`);
    wrapper.innerHTML = sector;
    wrappers.push(wrapper);
  }

  beltInner.replaceChildren(...wrappers);
}

/** Apply the belt loop plan to a live belt group, or null when inapplicable. */
function applyBeltLoop(
  beltGroup: Element,
  beltRotation: Element,
): BeltLoopPlan | null {
  const authored = parseSeconds(beltRotation.getAttribute('dur'));

  if (authored === null || authored <= 0) {
    return null;
  }

  // Rock count from the baked belt: the generator stamps `data-count`, and the
  // silhouette subpath count is the independent check the tests hold it to.
  const stamped = Number(beltGroup.getAttribute('data-count'));
  const rockCount = Number.isFinite(stamped) && stamped > 0
    ? stamped
    : [...beltGroup.querySelectorAll('[data-role="asteroid-silhouettes"]')]
        .reduce((sum, path) => sum + ((path.getAttribute('d') ?? '').match(/M/g)?.length ?? 0), 0);

  if (rockCount === 0) {
    return null;
  }

  const center = rotationCenter(beltRotation);

  if (center === null) {
    return null;
  }

  const plan = findBeltLoop(authored, rockCount);
  const beltInner = beltGroup.querySelector('g[id]');

  if (beltInner === null) {
    return null;
  }

  redistributeRocks(beltInner, plan.symmetry, center.x, center.y);

  // Fine-tune: the belt now completes `symmetry` sectors in
  // `loopPeriod * symmetry` seconds, so its effective period is exactly
  // `loopPeriod` and divides the loop length.
  beltRotation.setAttribute('dur', `${plan.loopPeriod * plan.symmetry}s`);

  return plan;
}

/**
 * Apply loop closure to a live, detached working copy: quantize every non-belt
 * animated element and rebuild the belt with N-fold symmetry plus its residual
 * fine-tune. Returns what was applied.
 */
export function closeLoop(svg: SVGSVGElement): CloseLoopResult {
  const quantized: Array<{ authored: number; exported: number }> = [];

  const beltGroup = svg.querySelector('g[data-role="asteroid-belt"]');
  const beltRotation =
    beltGroup?.querySelector(':scope > animateTransform[type="rotate"]') ?? null;

  for (const animation of svg.querySelectorAll('animateMotion, animateTransform')) {
    if (animation === beltRotation) {
      continue;
    }

    const authored = parseSeconds(animation.getAttribute('dur'));

    if (authored === null || authored <= 0) {
      continue;
    }

    const exported = quantizePeriod(authored);

    animation.setAttribute('dur', `${exported}s`);
    quantized.push({ authored, exported });
  }

  const belt =
    beltGroup !== null && beltRotation !== null
      ? applyBeltLoop(beltGroup, beltRotation)
      : null;

  return { quantized, belt };
}

/** UTF-8 safe base64 for the data URL the raster Image consumes. */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('wallpaper: could not rasterize the baked frame'));
    image.src = url;
  });
}

/**
 * Rasterize a baked (static) SVG clone onto a canvas at the preset size. The
 * working copy keeps the generated `viewBox` and is sized to the preset with
 * `xMidYMid slice`, so the scene fills the frame and overflows (D-07).
 */
async function rasterize(svg: SVGSVGElement, preset: WallpaperPreset): Promise<HTMLCanvasElement> {
  svg.setAttribute('width', String(preset.width));
  svg.setAttribute('height', String(preset.height));
  svg.setAttribute('preserveAspectRatio', WALLPAPER_PRESERVE_ASPECT_RATIO);

  const serialized = new XMLSerializer().serializeToString(svg);
  const image = await loadImage(`data:image/svg+xml;base64,${toBase64(serialized)}`);
  const canvas = document.createElement('canvas');
  canvas.width = preset.width;
  canvas.height = preset.height;

  const context = canvas.getContext('2d');

  if (context === null) {
    throw new Error('wallpaper: 2D canvas context unavailable');
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return canvas;
}

/* ----------------------------------------------------------------------------
 * Static background reuse (WAL-010).
 *
 * The per-frame cost is dominated by rasterizing the whole document, most of
 * which is the ambient starfield (E-012): thousands of static stars that never
 * move. `createWallpaperRenderer` below therefore rasterizes that static prefix
 * ONCE and composites the animated foreground over it on every subsequent
 * frame, instead of re-rasterizing the entire document each frame.
 *
 * The split is structural, not role-based. The scene is emitted in generation
 * order — background first, then belt, orbits, sun, planets, comets (GEN-004)
 * — so the starfield is exactly the leading run of siblings painted before the
 * first SMIL-animated host. Splitting at that boundary preserves z-order,
 * because the prefix is by definition everything painted before any animation
 * (when there is no belt, the leading run simply extends through the static
 * orbits and sun, which still come before the first planet — so they stay
 * correctly beneath it either way). Defs are never split: the background clone
 * keeps every leading <defs> it needs and the foreground clone keeps every
 * <defs> too, so cross-references like the belt's `href="#asteroid…"` symbols
 * and the sun's gradients still resolve after the visible starfield is removed.
 * -------------------------------------------------------------------------- */

/** SMIL animation elements the seek-and-bake pipeline walks. */
const ANIMATION_SELECTOR = 'animateMotion, animateTransform';

/** Where the static prefix ends: the container to split and the index of the
 * first animated host within it. */
interface StaticSplit {
  container: Element;
  boundary: number;
}

/** The first animated host and its container, or null when nothing animates. */
function locateStaticSplit(svg: SVGSVGElement): StaticSplit | null {
  const firstAnimation = svg.querySelector(ANIMATION_SELECTOR);

  if (firstAnimation === null) {
    return null;
  }

  // Climb from the animation element to the host group that sits directly in
  // the scene's content container — either a direct child of the root
  // (hand-built scenes) or a direct child of the root's translate <g>
  // (generated scenes). Nested animations (a moon orbiting inside a moving
  // planet) climb to the same outer host, so the split never lands mid-tree.
  let host: Element | null = firstAnimation.parentElement as Element | null;

  while (host !== null && host !== svg) {
    const parent = host.parentElement as Element | null;

    if (parent === null || parent === svg) {
      break;
    }

    if ((parent.parentElement as Element | null) === svg) {
      break;
    }

    host = parent;
  }

  if (host === null || host === svg) {
    return null;
  }

  const container = host.parentElement as Element | null ?? svg;
  const boundary = Array.from(container.children).indexOf(host);

  return { container, boundary: boundary === -1 ? container.children.length : boundary };
}

/** Clone the scene and strip the foreground, leaving the static starfield. */
function toStaticBackground(svg: SVGSVGElement): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const split = locateStaticSplit(clone);

  if (split !== null) {
    const children = Array.from(split.container.children);

    for (let index = split.boundary; index < children.length; index += 1) {
      children[index]!.remove();
    }
  }

  return clone;
}

/** Remove the starfield's visible elements from a container in place, keeping
 * every `<defs>` so the remaining foreground's references still resolve. */
function removeStaticBackground(container: Element, boundary: number): void {
  const children = Array.from(container.children);

  for (let index = 0; index < boundary; index += 1) {
    const child = children[index]!;

    if (child.tagName.toLowerCase() !== 'defs') {
      child.remove();
    }
  }
}

/** Composite the cached static background under a baked foreground frame. */
function composite(
  background: HTMLCanvasElement,
  foreground: HTMLCanvasElement,
  preset: WallpaperPreset,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = preset.width;
  canvas.height = preset.height;

  const context = canvas.getContext('2d');

  if (context === null) {
    throw new Error('wallpaper: 2D canvas context unavailable');
  }

  context.drawImage(background, 0, 0);
  context.drawImage(foreground, 0, 0);

  return canvas;
}

/** A live working copy that bakes and rasterizes frames for one export. */
export interface WallpaperRenderer {
  renderFrame(timeSeconds: number): Promise<HTMLCanvasElement>;
  dispose(): void;
  /**
   * Number of `use[data-role="star"]` elements remaining in the per-frame
   * foreground working copy (WAL-010). Zero when background reuse engaged: the
   * starfield lives only in the once-rasterized background, so the trimmed
   * foreground clone carries no stars. Non-zero when reuse is off and the full
   * document is cloned and rasterized every frame. Exposed so the cost spec can
   * assert reuse engaged DETERMINISTICALLY rather than by wall-clock timing.
   */
  readonly foregroundStarCount: number;
}

/** Renderer knobs. Loop closure and background reuse are on by default. */
export interface WallpaperRendererOptions {
  /**
   * Apply loop closure before baking. Defaults to true; tests pass `false` to
   * rasterize the unmodified belt for the control arm of the symmetry probe.
   */
  closeLoop?: boolean;
  /**
   * Reuse the rasterized static starfield across frames instead of
   * re-rasterizing the whole document each frame (WAL-010). Defaults to true;
   * the cost test passes `false` to measure the non-reused baseline.
   */
  reuseBackground?: boolean;
}

/**
 * Readies a detached offscreen working copy of the stored scene. Nothing done
 * through the renderer is observable in the preview or the SVG download
 * (WAL-006).
 */
export function createWallpaperRenderer(
  svg: string,
  preset: WallpaperPreset,
  options: WallpaperRendererOptions = {},
): WallpaperRenderer {
  const working = createWorkingCopy(svg);

  if (options.closeLoop !== false) {
    closeLoop(working.svg);
  }

  // WAL-010: when reuse is enabled and the scene has a static prefix to
  // separate, rasterize the starfield once and composite the animated
  // foreground over it per frame. The live working copy is then trimmed to the
  // foreground, so per-frame cloning/rasterizing skips the thousands of static
  // stars. The background source is captured from the full scene BEFORE the
  // trim, and rasterized lazily on the first frame.
  const split =
    options.reuseBackground === false ? null : locateStaticSplit(working.svg);
  let backgroundSource: SVGSVGElement | null = null;
  let backgroundCanvas: HTMLCanvasElement | null = null;
  let backgroundPromise: Promise<HTMLCanvasElement> | null = null;

  if (split !== null) {
    backgroundSource = toStaticBackground(working.svg);
    removeStaticBackground(split.container, split.boundary);
  }

  async function background(): Promise<HTMLCanvasElement> {
    if (backgroundCanvas !== null) {
      return backgroundCanvas;
    }

    if (backgroundSource === null) {
      throw new Error('wallpaper: static background was not prepared');
    }

    if (backgroundPromise === null) {
      backgroundPromise = rasterize(backgroundSource, preset).then((canvas) => {
        backgroundCanvas = canvas;
        return canvas;
      });
    }

    return backgroundPromise;
  }

  return {
    async renderFrame(timeSeconds: number): Promise<HTMLCanvasElement> {
      await seekTo(working.svg, timeSeconds);

      const clone = working.svg.cloneNode(true) as SVGSVGElement;
      bake(working.svg, clone);
      const frame = await rasterize(clone, preset);

      if (split === null) {
        return frame;
      }

      return composite(await background(), frame, preset);
    },

    dispose(): void {
      working.container.remove();
    },

    foregroundStarCount: working.svg.querySelectorAll('use[data-role="star"]').length,
  };
}

/** One-shot convenience: render a single frame and release the working copy. */
export async function renderWallpaperFrame(
  svg: string,
  preset: WallpaperPreset,
  timeSeconds: number,
  options: WallpaperRendererOptions = {},
): Promise<HTMLCanvasElement> {
  const renderer = createWallpaperRenderer(svg, preset, options);

  try {
    return await renderer.renderFrame(timeSeconds);
  } finally {
    renderer.dispose();
  }
}

/* ----------------------------------------------------------------------------
 * Encode (WAL-001, WAL-002, WAL-008).
 *
 * Baked frames are handed to the WebCodecs `VideoEncoder` with EXPLICIT
 * per-frame timestamps (microseconds, `frame * 1e6 / WALLPAPER_FPS`), and the
 * encoded chunks are multiplexed into an MP4 by `mp4-muxer`. This is a
 * deliberate departure from the earlier `MediaRecorder` + `captureStream(0)` +
 * `requestFrame()` pipeline, which timestamps every frame at wall-clock capture
 * time. Because the render is offline at ~116 ms/frame (E-012), a MediaRecorder
 * export advanced scene time at 1/30 s per frame while advancing presentation
 * time by the render cost — the file played ~5x slow and ~5x long. Explicit
 * timestamps decouple the presentation timeline from render wall time, so an
 * N-frame export decodes as N/30 s at 30 fps (WAL-005 requires the exported
 * belt speed to match the preview, which wall-clock pacing broke).
 *
 * Encoder availability is probed BEFORE any work starts (WAL-008). The probe is
 * `MediaRecorder.isTypeSupported` over the MP4 types below (E-008, E-009): the
 * only engine measured to encode H.264 MP4 is Chromium; Firefox reports zero
 * supported types and WebKit was never assumed, so the probe runs at runtime
 * and the caller surfaces an explicit message when nothing is supported.
 * `VideoEncoder` (now present in all three engines, correcting the stale E-010)
 * is additionally required, and the caller distinguishes an unavailable encoder
 * from a mid-render failure.
 * -------------------------------------------------------------------------- */

/** Frames per second the loop is authored at (design.md resolved decision). */
export const WALLPAPER_FPS = 30;

/** Encoder bitrate in bits per second: 4 Mbps, the measured default (E-012). */
export const WALLPAPER_BITRATE = 4_000_000;

/**
 * H.264 codec string the `VideoEncoder` is configured with: High profile,
 * Level 5.0. The presets are tall phone frames (1080x2400 and 1179x2556), so
 * Level 3.1 (`avc1.42001f`, the type MediaRecorder was measured with in E-008)
 * is too small — it caps at 3600 macroblocks while 1080x2400 alone needs
 * ~10,200. Level 5.0 caps at 22,080 macroblocks, which both presets fit.
 */
export const WALLPAPER_CODEC = 'avc1.640032';

/** Total frames in one loop: 45 s at 30 fps = 1350. */
export const WALLPAPER_FRAME_COUNT = WALLPAPER_LOOP_SECONDS * WALLPAPER_FPS;

/**
 * MP4 MIME types probed in preference order. `avc1.42001f` (H.264 Baseline
 * 3.1) is the exact type measured working in Chromium (E-008); the bare
 * `video/mp4` is the generic fallback a muxer may still accept. WebM is
 * deliberately absent: the change resolves to MP4 only (design.md).
 */
const WALLPAPER_MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42001f',
  'video/mp4',
] as const;

/** Raised when no supported encoder exists, so the caller can say so (WAL-008). */
export class WallpaperUnavailableError extends Error {
  constructor() {
    super('wallpaper: no supported video encoder is available in this browser');
    this.name = 'WallpaperUnavailableError';
  }
}

/**
 * Probe the platform recorder for a usable MP4 type. Returns the first
 * supported MIME type, or null when the browser offers none (WAL-008). WebKit
 * is NOT assumed: this is a runtime probe, never a vendor-string feature
 * detect.
 */
export function supportedWallpaperMimeType(): string | null {
  if (
    typeof MediaRecorder === 'undefined' ||
    typeof MediaRecorder.isTypeSupported !== 'function'
  ) {
    return null;
  }

  for (const type of WALLPAPER_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }

  return null;
}

/**
 * True when the full encode pipeline is available: an MP4 MIME type the
 * recorder supports (WAL-008, E-008/E-009) AND the WebCodecs `VideoEncoder`
 * the export actually drives (correcting the stale E-010 that recorded it
 * absent). Both are absent together in Firefox and WebKit, and present together
 * in Chromium, but each is probed independently rather than assumed.
 */
export function wallpaperEncodingAvailable(): boolean {
  return supportedWallpaperMimeType() !== null && typeof VideoEncoder !== 'undefined';
}

/** Download filename for a wallpaper video: `solarsys-<seed>-<preset>.mp4`. */
export function wallpaperFilename(seed: number, preset: WallpaperPreset): string {
  return `solarsys-${seed}-${preset.id}.mp4`;
}

/** Encoder knobs. Production uses the full loop; tests pass a small budget. */
export interface WallpaperEncodeOptions {
  /** Frame budget. Defaults to the full 45 s loop at 30 fps. */
  frames?: number;
  /** Reported after each captured frame (WAL-007 surface). */
  onProgress?: (rendered: number, total: number) => void;
  /** Abort signal checked between frames. */
  signal?: AbortSignal;
}

/**
 * Coded (macroblock-aligned, even) dimensions for a preset. H.264 4:2:0 rejects
 * odd dimensions: the iPhone preset is 1179 px wide (odd), so it is coded at
 * 1180 and cropped to the preset size through the `VideoFrame` `visibleRect`.
 * The encoded bitstream then carries the crop and decodes at the preset size.
 */
function codedDimensions(preset: WallpaperPreset): { width: number; height: number } {
  return {
    width: preset.width + (preset.width % 2),
    height: preset.height + (preset.height % 2),
  };
}

/**
 * Copy a rasterized frame onto a coded-size canvas, padding the right/bottom
 * edge when a preset dimension is odd. The pad column/row falls outside the
 * `VideoFrame` visible rect and never reaches the displayed pixels.
 */
function toCodedFrame(
  frame: HTMLCanvasElement,
  coded: { width: number; height: number },
): HTMLCanvasElement {
  if (frame.width === coded.width && frame.height === coded.height) {
    return frame;
  }

  const canvas = document.createElement('canvas');
  canvas.width = coded.width;
  canvas.height = coded.height;
  const context = canvas.getContext('2d');

  if (context === null) {
    throw new Error('wallpaper: 2D canvas context unavailable');
  }

  context.drawImage(frame, 0, 0);

  return canvas;
}

/**
 * Encode the stored scene as a looping MP4 at the preset size (WAL-001,
 * WAL-002). Reads only the stored string; it never regenerates a scene
 * (WAL-006).
 *
 * Each baked frame is encoded with an explicit presentation timestamp of
 * `frame / WALLPAPER_FPS` seconds, so the decoded timeline is exactly
 * `totalFrames / WALLPAPER_FPS` seconds at 30 fps regardless of the offline
 * render's wall-clock pace. Throws `WallpaperUnavailableError` when no usable
 * encoder exists (WAL-008).
 */
export async function encodeWallpaper(
  svg: string,
  preset: WallpaperPreset,
  options: WallpaperEncodeOptions = {},
): Promise<Blob> {
  const mimeType = supportedWallpaperMimeType();

  if (mimeType === null || typeof VideoEncoder === 'undefined') {
    throw new WallpaperUnavailableError();
  }

  const totalFrames = options.frames ?? WALLPAPER_FRAME_COUNT;

  if (totalFrames <= 0) {
    throw new Error('wallpaper: frame budget must be positive');
  }

  const coded = codedDimensions(preset);
  const renderer = createWallpaperRenderer(svg, preset);
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: 'avc',
      width: preset.width,
      height: preset.height,
      frameRate: WALLPAPER_FPS,
    },
    fastStart: 'in-memory',
  });

  let encoderError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata),
    error: (error) => {
      encoderError = error instanceof Error ? error : new Error(String(error));
    },
  });

  try {
    // WAL-008: probe the exact config before encoding rather than assuming the
    // static codec string is available.
    const support = await VideoEncoder.isConfigSupported({
      codec: WALLPAPER_CODEC,
      width: coded.width,
      height: coded.height,
      bitrate: WALLPAPER_BITRATE,
      framerate: WALLPAPER_FPS,
      avc: { format: 'avc' },
    });

    if (!support.supported) {
      throw new WallpaperUnavailableError();
    }

    encoder.configure({
      codec: WALLPAPER_CODEC,
      width: coded.width,
      height: coded.height,
      bitrate: WALLPAPER_BITRATE,
      framerate: WALLPAPER_FPS,
      avc: { format: 'avc' },
    });

    for (let frame = 0; frame < totalFrames; frame += 1) {
      if (options.signal?.aborted) {
        throw new DOMException('wallpaper: export aborted', 'AbortError');
      }

      const baked = await renderer.renderFrame(frame / WALLPAPER_FPS);
      const codedFrame = toCodedFrame(baked, coded);
      const videoFrame = new VideoFrame(codedFrame, {
        visibleRect: { x: 0, y: 0, width: preset.width, height: preset.height },
        timestamp: Math.round((frame * 1_000_000) / WALLPAPER_FPS),
        duration: Math.round(1_000_000 / WALLPAPER_FPS),
      });

      encoder.encode(videoFrame, { keyFrame: frame === 0 });
      videoFrame.close();
      options.onProgress?.(frame + 1, totalFrames);
    }

    await encoder.flush();

    if (encoderError !== null) {
      throw encoderError;
    }

    muxer.finalize();

    return new Blob([muxer.target.buffer], { type: 'video/mp4' });
  } finally {
    renderer.dispose();

    if (encoder.state !== 'closed') {
      encoder.close();
    }
  }
}

/** Trigger a browser download for a wallpaper video blob (mirrors downloadSvg). */
export function downloadWallpaperBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  // Revoke after the browser has consumed the object URL for this click.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
