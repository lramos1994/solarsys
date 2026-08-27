export function svgFilename(seed: number): string {
  return `solarsys-${seed}.svg`;
}

export interface SvgDownload {
  filename: string;
  blob: Blob;
}

/**
 * Build the download payload from an already serialized scene (D-19, EXP-002).
 * Generation deliberately does not appear in this module: the exact string held
 * by the scene store is the one rendered in preview and written to the file.
 */
export function createSvgDownload(
  svg: string,
  seed: number,
): SvgDownload {
  return {
    filename: svgFilename(seed),
    blob: new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
  };
}

/** Trigger a browser download without regenerating or reserializing the scene. */
export function downloadSvg(
  svg: string,
  seed: number,
): void {
  const download = createSvgDownload(svg, seed);
  const url = URL.createObjectURL(download.blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = download.filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  // Revoke after the browser has consumed the object URL for this click.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
