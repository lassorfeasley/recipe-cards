import { NextRequest, NextResponse } from "next/server";
import { getDb, mapExtraction } from "@/lib/db";
import { uniqueSlug } from "@/lib/slug";

export const runtime = "nodejs";

const EDITABLE = [
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json()) as Record<string, unknown> & {
    ink_colors?: string[] | null;
    ingredients?: string[] | null;
    recipe_structured?: object | null;
    reviewed?: boolean;
  };
  const db = getDb();
  const existing = db.prepare("select * from extractions where id = ?").get(id) as
    | { card_id: string }
    | undefined;
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  for (const field of EDITABLE) {
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
      body.ingredients && body.ingredients.length ? JSON.stringify(body.ingredients) : null,
      id
    );
  }
  if ("reviewed" in body) {
    db.prepare("update extractions set reviewed = ? where id = ?").run(body.reviewed ? 1 : 0, id);
    if (body.reviewed) {
      // Don't downgrade already-published cards when re-approving edits.
      db.prepare(
        "update cards set status = 'reviewed' where id = ? and status != 'published'"
      ).run(existing.card_id);
      // Keep the slug in sync with any human-edited title.
      if (typeof body.title === "string" && body.title.trim()) {
        db.prepare("update cards set slug = ? where id = ?").run(
          uniqueSlug(body.title, existing.card_id),
          existing.card_id
        );
      }
    }
  }

  const row = db.prepare("select * from extractions where id = ?").get(id);
  return NextResponse.json(mapExtraction(row as Parameters<typeof mapExtraction>[0]));
}
