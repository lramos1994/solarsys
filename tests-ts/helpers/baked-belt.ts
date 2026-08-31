import type { Canvas } from '../../ts/generator/orbit';

/**
 * Shared parser for the BAKED belt serialization (GEN-026).
 *
 * The belt renders as opacity clusters, each holding three tone paths whose
 * subpaths are rocks. A rock is recovered as the triple of same-index subpaths.
 * Its centre is estimated as the centroid of its silhouette vertices — exact
 * for these small convex-ish polygons' purposes — and its scale from the mean
 * vertex distance to that centroid (the unit shapes have mean vertex radius
 * ~0.77, factored out below so `scale` is comparable to the retired
 * `scale()` transform value).
 */

export interface BakedRock {
  x: number;
  y: number;
  scale: number;
  radius: number;
  opacity: number;
}

/**
 * Mean vertex radius of the unit-scale ROCKY silhouettes, measured from
 * `BELT_SHAPES` (0.840, 0.835, 0.866, 0.850). Tests that need scale in the
 * retired transform's units use the rocky belt; icy (~0.77) and metallic
 * (~0.96) differ, so scale comparisons across types are not meaningful and no
 * test makes one.
 */
const UNIT_MEAN_VERTEX_RADIUS = 0.8476;

function subpathsOf(d: string): string[] {
  return d.match(/M[^M]+/g) ?? [];
}

function verticesOf(subpath: string): Array<[number, number]> {
  return [...subpath.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);
}

/** Parse every rock out of a generated scene's baked belt. */
export function parseBakedRocks(svg: string, canvas: Canvas): BakedRock[] {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const rocks: BakedRock[] = [];

  const clusters = svg.matchAll(
    /<g data-role="asteroid-cluster" opacity="([\d.]+)">(.*?)<\/g>/gs,
  );

  for (const cluster of clusters) {
    const opacity = Number(cluster[1]);
    const body = cluster[2] ?? '';
    const silhouette = /data-role="asteroid-silhouettes"[^>]* d="([^"]*)"/.exec(body);

    for (const subpath of subpathsOf(silhouette?.[1] ?? '')) {
      const vertices = verticesOf(subpath);

      if (vertices.length === 0) {
        continue;
      }

      const x = vertices.reduce((sum, [vx]) => sum + vx, 0) / vertices.length;
      const y = vertices.reduce((sum, [, vy]) => sum + vy, 0) / vertices.length;
      const meanVertexDistance =
        vertices.reduce((sum, [vx, vy]) => sum + Math.hypot(vx - x, vy - y), 0) /
        vertices.length;

      rocks.push({
        x,
        y,
        scale: meanVertexDistance / UNIT_MEAN_VERTEX_RADIUS,
        radius: Math.hypot(x - cx, y - cy),
        opacity,
      });
    }
  }

  return rocks;
}

/** The generator's own claim of how many rocks it rendered. */
export function stampedRockCount(svg: string): number {
  const stamped = /data-role="asteroid-belt" data-count="(\d+)"/.exec(svg);

  return stamped === null ? 0 : Number(stamped[1]);
}
