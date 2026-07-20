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

/** Create a collection: { name } — writes local (for batch FKs) and mirrors to Supabase when configured. */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { name?: string };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  try {
    const db = getDb();
    const existing = db.prepare("select * from collections where name = ?").get(name) as
      | { id: string; name: string; created_at: string }
      | undefined;
    if (existing) {
      await mirrorCollectionToSupabase(existing);
      return NextResponse.json(existing);
    }

    const id = randomUUID();
    db.prepare("insert into collections (id, name) values (?, ?)").run(id, name);
    const row = db.prepare("select * from collections where id = ?").get(id) as {
      id: string;
      name: string;
      created_at: string;
    };
    await mirrorCollectionToSupabase(row);
    return NextResponse.json(row);
  } catch (e) {
    // Hosted with no writable local DB: create in Supabase only.
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
      } catch (sbErr) {
        return NextResponse.json(
          { error: sbErr instanceof Error ? sbErr.message : String(sbErr) },
          { status: 500 }
        );
      }
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

async function mirrorCollectionToSupabase(row: {
  id: string;
  name: string;
  created_at: string;
}) {
  if (!supabaseConfigured()) return;
  try {
    const supabase = getSupabaseAdmin();
    const createdAt = row.created_at.includes("T")
      ? row.created_at
      : `${row.created_at.replace(" ", "T")}Z`;
    await supabase.from("collections").upsert({
      id: row.id,
      name: row.name,
      created_at: createdAt,
    });
  } catch (e) {
    console.error("collections: supabase mirror failed:", e);
  }
}
