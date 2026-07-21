// One-off: fix the collection name typo "Phebe Butler" -> "Phoebe Butler",
// locally (SQLite) and in Supabase. The collection is referenced by id
// everywhere, so only the display name changes.
// Run with: node scripts/rename-phoebe-collection.mjs
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { createClient } from "@supabase/supabase-js";

const PHOEBE_COLLECTION_ID = "43c11c93-4a1b-4423-993b-621ad8630527";
const NEW_NAME = "Phoebe Butler";

const root = process.cwd();
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

// ---- local SQLite ----
const dbPath = path.join(root, "data", "archive.db");
if (fs.existsSync(dbPath)) {
  const db = new Database(dbPath);
  const res = db
    .prepare("update collections set name = ? where id = ?")
    .run(NEW_NAME, PHOEBE_COLLECTION_ID);
  console.log(`local: renamed ${res.changes} collection -> ${NEW_NAME}`);
} else {
  console.log("local: data/archive.db not found, skipping");
}

// ---- Supabase ----
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
const { data, error } = await supabase
  .from("collections")
  .update({ name: NEW_NAME })
  .eq("id", PHOEBE_COLLECTION_ID)
  .select("id, name");
if (error) throw new Error(`collections rename failed: ${error.message}`);
console.log(`supabase: ${JSON.stringify(data)}`);
