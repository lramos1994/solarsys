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

/** Freeze the SMIL timeline and move the document clock to the wanted time. */
function seekTo(live: SVGSVGElement, timeSeconds: number): void {
  live.pauseAnimations();
  live.setCurrentTime(timeSeconds);
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

/** A live working copy that bakes and rasterizes frames for one export. */
export interface WallpaperRenderer {
  renderFrame(timeSeconds: number): Promise<HTMLCanvasElement>;
  dispose(): void;
}

/**
 * Readies a detached offscreen working copy of the stored scene. Nothing done
 * through the renderer is observable in the preview or the SVG download
 * (WAL-006).
 */
export function createWallpaperRenderer(svg: string, preset: WallpaperPreset): WallpaperRenderer {
  const working = createWorkingCopy(svg);

  return {
    async renderFrame(timeSeconds: number): Promise<HTMLCanvasElement> {
      seekTo(working.svg, timeSeconds);
      const clone = working.svg.cloneNode(true) as SVGSVGElement;
      bake(working.svg, clone);

      return rasterize(clone, preset);
    },

    dispose(): void {
      working.container.remove();
    },
  };
}

/** One-shot convenience: render a single frame and release the working copy. */
export async function renderWallpaperFrame(
  svg: string,
  preset: WallpaperPreset,
  timeSeconds: number,
): Promise<HTMLCanvasElement> {
  const renderer = createWallpaperRenderer(svg, preset);

  try {
    return await renderer.renderFrame(timeSeconds);
  } finally {
    renderer.dispose();
  }
}
