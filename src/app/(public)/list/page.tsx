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
/** Strip markdown syntax and truncate — just enough recipe to peek out of a focused card. */
function mdTeaser(md: string | null, title: string): string | null {
  if (!md) return null;
  let text = md
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*?|__?/g, "")
    .replace(/^\s*[-*+]\s+/gm, "· ")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
  // The markdown usually opens with the recipe's title — the card already shows it.
  const firstBreak = text.indexOf("\n");
  if (firstBreak !== -1 && text.slice(0, firstBreak).trim().toLowerCase() === title.trim().toLowerCase()) {
    text = text.slice(firstBreak + 1).trim();
  }
  return text.slice(0, 360) || null;
}

export default async function IndexPage() {
  const recipes = await getPublishedRecipes();

  // Slim payload for the client — no transcriptions or image URLs needed here.
  const entries = recipes.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    category: r.category,
    attribution: r.attribution,
    ingredients: r.ingredients,
    teaser: mdTeaser(r.recipe_markdown, r.title),
  }));

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-900">
      <IndexBrowser entries={entries} />
    </div>
  );
}
