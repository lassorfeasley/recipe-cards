import type { CropRect } from "./types";

const DEG = Math.PI / 180;

export function rotatePoint(x: number, y: number, deg: number): { x: number; y: number } {
  const r = deg * DEG;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: x * c - y * s, y: x * s + y * c };
}

/** Center of the inner guide rect in source coordinates. */
export function cropCenter(crop: CropRect): { x: number; y: number } {
  const off = rotatePoint(crop.w / 2, crop.h / 2, crop.rotation);
  return { x: crop.x + off.x, y: crop.y + off.y };
}

/** Recompute the top-left anchor so the rect keeps the given center. */
export function anchorFromCenter(
  cx: number,
  cy: number,
  w: number,
  h: number,
  rotation: number
): { x: number; y: number } {
  const off = rotatePoint(w / 2, h / 2, rotation);
  return { x: cx - off.x, y: cy - off.y };
}

/** Rotate a crop about its center to a new absolute angle. */
export function withRotationAboutCenter(crop: CropRect, rotation: number): CropRect {
  const c = cropCenter(crop);
  const a = anchorFromCenter(c.x, c.y, crop.w, crop.h, rotation);
  return { ...crop, x: a.x, y: a.y, rotation };
}

/**
 * The outer export rect: the inner guide expanded by marginPx on all sides,
 * in the crop's rotated frame. Same rotation, anchored at its own top-left.
 */
export function outerRect(crop: CropRect, marginPx: number): CropRect {
  const off = rotatePoint(-marginPx, -marginPx, crop.rotation);
  return {
    x: crop.x + off.x,
    y: crop.y + off.y,
    w: crop.w + 2 * marginPx,
    h: crop.h + 2 * marginPx,
    rotation: crop.rotation,
  };
}

/** Mirror a crop horizontally about the vertical centerline of the image. */
export function mirrorHorizontal(crop: CropRect, imageW: number): CropRect {
  const c = cropCenter(crop);
  const rotation = -crop.rotation;
  const a = anchorFromCenter(imageW - c.x, c.y, crop.w, crop.h, rotation);
  return { x: a.x, y: a.y, w: crop.w, h: crop.h, rotation };
}

/** Mirror a crop vertically about the horizontal centerline of the image. */
export function mirrorVertical(crop: CropRect, imageH: number): CropRect {
  const c = cropCenter(crop);
  const rotation = -crop.rotation;
  const a = anchorFromCenter(c.x, imageH - c.y, crop.w, crop.h, rotation);
  return { x: a.x, y: a.y, w: crop.w, h: crop.h, rotation };
}

/**
 * Sort crops into reading order (top-to-bottom rows, left-to-right within a
 * row). Rows are clustered by center Y with a tolerance of half the median
 * crop height. Returns the array of indices into `crops` in reading order.
 */
export function readingOrder(crops: CropRect[]): number[] {
  if (crops.length === 0) return [];
  const centers = crops.map((c, i) => ({ i, ...cropCenter(c) }));
  const heights = crops.map((c) => c.h).sort((a, b) => a - b);
  const tolerance = heights[Math.floor(heights.length / 2)] * 0.5;

  const sorted = [...centers].sort((a, b) => a.y - b.y);
  const rows: (typeof centers)[] = [];
  for (const c of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(c.y - row.reduce((s, r) => s + r.y, 0) / row.length) <= tolerance) {
      row.push(c);
    } else {
      rows.push([c]);
    }
  }
  return rows.flatMap((row) => row.sort((a, b) => a.x - b.x).map((c) => c.i));
}
