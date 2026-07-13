import sharp from "sharp";
import { getDb } from "@/lib/db";
import { readStoredFile, storedFileExists } from "@/lib/storage";
import { getSupabaseAdmin } from "@/lib/supabase";

/** Width of the public showcase thumbnails uploaded as {card_id}/{face}_thumb.jpg. */
const THUMB_WIDTH = 480;

async function makeThumb(buf: Buffer): Promise<Buffer> {
  return sharp(buf).resize({ width: THUMB_WIDTH }).jpeg({ quality: 78 }).toBuffer();
}

interface CardRow {
  id: string;
  batch_id: string;
  position: number;
  slug: string | null;
  front_crop: string | null;
  back_crop: string | null;
  front_rotate180: number;
  back_rotate180: number;
  faces_swapped: number;
  front_image: string | null;
  back_image: string | null;
  status: string;
  created_at: string;
  synced_at: string | null;
}

export interface SyncResult {
  batches: number;
  cards: number;
  extractions: number;
  imagesUploaded: number;
  errors: string[];
}

/** SQLite "YYYY-MM-DD HH:MM:SS" (UTC) -> ISO 8601 so Postgres reads it as UTC. */
function toIso(sqliteUtc: string): string {
  return sqliteUtc.includes("T") ? sqliteUtc : sqliteUtc.replace(" ", "T") + "Z";
}

/** Local storage path "cards/{id}/front.jpg" -> object key within the bucket. */
function bucketKey(localPath: string): string {
  return localPath.replace(/^cards\//, "");
}

/** Cards that have both faces exported — the unit we sync. */
export function exportedCards(cardIds?: string[]): CardRow[] {
  const db = getDb();
  if (cardIds && cardIds.length > 0) {
    const placeholders = cardIds.map(() => "?").join(",");
    return db
      .prepare(
        `select * from cards where front_image is not null and back_image is not null
         and id in (${placeholders}) order by created_at`
      )
      .all(...cardIds) as CardRow[];
  }
  return db
    .prepare(
      "select * from cards where front_image is not null and back_image is not null order by created_at"
    )
    .all() as CardRow[];
}

/**
 * Push exported card pairs to Supabase:
 *   - upsert batches / cards / latest extraction per card (always — cheap)
 *   - upload front/back JPEGs to the public `cards` bucket for cards whose
 *     exports changed since the last sync (or all with force)
 *
 * Pass cardIds to sync a subset (e.g. one card right after approval).
 * Throws on fatal upsert errors; per-image upload failures are collected
 * in the returned errors array.
 */
export async function runSync(
  { cardIds, force = false }: { cardIds?: string[]; force?: boolean } = {}
): Promise<SyncResult> {
  const db = getDb();
  const supabase = getSupabaseAdmin();
  const cards = exportedCards(cardIds);
  if (cards.length === 0) {
    return { batches: 0, cards: 0, extractions: 0, imagesUploaded: 0, errors: [] };
  }
  const errors: string[] = [];

  // ---- 1. batches (only those with exported cards) ----
  const batchIds = [...new Set(cards.map((c) => c.batch_id))];
  const batchRows = batchIds
    .map((id) => db.prepare("select * from batches where id = ?").get(id))
    .filter(Boolean) as Array<{
    id: string;
    batch_number: number;
    dpi: number | null;
    status: string;
    created_at: string;
  }>;
  {
    const { error } = await supabase.from("batches").upsert(
      batchRows.map((b) => ({
        id: b.id,
        batch_number: b.batch_number,
        dpi: b.dpi,
        status: b.status,
        created_at: toIso(b.created_at),
      }))
    );
    if (error) throw new Error(`batches upsert failed: ${error.message}`);
  }

  // ---- 2. cards ----
  {
    const { error } = await supabase.from("cards").upsert(
      cards.map((c) => ({
        id: c.id,
        batch_id: c.batch_id,
        position: c.position,
        slug: c.slug,
        front_crop: c.front_crop ? JSON.parse(c.front_crop) : null,
        back_crop: c.back_crop ? JSON.parse(c.back_crop) : null,
        front_rotate180: !!c.front_rotate180,
        back_rotate180: !!c.back_rotate180,
        // faces_swapped is local workflow state only — exports bake it in.
        // Paths within the public `cards` bucket.
        front_image: bucketKey(c.front_image!),
        back_image: bucketKey(c.back_image!),
        status: c.status,
        created_at: toIso(c.created_at),
      }))
    );
    if (error) throw new Error(`cards upsert failed: ${error.message}`);
  }

  // ---- 3. latest extraction per card ----
  const latestExtraction = db.prepare(
    "select * from extractions where card_id = ? order by created_at desc limit 1"
  );
  const extractionRows = cards
    .map((c) => latestExtraction.get(c.id))
    .filter(Boolean) as Array<Record<string, unknown>>;
  if (extractionRows.length > 0) {
    const { error } = await supabase.from("extractions").upsert(
      extractionRows.map((e) => ({
        id: e.id,
        card_id: e.card_id,
        title: e.title,
        category: e.category,
        writing_medium: e.writing_medium,
        ink_colors: e.ink_colors ? JSON.parse(e.ink_colors as string) : null,
        card_design: e.card_design,
        attribution: e.attribution,
        back_relationship: e.back_relationship,
        transcription_front: e.transcription_front,
        transcription_back: e.transcription_back,
        ingredients: e.ingredients ? JSON.parse(e.ingredients as string) : null,
        recipe_markdown: e.recipe_markdown,
        ai_notes: e.ai_notes,
        confidence: e.confidence,
        model: e.model,
        raw_response: e.raw_response ? JSON.parse(e.raw_response as string) : null,
        reviewed: !!e.reviewed,
        created_at: toIso(e.created_at as string),
      }))
    );
    if (error) throw new Error(`extractions upsert failed: ${error.message}`);
  }

  // ---- 4. images (only pending, unless forced) ----
  const toUpload = cards.filter((c) => force || !c.synced_at);
  const markSynced = db.prepare("update cards set synced_at = datetime('now') where id = ?");
  let imagesUploaded = 0;

  const uploadCard = async (c: CardRow) => {
    for (const path of [c.front_image!, c.back_image!]) {
      if (!storedFileExists(path)) throw new Error(`${path} missing on disk`);
      const buf = await readStoredFile(path);
      const { error } = await supabase.storage
        .from("cards")
        .upload(bucketKey(path), buf, { contentType: "image/jpeg", upsert: true });
      if (error) throw new Error(`${path}: ${error.message}`);
      imagesUploaded++;
      // Small thumbnails (both faces) for the public showcase wall.
      const face = path === c.front_image ? "front" : "back";
      const { error: thumbErr } = await supabase.storage
        .from("cards")
        .upload(`${c.id}/${face}_thumb.jpg`, await makeThumb(buf), {
          contentType: "image/jpeg",
          upsert: true,
        });
      if (thumbErr) throw new Error(`${path} thumb: ${thumbErr.message}`);
    }
    markSynced.run(c.id);
  };

  const CONCURRENCY = 4;
  for (let i = 0; i < toUpload.length; i += CONCURRENCY) {
    const results = await Promise.allSettled(toUpload.slice(i, i + CONCURRENCY).map(uploadCard));
    for (const r of results) {
      if (r.status === "rejected") {
        errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
      }
    }
  }

  return {
    batches: batchRows.length,
    cards: cards.length,
    extractions: extractionRows.length,
    imagesUploaded,
    errors,
  };
}

/**
 * One-off backfill: (re)generate and upload the public showcase thumbnails
 * (both faces) for every exported card. Used for cards synced before
 * thumbnails existed.
 */
export async function backfillThumbs(): Promise<{ uploaded: number; errors: string[] }> {
  const supabase = getSupabaseAdmin();
  const cards = exportedCards();
  const errors: string[] = [];
  let uploaded = 0;

  const one = async (c: CardRow) => {
    const faces = [
      ["front", c.front_image],
      ["back", c.back_image],
    ] as const;
    for (const [face, path] of faces) {
      if (!path) continue;
      const buf = await readStoredFile(path);
      const { error } = await supabase.storage
        .from("cards")
        .upload(`${c.id}/${face}_thumb.jpg`, await makeThumb(buf), {
          contentType: "image/jpeg",
          upsert: true,
        });
      if (error) throw new Error(`${c.id}/${face}: ${error.message}`);
      uploaded++;
    }
  };

  const CONCURRENCY = 6;
  for (let i = 0; i < cards.length; i += CONCURRENCY) {
    const results = await Promise.allSettled(cards.slice(i, i + CONCURRENCY).map(one));
    for (const r of results) {
      if (r.status === "rejected") {
        errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
      }
    }
  }
  return { uploaded, errors };
}
