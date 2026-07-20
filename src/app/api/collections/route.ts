import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db";
import { listCollectionsAdmin } from "@/lib/adminData";
import { getSupabaseAdmin, supabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await listCollectionsAdmin());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

/** Create a collection: { name } */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { name?: string };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  // Prefer writing to Supabase when configured (hosted admin); else local.
  if (supabaseConfigured()) {
    try {
      const supabase = getSupabaseAdmin();
      const { data: existing } = await supabase
        .from("collections")
        .select("*")
        .eq("name", name)
        .maybeSingle();
      if (existing) return NextResponse.json(existing);
      const { data, error } = await supabase
        .from("collections")
        .insert({ name })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return NextResponse.json(data);
    } catch (e) {
      console.error("collections POST supabase failed, trying local:", e);
    }
  }

  const db = getDb();
  const existing = db.prepare("select * from collections where name = ?").get(name);
  if (existing) return NextResponse.json(existing);
  const id = randomUUID();
  db.prepare("insert into collections (id, name) values (?, ?)").run(id, name);
  return NextResponse.json(db.prepare("select * from collections where id = ?").get(id));
}
