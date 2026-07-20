import { ImageResponse } from "next/og";
import { getPublishedRecipes } from "@/lib/publicData";
import { OG_COLORS, OG_SIZE, fetchCardImage } from "@/lib/og";

export const alt = "Grandma's Recipe Cards — a family archive of handwritten recipe cards";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 3600;

/** Pick `count` items evenly spread across the deck for a varied fan. */
function sample<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  const step = items.length / count;
  return Array.from({ length: count }, (_, i) => items[Math.floor(i * step)]);
}

export default async function Image() {
  const recipes = await getPublishedRecipes().catch(() => []);

  // Spread candidates across the deck, then keep the first few whose photos
  // actually decode (skipping any WebP/HEIC/missing images) so no blank cards.
  const candidates = sample(
    recipes.filter((r) => r.front_image),
    12
  );
  const resolved = await Promise.all(
    candidates.map(async (r) => ({
      id: r.id,
      src: await fetchCardImage(r.front_image, 420),
    }))
  );
  const fan = resolved.filter((r): r is { id: string; src: string } => !!r.src).slice(0, 5);
  const center = (fan.length - 1) / 2;

  const cardW = 380;
  const cardH = Math.round((cardW * 3) / 5); // 5:3 fronts

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: OG_COLORS.ink,
          overflow: "hidden",
        }}
      >
        {/* fanned deck of real card fronts — laid out as in-flow flex items
            (Satori drops images inside position:absolute + transform, so we
            overlap with negative margins instead). */}
        {fan.map((r, i) => {
          const offset = i - center;
          const angle = offset * 8;
          const dy = Math.abs(offset) * Math.abs(offset) * 16;
          return (
            <div
              key={r.id}
              style={{
                display: "flex",
                width: cardW,
                height: cardH,
                marginLeft: i === 0 ? 0 : -Math.round(cardW * 0.4),
                transform: `translateY(${dy}px) rotate(${angle}deg)`,
                borderRadius: 12,
                padding: 8,
                background: OG_COLORS.paper,
                border: `1px solid ${OG_COLORS.paperEdge}`,
                boxShadow: "0 26px 60px rgba(0,0,0,0.55)",
              }}
            >
              <img
                src={r.src}
                alt=""
                width={cardW - 16}
                height={cardH - 16}
                style={{
                  width: cardW - 16,
                  height: cardH - 16,
                  objectFit: "cover",
                  borderRadius: 6,
                }}
              />
            </div>
          );
        })}
      </div>
    ),
    { ...size }
  );
}
