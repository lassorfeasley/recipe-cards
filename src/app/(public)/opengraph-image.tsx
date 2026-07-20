import { ImageResponse } from "next/og";
import { getPublishedRecipes } from "@/lib/publicData";
import { OG_COLORS, OG_SIZE, fetchCardImage } from "@/lib/og";

export const alt = "Feasley's Recipes — a family archive of handwritten recipe cards";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 3600;

/** Pick `count` items evenly spread across the deck for a varied grid. */
function sample<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  const step = items.length / count;
  return Array.from({ length: count }, (_, i) => items[Math.floor(i * step)]);
}

// 4 columns of 5:3 cards with 8px gaps, exactly like the landing-page wall.
// Four rows slightly overflow the 630px canvas, so the last row crops at the
// bottom edge — the same endless-grid feel the site has in a real viewport.
const COLS = 4;
const GAP = 8;
const CARD_W = Math.floor((OG_SIZE.width - GAP * (COLS - 1)) / COLS); // 294
const CARD_H = Math.round((CARD_W * 3) / 5); // 176
const ROWS = 4;

export default async function Image() {
  const recipes = await getPublishedRecipes().catch(() => []);

  // Spread candidates across the deck, then keep those whose photos actually
  // decode (skipping any WebP/HEIC/missing images) so there are no blank cells.
  const candidates = sample(
    recipes.filter((r) => r.front_image),
    COLS * ROWS + 4
  );
  const resolved = await Promise.all(
    candidates.map(async (r) => ({
      id: r.id,
      src: await fetchCardImage(r.front_image, 320),
    }))
  );
  const cards = resolved
    .filter((r): r is { id: string; src: string } => !!r.src)
    .slice(0, COLS * ROWS);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexWrap: "wrap",
          alignContent: "flex-start",
          gap: GAP,
          background: OG_COLORS.ink,
          overflow: "hidden",
        }}
      >
        {cards.map((r) => (
          <img
            key={r.id}
            src={r.src}
            alt=""
            width={CARD_W}
            height={CARD_H}
            style={{
              width: CARD_W,
              height: CARD_H,
              objectFit: "cover",
              borderRadius: 4,
            }}
          />
        ))}
      </div>
    ),
    { ...size }
  );
}
