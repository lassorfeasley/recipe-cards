import type { RecipeStructured } from "@/lib/types";
import { bySection, formatMinutes } from "@/lib/recipe";

/**
 * Renders the machine-readable recipe with the same h2/ul/ol structure the
 * markdown version produced, so the existing .recipe-preview / .recipe-print
 * styles apply as-is.
 */
export default function StructuredRecipe({ recipe }: { recipe: RecipeStructured }) {
  const ingredientGroups = bySection(recipe.ingredients);
  const stepGroups = bySection(recipe.steps);
  const meta = [
    recipe.prep_minutes != null && `${formatMinutes(recipe.prep_minutes)} active`,
    recipe.total_minutes != null && `${formatMinutes(recipe.total_minutes)} total`,
    recipe.yield,
  ].filter(Boolean) as string[];

  // Steps number continuously across sections, like the markdown version did.
  const stepStarts: number[] = [];
  for (let i = 0, start = 1; i < stepGroups.length; i++) {
    stepStarts.push(start);
    start += stepGroups[i].items.length;
  }

  return (
    <div>
      {meta.length > 0 && (
        <p className="!mt-0 text-[0.8em] uppercase tracking-[0.15em] opacity-60">
          {meta.join(" · ")}
          {(recipe.prep_minutes != null || recipe.total_minutes != null) && (
            <span className="normal-case tracking-normal"> (times estimated)</span>
          )}
        </p>
      )}

      {recipe.ingredients.length > 0 && <h2>Ingredients</h2>}
      {ingredientGroups.map((group, gi) => (
        <div key={gi}>
          {group.section && <h3>{group.section}</h3>}
          <ul>
            {group.items.map((ing, i) => (
              <li key={i}>{ing.raw}</li>
            ))}
          </ul>
        </div>
      ))}

      {recipe.steps.length > 0 && <h2>Steps</h2>}
      {stepGroups.map((group, gi) => (
        <div key={gi}>
          {group.section && <h3>{group.section}</h3>}
          <ol start={stepStarts[gi]}>
            {group.items.map((step, i) => (
              <li key={i}>{step.text}</li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
