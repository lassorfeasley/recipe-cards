import { randomUUID } from "crypto";
import { getDb, mapCard, mapExtraction } from "@/lib/db";
import { slugify, uniqueSlug } from "@/lib/slug";
import { getSupabaseAdmin, supabaseConfigured } from "@/lib/supabase";
import type { Card, Collection, Extraction, RecipeStructured } from "@/lib/types";

export type DataSource = "local" | "supabase";

export interface CardDetail {
  card: Card & { batch_number: number | null };
  extraction: Extraction | null;
  source: DataSource;
}

const EDITABLE_EXTRACTION = [
  "title",
  "category",
  "writing_medium",
  "card_design",
  "attribution",
  "back_relationship",
  "transcription_front",
  "transcription_back",
  "recipe_markdown",
  "ai_notes",
  "confidence",
] as const;

function publicUrl(key: string): string {
  return getSupabaseAdmin().storage.from("cards").getPublicUrl(key).data.publicUrl;
}

function mapSupabaseCard(
  row: Record<string, unknown>,
  batchNumber: number | null
): Card & { batch_number: number | null } {
  return {
    id: row.id as string,
    batch_id: (row.batch_id as string) ?? "",
    position: row.position as number,
    slug: (row.slug as string | null) ?? null,
    front_crop: (row.front_crop as Card["front_crop"]) ?? null,
    back_crop: (row.back_crop as Card["back_crop"]) ?? null,
    front_rotate180: !!(row.front_rotate180 as boolean | null),
    back_rotate180: !!(row.back_rotate180 as boolean | null),
    faces_swapped: !!(row.faces_swapped as boolean | null),
    front_image: row.front_image ? publicUrl(row.front_image as string) : null,
    back_image: row.back_image ? publicUrl(row.back_image as string) : null,
    status: row.status as Card["status"],
    collection_id: (row.collection_id as string | null) ?? null,
    created_at: row.created_at as string,
    synced_at: null,
    batch_number: batchNumber,
  };
}

function mapSupabaseExtraction(row: Record<string, unknown>): Extraction {
  return {
    id: row.id as string,
    card_id: row.card_id as string,
    title: (row.title as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    writing_medium: (row.writing_medium as string | null) ?? null,
    ink_colors: (row.ink_colors as string[] | null) ?? null,
    card_design: (row.card_design as string | null) ?? null,
    attribution: (row.attribution as string | null) ?? null,
    back_relationship: (row.back_relationship as string | null) ?? null,
    transcription_front: (row.transcription_front as string | null) ?? null,
    transcription_back: (row.transcription_back as string | null) ?? null,
    ingredients: (row.ingredients as string[] | null) ?? null,
    recipe_markdown: (row.recipe_markdown as string | null) ?? null,
    recipe_structured: (row.recipe_structured as RecipeStructured | null) ?? null,
    ai_notes: (row.ai_notes as string | null) ?? null,
    confidence: (row.confidence as string | null) ?? null,
    model: (row.model as string | null) ?? null,
    reviewed: !!(row.reviewed as boolean),
    created_at: row.created_at as string,
  };
}

function getLocalCardDetail(id: string): CardDetail | null {
  try {
    const db = getDb();
    const row = db
      .prepare(
        `select c.*, b.batch_number from cards c
         join batches b on b.id = c.batch_id where c.id = ?`
      )
      .get(id) as (Parameters<typeof mapCard>[0] & { batch_number: number }) | undefined;
    if (!row) return null;
    const extraction = db
      .prepare("select * from extractions where card_id = ? order by created_at desc limit 1")
      .get(id);
    return {
      card: {
        ...mapCard(row),
        batch_number: row.batch_number,
      },
      extraction: extraction
        ? mapExtraction(extraction as Parameters<typeof mapExtraction>[0])
        : null,
      source: "local",
    };
  } catch {
    return null;
  }
}

async function getSupabaseCardDetail(id: string): Promise<CardDetail | null> {
  if (!supabaseConfigured()) return null;
  const supabase = getSupabaseAdmin();
  const { data: card, error } = await supabase.from("cards").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!card) return null;

  let batchNumber: number | null = null;
  if (card.batch_id) {
    const { data: batch } = await supabase
      .from("batches")
      .select("batch_number")
      .eq("id", card.batch_id)
      .maybeSingle();
    batchNumber = batch?.batch_number ?? null;
  }

  const { data: extraction } = await supabase
    .from("extractions")
    .select("*")
    .eq("card_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    card: mapSupabaseCard(card as Record<string, unknown>, batchNumber),
    extraction: extraction
      ? mapSupabaseExtraction(extraction as Record<string, unknown>)
      : null,
    source: "supabase",
  };
}

/** Prefer local SQLite; fall back to Supabase when the row is missing (hosted). */
export async function getCardDetail(id: string): Promise<CardDetail | null> {
  const local = getLocalCardDetail(id);
  if (local) return local;
  return getSupabaseCardDetail(id);
}

export async function updateCard(
  id: string,
  body: {
    status?: string;
    slug?: string;
    collection_id?: string | null;
    front_crop?: object;
    back_crop?: object;
    front_rotate180?: boolean;
    back_rotate180?: boolean;
    faces_swapped?: boolean;
  }
): Promise<{ card: Card; source: DataSource } | null> {
  const local = getLocalCardDetail(id);
  if (local) {
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
    if (!row) return null;
    return { card: mapCard(row as Parameters<typeof mapCard>[0]), source: "local" };
  }

  if (!supabaseConfigured()) return null;
  const supabase = getSupabaseAdmin();
  const patch: Record<string, unknown> = {};
  if (body.status !== undefined) patch.status = body.status;
  if (body.slug !== undefined) patch.slug = body.slug;
  if (body.collection_id !== undefined) patch.collection_id = body.collection_id;
  if (body.front_crop !== undefined) patch.front_crop = body.front_crop;
  if (body.back_crop !== undefined) patch.back_crop = body.back_crop;
  if (body.front_rotate180 !== undefined) patch.front_rotate180 = body.front_rotate180;
  if (body.back_rotate180 !== undefined) patch.back_rotate180 = body.back_rotate180;
  // faces_swapped is local-only (not in Supabase schema)

  const { data, error } = await supabase
    .from("cards")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  let batchNumber: number | null = null;
  if (data.batch_id) {
    const { data: batch } = await supabase
      .from("batches")
      .select("batch_number")
      .eq("id", data.batch_id)
      .maybeSingle();
    batchNumber = batch?.batch_number ?? null;
  }
  const mapped = mapSupabaseCard(data as Record<string, unknown>, batchNumber);
  return { card: mapped, source: "supabase" };
}

async function uniqueSlugSupabase(title: string, cardId: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  const base = slugify(title);
  let candidate = base;
  let n = 2;
  for (;;) {
    const { data } = await supabase
      .from("cards")
      .select("id")
      .eq("slug", candidate)
      .neq("id", cardId)
      .maybeSingle();
    if (!data) return candidate;
    candidate = `${base}-${n++}`;
  }
}

export async function updateExtraction(
  id: string,
  body: Record<string, unknown> & {
    ink_colors?: string[] | null;
    ingredients?: string[] | null;
    recipe_structured?: object | null;
    reviewed?: boolean;
  }
): Promise<{ extraction: Extraction; source: DataSource } | null> {
  try {
    const db = getDb();
    const existing = db.prepare("select * from extractions where id = ?").get(id) as
      | { card_id: string }
      | undefined;
    if (existing) {
      for (const field of EDITABLE_EXTRACTION) {
        if (field in body) {
          db.prepare(`update extractions set ${field} = ? where id = ?`).run(
            (body[field] as string | null) ?? null,
            id
          );
        }
      }
      if ("ink_colors" in body) {
        db.prepare("update extractions set ink_colors = ? where id = ?").run(
          body.ink_colors ? JSON.stringify(body.ink_colors) : null,
          id
        );
      }
      if ("recipe_structured" in body) {
        db.prepare("update extractions set recipe_structured = ? where id = ?").run(
          body.recipe_structured ? JSON.stringify(body.recipe_structured) : null,
          id
        );
      }
      if ("ingredients" in body) {
        db.prepare("update extractions set ingredients = ? where id = ?").run(
          body.ingredients && body.ingredients.length
            ? JSON.stringify(body.ingredients)
            : null,
          id
        );
      }
      if ("reviewed" in body) {
        db.prepare("update extractions set reviewed = ? where id = ?").run(
          body.reviewed ? 1 : 0,
          id
        );
        if (body.reviewed) {
          db.prepare(
            "update cards set status = 'reviewed' where id = ? and status != 'published'"
          ).run(existing.card_id);
          if (typeof body.title === "string" && body.title.trim()) {
            db.prepare("update cards set slug = ? where id = ?").run(
              uniqueSlug(body.title, existing.card_id),
              existing.card_id
            );
          }
        }
      }
      const row = db.prepare("select * from extractions where id = ?").get(id);
      return {
        extraction: mapExtraction(row as Parameters<typeof mapExtraction>[0]),
        source: "local",
      };
    }
  } catch {
    // fall through to Supabase
  }

  if (!supabaseConfigured()) return null;
  const supabase = getSupabaseAdmin();
  const { data: existing, error: findErr } = await supabase
    .from("extractions")
    .select("id, card_id")
    .eq("id", id)
    .maybeSingle();
  if (findErr) throw new Error(findErr.message);
  if (!existing) return null;

  const patch: Record<string, unknown> = {};
  for (const field of EDITABLE_EXTRACTION) {
    if (field in body) patch[field] = (body[field] as string | null) ?? null;
  }
  if ("ink_colors" in body) patch.ink_colors = body.ink_colors ?? null;
  if ("recipe_structured" in body) patch.recipe_structured = body.recipe_structured ?? null;
  if ("ingredients" in body) patch.ingredients = body.ingredients ?? null;
  if ("reviewed" in body) patch.reviewed = !!body.reviewed;

  const { data, error } = await supabase
    .from("extractions")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  if (body.reviewed) {
    await supabase
      .from("cards")
      .update({ status: "reviewed" })
      .eq("id", existing.card_id)
      .neq("status", "published");
    if (typeof body.title === "string" && body.title.trim()) {
      const slug = await uniqueSlugSupabase(body.title, existing.card_id);
      await supabase.from("cards").update({ slug }).eq("id", existing.card_id);
    }
  }

  return {
    extraction: mapSupabaseExtraction(data as Record<string, unknown>),
    source: "supabase",
  };
}

export async function createBlankExtraction(
  cardId: string
): Promise<{ extraction: Extraction; source: DataSource } | null> {
  try {
    const db = getDb();
    const card = db.prepare("select id, status from cards where id = ?").get(cardId) as
      | { id: string; status: string }
      | undefined;
    if (card) {
      const extractionId = randomUUID();
      db.prepare(
        "insert into extractions (id, card_id, model, reviewed) values (?, ?, 'manual', 0)"
      ).run(extractionId, cardId);
      if (card.status === "cropped") {
        db.prepare("update cards set status = 'extracted' where id = ?").run(cardId);
      }
      const row = db.prepare("select * from extractions where id = ?").get(extractionId);
      return {
        extraction: mapExtraction(row as Parameters<typeof mapExtraction>[0]),
        source: "local",
      };
    }
  } catch {
    // fall through
  }

  if (!supabaseConfigured()) return null;
  const supabase = getSupabaseAdmin();
  const { data: card, error: cardErr } = await supabase
    .from("cards")
    .select("id, status")
    .eq("id", cardId)
    .maybeSingle();
  if (cardErr) throw new Error(cardErr.message);
  if (!card) return null;

  const { data, error } = await supabase
    .from("extractions")
    .insert({ card_id: cardId, model: "manual", reviewed: false })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  if (card.status === "cropped") {
    await supabase.from("cards").update({ status: "extracted" }).eq("id", cardId);
  }

  return {
    extraction: mapSupabaseExtraction(data as Record<string, unknown>),
    source: "supabase",
  };
}

export async function listCollectionsAdmin(): Promise<Collection[]> {
  if (supabaseConfigured()) {
    try {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from("collections")
        .select("*")
        .order("name");
      if (error) throw new Error(error.message);
      return (data ?? []) as Collection[];
    } catch (e) {
      console.error("collections: supabase read failed, falling back to local:", e);
    }
  }
  try {
    const { listCollections } = await import("@/lib/db");
    return listCollections();
  } catch {
    return [];
  }
}
