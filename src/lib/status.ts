import type { BatchWithCounts, CardStatus } from "./types";

/**
 * One shared status vocabulary so every screen uses the same words and colors.
 * Green = live on the public site, cyan = human-approved, amber = needs a human,
 * gray = not there yet.
 */

export const CARD_STATUS: Record<
  CardStatus,
  { label: string; dot: string; pill: string; help: string }
> = {
  cropped: {
    label: "No metadata",
    dot: "bg-zinc-600",
    pill: "bg-zinc-800 text-zinc-300",
    help: "Card pair is exported but has no metadata yet — run extraction",
  },
  extracted: {
    label: "Needs review",
    dot: "bg-amber-400",
    pill: "bg-amber-950 text-amber-300",
    help: "AI metadata exists but a human hasn't approved it yet",
  },
  reviewed: {
    label: "Reviewed",
    dot: "bg-cyan-400",
    pill: "bg-cyan-950 text-cyan-300",
    help: "Metadata approved by a human — ready to publish",
  },
  published: {
    label: "Published",
    dot: "bg-emerald-400",
    pill: "bg-emerald-950 text-emerald-300",
    help: "Visible on the public site (after sync)",
  },
};

export const BATCH_STATUS: Record<string, { label: string; pill: string }> = {
  uploaded: { label: "Needs alignment", pill: "bg-amber-950 text-amber-300" },
  fronts_cropped: { label: "In progress", pill: "bg-amber-950 text-amber-300" },
  backs_aligned: { label: "Needs card review", pill: "bg-cyan-950 text-cyan-300" },
  complete: { label: "Complete", pill: "bg-emerald-950 text-emerald-300" },
};

/** The single most useful next action for a batch, for a one-click CTA. */
export function batchNextStep(b: BatchWithCounts): {
  href: string;
  label: string;
  done: boolean;
} {
  const exported = Math.min(b.fronts_exported, b.backs_exported);
  if (b.card_count === 0 || b.status === "uploaded") {
    return { href: `/admin/batches/${b.id}/align`, label: "Align scans", done: false };
  }
  if (exported < b.card_count) {
    return {
      href: `/admin/batches/${b.id}/cards`,
      label: `Review cards (${exported}/${b.card_count})`,
      done: false,
    };
  }
  return { href: `/admin/batches/${b.id}/cards`, label: "All cards approved", done: true };
}
