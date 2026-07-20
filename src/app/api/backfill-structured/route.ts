import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "@/lib/db";
import { ingredientTags } from "@/lib/recipe";
import { RECIPE_STRUCTURED_SCHEMA, RECIPE_STRUCTURED_RULES } from "@/lib/recipeSchema";
import type { RecipeStructured } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

/**
 * Backfill recipe_structured for extractions that already have a
 * human-reviewed recipe_markdown, without re-reading the card images.
 * The reviewed markdown is the source of truth, so the row is updated in
 * place and stays reviewed — no second review pass needed.
 *
 * POST { batch_size?: number, dry_run?: boolean }
 * Processes up to batch_size rows per call; call repeatedly until
 * remaining is 0. Returns token usage so cost can be tracked.
 */

const STRUCTURE_TOOL: Anthropic.Tool = {
  name: "record_structured_recipe",
  description: "Record the machine-readable version of one recipe.",
  input_schema: {
    type: "object",
    properties: { recipe_structured: RECIPE_STRUCTURED_SCHEMA },
    required: ["recipe_structured"],
  },
};

const SYSTEM_PROMPT = `You convert one mid-20th-century American family recipe into machine-readable data. You get the human-reviewed modernized markdown (the source of truth for content) plus the verbatim card transcription for context on anything ambiguous.

Rules:
- ${RECIPE_STRUCTURED_RULES.split("\n").join("\n- ")}
- The markdown is already reviewed: follow its ingredient lines and steps exactly; do not add, drop, or reorder content. Only parse it.
- If the text holds no actual recipe, return recipe_structured: null.
- Use the record_structured_recipe tool for your answer.`;

interface PendingRow {
  id: string;
  title: string | null;
  recipe_markdown: string;
  transcription_front: string | null;
  transcription_back: string | null;
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server." },
      { status: 500 }
    );
  }

  const { batch_size = 8, dry_run = false } = (await req
    .json()
    .catch(() => ({}))) as { batch_size?: number; dry_run?: boolean };

  const db = getDb();
  // Only the latest extraction per card matters — older rows never sync.
  const pendingQuery = `
    select e.id, e.title, e.recipe_markdown, e.transcription_front, e.transcription_back
    from extractions e
    where e.recipe_structured is null
      and e.recipe_markdown is not null
      and e.reviewed = 1
      and e.created_at = (
        select max(e2.created_at) from extractions e2 where e2.card_id = e.card_id
      )
    order by e.created_at`;
  const allPending = db.prepare(pendingQuery).all() as PendingRow[];
  if (dry_run) {
    return NextResponse.json({ processed: 0, remaining: allPending.length, errors: [] });
  }
  const batch = allPending.slice(0, batch_size);

  const anthropic = new Anthropic();
  const update = db.prepare(
    "update extractions set recipe_structured = ?, ingredients = coalesce(?, ingredients) where id = ?"
  );
  const errors: string[] = [];
  let processed = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  const one = async (row: PendingRow) => {
    const parts = [
      `Reviewed modernized recipe (markdown):\n\n${row.recipe_markdown}`,
      row.transcription_front && `Verbatim transcription, front of card:\n\n${row.transcription_front}`,
      row.transcription_back && `Verbatim transcription, back of card:\n\n${row.transcription_back}`,
    ].filter(Boolean) as string[];

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [STRUCTURE_TOOL],
      tool_choice: { type: "tool", name: "record_structured_recipe" },
      messages: [{ role: "user", content: parts.join("\n\n---\n\n") }],
    });
    inputTokens += response.usage.input_tokens;
    outputTokens += response.usage.output_tokens;

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    if (!toolUse) throw new Error("model returned no structured output");
    let structured = (toolUse.input as { recipe_structured: RecipeStructured | null })
      .recipe_structured;
    if (!structured) {
      // Not actually a recipe (garden notes, addresses…): store an empty
      // structure so the row isn't retried on every pass.
      structured = {
        ingredients: [],
        steps: [],
        prep_minutes: null,
        total_minutes: null,
        yield: null,
      };
    }

    const tags = ingredientTags(structured);
    update.run(JSON.stringify(structured), tags ? JSON.stringify(tags) : null, row.id);
    processed++;
  };

  const CONCURRENCY = 2;
  for (let i = 0; i < batch.length; i += CONCURRENCY) {
    const chunk = batch.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(chunk.map(one));
    results.forEach((r, j) => {
      if (r.status === "rejected") {
        const title = chunk[j].title ?? chunk[j].id.slice(0, 8);
        errors.push(`${title}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
      }
    });
  }

  return NextResponse.json({
    processed,
    remaining: allPending.length - batch.length + (batch.length - processed),
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    errors,
  });
}
