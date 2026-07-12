import { NextRequest, NextResponse } from "next/server";
import { getDb, mapCard } from "@/lib/db";
import { saveFile } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Upload a cropped card face rendered client-side.
 * POST /api/cards/[id]/image?face=front|back with a JPEG body.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const face = req.nextUrl.searchParams.get("face");
  if (face !== "front" && face !== "back") {
    return NextResponse.json({ error: "face must be front or back" }, { status: 400 });
  }

  const db = getDb();
  const row = db.prepare("select * from cards where id = ?").get(id);
  if (!row) return NextResponse.json({ error: "card not found" }, { status: 404 });

  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) return NextResponse.json({ error: "empty body" }, { status: 400 });

  const storagePath = `cards/${id}/${face}.jpg`;
  await saveFile(storagePath, buf);
  // New export invalidates the Supabase image sync for this card.
  db.prepare(
    `update cards set ${face === "front" ? "front_image" : "back_image"} = ?, synced_at = null where id = ?`
  ).run(storagePath, id);

  const updated = db.prepare("select * from cards where id = ?").get(id);
  return NextResponse.json(mapCard(updated as Parameters<typeof mapCard>[0]));
}
