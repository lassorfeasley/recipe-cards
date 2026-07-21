// One-off: fix recipe titles stored in ALL CAPS (e.g. "12-14 ENGLISH MUFFINS")
// by converting only those to Title Case. Titles that already contain any
// lowercase letter are left untouched, so properly-cased titles and proper
// nouns are never downgraded. Applied to extractions.title locally (SQLite)
// and in Supabase.
//
// Dry run (default, no writes):  node scripts/fix-allcaps-titles.mjs
// Apply changes:                 node scripts/fix-allcaps-titles.mjs --apply
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

const root = process.cwd();
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

/** True when the title has uppercase letters but no lowercase — i.e. all caps. */
function isAllCaps(title) {
  return /[A-Z]/.test(title) && !/[a-z]/.test(title);
}

/** Capitalize the first letter of each word, lowercase the rest. */
function toTitleCase(title) {
  return title
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

// ---- local SQLite ----
const db = new Database(path.join(root, "data", "archive.db"));
const rows = db
  .prepare("select id, title from extractions where title is not null and title != ''")
  .all();

const changes = [];
for (const { id, title } of rows) {
  if (!isAllCaps(title)) continue;
  const next = toTitleCase(title);
  if (next !== title) changes.push({ id, from: title, to: next });
}

console.log(`${rows.length} titles scanned, ${changes.length} all-caps titles to fix:\n`);
for (const c of changes) {
  console.log(`  "${c.from}"\n    -> "${c.to}"`);
}

if (!APPLY) {
  console.log(`\nDry run only. Re-run with --apply to write these changes.`);
  process.exit(0);
}

// ---- apply: local SQLite ----
const update = db.prepare("update extractions set title = ? where id = ?");
const applyLocal = db.transaction((items) => {
  for (const c of items) update.run(c.to, c.id);
});
applyLocal(changes);
console.log(`\nlocal: updated ${changes.length} extractions`);

// ---- apply: Supabase ----
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

let supabaseCount = 0;
for (const c of changes) {
  const { error } = await supabase
    .from("extractions")
    .update({ title: c.to })
    .eq("id", c.id);
  if (error) throw new Error(`supabase title update failed for ${c.id}: ${error.message}`);
  supabaseCount++;
}
console.log(`supabase: updated ${supabaseCount} extractions`);
