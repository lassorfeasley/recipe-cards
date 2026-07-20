import { NextRequest, NextResponse } from "next/server";
import { getDb, mapCard, mapExtraction } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const row = db
    .prepare(
      `select c.*, b.batch_number from cards c
       join batches b on b.id = c.batch_id where c.id = ?`
    )
    .get(id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  const extraction = db
    .prepare("select * from extractions where card_id = ? order by created_at desc limit 1")
    .get(id);
  return NextResponse.json({
    card: {
      ...mapCard(row as Parameters<typeof mapCard>[0]),
      batch_number: (row as { batch_number: number }).batch_number,
    },
    extraction: extraction
      ? mapExtraction(extraction as Parameters<typeof mapExtraction>[0])
      : null,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json()) as {
    status?: string;
    slug?: string;
    front_crop?: object;
    back_crop?: object;
    front_rotate180?: boolean;
    back_rotate180?: boolean;
    faces_swapped?: boolean;
    collection_id?: string | null;
  };
  const db = getDb();
  if (body.status !== undefined)
    db.prepare("update cards set status = ? where id = ?").run(body.status, id);
  if (body.slug !== undefined)
    db.prepare("update cards set slug = ? where id = ?").run(body.slug, id);
  if (body.front_crop !== undefined)
    db.prepare("update cards set front_crop = ? where id = ?").run(
      JSON.stringify(body.front_crop),
      id
    );
  if (body.back_crop !== undefined)
    db.prepare("update cards set back_crop = ? where id = ?").run(
      JSON.stringify(body.back_crop),
      id
    );
  if (body.front_rotate180 !== undefined)
    db.prepare("update cards set front_rotate180 = ? where id = ?").run(
      body.front_rotate180 ? 1 : 0,
      id
    );
  if (body.back_rotate180 !== undefined)
    db.prepare("update cards set back_rotate180 = ? where id = ?").run(
      body.back_rotate180 ? 1 : 0,
      id
    );
  if (body.faces_swapped !== undefined)
    db.prepare("update cards set faces_swapped = ? where id = ?").run(
      body.faces_swapped ? 1 : 0,
      id
    );
  if (body.collection_id !== undefined)
    db.prepare("update cards set collection_id = ? where id = ?").run(body.collection_id, id);
  const row = db.prepare("select * from cards where id = ?").get(id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(mapCard(row as Parameters<typeof mapCard>[0]));
}
