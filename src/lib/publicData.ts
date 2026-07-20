import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RecipeStructured } from "./types";

/**
 * Data access for the public site. Uses the ANON key, so Supabase RLS is the
 * gatekeeper: only published cards and their reviewed extractions come back —
 * exactly what visitors are allowed to see.
 */

let anon: SupabaseClient | null = null;

function getSupabaseAnon(): SupabaseClient {
  if (anon) return anon;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Public site needs NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }
  anon = createClient(url, key, { auth: { persistSession: false } });
  return anon;
}

export interface PublicRecipe {
  id: string;
  slug: string;
  title: string;
  category: string | null;
  attribution: string | null;
  /** Name of the physical recipe box the card came from, e.g. "Adeline Feasley". */
  collection: string | null;
  ingredients: string[] | null;
  recipe_markdown: string | null;
  recipe_structured: RecipeStructured | null;
  transcription_front: string | null;
  transcription_back: string | null;
  back_relationship: string | null;
  card_design: string | null;
  front_image: string;
  back_image: string | null;
  thumb: string;
  back_thumb: string | null;
}

/** All published recipes with reviewed metadata, alphabetical by title. */
export async function getPublishedRecipes(): Promise<PublicRecipe[]> {
  const supabase = getSupabaseAnon();
  const publicUrl = (key: string) =>
    supabase.storage.from("cards").getPublicUrl(key).data.publicUrl;

  const [cardsRes, extractionsRes, collectionsRes] = await Promise.all([
    supabase.from("cards").select("*").not("slug", "is", null).not("front_image", "is", null),
    supabase.from("extractions").select("*").order("created_at", { ascending: false }),
    supabase.from("collections").select("id, name"),
  ]);
  if (cardsRes.error) throw new Error(cardsRes.error.message);
  if (extractionsRes.error) throw new Error(extractionsRes.error.message);
  if (collectionsRes.error) throw new Error(collectionsRes.error.message);

  const collectionName = new Map(
    (collectionsRes.data as Array<{ id: string; name: string }>).map((c) => [c.id, c.name])
  );

  // Newest-first, so the first extraction per card wins (RLS already filtered to reviewed).
  const latest = new Map<string, Record<string, unknown>>();
  for (const e of extractionsRes.data as Array<Record<string, unknown>>) {
    const cardId = e.card_id as string;
    if (!latest.has(cardId)) latest.set(cardId, e);
  }

  const recipes: PublicRecipe[] = [];
  for (const c of cardsRes.data as Array<Record<string, unknown>>) {
    const e = latest.get(c.id as string);
    if (!e) continue; // no reviewed extraction — nothing to show
    recipes.push({
      id: c.id as string,
      slug: c.slug as string,
      title: (e.title as string | null) ?? (c.slug as string),
      category: e.category as string | null,
      attribution: e.attribution as string | null,
      collection: c.collection_id
        ? (collectionName.get(c.collection_id as string) ?? null)
        : null,
      ingredients: e.ingredients as string[] | null,
      recipe_markdown: e.recipe_markdown as string | null,
      recipe_structured: (e.recipe_structured as RecipeStructured | undefined) ?? null,
      transcription_front: e.transcription_front as string | null,
      transcription_back: e.transcription_back as string | null,
      back_relationship: e.back_relationship as string | null,
      card_design: e.card_design as string | null,
      front_image: publicUrl(c.front_image as string),
      back_image: c.back_image ? publicUrl(c.back_image as string) : null,
      thumb: publicUrl(`${c.id}/front_thumb.jpg`),
      back_thumb: c.back_image ? publicUrl(`${c.id}/back_thumb.jpg`) : null,
    });
  }
  recipes.sort((a, b) => a.title.localeCompare(b.title));
  return recipes;
}

/** One recipe by slug, with its alphabetical neighbors for prev/next nav. */
export async function getRecipeBySlug(slug: string): Promise<{
  recipe: PublicRecipe;
  prev: PublicRecipe | null;
  next: PublicRecipe | null;
} | null> {
  const all = await getPublishedRecipes();
  const idx = all.findIndex((r) => r.slug === slug);
  if (idx === -1) return null;
  return {
    recipe: all[idx],
    prev: idx > 0 ? all[idx - 1] : null,
    next: idx < all.length - 1 ? all[idx + 1] : null,
  };
}
