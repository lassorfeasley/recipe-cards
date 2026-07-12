import type { CropRect } from "./types";
import { readingOrder } from "./cropGeometry";

type Point = [number, number];

/**
 * Reduce a component to candidate hull points (each row's min/max x), then
 * compute the convex hull with Andrew's monotone chain.
 */
function componentHull(pixels: number[], w: number): Point[] {
  const rows = new Map<number, { min: number; max: number }>();
  for (const p of pixels) {
    const x = p % w;
    const y = (p / w) | 0;
    const r = rows.get(y);
    if (!r) rows.set(y, { min: x, max: x });
    else {
      if (x < r.min) r.min = x;
      if (x > r.max) r.max = x;
    }
  }
  const pts: Point[] = [];
  for (const [y, r] of rows) {
    pts.push([r.min, y]);
    if (r.max !== r.min) pts.push([r.max, y]);
  }
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Point, a: Point, b: Point) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Minimum-area oriented bounding box via rotating calipers over hull edges.
 * Returns the box angle normalized to (-45°, 45°] plus the projection extents
 * along that angle's axes.
 */
function minAreaRect(hull: Point[]): {
  angle: number;
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
} | null {
  if (hull.length < 3) return null;
  let best: { angle: number; area: number } | null = null;
  for (let i = 0; i < hull.length; i++) {
    const [x1, y1] = hull[i];
    const [x2, y2] = hull[(i + 1) % hull.length];
    const edgeAngle = Math.atan2(y2 - y1, x2 - x1);
    const cos = Math.cos(edgeAngle);
    const sin = Math.sin(edgeAngle);
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const [x, y] of hull) {
      const u = x * cos + y * sin;
      const v = -x * sin + y * cos;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const area = (maxU - minU) * (maxV - minV);
    if (!best || area < best.area) best = { angle: edgeAngle, area };
  }
  if (!best) return null;

  // Normalize: cards are nearly axis-aligned, we only want the small skew.
  let angle = best.angle;
  while (angle > Math.PI / 4) angle -= Math.PI / 2;
  while (angle <= -Math.PI / 4) angle += Math.PI / 2;

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const [x, y] of hull) {
    const u = x * cos + y * sin;
    const v = -x * sin + y * cos;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  return { angle, minU, maxU, minV, maxV };
}

/**
 * Auto-detect light cards on a black scan background.
 * Threshold + connected components + oriented bounding box from image moments.
 * Runs on a downscaled copy for speed; returns crops in source-image pixels.
 */
export function detectCards(
  img: HTMLImageElement,
  opts: { threshold?: number; maxWorkingEdge?: number } = {}
): CropRect[] {
  const threshold = opts.threshold ?? 50;
  const maxEdge = opts.maxWorkingEdge ?? 1000;

  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  // Binary mask: anything meaningfully brighter than the black background.
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const lum = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    if (lum > threshold) mask[i] = 1;
  }

  // Connected components (4-connectivity, iterative flood fill).
  const labels = new Int32Array(w * h); // 0 = unlabeled
  const stack = new Int32Array(w * h);
  let nextLabel = 0;
  const components: number[][] = []; // label -> flat pixel indices

  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || labels[start]) continue;
    nextLabel++;
    const pixels: number[] = [];
    let sp = 0;
    stack[sp++] = start;
    labels[start] = nextLabel;
    while (sp > 0) {
      const p = stack[--sp];
      pixels.push(p);
      const px = p % w;
      const py = (p / w) | 0;
      if (px > 0 && mask[p - 1] && !labels[p - 1]) { labels[p - 1] = nextLabel; stack[sp++] = p - 1; }
      if (px < w - 1 && mask[p + 1] && !labels[p + 1]) { labels[p + 1] = nextLabel; stack[sp++] = p + 1; }
      if (py > 0 && mask[p - w] && !labels[p - w]) { labels[p - w] = nextLabel; stack[sp++] = p - w; }
      if (py < h - 1 && mask[p + w] && !labels[p + w]) { labels[p + w] = nextLabel; stack[sp++] = p + w; }
    }
    components.push(pixels);
  }

  const totalArea = w * h;
  const crops: CropRect[] = [];

  for (const pixels of components) {
    const areaFrac = pixels.length / totalArea;
    // A 3x5 card in a 9-card scan is roughly 4-12% of the image.
    if (areaFrac < 0.015 || areaFrac > 0.45) continue;

    const box = minAreaRect(componentHull(pixels, w));
    if (!box) continue;
    const { angle, minU, maxU, minV, maxV } = box;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const bw = maxU - minU;
    const bh = maxV - minV;
    if (bw < 8 || bh < 8) continue;
    const aspect = Math.max(bw, bh) / Math.min(bw, bh);
    if (aspect > 3) continue; // not remotely card-shaped

    // Top-left corner of the oriented box back in image coordinates.
    const ax = minU * cos - minV * sin;
    const ay = minU * sin + minV * cos;

    crops.push({
      x: ax / scale,
      y: ay / scale,
      w: bw / scale,
      h: bh / scale,
      rotation: (angle * 180) / Math.PI,
    });
  }

  const order = readingOrder(crops);
  return order.map((i) => crops[i]);
}
