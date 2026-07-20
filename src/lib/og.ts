/**
 * Shared helpers for Open Graph image generation (`opengraph-image.tsx`) and
 * page metadata. Keeps the site URL, palette, and font loading in one place so
 * the social cards stay consistent with the site's warm, paper-and-ink look.
 */
import sharp from "sharp";

/** Standard Open Graph / Twitter card canvas. */
export const OG_SIZE = { width: 1200, height: 630 } as const;

/**
 * The recipe-card visual language, pulled from the live site:
 * black-and-amber chrome over cream paper with dark-brown serif "ink".
 */
export const OG_COLORS = {
  ink: "#0a0806", // near-black page
  inkSoft: "#161210",
  paper: "#f3ecd7", // cream card stock
  paperEdge: "#d8cdb0", // tan card border
  amber: "#fef3c7", // amber-100 title ink
  amberDim: "#f5deb3",
  brown: "#4a4234", // handwritten-ink brown
  muted: "#a1998a", // muted label text
} as const;

/** Resolve the public origin for `metadataBase` and absolute URLs. */
export function getSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/**
 * Fetch a Google font as an ArrayBuffer for `ImageResponse`, subset to just the
 * glyphs in `text` to keep the download tiny. Satori needs real font data —
 * this is the standard next/og pattern. Returns `null` on any failure so image
 * generation can gracefully fall back to the built-in default font.
 */
export async function loadGoogleFont(
  family: string,
  weight: number,
  text: string
): Promise<ArrayBuffer | null> {
  try {
    const params = new URLSearchParams({
      family: `${family}:wght@${weight}`,
      // Always include the ASCII printable range so any character renders.
      text: text + " ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'&·—-.,",
    });
    // No modern User-Agent on purpose: that makes Google serve a TTF/OTF, which
    // Satori can parse. A browser UA yields woff2, which Satori cannot decode.
    const css = await fetch(`https://fonts.googleapis.com/css2?${params}`).then(
      (r) => r.text()
    );

    const url = css.match(
      /src:\s*url\(([^)]+)\)\s*format\('(?:opentype|truetype)'\)/
    )?.[1];
    if (!url) return null;
    return await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
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
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const input = Buffer.from(await res.arrayBuffer());
    const out = await sharp(input)
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  } catch {
    return null;
  }
}
