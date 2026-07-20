import ShowcaseWall, { type WallRecipe } from "@/components/ShowcaseWall";
import { getPublishedRecipes } from "@/lib/publicData";

export const revalidate = 120;

export const metadata = {
  title: { absolute: "Grandma's Recipe Cards" },
  description: "A family archive of handwritten recipe cards.",
};

const normalizeTitle = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * The deck arrives sorted alphabetically, so genuinely duplicated recipes
 * (e.g. two "Baked Pineapple" cards, three "Cream Cheese Frosting") land right
 * next to each other — the "birthday effect." The wall tiles this one deck 2×2
 * and every copy must stay identical for the loop to be seamless, so we can't
 * shuffle copies independently; instead we fix the single ordering here.
 *
 * We keep the first card of each title in its alphabetical spot and relocate
 * every additional match to roughly the opposite side of the deck. A pair ends
 * up ~half a deck apart, a triple fans out to thirds — hundreds of positions,
 * which is dozens of rows at any column count, so matching cards are never
 * within two cells of each other (including across the toroidal wrap seams).
 */
function spaceOutDuplicates(cards: WallRecipe[]): WallRecipe[] {
  const seen = new Set<string>();
  const primary: WallRecipe[] = [];
  const extras: WallRecipe[] = [];
  for (const card of cards) {
    const key = normalizeTitle(card.title);
    if (seen.has(key)) extras.push(card);
    else {
      seen.add(key);
      primary.push(card);
    }
  }
  if (extras.length === 0) return cards;

  const result = [...primary];
  const placed = new Map<string, number>();
  for (const extra of extras) {
    const key = normalizeTitle(extra.title);
    const twin = result.findIndex((c) => normalizeTitle(c.title) === key);
    const n = (placed.get(key) ?? 0) + 1;
    placed.set(key, n);
    // Fan successive matches of the same title to n/(n+1) of the deck away.
    const offset = Math.round((result.length * n) / (n + 1));
    const pos = (twin + offset) % (result.length + 1);
    result.splice(pos, 0, extra);
  }
  return result;
}

/** Showcase mode: a fullscreen, endlessly panning wall of card fronts. */
export default async function ShowcasePage() {
  const recipes = await getPublishedRecipes();
  const wall = spaceOutDuplicates(
    recipes.map(({ id, slug, title, thumb, back_thumb }) => ({
      id,
      slug,
      title,
      thumb,
      backThumb: back_thumb,
    }))
  );

  return <ShowcaseWall recipes={wall} />;
}
