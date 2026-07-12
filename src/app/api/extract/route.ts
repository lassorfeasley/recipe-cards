import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { getDb, mapCard, mapExtraction } from "@/lib/db";
import { readStoredFile } from "@/lib/storage";
import { uniqueSlug } from "@/lib/slug";
import { randomUUID } from "crypto";
import { CATEGORIES, WRITING_MEDIUMS, BACK_RELATIONSHIPS, CONFIDENCES } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
const MAX_EDGE = 1568; // Claude vision sweet spot

const EXTRACTION_TOOL: Anthropic.Tool = {
  name: "record_extraction",
  description: "Record the structured metadata and transcription for one recipe card.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: ["string", "null"], description: "Recipe title as written on the card" },
      category: { type: ["string", "null"], enum: [...CATEGORIES, null] },
      writing_medium: { type: ["string", "null"], enum: [...WRITING_MEDIUMS, null] },
      ink_colors: {
        type: ["array", "null"],
        items: { type: "string" },
        description: "Ink colors present, e.g. ['blue','black']",
      },
      card_design: {
        type: ["string", "null"],
        description:
          "Short description of the physical card: 'plain ruled', 'decorative \"From My Kitchen\" strawberry basket', etc.",
      },
      attribution: {
        type: ["string", "null"],
        description: "Person credited, often printed as 'From the kitchen of ___'",
      },
      back_relationship: { type: ["string", "null"], enum: [...BACK_RELATIONSHIPS, null] },
      transcription_front: { type: ["string", "null"] },
      transcription_back: { type: ["string", "null"] },
      ingredients: {
        type: ["array", "null"],
        items: { type: "string" },
        description:
          "Every ingredient mentioned in the recipe, as short lowercase singular tags with no quantities, e.g. ['flour','butter','raisin','nutmeg']",
      },
      recipe_markdown: {
        type: ["string", "null"],
        description:
          "The recipe rewritten in clean plain modern language as markdown: a bulleted ingredient list with modernized quantities, then numbered steps. Null if the card holds no recipe.",
      },
      ai_notes: {
        type: ["string", "null"],
        description: "Stains, illegible sections, dates, marginalia worth flagging",
      },
      confidence: { type: "string", enum: [...CONFIDENCES] },
    },
    required: ["confidence"],
  },
};

const SYSTEM_PROMPT = `You are transcribing mid-20th-century American family recipe cards, handwritten or typed by the user's great-grandmother and her circle. You will be shown the FRONT of a card and, when available, its BACK.

Rules:
- Transcribe faithfully and verbatim. Keep period abbreviations exactly as written (1 c., 2 T., tsp, oleo, oven 350°). Do NOT modernize, correct spelling, or expand abbreviations.
- Preserve line breaks exactly as they appear on the card.
- Use [illegible] for words you cannot read, [illegible: guess?] when you have a plausible guess.
- Distinguish pre-printed card text (e.g. "From My Kitchen", "Recipe", ruled headers, decorative art) from handwriting. Describe printed design in card_design, put printed attribution lines in attribution, and do NOT include pre-printed boilerplate in the transcription.
- If the back continues the front recipe, set back_relationship to "continuation". If it is a different recipe, use "separate-recipe". If empty, "blank" (transcription_back null). If it holds notes/doodles, "notes".
- Flag stains, tape, dates, pinholes, margin notes, or anything historically interesting in ai_notes.
- ingredients: list every ingredient the recipe calls for as short lowercase tags without quantities ("flour", "brown sugar", "raisin"). Use common modern names (oleo -> "margarine") so tags are consistent across cards.
- recipe_markdown: separately from the verbatim transcription, rewrite the recipe in clean modern plain language as markdown. Start with "## Ingredients" as a bulleted list (spell out abbreviations: "1 c." -> "1 cup", "2 T." -> "2 tablespoons"), then "## Steps" as a numbered list of clear instructions in logical order, combining front and back when the back continues the recipe. Include oven temperatures, times, and yields where given. Do not invent quantities or steps that are not on the card; where something is illegible or missing, note it in italics.
- Use the record_extraction tool for your answer.`;

async function prepareImage(storagePath: string): Promise<string> {
  const buf = await readStoredFile(storagePath);
  const resized = await sharp(buf)
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
  return resized.toString("base64");
}

interface ExtractionResult {
  title?: string | null;
  category?: string | null;
  writing_medium?: string | null;
  ink_colors?: string[] | null;
  card_design?: string | null;
  attribution?: string | null;
  back_relationship?: string | null;
  transcription_front?: string | null;
  transcription_back?: string | null;
  ingredients?: string[] | null;
  recipe_markdown?: string | null;
  ai_notes?: string | null;
  confidence?: string;
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server." },
      { status: 500 }
    );
  }

  const { card_id, force } = (await req.json()) as { card_id: string; force?: boolean };
  const db = getDb();
  const cardRow = db.prepare("select * from cards where id = ?").get(card_id);
  if (!cardRow) return NextResponse.json({ error: "card not found" }, { status: 404 });
  const card = mapCard(cardRow as Parameters<typeof mapCard>[0]);

  if (!card.front_image) {
    return NextResponse.json({ error: "card has no exported front image" }, { status: 400 });
  }

  // Never silently clobber a human-reviewed extraction.
  const latest = db
    .prepare("select * from extractions where card_id = ? order by created_at desc limit 1")
    .get(card_id) as { reviewed: number } | undefined;
  if (latest?.reviewed && !force) {
    return NextResponse.json(
      { error: "reviewed", message: "Latest extraction is human-reviewed. Pass force to re-run." },
      { status: 409 }
    );
  }

  const content: Anthropic.MessageParam["content"] = [
    { type: "text", text: "FRONT of the card:" },
    {
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: await prepareImage(card.front_image) },
    },
  ];
  if (card.back_image) {
    content.push(
      { type: "text", text: "BACK of the card:" },
      {
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: await prepareImage(card.back_image) },
      }
    );
  } else {
    content.push({ type: "text", text: "No back image available; treat the back as unknown." });
  }

  const anthropic = new Anthropic();
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: "tool", name: "record_extraction" },
    messages: [{ role: "user", content }],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
  );
  if (!toolUse) {
    return NextResponse.json({ error: "model returned no structured output" }, { status: 502 });
  }
  const data = toolUse.input as ExtractionResult;

  const extractionId = randomUUID();
  db.prepare(
    `insert into extractions (
       id, card_id, title, category, writing_medium, ink_colors, card_design,
       attribution, back_relationship, transcription_front, transcription_back,
       ingredients, recipe_markdown, ai_notes, confidence, model, raw_response, reviewed
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
  ).run(
    extractionId,
    card_id,
    data.title ?? null,
    data.category ?? null,
    data.writing_medium ?? null,
    data.ink_colors ? JSON.stringify(data.ink_colors) : null,
    data.card_design ?? null,
    data.attribution ?? null,
    data.back_relationship ?? null,
    data.transcription_front ?? null,
    data.transcription_back ?? null,
    data.ingredients ? JSON.stringify(data.ingredients) : null,
    data.recipe_markdown ?? null,
    data.ai_notes ?? null,
    data.confidence ?? null,
    MODEL,
    JSON.stringify(response)
  );

  const slug = data.title ? uniqueSlug(data.title, card_id) : card.slug;
  db.prepare("update cards set status = 'extracted', slug = ? where id = ?").run(
    slug ?? null,
    card_id
  );

  const row = db.prepare("select * from extractions where id = ?").get(extractionId);
  return NextResponse.json({
    extraction: mapExtraction(row as Parameters<typeof mapExtraction>[0]),
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  });
}
