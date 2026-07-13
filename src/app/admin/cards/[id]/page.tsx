"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Card, Extraction } from "@/lib/types";
import ExtractionFields from "@/components/ExtractionFields";
import { CARD_STATUS } from "@/lib/status";

interface CardDetail {
  card: Card & { batch_number: number };
  extraction: Extraction | null;
}

export default function CardProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [detail, setDetail] = useState<CardDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [draft, setDraft] = useState<Partial<Extraction>>({});
  const [showBack, setShowBack] = useState(false);
  const [busy, setBusy] = useState<null | "save" | "rescan" | "status">(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/cards/${id}`);
    if (!res.ok) {
      setNotFound(true);
      return null;
    }
    const data = (await res.json()) as CardDetail;
    setDetail(data);
    setDraft(data.extraction ? { ...data.extraction } : {});
    return data;
  }, [id]);

  useEffect(() => {
    // Fetch-on-mount: state updates happen after the awaited response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Background push to Supabase after any change (mirrors the review queue).
  const syncCard = useCallback(async () => {
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card_ids: [id] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setMessage(`Sync failed: ${data.error ?? res.status}`);
      else if (data.errors?.length) setMessage(`Sync failed: ${data.errors[0]}`);
      else setMessage("Saved · synced to Supabase ✓");
    } catch (e) {
      setMessage(`Sync failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [id]);

  const saveMetadata = useCallback(async () => {
    if (!detail) return;
    setBusy("save");
    setMessage(null);
    let extraction = detail.extraction;
    // No extraction yet (never scanned): create a blank manual one to hold the edits.
    if (!extraction) {
      const res = await fetch(`/api/cards/${id}/extraction`, { method: "POST" });
      extraction = (await res.json()) as Extraction;
    }
    await fetch(`/api/extractions/${extraction.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draft, reviewed: true }),
    });
    await load();
    await syncCard();
    setBusy(null);
  }, [detail, draft, id, load, syncCard]);

  const rescan = useCallback(async () => {
    if (!detail) return;
    if (
      detail.extraction?.reviewed &&
      !confirm(
        "This card has human-reviewed metadata. Re-scanning creates a new unreviewed extraction that replaces it here. Continue?"
      )
    ) {
      return;
    }
    setBusy("rescan");
    setMessage(null);
    const res = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ card_id: id, force: true }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setMessage(`Re-scan failed: ${err.message ?? err.error ?? res.status}`);
    } else {
      await load();
      await syncCard();
    }
    setBusy(null);
  }, [detail, id, load, syncCard]);

  const setStatus = useCallback(
    async (status: Card["status"]) => {
      setBusy("status");
      setMessage(null);
      await fetch(`/api/cards/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await load();
      await syncCard();
      setBusy(null);
    },
    [id, load, syncCard]
  );

  if (notFound) {
    return (
      <div className="p-8 text-zinc-400">
        Card not found. <Link href="/admin/library" className="text-cyan-400">Back to library</Link>
      </div>
    );
  }
  if (!detail) return <div className="p-8 text-zinc-600">Loading…</div>;

  const { card, extraction } = detail;
  const title = extraction?.title ?? `Batch ${card.batch_number} · card ${card.position}`;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/admin/library" className="text-sm text-zinc-500 hover:text-zinc-300">
          ← Library
        </Link>
        <h1 className="text-xl font-semibold text-amber-50">{title}</h1>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] ${CARD_STATUS[card.status].pill}`}
          title={CARD_STATUS[card.status].help}
        >
          {CARD_STATUS[card.status].label}
        </span>
        {message && <span className="ml-auto text-xs text-zinc-500">{message}</span>}
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        {/* left: images + facts */}
        <div>
          <button
            onClick={() => setShowBack((v) => !v)}
            className="block w-full cursor-pointer"
            style={{ perspective: "1200px" }}
            title={showBack ? "Show front" : "Show back"}
          >
            <div
              className="relative aspect-[5/3] w-full transition-transform duration-500"
              style={{
                transformStyle: "preserve-3d",
                transform: showBack ? "rotateY(180deg)" : "rotateY(0deg)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/files/${card.front_image}`}
                alt={`${title} — front`}
                className="absolute inset-0 h-full w-full rounded-md object-contain"
                style={{ backfaceVisibility: "hidden" }}
              />
              {card.back_image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/files/${card.back_image}`}
                  alt={`${title} — back`}
                  className="absolute inset-0 h-full w-full rounded-md object-contain"
                  style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                />
              )}
            </div>
          </button>
          <p className="mt-2 text-center text-xs text-zinc-600">
            Click the card to flip it — showing the {showBack ? "back" : "front"}
          </p>

          <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm">
            <dt className="text-zinc-500">Batch</dt>
            <dd className="text-zinc-200">
              {card.batch_number} · position {card.position}
            </dd>
            <dt className="text-zinc-500">Slug</dt>
            <dd className="truncate text-zinc-200">{card.slug ?? "—"}</dd>
            <dt className="text-zinc-500">Extraction</dt>
            <dd className="text-zinc-200">
              {extraction
                ? `${extraction.model}${extraction.reviewed ? " · reviewed ✓" : " · unreviewed"}`
                : "none yet"}
            </dd>
            <dt className="text-zinc-500">Supabase</dt>
            <dd className="text-zinc-200">{card.synced_at ? "images synced" : "images pending sync"}</dd>
          </dl>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={rescan}
              disabled={busy !== null}
              className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-900 disabled:opacity-50"
              title="Run Claude over the front + back images again"
            >
              {busy === "rescan" ? "Re-scanning…" : "Re-scan metadata (AI)"}
            </button>
            {card.status === "published" ? (
              <button
                onClick={() => setStatus("reviewed")}
                disabled={busy !== null}
                className="rounded-md border border-amber-900 px-4 py-2 text-sm text-amber-300 hover:bg-amber-950 disabled:opacity-50"
              >
                Unpublish
              </button>
            ) : (
              <button
                onClick={() => setStatus("published")}
                disabled={busy !== null}
                className="rounded-md border border-emerald-800 px-4 py-2 text-sm text-emerald-300 hover:bg-emerald-950 disabled:opacity-50"
              >
                Publish
              </button>
            )}
          </div>
        </div>

        {/* right: metadata */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-zinc-100">Metadata</h2>
            {extraction && (
              <span className="text-xs text-zinc-600">
                {extraction.model} · confidence {extraction.confidence ?? "—"}
              </span>
            )}
          </div>
          {!extraction && (
            <p className="mb-3 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-500">
              No metadata yet — fill in the fields and save, or run the AI re-scan.
            </p>
          )}
          <ExtractionFields draft={draft} onChange={setDraft} />
          <div className="mt-4 flex gap-2">
            <button
              onClick={saveMetadata}
              disabled={busy !== null}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-black hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy === "save" ? "Saving…" : "Save metadata"}
            </button>
          </div>
          <p className="mt-2 text-xs text-zinc-600">
            Saving marks the metadata as human-reviewed and syncs the card to Supabase.
          </p>
        </div>
      </div>
    </div>
  );
}
