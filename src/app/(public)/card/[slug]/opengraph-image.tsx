import { ImageResponse } from "next/og";
import { getRecipeBySlug } from "@/lib/publicData";
import { OG_COLORS, OG_SIZE, fetchCardImageBytes } from "@/lib/og";

export const alt = "A handwritten family recipe card";
export const contentType = "image/jpeg";
export const revalidate = 3600;

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getRecipeBySlug(slug).catch(() => null);

  // The Open Graph image is simply the front of the card itself. All wording
  // (title, attribution, etc.) lives in the page's OG title/description.
  const bytes = data?.recipe.front_image
    ? await fetchCardImageBytes(data.recipe.front_image, 1200)
    : null;

  if (bytes) {
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": "image/jpeg",
        "cache-control": "public, max-age=3600, s-maxage=3600",
      },
    });
  }

  // Fallback (missing/undecodable image): a plain branded card.
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
          color: OG_COLORS.amber,
          fontSize: 64,
        }}
      >
        {data?.recipe.title ?? "Grandma's Recipe Cards"}
      </div>
    ),
    { ...OG_SIZE }
  );
}
