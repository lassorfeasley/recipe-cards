import { ImageResponse } from "next/og";
import { getPublishedRecipes } from "@/lib/publicData";
import { OG_COLORS, OG_SIZE, fetchCardImage, loadGoogleFont } from "@/lib/og";

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
  const title = "Grandma's Recipe Cards";
  const subtitle = "A family archive of handwritten recipe cards";

  const [recipes, serif, serifBold] = await Promise.all([
    getPublishedRecipes().catch(() => []),
    loadGoogleFont("EB Garamond", 500, title + subtitle),
    loadGoogleFont("Playfair Display", 700, title),
  ]);

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
  const fan = resolved.filter((r): r is { id: string; src: string } => !!r.src).slice(0, 3);
  const center = (fan.length - 1) / 2;
  const cardW = 340;
  const cardH = Math.round((cardW * 3) / 5); // 5:3 fronts

  const fonts = [
    ...(serif ? [{ name: "EB Garamond", data: serif, weight: 500 as const }] : []),
    ...(serifBold
      ? [{ name: "Playfair Display", data: serifBold, weight: 700 as const }]
      : []),
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          position: "relative",
          background: `radial-gradient(120% 120% at 50% 0%, ${OG_COLORS.inkSoft} 0%, ${OG_COLORS.ink} 60%)`,
          color: OG_COLORS.amber,
          fontFamily: "EB Garamond, serif",
          overflow: "hidden",
        }}
      >
        {/* warm glow behind the deck */}
        <div
          style={{
            position: "absolute",
            bottom: -260,
            left: 260,
            width: 680,
            height: 680,
            borderRadius: "9999px",
            background:
              "radial-gradient(circle, rgba(255,214,150,0.16) 0%, rgba(255,214,150,0) 70%)",
            display: "flex",
          }}
        />

        {/* wordmark */}
        <div
          style={{
            display: "flex",
            marginTop: 66,
            fontSize: 22,
            letterSpacing: 8,
            textTransform: "uppercase",
            color: OG_COLORS.muted,
          }}
        >
          The Family Kitchen
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 10,
            fontSize: 88,
            fontFamily: "Playfair Display, serif",
            fontWeight: 700,
            color: OG_COLORS.amber,
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 6,
            fontSize: 30,
            fontStyle: "italic",
            color: OG_COLORS.amberDim,
          }}
        >
          {subtitle}
        </div>

        {/* fanned deck of real card fronts */}
        <div
          style={{
            position: "absolute",
            bottom: 6,
            left: 0,
            right: 0,
            height: cardH + 120,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          {fan.map((r, i) => {
            const offset = i - center;
            const angle = offset * 9;
            const dx = offset * cardW * 0.58;
            // Outer cards ride higher so the whole hand fans up into frame.
            const dy = -Math.abs(offset) * Math.abs(offset) * 20;
            return (
              <div
                key={r.id}
                style={{
                  position: "absolute",
                  display: "flex",
                  width: cardW,
                  height: cardH,
                  transform: `translateX(${dx}px) translateY(${dy}px) rotate(${angle}deg)`,
                  borderRadius: 12,
                  padding: 8,
                  background: OG_COLORS.paper,
                  border: `1px solid ${OG_COLORS.paperEdge}`,
                  boxShadow: "0 26px 60px rgba(0,0,0,0.55)",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={r.src}
                  alt=""
                  width={cardW - 16}
                  height={cardH - 16}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    borderRadius: 6,
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}
