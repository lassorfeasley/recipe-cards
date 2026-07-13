import Link from "next/link";
import { notFound } from "next/navigation";
import { getRecipeBySlug } from "@/lib/publicData";
import RecipeView from "@/components/RecipeView";

export const revalidate = 120;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getRecipeBySlug(slug);
  if (!data) return { title: "Grandma's Recipe Cards" };
  return {
    title: `${data.recipe.title} — Grandma's Recipe Cards`,
    description: `A handwritten family recipe card: ${data.recipe.title}`,
    openGraph: { images: [data.recipe.front_image] },
  };
}

export default async function RecipePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getRecipeBySlug(slug);
  if (!data) notFound();
  const { recipe, prev, next } = data;

  return (
    <main className="px-4 pb-24 pt-16 sm:px-6">
      <RecipeView
        recipe={recipe}
        header={
          <header className="mb-10 text-center lg:mb-0 lg:text-left">
            <h1 className="font-serif text-3xl text-amber-50 sm:text-4xl">{recipe.title}</h1>
            <p className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs uppercase tracking-[0.25em] text-zinc-500 lg:justify-start">
              {recipe.category && <span>{recipe.category}</span>}
              {recipe.attribution && (
                <span className="normal-case italic tracking-normal text-zinc-400">
                  from the kitchen of {recipe.attribution}
                </span>
              )}
            </p>
            {recipe.ingredients && recipe.ingredients.length > 0 && (
              <p className="mx-auto mt-4 max-w-xl text-xs leading-relaxed text-zinc-600 lg:mx-0">
                {recipe.ingredients.join(" · ")}
              </p>
            )}
          </header>
        }
      />

      {/* prev / next */}
      <nav className="mx-auto mt-16 flex max-w-3xl items-center justify-between gap-4 text-sm">
        {prev ? (
          <Link
            href={`/card/${prev.slug}`}
            className="max-w-[45%] truncate text-zinc-500 hover:text-amber-100"
            title={prev.title}
          >
            ← {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            href={`/card/${next.slug}`}
            className="max-w-[45%] truncate text-right text-zinc-500 hover:text-amber-100"
            title={next.title}
          >
            {next.title} →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </main>
  );
}
