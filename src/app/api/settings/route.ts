import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db";
import { DEFAULT_SETTINGS, Settings } from "@/lib/types";

export const runtime = "nodejs";

function currentSettings(): Settings {
  return {
    default_dpi: Number(getSetting("default_dpi") ?? DEFAULT_SETTINGS.default_dpi),
    card_aspect: getSetting("card_aspect") ?? DEFAULT_SETTINGS.card_aspect,
    margin_inches: Number(getSetting("margin_inches") ?? DEFAULT_SETTINGS.margin_inches),
  };
}

export async function GET() {
  return NextResponse.json(currentSettings());
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as Partial<Settings>;
  if (body.default_dpi !== undefined) setSetting("default_dpi", String(body.default_dpi));
  if (body.card_aspect !== undefined) setSetting("card_aspect", body.card_aspect);
  if (body.margin_inches !== undefined) setSetting("margin_inches", String(body.margin_inches));
  return NextResponse.json(currentSettings());
}
