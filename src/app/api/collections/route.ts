import { NextRequest, NextResponse } from "next/server";
import { getDb, listCollections } from "@/lib/db";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(listCollections());
}

/** Create a collection: { name } */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { name?: string };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const db = getDb();
  const existing = db.prepare("select * from collections where name = ?").get(name);
  if (existing) return NextResponse.json(existing);
  const id = randomUUID();
  db.prepare("insert into collections (id, name) values (?, ?)").run(id, name);
  return NextResponse.json(db.prepare("select * from collections where id = ?").get(id));
}
