import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { getRecipeBySlug } from "@/lib/publicData";
import AutoPrint from "@/components/AutoPrint";
import StructuredRecipe from "@/components/StructuredRecipe";
import { hasStructuredContent } from "@/lib/recipe";

export const revalidate = 120;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getRecipeBySlug(slug);
  if (!data) return { title: "Feasley's Recipes" };
  return { title: `${data.recipe.title} — printable card` };
}

/** A clean, white, print-ready view of one recipe: title, card images, recipe. */
export default async function PrintPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getRecipeBySlug(slug);
  if (!data) notFound();
  const { recipe } = data;

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <AutoPrint />

      <main className="mx-auto max-w-[46rem] px-8 py-12 print:max-w-none print:px-0 print:py-0">
        <header className="border-b border-zinc-300 pb-5">
          <h1 className="font-serif text-3xl">{recipe.title}</h1>
          <p className="mt-2 text-xs uppercase tracking-[0.25em] text-zinc-500">
            {recipe.category && <span>{recipe.category}</span>}
            {recipe.category && recipe.attribution && <span> · </span>}
            {recipe.attribution && (
              <span className="normal-case italic tracking-normal">
                from the kitchen of {recipe.attribution}
              </span>
            )}
          </p>
        </header>

        {/* the card itself */}
        <section
          className={`mt-8 grid gap-6 ${recipe.back_image ? "grid-cols-2" : "grid-cols-1"}`}
          style={{ breakInside: "avoid" }}
        >
          <figure style={{ breakInside: "avoid" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={recipe.front_image}
              alt={`${recipe.title} — front of the card`}
              className="w-full rounded border border-zinc-200"
            />
            {recipe.back_image && (
              <figcaption className="mt-2 text-center text-[10px] uppercase tracking-[0.2em] text-zinc-400">
                front
              </figcaption>
            )}
          </figure>
          {recipe.back_image && (
            <figure style={{ breakInside: "avoid" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={recipe.back_image}
                alt={`${recipe.title} — back of the card`}
                className="w-full rounded border border-zinc-200"
              />
              <figcaption className="mt-2 text-center text-[10px] uppercase tracking-[0.2em] text-zinc-400">
                back
              </figcaption>
            </figure>
          )}
        </section>

        {/* the recipe, cleaned up */}
        {(hasStructuredContent(recipe.recipe_structured) || recipe.recipe_markdown) && (
          <section className="recipe-print mt-8 text-[13px] leading-relaxed">
            {hasStructuredContent(recipe.recipe_structured) ? (
              <StructuredRecipe recipe={recipe.recipe_structured} />
            ) : (
              <ReactMarkdown>{recipe.recipe_markdown!}</ReactMarkdown>
            )}
          </section>
        )}

        <footer className="mt-10 border-t border-zinc-300 pt-3 text-[10px] uppercase tracking-[0.25em] text-zinc-400">
          Feasley&apos;s Recipes
        </footer>
      </main>
    </div>
  );
}
