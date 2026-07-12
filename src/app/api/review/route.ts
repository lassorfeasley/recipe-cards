import { NextResponse } from "next/server";
import { getDb, mapCard, mapExtraction } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Everything the review queue needs: every card that has an exported front,
 * with its batch number and latest extraction (if any).
 */
export async function GET() {
  const db = getDb();
  const cards = db
    .prepare(
      `select c.*, b.batch_number from cards c
       join batches b on b.id = c.batch_id
       where c.front_image is not null
       order by b.batch_number, c.position`
    )
    .all() as Array<Parameters<typeof mapCard>[0] & { batch_number: number }>;

  const latestExtraction = db.prepare(
    "select * from extractions where card_id = ? order by created_at desc limit 1"
  );

  return NextResponse.json(
    cards.map((row) => ({
      card: { ...mapCard(row), batch_number: row.batch_number },
      extraction: (() => {
        const e = latestExtraction.get(row.id);
        return e ? mapExtraction(e as Parameters<typeof mapExtraction>[0]) : null;
      })(),
    }))
  );
}
