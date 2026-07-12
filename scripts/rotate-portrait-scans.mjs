// One-off migration: rotate any portrait scans 90° clockwise so all stored
// scans are landscape, regenerate thumbnails, and transform saved crop
// geometry so no alignment work is lost. New uploads are normalized at
// upload time, so this only matters for batches uploaded before that change.
//
// Usage: node scripts/rotate-portrait-scans.mjs
import Database from "better-sqlite3";
import sharp from "sharp";
import path from "path";
import fs from "fs";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const FILES_DIR = path.join(DATA_DIR, "files");

const db = new Database(path.join(DATA_DIR, "archive.db"));

/**
 * Rotating an image 90° cw maps source point (x, y) -> (H - y, x).
 * For a crop rect anchored at its top-left with clockwise rotation θ,
 * the transformed rect keeps θ, swaps w/h, and its new anchor is the
 * image of the old bottom-left corner.
 */
function rotateRect90cw(rect, oldHeight) {
  const t = (rect.rotation * Math.PI) / 180;
  return {
    x: oldHeight - (rect.y + rect.h * Math.cos(t)),
    y: rect.x - rect.h * Math.sin(t),
    w: rect.h,
    h: rect.w,
    rotation: rect.rotation,
  };
}

async function rotateScanFile(storagePath) {
  const abs = path.join(FILES_DIR, storagePath);
  if (!fs.existsSync(abs)) return null;
  const meta = await sharp(abs).metadata();
  if ((meta.height ?? 0) <= (meta.width ?? 0)) return null; // already landscape
  const rotated = await sharp(abs).rotate(90).jpeg({ quality: 95 }).toBuffer();
  fs.writeFileSync(abs, rotated);
  const thumbAbs = abs.replace(/(front|back)\.jpg$/, "$1_thumb.jpg");
  const thumb = await sharp(rotated).resize({ width: 480 }).jpeg({ quality: 80 }).toBuffer();
  fs.writeFileSync(thumbAbs, thumb);
  return { oldW: meta.width, oldH: meta.height };
}

const batches = db.prepare("select * from batches order by batch_number").all();
for (const batch of batches) {
  const frontDims = await rotateScanFile(batch.front_path);
  const backDims = await rotateScanFile(batch.back_path);
  if (!frontDims && !backDims) {
    console.log(`batch ${batch.batch_number}: already landscape, skipped`);
    continue;
  }
  const cards = db.prepare("select * from cards where batch_id = ?").all(batch.id);
  const update = db.prepare("update cards set front_crop = ?, back_crop = ? where id = ?");
  for (const card of cards) {
    let front = card.front_crop ? JSON.parse(card.front_crop) : null;
    let back = card.back_crop ? JSON.parse(card.back_crop) : null;
    if (front && frontDims) front = rotateRect90cw(front, frontDims.oldH);
    if (back && backDims) back = rotateRect90cw(back, backDims.oldH);
    update.run(front ? JSON.stringify(front) : null, back ? JSON.stringify(back) : null, card.id);
  }
  console.log(
    `batch ${batch.batch_number}: rotated ${frontDims ? "front " : ""}${backDims ? "back " : ""}` +
      `and transformed crops for ${cards.length} cards`
  );
}
db.close();
console.log("done");
