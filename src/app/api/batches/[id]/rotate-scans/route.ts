import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { resolveStoragePath } from "@/lib/storage";
import sharp from "sharp";
import fs from "fs";
import type { CropRect } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Rotating an image 180° maps source point (x, y) -> (W - x, H - y).
 * A crop rect keeps its size and rotation; its new anchor is the image of
 * the old bottom-right corner.
 */
function rotateRect180(rect: CropRect, w: number, h: number): CropRect {
  const t = (rect.rotation * Math.PI) / 180;
  return {
    x: w - (rect.x + rect.w * Math.cos(t) - rect.h * Math.sin(t)),
    y: h - (rect.y + rect.w * Math.sin(t) + rect.h * Math.cos(t)),
    w: rect.w,
    h: rect.h,
    rotation: rect.rotation,
  };
}

async function rotateScanFile(storagePath: string): Promise<{ w: number; h: number }> {
  const abs = resolveStoragePath(storagePath);
  const meta = await sharp(abs).metadata();
  const rotated = await sharp(abs).rotate(180).jpeg({ quality: 95 }).toBuffer();
  fs.writeFileSync(abs, rotated);
  const thumbAbs = abs.replace(/(front|back)\.jpg$/, "$1_thumb.jpg");
  const thumb = await sharp(rotated).resize({ width: 480 }).jpeg({ quality: 80 }).toBuffer();
  fs.writeFileSync(thumbAbs, thumb);
  return { w: meta.width ?? 0, h: meta.height ?? 0 };
}

/**
 * Rotate a batch's scan(s) 180° in place. Saved crop geometry is transformed
 * to keep pointing at the same cards, and per-face 180° flags are toggled so
 * already-approved exports keep their meaning.
 * Body: { side: "front" | "back" | "both" }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { side } = (await req.json()) as { side: "front" | "back" | "both" };
  if (!["front", "back", "both"].includes(side)) {
    return NextResponse.json({ error: "side must be front, back or both" }, { status: 400 });
  }

  const db = getDb();
  const batch = db.prepare("select * from batches where id = ?").get(id) as
    | { front_path: string; back_path: string }
    | undefined;
  if (!batch) return NextResponse.json({ error: "not found" }, { status: 404 });

  const doFront = side === "front" || side === "both";
  const doBack = side === "back" || side === "both";

  const frontDims = doFront ? await rotateScanFile(batch.front_path) : null;
  const backDims = doBack ? await rotateScanFile(batch.back_path) : null;

  const cards = db.prepare("select * from cards where batch_id = ?").all(id) as Array<{
    id: string;
    front_crop: string | null;
    back_crop: string | null;
    front_rotate180: number;
    back_rotate180: number;
  }>;
  const update = db.prepare(
    "update cards set front_crop = ?, back_crop = ?, front_rotate180 = ?, back_rotate180 = ? where id = ?"
  );
  for (const card of cards) {
    let front = card.front_crop ? (JSON.parse(card.front_crop) as CropRect) : null;
    let back = card.back_crop ? (JSON.parse(card.back_crop) as CropRect) : null;
    let front180 = !!card.front_rotate180;
    let back180 = !!card.back_rotate180;
    if (front && frontDims) {
      front = rotateRect180(front, frontDims.w, frontDims.h);
      front180 = !front180;
    }
    if (back && backDims) {
      back = rotateRect180(back, backDims.w, backDims.h);
      back180 = !back180;
    }
    update.run(
      front ? JSON.stringify(front) : null,
      back ? JSON.stringify(back) : null,
      front180 ? 1 : 0,
      back180 ? 1 : 0,
      card.id
    );
  }

  return NextResponse.json({ ok: true, rotated: { front: doFront, back: doBack } });
}
