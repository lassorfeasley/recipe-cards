import type { RecipeStructured } from "./types";

/**
 * A structured recipe worth rendering. Cards that hold no real recipe
 * (garden notes, addresses) get an empty structure so backfills don't retry
 * them — those should fall back to markdown/transcription in the UI.
 */
export function hasStructuredContent(
  structured: RecipeStructured | null | undefined
): structured is RecipeStructured {
  return !!structured && (structured.ingredients.length > 0 || structured.steps.length > 0);
}

/** Ingredient tags for search/filtering, derived from the structured items. */
export function ingredientTags(
  structured: RecipeStructured | null | undefined
): string[] | null {
  // Guard `?.` because model output can omit the array despite the schema.
  if (!structured?.ingredients?.length) return null;
  const tags = [...new Set(structured.ingredients.map((i) => i.item.trim().toLowerCase()))];
  const nonEmpty = tags.filter(Boolean);
  return nonEmpty.length > 0 ? nonEmpty : null;
}

/** 90 -> "1 hr 30 min", 45 -> "45 min". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/** Minutes -> ISO 8601 duration for schema.org, e.g. 90 -> "PT90M". */
export function toIsoDuration(minutes: number): string {
  return `PT${minutes}M`;
}

/** Group items by section, preserving order; null-section items come as one leading group. */
export function bySection<T extends { section: string | null }>(
  items: T[]
): Array<{ section: string | null; items: T[] }> {
  const groups: Array<{ section: string | null; items: T[] }> = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.section === item.section) last.items.push(item);
    else groups.push({ section: item.section, items: [item] });
  }
  return groups;
}
