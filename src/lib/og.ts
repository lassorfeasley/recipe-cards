/**
 * Shared helpers for Open Graph image generation (`opengraph-image.tsx`) and
 * page metadata. Keeps the site URL, palette, and image loading in one place so
 * the social cards stay consistent with the site's warm, paper-and-ink look.
 */
import sharp from "sharp";

/** Standard Open Graph / Twitter card canvas. */
export const OG_SIZE = { width: 1200, height: 630 } as const;

/** The recipe-card visual language, pulled from the live site. */
export const OG_COLORS = {
  ink: "#0a0806", // near-black page
  paper: "#f3ecd7", // cream card stock
  paperEdge: "#d8cdb0", // tan card border
  amber: "#fef3c7", // amber-100 ink
} as const;

/** Resolve the public origin for `metadataBase` and absolute URLs. */
export function getSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/**
 * Fetch a remote card photo, downscale it with sharp, and return it as a base64
 * JPEG data URL that Satori can embed directly.
 *
 * Downscaling matters for two reasons: (1) it normalizes odd source formats
 * (WebP/HEIC/CMYK) into a JPEG that `ImageResponse` can always decode, and
 * (2) it keeps each embedded image small — Satori silently drops images once
 * the combined payload gets too large, which otherwise leaves blank cards.
 * Returns `null` on any failure so callers can skip the card gracefully.
 */
export async function fetchCardImage(
  url: string,
  width = 640
): Promise<string | null> {
  const buf = await fetchCardImageBytes(url, width);
  return buf ? `data:image/jpeg;base64,${buf.toString("base64")}` : null;
}

/**
 * Fetch a remote card photo and return it as downscaled, normalized JPEG bytes.
 * Used to serve a recipe's card front directly as its Open Graph image.
 * Returns `null` on any failure.
 */
export async function fetchCardImageBytes(
  url: string,
  width = 1200
): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const input = Buffer.from(await res.arrayBuffer());
    return await sharp(input)
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    return null;
  }
}
