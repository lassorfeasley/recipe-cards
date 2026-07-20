import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { Batch, Card, Collection, CropRect, Extraction, RecipeStructured } from "./types";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");

// Fixed IDs so the local seed and the Supabase migration refer to the same
// rows (sync upserts collections by id).
export const ADELINE_COLLECTION_ID = "b541028d-98ff-40d1-9e06-64b673ab9742";
export const PHOBE_COLLECTION_ID = "43c11c93-4a1b-4423-993b-621ad8630527";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(path.join(DATA_DIR, "archive.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    create table if not exists batches (
      id            text primary key,
      batch_number  integer not null unique,
      front_path    text not null,
      back_path     text not null,
      dpi           integer,
      status        text not null default 'uploaded',
      created_at    text not null default (datetime('now'))
    );

    create table if not exists cards (
      id             text primary key,
      batch_id       text not null references batches(id) on delete cascade,
      position       integer not null,
      slug           text unique,
      front_crop     text,
      back_crop      text,
      back_rotate180 integer not null default 0,
      front_image    text,
      back_image     text,
      status         text not null default 'cropped',
      created_at     text not null default (datetime('now')),
      unique (batch_id, position)
    );

    create table if not exists extractions (
      id                  text primary key,
      card_id             text not null references cards(id) on delete cascade,
      title               text,
      category            text,
      writing_medium      text,
      ink_colors          text,
      card_design         text,
      attribution         text,
      back_relationship   text,
      transcription_front text,
      transcription_back  text,
      ingredients         text,
      recipe_markdown     text,
      ai_notes            text,
      confidence          text,
      model               text,
      raw_response        text,
      reviewed            integer not null default 0,
      created_at          text not null default (datetime('now'))
    );

    create table if not exists settings (
      key   text primary key,
      value text not null
    );

    create table if not exists collections (
      id         text primary key,
      name       text not null unique,
      created_at text not null default (datetime('now'))
    );
  `);
  // Seed the two known recipe boxes on first run.
  const collectionCount = db.prepare("select count(*) as n from collections").get() as {
    n: number;
  };
  if (collectionCount.n === 0) {
    const insert = db.prepare("insert into collections (id, name) values (?, ?)");
    insert.run(ADELINE_COLLECTION_ID, "Adeline Feasley");
    insert.run(PHOBE_COLLECTION_ID, "Phebe Butler");
  }
  // Migrations for columns added after the initial schema.
  const cardCols = (db.prepare("pragma table_info(cards)").all() as Array<{ name: string }>).map(
    (c) => c.name
  );
  if (!cardCols.includes("front_rotate180")) {
    db.exec("alter table cards add column front_rotate180 integer not null default 0");
  }
  if (!cardCols.includes("synced_at")) {
    // When this card's exported images were last uploaded to Supabase;
    // null = images need (re-)uploading on the next sync.
    db.exec("alter table cards add column synced_at text");
  }
  if (!cardCols.includes("faces_swapped")) {
    // Card was placed back-up on the scanner: exports use the back scan for
    // front.jpg and vice versa. Local workflow state only (exports bake it in).
    db.exec("alter table cards add column faces_swapped integer not null default 0");
  }
  if (!cardCols.includes("collection_id")) {
    // Whose physical recipe box the card came from. Everything digitized
    // before collections existed is from Adeline Feasley's box.
    db.exec("alter table cards add column collection_id text references collections(id)");
    db.prepare("update cards set collection_id = ?").run(ADELINE_COLLECTION_ID);
  }
  const batchCols = (db.prepare("pragma table_info(batches)").all() as Array<{ name: string }>).map(
    (c) => c.name
  );
  if (!batchCols.includes("collection_id")) {
    // Default collection for cards created from this batch's scans.
    db.exec("alter table batches add column collection_id text references collections(id)");
    db.prepare("update batches set collection_id = ?").run(ADELINE_COLLECTION_ID);
  }
  const extractionCols = (
    db.prepare("pragma table_info(extractions)").all() as Array<{ name: string }>
  ).map((c) => c.name);
  if (!extractionCols.includes("ingredients")) {
    // JSON array of lowercase ingredient tags.
    db.exec("alter table extractions add column ingredients text");
  }
  if (!extractionCols.includes("recipe_markdown")) {
    // Cleaned-up plain-language rewrite of the recipe, as markdown.
    db.exec("alter table extractions add column recipe_markdown text");
  }
  if (!extractionCols.includes("recipe_structured")) {
    // JSON RecipeStructured: parsed ingredients, steps, time estimates.
    db.exec("alter table extractions add column recipe_structured text");
  }
  return db;
}

// ---------- row mappers ----------

interface BatchRow {
  id: string;
  batch_number: number;
  front_path: string;
  back_path: string;
  dpi: number | null;
  status: string;
  collection_id: string | null;
  created_at: string;
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
  collection_id: string | null;
  created_at: string;
  synced_at: string | null;
}

interface ExtractionRow {
  id: string;
  card_id: string;
  title: string | null;
  category: string | null;
  writing_medium: string | null;
  ink_colors: string | null;
  card_design: string | null;
  attribution: string | null;
  back_relationship: string | null;
  transcription_front: string | null;
  transcription_back: string | null;
  ingredients: string | null;
  recipe_markdown: string | null;
  recipe_structured: string | null;
  ai_notes: string | null;
  confidence: string | null;
  model: string | null;
  raw_response: string | null;
  reviewed: number;
  created_at: string;
}

export function mapBatch(row: BatchRow): Batch {
  return { ...row, status: row.status as Batch["status"] };
}

export function mapCard(row: CardRow): Card {
  return {
    ...row,
    front_crop: row.front_crop ? (JSON.parse(row.front_crop) as CropRect) : null,
    back_crop: row.back_crop ? (JSON.parse(row.back_crop) as CropRect) : null,
    front_rotate180: !!row.front_rotate180,
    back_rotate180: !!row.back_rotate180,
    faces_swapped: !!row.faces_swapped,
    status: row.status as Card["status"],
  };
}

export function mapExtraction(row: ExtractionRow): Extraction {
  return {
    ...row,
    ink_colors: row.ink_colors ? (JSON.parse(row.ink_colors) as string[]) : null,
    ingredients: row.ingredients ? (JSON.parse(row.ingredients) as string[]) : null,
    recipe_structured: row.recipe_structured
      ? (JSON.parse(row.recipe_structured) as RecipeStructured)
      : null,
    reviewed: !!row.reviewed,
  };
}

export function listCollections(): Collection[] {
  return getDb()
    .prepare("select * from collections order by name")
    .all() as Collection[];
}

export function getSetting(key: string): string | null {
  const row = getDb().prepare("select value from settings where key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      "insert into settings (key, value) values (?, ?) on conflict(key) do update set value = excluded.value"
    )
    .run(key, value);
}
