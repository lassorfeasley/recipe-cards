/**
 * JSON schema for the machine-readable recipe (RecipeStructured), shared by
 * the image extraction tool and the text-only backfill tool.
 */
export const RECIPE_STRUCTURED_SCHEMA = {
  type: ["object", "null"],
  description:
    "Machine-readable version of the same recipe as recipe_markdown. Null if the card holds no recipe.",
  properties: {
    ingredients: {
      type: "array",
      items: {
        type: "object",
        properties: {
          raw: {
            type: "string",
            description:
              "Modernized display text for this ingredient line, e.g. '2 cups sugar, sifted'",
          },
          item: {
            type: "string",
            description:
              "Short lowercase singular tag using the common modern name (oleo -> 'margarine'), e.g. 'sugar', 'brown sugar', 'raisin'",
          },
          quantity: {
            type: ["string", "null"],
            description:
              "Amount as written on the card, modernized but kept as a string: '2', '1/2', '2-3'. Null when the card gives none.",
          },
          unit: {
            type: ["string", "null"],
            description:
              "Spelled-out singular unit: 'cup', 'tablespoon', 'teaspoon', 'pound'. Null for unitless items like '3 eggs' or vague amounts like '1 box'.",
          },
          note: {
            type: ["string", "null"],
            description: "Preparation or trait note: 'sifted', 'melted', 'optional'",
          },
          section: {
            type: ["string", "null"],
            description:
              "Sub-recipe this line belongs to, e.g. 'Filling'. Null for single-part recipes.",
          },
        },
        required: ["raw", "item", "quantity", "unit", "note", "section"],
      },
    },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string", description: "One clear instruction in modern language" },
          section: {
            type: ["string", "null"],
            description: "Sub-recipe this step belongs to, e.g. 'Filling'. Null otherwise.",
          },
        },
        required: ["text", "section"],
      },
    },
    prep_minutes: {
      type: ["integer", "null"],
      description:
        "Estimated minutes of active work for a home cook. Estimate even when the card is silent; null only if no recipe.",
    },
    total_minutes: {
      type: ["integer", "null"],
      description:
        "Estimated total minutes including baking, chilling, rising. Use times stated on the card where given.",
    },
    yield: {
      type: ["string", "null"],
      description: "Yield as written or reasonably inferred, e.g. 'about 3 dozen cookies'",
    },
  },
  required: ["ingredients", "steps", "prep_minutes", "total_minutes", "yield"],
} as const;

/** Prompt rules for producing recipe_structured, shared by both tools. */
export const RECIPE_STRUCTURED_RULES = `recipe_structured: the recipe as machine-readable data, matching the prose recipe line for line. Every ingredient line becomes one object: raw is the full modernized line; item is a short lowercase singular tag using the common modern name (oleo -> "margarine") so tags stay consistent across cards; quantity stays a string ("1/2", "2-3"), null when the card gives none; unit is a spelled-out singular word ("cup", "tablespoon"), null for unitless or vague amounts ("3 eggs", "1 box"); note carries traits like "sifted" or "optional". When the recipe has sub-recipes (dough + filling), set section on the lines and steps that belong to each part. Do not invent quantities — a line like "salt" is fine with everything null but raw and item.
prep_minutes / total_minutes: estimate honestly for a home cook even though the card rarely states times — active work in prep_minutes, everything including baking/chilling/rising in total_minutes. Use times the card does state.`;
