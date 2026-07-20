export interface CropRect {
  /** Top-left corner of the inner guide rect (card edge), in source-image pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees, clockwise, about the top-left corner (Konva convention). */
  rotation: number;
}

export type BatchStatus = "uploaded" | "fronts_cropped" | "backs_aligned" | "complete";
export type CardStatus = "cropped" | "extracted" | "reviewed" | "published";

/** A physical recipe-box a card came from, named for its original owner. */
export interface Collection {
  id: string;
  name: string;
  created_at: string;
}

export interface Batch {
  id: string;
  batch_number: number;
  front_path: string;
  back_path: string;
  dpi: number | null;
  status: BatchStatus;
  /** Collection new cards in this batch are assigned to. */
  collection_id: string | null;
  created_at: string;
}

export interface BatchWithCounts extends Batch {
  card_count: number;
  fronts_exported: number;
  backs_exported: number;
  extracted_count: number;
}

export interface Card {
  id: string;
  batch_id: string;
  position: number;
  slug: string | null;
  front_crop: CropRect | null;
  back_crop: CropRect | null;
  front_rotate180: boolean;
  back_rotate180: boolean;
  /** Card was placed back-up on the scanner: exports swap which scan feeds front/back. */
  faces_swapped: boolean;
  front_image: string | null;
  back_image: string | null;
  status: CardStatus;
  /** Whose physical collection this card belongs to. */
  collection_id: string | null;
  created_at: string;
  /** When the exported images were last uploaded to Supabase (null = pending). */
  synced_at: string | null;
}

/** One ingredient line, parsed. `raw` is the display text and the fallback when parsing fails. */
export interface StructuredIngredient {
  /** Modernized display text, e.g. "2 cups sugar, sifted". Always present. */
  raw: string;
  /** Lowercase singular tag, e.g. "sugar". Feeds the ingredients tag index. */
  item: string;
  /** String to survive fractions and ranges: "2", "1/2", "2-3". Null when the card gives none. */
  quantity: string | null;
  /** Spelled-out singular unit ("cup", "tablespoon"), null for unitless items like "3 eggs". */
  unit: string | null;
  /** Preparation or trait note: "sifted", "room temperature", "optional". */
  note: string | null;
  /** Sub-recipe this belongs to, e.g. "Filling". Null for single-part recipes. */
  section: string | null;
}

export interface StructuredStep {
  text: string;
  /** Sub-recipe this belongs to, e.g. "Filling". Null for single-part recipes. */
  section: string | null;
}

/** Machine-readable recipe, extracted alongside the prose rewrite. */
export interface RecipeStructured {
  ingredients: StructuredIngredient[];
  steps: StructuredStep[];
  /** Estimated active work time in minutes (AI estimate — cards rarely state it). */
  prep_minutes: number | null;
  /** Estimated total time in minutes, including baking/chilling. */
  total_minutes: number | null;
  /** Yield as written or inferred, e.g. "about 3 dozen cookies". */
  yield: string | null;
}

export interface Extraction {
  id: string;
  card_id: string;
  title: string | null;
  category: string | null;
  writing_medium: string | null;
  ink_colors: string[] | null;
  card_design: string | null;
  attribution: string | null;
  back_relationship: string | null;
  transcription_front: string | null;
  transcription_back: string | null;
  /** Ingredients mentioned in the recipe, as lowercase tags, e.g. ["flour","raisins"]. */
  ingredients: string[] | null;
  /** The recipe rewritten in plain modern language as markdown (ingredient list + numbered steps). */
  recipe_markdown: string | null;
  /** Machine-readable version of the recipe (parsed ingredients, steps, time estimates). */
  recipe_structured: RecipeStructured | null;
  ai_notes: string | null;
  confidence: string | null;
  model: string | null;
  reviewed: boolean;
  created_at: string;
}

export interface Settings {
  default_dpi: number;
  /** Card aspect ratio as width:height of a landscape card, e.g. "5:3". */
  card_aspect: string;
  /** Margin of black background kept around the card, in inches. */
  margin_inches: number;
}

export const DEFAULT_SETTINGS: Settings = {
  default_dpi: 300,
  card_aspect: "5:3",
  margin_inches: 0.06,
};

export const CATEGORIES = [
  "dessert",
  "bread",
  "main",
  "side",
  "salad",
  "beverage",
  "snack",
  "preserves",
  "sauce",
  "other",
] as const;

export const WRITING_MEDIUMS = [
  "cursive",
  "print-handwriting",
  "typewriter",
  "mixed",
  "pre-printed",
] as const;

export const BACK_RELATIONSHIPS = [
  "continuation",
  "separate-recipe",
  "blank",
  "notes",
] as const;

export const CONFIDENCES = ["high", "medium", "low"] as const;

export function marginPx(dpi: number, marginInches = 0.06): number {
  return Math.round(marginInches * dpi);
}
