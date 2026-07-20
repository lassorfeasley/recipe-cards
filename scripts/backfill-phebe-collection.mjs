// One-off: attribute every existing card (and batch) to Phebe Butler's
// collection, locally and in Supabase, and fix the collection name spelling
// ("Phobe" -> "Phebe"). Run with: node scripts/backfill-phebe-collection.mjs
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { createClient } from "@supabase/supabase-js";

const PHOBE_COLLECTION_ID = "43c11c93-4a1b-4423-993b-621ad8630527";
const COLLECTION_NAME = "Phebe Butler";

const root = process.cwd();
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

// ---- local SQLite ----
const db = new Database(path.join(root, "data", "archive.db"));
db.prepare("update collections set name = ? where id = ?").run(
  COLLECTION_NAME,
  PHOBE_COLLECTION_ID
);
const cards = db
  .prepare("update cards set collection_id = ?")
  .run(PHOBE_COLLECTION_ID);
const batches = db
  .prepare("update batches set collection_id = ?")
  .run(PHOBE_COLLECTION_ID);
console.log(`local: ${cards.changes} cards, ${batches.changes} batches -> ${COLLECTION_NAME}`);

// ---- Supabase ----
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

{
  const { error } = await supabase
    .from("collections")
    .update({ name: COLLECTION_NAME })
    .eq("id", PHOBE_COLLECTION_ID);
  if (error) throw new Error(`collections rename failed: ${error.message}`);
}

{
  const { data, error } = await supabase
    .from("cards")
    .update({ collection_id: PHOBE_COLLECTION_ID })
    .not("id", "is", null)
    .select("id");
  if (error) throw new Error(`cards update failed: ${error.message}`);
  console.log(`supabase: ${data.length} cards -> ${COLLECTION_NAME}`);
}
