import { NextRequest, NextResponse } from "next/server";
import { updateExtraction } from "@/lib/adminData";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json()) as Record<string, unknown> & {
    ink_colors?: string[] | null;
    ingredients?: string[] | null;
    recipe_structured?: object | null;
    reviewed?: boolean;
  };
  try {
    const result = await updateExtraction(id, body);
    if (!result) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ...result.extraction, source: result.source });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
