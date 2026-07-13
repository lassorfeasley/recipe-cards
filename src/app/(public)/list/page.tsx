import { getPublishedRecipes } from "@/lib/publicData";
import IndexBrowser from "@/components/IndexBrowser";

export const revalidate = 120;

export const metadata = {
  title: "Recipe Index — Grandma's Recipe Cards",
};

/**
 * Utilitarian mode: a searchable, filterable alphabetical index. Search and
 * filters live in a narrow left column on the grey background; the white
 * cards stack in the wider right column.
 */
export default async function IndexPage() {
  const recipes = await getPublishedRecipes();

  // Slim payload for the client — no transcriptions or image URLs needed
  // here. Attribution and ingredients are kept for search only; the cards
  // themselves render as blank ruled index cards.
  const entries = recipes.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    category: r.category,
    attribution: r.attribution,
    ingredients: r.ingredients,
  }));

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-900">
      <IndexBrowser entries={entries} />
    </div>
  );
}
