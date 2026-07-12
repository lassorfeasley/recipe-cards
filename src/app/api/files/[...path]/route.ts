import { NextRequest, NextResponse } from "next/server";
import { resolveStoragePath } from "@/lib/storage";
import fs from "fs";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: parts } = await params;
  const storagePath = parts.join("/");
  let abs: string;
  try {
    abs = resolveStoragePath(storagePath);
  } catch {
    return NextResponse.json({ error: "invalid path" }, { status: 400 });
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const ext = abs.slice(abs.lastIndexOf(".")).toLowerCase();
  const stat = fs.statSync(abs);
  const stream = fs.createReadStream(abs);
  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Content-Length": String(stat.size),
      "Cache-Control": "no-cache",
    },
  });
}
