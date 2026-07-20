import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { getDb, mapBatch } from "@/lib/db";
import { resolveStoragePath } from "@/lib/storage";
import sharp from "sharp";

export const runtime = "nodejs";

async function scanDims(storagePath: string): Promise<{ width: number; height: number } | null> {
  try {
    const meta = await sharp(resolveStoragePath(storagePath)).metadata();
    return meta.width && meta.height ? { width: meta.width, height: meta.height } : null;
  } catch {
    return null;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const row = getDb().prepare("select * from batches where id = ?").get(id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  const batch = mapBatch(row as Parameters<typeof mapBatch>[0]);
  // Scan pixel dimensions: fronts and backs may have been scanned at
  // different resolutions, so clients need both to map coordinates.
  const [front, back] = await Promise.all([
    scanDims(batch.front_path),
    scanDims(batch.back_path),
  ]);
  return NextResponse.json({ ...batch, front_dims: front, back_dims: back });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json()) as {
    dpi?: number;
    status?: string;
    collection_id?: string | null;
  };
  const db = getDb();
  if (body.dpi !== undefined) db.prepare("update batches set dpi = ? where id = ?").run(body.dpi, id);
  if (body.status !== undefined)
    db.prepare("update batches set status = ? where id = ?").run(body.status, id);
  if (body.collection_id !== undefined) {
    // Cards inherit the batch's collection, so reassigning a batch moves its cards too.
    db.prepare("update batches set collection_id = ? where id = ?").run(body.collection_id, id);
    db.prepare("update cards set collection_id = ? where batch_id = ?").run(body.collection_id, id);
  }
  const row = db.prepare("select * from batches where id = ?").get(id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(mapBatch(row as Parameters<typeof mapBatch>[0]));
}

/** Delete a batch: DB rows (cards cascade), scan files, and card exports. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const row = db.prepare("select * from batches where id = ?").get(id) as
    | { batch_number: number }
    | undefined;
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const cardIds = (
    db.prepare("select id from cards where batch_id = ?").all(id) as Array<{ id: string }>
  ).map((c) => c.id);

  db.prepare("delete from batches where id = ?").run(id);

  const rmrf = (storagePath: string) => {
    try {
      fs.rmSync(resolveStoragePath(storagePath), { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  };
  rmrf(`scans/${row.batch_number}`);
  for (const cardId of cardIds) rmrf(`cards/${cardId}`);

  return NextResponse.json({ ok: true });
}
