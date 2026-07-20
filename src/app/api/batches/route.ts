import { NextRequest, NextResponse } from "next/server";
import { getDb, mapBatch } from "@/lib/db";
import { saveFile } from "@/lib/storage";
import { randomUUID } from "crypto";
import sharp from "sharp";

export const runtime = "nodejs";

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare(
      `select b.*,
        (select count(*) from cards c where c.batch_id = b.id) as card_count,
        (select count(*) from cards c where c.batch_id = b.id and c.front_image is not null) as fronts_exported,
        (select count(*) from cards c where c.batch_id = b.id and c.back_image is not null) as backs_exported,
        (select count(*) from cards c where c.batch_id = b.id and c.status in ('extracted','reviewed','published')) as extracted_count
       from batches b order by b.batch_number`
    )
    .all() as Array<Record<string, unknown>>;
  const batches = rows.map((r) => ({
    ...mapBatch(r as unknown as Parameters<typeof mapBatch>[0]),
    card_count: r.card_count,
    fronts_exported: r.fronts_exported,
    backs_exported: r.backs_exported,
    extracted_count: r.extracted_count,
  }));
  return NextResponse.json(batches);
}

/**
 * Apply EXIF auto-orientation, then rotate portrait scans 90° counter-
 * clockwise so every stored scan is landscape (cards are scanned sideways on
 * a portrait bed; this puts them upright-landscape everywhere downstream).
 * If a batch still reads wrong, the align screen has per-scan 180° flips.
 */
async function normalizeScan(buf: Buffer): Promise<Buffer> {
  const meta = await sharp(buf).metadata();
  let work = buf;
  // Bake in EXIF orientation first (sharp allows one rotation per pipeline).
  if (meta.orientation && meta.orientation !== 1) {
    work = await sharp(buf).rotate().jpeg({ quality: 95 }).toBuffer();
  }
  const { width = 0, height = 0 } = await sharp(work).metadata();
  if (height > width) {
    work = await sharp(work).rotate(270).jpeg({ quality: 95 }).toBuffer();
  }
  return work;
}

/**
 * Upload one batch: multipart form with fields
 *   batch_number, dpi (optional), collection_id (optional), front (File), back (File)
 * Re-uploading an existing batch number replaces the scans but keeps cards.
 */
export async function POST(req: NextRequest) {
  try {
    return await handleUpload(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("batch upload failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleUpload(req: NextRequest) {
  const form = await req.formData();
  const batchNumber = Number(form.get("batch_number"));
  const dpiRaw = form.get("dpi");
  const dpi = dpiRaw ? Number(dpiRaw) : null;
  const collectionId = (form.get("collection_id") as string | null) || null;
  const front = form.get("front") as File | null;
  const back = form.get("back") as File | null;

  if (!Number.isInteger(batchNumber) || !front || !back) {
    return NextResponse.json(
      { error: "batch_number, front and back are required" },
      { status: 400 }
    );
  }
  // Cloud-only placeholders (iCloud "Optimize Mac Storage") upload as 0 bytes.
  for (const [label, f] of [["front", front], ["back", back]] as const) {
    if (f.size === 0) {
      return NextResponse.json(
        {
          error: `${label} scan "${f.name}" is empty (0 bytes) — if the folder lives in iCloud Drive, download it locally first (right-click → Download Now)`,
        },
        { status: 400 }
      );
    }
  }

  const frontPath = `scans/${batchNumber}/front.jpg`;
  const backPath = `scans/${batchNumber}/back.jpg`;
  const frontBuf = await normalizeScan(Buffer.from(await front.arrayBuffer()));
  const backBuf = await normalizeScan(Buffer.from(await back.arrayBuffer()));

  await saveFile(frontPath, frontBuf);
  await saveFile(backPath, backBuf);

  // Thumbnails for the batch list (originals can be 10-30 MB).
  await saveFile(
    `scans/${batchNumber}/front_thumb.jpg`,
    await sharp(frontBuf).resize({ width: 480 }).jpeg({ quality: 80 }).toBuffer()
  );
  await saveFile(
    `scans/${batchNumber}/back_thumb.jpg`,
    await sharp(backBuf).resize({ width: 480 }).jpeg({ quality: 80 }).toBuffer()
  );

  const db = getDb();
  const existing = db
    .prepare("select id from batches where batch_number = ?")
    .get(batchNumber) as { id: string } | undefined;

  let id: string;
  if (existing) {
    id = existing.id;
    db.prepare(
      "update batches set front_path = ?, back_path = ?, dpi = coalesce(?, dpi), collection_id = coalesce(?, collection_id) where id = ?"
    ).run(frontPath, backPath, dpi, collectionId, id);
  } else {
    id = randomUUID();
    db.prepare(
      "insert into batches (id, batch_number, front_path, back_path, dpi, status, collection_id) values (?, ?, ?, ?, ?, 'uploaded', ?)"
    ).run(id, batchNumber, frontPath, backPath, dpi, collectionId);
  }

  const row = db.prepare("select * from batches where id = ?").get(id);
  return NextResponse.json(mapBatch(row as Parameters<typeof mapBatch>[0]));
}
