import { NextRequest, NextResponse } from "next/server";
import { getCardDetail, updateCard } from "@/lib/adminData";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const detail = await getCardDetail(id);
    if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(detail);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json()) as {
    status?: string;
    slug?: string;
    front_crop?: object;
    back_crop?: object;
    front_rotate180?: boolean;
    back_rotate180?: boolean;
    faces_swapped?: boolean;
    collection_id?: string | null;
  };
  try {
    const result = await updateCard(id, body);
    if (!result) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ...result.card, source: result.source });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
