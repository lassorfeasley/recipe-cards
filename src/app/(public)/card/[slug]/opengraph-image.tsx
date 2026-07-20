import { ImageResponse } from "next/og";
import { getRecipeBySlug } from "@/lib/publicData";
import { OG_COLORS, OG_SIZE, fetchCardImage, loadGoogleFont } from "@/lib/og";

export const alt = "A handwritten family recipe card";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 3600;

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getRecipeBySlug(slug).catch(() => null);
  const recipe = data?.recipe;

  const title = recipe?.title ?? "Grandma's Recipe Cards";
  const category = recipe?.category ?? null;
  const attribution = recipe?.attribution ?? null;

  const subsetText = `${title}${category ?? ""}${attribution ?? ""}from the kitchen of`;
  const [frontImage, serif, serifBold] = await Promise.all([
    recipe?.front_image ? fetchCardImage(recipe.front_image, 760) : null,
    loadGoogleFont("EB Garamond", 500, subsetText),
    loadGoogleFont("Playfair Display", 700, subsetText),
  ]);

  // Scale the title down as it gets longer so it never overflows the column.
  const titleSize = title.length > 34 ? 52 : title.length > 22 ? 64 : 76;

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
          position: "relative",
          background: `radial-gradient(130% 130% at 78% 30%, ${OG_COLORS.inkSoft} 0%, ${OG_COLORS.ink} 62%)`,
          color: OG_COLORS.amber,
          fontFamily: "EB Garamond, serif",
          overflow: "hidden",
        }}
      >
        {/* warm glow behind the card */}
        <div
          style={{
            position: "absolute",
            top: -140,
            right: -120,
            width: 620,
            height: 620,
            borderRadius: "9999px",
            background:
              "radial-gradient(circle, rgba(255,214,150,0.18) 0%, rgba(255,214,150,0) 70%)",
            display: "flex",
          }}
        />

        {/* left column: the words */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            width: 560,
            padding: "72px 0 72px 72px",
          }}
        >
          {category && (
            <div
              style={{
                display: "flex",
                fontSize: 22,
                letterSpacing: 6,
                textTransform: "uppercase",
                color: OG_COLORS.muted,
                marginBottom: 18,
              }}
            >
              {category}
            </div>
          )}
          <div
            style={{
              display: "flex",
              fontFamily: "Playfair Display, serif",
              fontWeight: 700,
              fontSize: titleSize,
              lineHeight: 1.05,
              color: OG_COLORS.amber,
            }}
          >
            {title}
          </div>
          {attribution && (
            <div
              style={{
                display: "flex",
                marginTop: 22,
                fontSize: 28,
                fontStyle: "italic",
                color: OG_COLORS.amberDim,
              }}
            >
              from the kitchen of {attribution}
            </div>
          )}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginTop: 44,
              fontSize: 20,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: OG_COLORS.muted,
            }}
          >
            Grandma&apos;s Recipe Cards
          </div>
        </div>

        {/* right column: the front of the card */}
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingRight: 56,
          }}
        >
          {frontImage ? (
            <div
              style={{
                display: "flex",
                padding: 12,
                background: OG_COLORS.paper,
                border: `1px solid ${OG_COLORS.paperEdge}`,
                borderRadius: 14,
                boxShadow: "0 34px 80px rgba(0,0,0,0.6)",
                transform: "rotate(-4deg)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={frontImage}
                alt=""
                width={520}
                height={312}
                style={{
                  width: 520,
                  height: 312,
                  objectFit: "cover",
                  borderRadius: 8,
                }}
              />
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                width: 460,
                height: 276,
                alignItems: "center",
                justifyContent: "center",
                background: OG_COLORS.paper,
                border: `1px solid ${OG_COLORS.paperEdge}`,
                borderRadius: 14,
                transform: "rotate(-4deg)",
                fontFamily: "Playfair Display, serif",
                fontSize: 40,
                color: OG_COLORS.brown,
                boxShadow: "0 34px 80px rgba(0,0,0,0.6)",
              }}
            >
              {title}
            </div>
          )}
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}
