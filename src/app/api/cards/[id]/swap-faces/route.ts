import { NextRequest, NextResponse } from "next/server";
import { getDb, mapCard, mapExtraction } from "@/lib/db";
import { resolveStoragePath } from "@/lib/storage";
import fs from "fs";

export const runtime = "nodejs";

/**
 * Swap a card's front and back AFTER export (the card was scanned back-up):
 *   - swaps the exported front.jpg / back.jpg files on disk
 *   - toggles faces_swapped so re-approving in card review stays consistent
 *   - swaps transcription_front / transcription_back on the latest extraction
 *   - clears synced_at so the next Supabase sync re-uploads both images
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const row = db.prepare("select * from cards where id = ?").get(id) as
    | { front_image: string | null; back_image: string | null }
    | undefined;
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!row.front_image || !row.back_image) {
    return NextResponse.json(
      { error: "card must have both faces exported before swapping" },
      { status: 400 }
    );
  }

  const frontAbs = resolveStoragePath(row.front_image);
  const backAbs = resolveStoragePath(row.back_image);
  const tmpAbs = frontAbs + ".swap-tmp";
  fs.renameSync(frontAbs, tmpAbs);
  fs.renameSync(backAbs, frontAbs);
  fs.renameSync(tmpAbs, backAbs);

  db.prepare(
    "update cards set faces_swapped = not faces_swapped, synced_at = null where id = ?"
  ).run(id);

  const extraction = db
    .prepare("select * from extractions where card_id = ? order by created_at desc limit 1")
    .get(id) as { id: string } | undefined;
  if (extraction) {
    db.prepare(
      `update extractions set
         transcription_front = transcription_back,
         transcription_back = transcription_front
       where id = ?`
    ).run(extraction.id);
  }

  const card = db.prepare("select * from cards where id = ?").get(id);
  const fresh = extraction
    ? db.prepare("select * from extractions where id = ?").get(extraction.id)
    : null;
  return NextResponse.json({
    card: mapCard(card as Parameters<typeof mapCard>[0]),
    extraction: fresh ? mapExtraction(fresh as Parameters<typeof mapExtraction>[0]) : null,
  });
}
