import type { CropRect } from "./types";
import { outerRect } from "./cropGeometry";

/**
 * Render one card crop (outer rect = inner guide + margin) from the full-res
 * scan to a canvas, with rotation baked in. Optionally rotates the result 180°
 * (for backs that were flipped the other way).
 */
export function renderCrop(
  img: HTMLImageElement,
  crop: CropRect,
  marginPx: number,
  rotate180 = false
): HTMLCanvasElement {
  const outer = outerRect(crop, marginPx);
  const outW = Math.max(1, Math.round(outer.w));
  const outH = Math.max(1, Math.round(outer.h));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Crops near the scan edge may sample outside the image; keep that black.
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, outW, outH);

  if (rotate180) {
    ctx.translate(outW, outH);
    ctx.rotate(Math.PI);
  }
  // Map source point P to canvas: R(-θ) · (P - outerAnchor)
  ctx.rotate((-outer.rotation * Math.PI) / 180);
  ctx.translate(-outer.x, -outer.y);
  ctx.drawImage(img, 0, 0);

  return canvas;
}

export function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      quality
    );
  });
}

export async function uploadCardImage(
  cardId: string,
  face: "front" | "back",
  blob: Blob
): Promise<void> {
  const res = await fetch(`/api/cards/${cardId}/image?face=${face}`, {
    method: "POST",
    headers: { "Content-Type": "image/jpeg" },
    body: blob,
  });
  if (!res.ok) throw new Error(`Upload failed for card ${cardId} ${face}: ${res.status}`);
}
