import { getDb } from "./db";

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "untitled";
}

/** Generate a slug unique across cards, deduping with -2, -3, ... suffixes. */
export function uniqueSlug(title: string, cardId: string): string {
  const db = getDb();
  const base = slugify(title);
  let candidate = base;
  let n = 2;
  const taken = db.prepare("select id from cards where slug = ? and id != ?");
  while (taken.get(candidate, cardId)) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}
