import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDb, mapExtraction } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Create a blank manual extraction for a card that has none (or whose latest
 * run failed), so metadata can be entered by hand in the card profile.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const card = db.prepare("select id, status from cards where id = ?").get(id) as
    | { id: string; status: string }
    | undefined;
  if (!card) return NextResponse.json({ error: "not found" }, { status: 404 });

  const extractionId = randomUUID();
  db.prepare(
    "insert into extractions (id, card_id, model, reviewed) values (?, ?, 'manual', 0)"
  ).run(extractionId, id);
  if (card.status === "cropped") {
    db.prepare("update cards set status = 'extracted' where id = ?").run(id);
  }

  const row = db.prepare("select * from extractions where id = ?").get(extractionId);
  return NextResponse.json(mapExtraction(row as Parameters<typeof mapExtraction>[0]));
}
