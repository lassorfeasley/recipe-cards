import { NextRequest, NextResponse } from "next/server";
import { backfillThumbs, exportedCards, runSync } from "@/lib/sync";
import { supabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  const cards = exportedCards();
  return NextResponse.json({
    configured: supabaseConfigured(),
    exported: cards.length,
    pendingImages: cards.filter((c) => !c.synced_at).length,
  });
}

/**
 * Push exported card pairs to Supabase. Body (all optional):
 *   { card_ids: string[] } — sync only these cards (used for auto-sync on approve)
 *   { force: true }        — re-upload every image, not just pending ones
 *   { thumbs: true }       — only (re)generate + upload showcase thumbnails
 */
export async function POST(req: NextRequest) {
  if (!supabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured (see .env.local.example)" },
      { status: 400 }
    );
  }
  const { force = false, card_ids, thumbs = false } = (await req.json().catch(() => ({}))) as {
    force?: boolean;
    card_ids?: string[];
    thumbs?: boolean;
  };

  try {
    if (thumbs) return NextResponse.json(await backfillThumbs());
    const result = await runSync({ cardIds: card_ids, force });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
