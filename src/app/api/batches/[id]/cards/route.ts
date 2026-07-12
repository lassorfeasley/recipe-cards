import { NextRequest, NextResponse } from "next/server";
import { getDb, mapCard } from "@/lib/db";
import { resolveStoragePath } from "@/lib/storage";
import { randomUUID } from "crypto";
import fs from "fs";
import type { CropRect } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rows = getDb()
    .prepare("select * from cards where batch_id = ? order by position")
    .all(id) as Array<Parameters<typeof mapCard>[0]>;
  return NextResponse.json(rows.map(mapCard));
}

interface SaveCropsBody {
  face: "front" | "back";
  crops: Array<{
    card_id?: string;
    position: number;
    crop: CropRect;
    back_rotate180?: boolean;
  }>;
}

/**
 * Persist crop geometry for a batch.
 * face=front: upserts cards by position (creates/deletes rows to match the list),
 *             and seeds back_crop with a copy of front_crop when not yet set.
 * face=back:  updates back_crop / back_rotate180 on existing cards by card_id.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json()) as SaveCropsBody;
  const db = getDb();

  const batch = db.prepare("select id from batches where id = ?").get(id);
  if (!batch) return NextResponse.json({ error: "batch not found" }, { status: 404 });

  const save = db.transaction(() => {
    if (body.face === "front") {
      const keptIds: string[] = [];
      // Two-pass position update to avoid transient unique-constraint clashes
      // when positions are reshuffled.
      const existing = db
        .prepare("select id from cards where batch_id = ?")
        .all(id) as Array<{ id: string }>;
      const bump = db.prepare("update cards set position = position + 1000 where batch_id = ?");
      if (existing.length) bump.run(id);

      for (const item of body.crops) {
        const cropJson = JSON.stringify(item.crop);
        if (item.card_id && existing.some((e) => e.id === item.card_id)) {
          db.prepare(
            `update cards set position = ?, front_crop = ?,
               back_crop = coalesce(back_crop, ?)
             where id = ?`
          ).run(item.position, cropJson, cropJson, item.card_id);
          keptIds.push(item.card_id);
        } else {
          const cardId = randomUUID();
          db.prepare(
            `insert into cards (id, batch_id, position, front_crop, back_crop, status)
             values (?, ?, ?, ?, ?, 'cropped')`
          ).run(cardId, id, item.position, cropJson, cropJson);
          keptIds.push(cardId);
        }
      }
      // Remove cards whose crop boxes were deleted, along with their exports.
      const placeholders = keptIds.map(() => "?").join(",");
      const removed = db
        .prepare(
          `select id from cards where batch_id = ? ${keptIds.length ? `and id not in (${placeholders})` : ""}`
        )
        .all(id, ...keptIds) as Array<{ id: string }>;
      for (const r of removed) {
        db.prepare("delete from cards where id = ?").run(r.id);
        try {
          fs.rmSync(resolveStoragePath(`cards/${r.id}`), { recursive: true, force: true });
        } catch {
          // best-effort cleanup
        }
      }
    } else {
      for (const item of body.crops) {
        if (!item.card_id) continue;
        db.prepare(
          "update cards set back_crop = ?, back_rotate180 = ? where id = ? and batch_id = ?"
        ).run(JSON.stringify(item.crop), item.back_rotate180 ? 1 : 0, item.card_id, id);
      }
    }
  });
  save();

  const rows = db
    .prepare("select * from cards where batch_id = ? order by position")
    .all(id) as Array<Parameters<typeof mapCard>[0]>;
  return NextResponse.json(rows.map(mapCard));
}
