import { NextRequest, NextResponse } from "next/server";
import { createBlankExtraction } from "@/lib/adminData";

export const runtime = "nodejs";

/**
 * Create a blank manual extraction for a card that has none (or whose latest
 * run failed), so metadata can be entered by hand in the card profile.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const result = await createBlankExtraction(id);
    if (!result) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ...result.extraction, source: result.source });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
