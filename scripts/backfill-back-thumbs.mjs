// One-off: generate + upload back-face showcase thumbnails ({id}/back_thumb.jpg)
// for every exported card. Run with: node scripts/backfill-back-thumbs.mjs
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const db = new Database(path.join(root, "data", "archive.db"), { readonly: true });
const cards = db
  .prepare(
    "select id, back_image from cards where front_image is not null and back_image is not null"
  )
  .all();
console.log(`${cards.length} cards to process`);

let done = 0;
const errors = [];

async function one(c) {
  const abs = path.join(root, "data", "files", c.back_image);
  const buf = await sharp(abs).resize({ width: 480 }).jpeg({ quality: 78 }).toBuffer();
  const { error } = await supabase.storage
    .from("cards")
    .upload(`${c.id}/back_thumb.jpg`, buf, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`${c.id}: ${error.message}`);
}

const CONCURRENCY = 6;
for (let i = 0; i < cards.length; i += CONCURRENCY) {
  const results = await Promise.allSettled(cards.slice(i, i + CONCURRENCY).map(one));
  for (const r of results) {
    if (r.status === "rejected") errors.push(String(r.reason));
    done++;
  }
  if (done % 30 < CONCURRENCY || done === cards.length) {
    console.log(`progress: ${done}/${cards.length}, errors: ${errors.length}`);
  }
}

console.log(`FINISHED uploaded=${done - errors.length} errors=${errors.length}`);
for (const e of errors.slice(0, 10)) console.error(e);
