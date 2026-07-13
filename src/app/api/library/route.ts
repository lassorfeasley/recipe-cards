import { NextResponse } from "next/server";
import { getDb, mapCard, mapExtraction } from "@/lib/db";
import { getSupabaseAdmin, supabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * Library listing. When Supabase is configured this reads from Supabase
 * (the source of truth the public site will use), returning public storage
 * URLs for the images. Without Supabase it falls back to the local database
 * and local file URLs, so the tool still works offline.
 */
export async function GET() {
  if (supabaseConfigured()) {
    try {
      return NextResponse.json({ source: "supabase", entries: await fromSupabase() });
    } catch (e) {
      // Supabase down/unreachable: degrade to local rather than an empty library.
      console.error("library: supabase read failed, falling back to local:", e);
    }
  }
  return NextResponse.json({ source: "local", entries: fromLocal() });
}

async function fromSupabase() {
  const supabase = getSupabaseAdmin();
  const publicUrl = (key: string) =>
    supabase.storage.from("cards").getPublicUrl(key).data.publicUrl;

  const [cardsRes, extractionsRes, batchesRes] = await Promise.all([
    supabase.from("cards").select("*").order("created_at"),
    supabase.from("extractions").select("*").order("created_at", { ascending: false }),
    supabase.from("batches").select("id, batch_number"),
  ]);
  for (const res of [cardsRes, extractionsRes, batchesRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  const batchNumber = new Map(
    (batchesRes.data as Array<{ id: string; batch_number: number }>).map((b) => [
      b.id,
      b.batch_number,
    ])
  );
  // Rows are newest-first, so the first extraction seen per card is the latest.
  const latest = new Map<string, Record<string, unknown>>();
  for (const e of extractionsRes.data as Array<Record<string, unknown>>) {
    const cardId = e.card_id as string;
    if (!latest.has(cardId)) latest.set(cardId, e);
  }

  return (cardsRes.data as Array<Record<string, unknown>>).map((c) => ({
    card: {
      ...c,
      batch_number: batchNumber.get(c.batch_id as string) ?? null,
      front_image: c.front_image ? publicUrl(c.front_image as string) : null,
      back_image: c.back_image ? publicUrl(c.back_image as string) : null,
    },
    extraction: latest.get(c.id as string) ?? null,
  }));
}

function fromLocal() {
  const db = getDb();
  const cards = db
    .prepare(
      `select c.*, b.batch_number from cards c
       join batches b on b.id = c.batch_id
       where c.front_image is not null and c.back_image is not null
       order by b.batch_number, c.position`
    )
    .all() as Array<Record<string, unknown>>;
  const latestExtraction = db.prepare(
    "select * from extractions where card_id = ? order by created_at desc limit 1"
  );
  return cards.map((row) => {
    const card = mapCard(row as Parameters<typeof mapCard>[0]);
    const extraction = latestExtraction.get(card.id);
    return {
      card: {
        ...card,
        batch_number: row.batch_number,
        front_image: card.front_image ? `/api/files/${card.front_image}` : null,
        back_image: card.back_image ? `/api/files/${card.back_image}` : null,
      },
      extraction: extraction
        ? mapExtraction(extraction as Parameters<typeof mapExtraction>[0])
        : null,
    };
  });
}
