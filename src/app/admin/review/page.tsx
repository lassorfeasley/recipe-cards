"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Card, Extraction } from "@/lib/types";
import ExtractionFields from "@/components/ExtractionFields";

interface ReviewItem {
  card: Card & { batch_number: number };
  extraction: Extraction | null;
}

interface RunnerState {
  running: boolean;
  done: number;
  total: number;
  inputTokens: number;
  outputTokens: number;
  errors: string[];
}

// Rough Sonnet pricing for the running cost figure.
const USD_PER_INPUT_TOKEN = 3 / 1_000_000;
const USD_PER_OUTPUT_TOKEN = 15 / 1_000_000;

export default function ReviewPage() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showBack, setShowBack] = useState(false);
  const [draft, setDraft] = useState<Partial<Extraction>>({});
  const [runner, setRunner] = useState<RunnerState>({
    running: false,
    done: 0,
    total: 0,
    inputTokens: 0,
    outputTokens: 0,
    errors: [],
  });
  const [busy, setBusy] = useState(false);
  const [imgV, setImgV] = useState(0); // bumped when face images change on disk
  const [syncState, setSyncState] = useState<{
    status: "idle" | "syncing" | "ok" | "error";
    detail?: string;
  }>({ status: "idle" });
  const stopRef = useRef(false);
  const syncSeq = useRef(0);

  // Fire-and-forget push of specific cards to Supabase (called after approve,
  // publish, and face-swap). Only the most recent request drives the indicator.
  const syncCards = useCallback(async (cardIds: string[]) => {
    const seq = ++syncSeq.current;
    setSyncState({ status: "syncing" });
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card_ids: cardIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (seq !== syncSeq.current) return;
      if (!res.ok) {
        setSyncState({ status: "error", detail: data.error ?? `HTTP ${res.status}` });
      } else if (data.errors?.length) {
        setSyncState({ status: "error", detail: data.errors[0] });
      } else {
        setSyncState({ status: "ok" });
      }
    } catch (e) {
      if (seq === syncSeq.current) {
        setSyncState({ status: "error", detail: e instanceof Error ? e.message : String(e) });
      }
    }
  }, []);

  const refresh = useCallback(async () => {
    const data = (await fetch("/api/review").then((r) => r.json())) as ReviewItem[];
    setItems(data);
    return data;
  }, []);

  useEffect(() => {
    // Fetch-on-mount: state updates happen after the awaited response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().then((data) => {
      const first = data.find((i) => i.extraction && !i.extraction.reviewed);
      if (first) setSelectedId(first.card.id);
    });
  }, [refresh]);

  const selected = useMemo(
    () => items.find((i) => i.card.id === selectedId) ?? null,
    [items, selectedId]
  );

  // Reset the edit draft when switching cards (state adjustment during render).
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const currentKey = `${selectedId}:${selected?.extraction?.id ?? "none"}`;
  if (draftKey !== currentKey) {
    setDraftKey(currentKey);
    setDraft(selected?.extraction ? { ...selected.extraction } : {});
    setShowBack(false);
  }

  const pending = useMemo(
    () => items.filter((i) => !i.extraction),
    [items]
  );
  const unreviewed = useMemo(
    () => items.filter((i) => i.extraction && !i.extraction.reviewed),
    [items]
  );

  // ---- queue runner: 2 concurrent, exponential backoff on 429/529 ----
  const extractOne = useCallback(async (cardId: string, force = false) => {
    let delay = 2000;
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card_id: cardId, force }),
      });
      if (res.ok) {
        const data = await res.json();
        return { ok: true as const, usage: data.usage as { input_tokens: number; output_tokens: number } };
      }
      if (res.status === 429 || res.status === 529 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, 60000);
        continue;
      }
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      return { ok: false as const, error: err.message ?? err.error ?? `HTTP ${res.status}` };
    }
    return { ok: false as const, error: "gave up after retries" };
  }, []);

  const runAll = useCallback(async () => {
    const queue = pending.map((i) => i.card.id);
    if (queue.length === 0) return;
    stopRef.current = false;
    setRunner({ running: true, done: 0, total: queue.length, inputTokens: 0, outputTokens: 0, errors: [] });

    let idx = 0;
    const worker = async () => {
      while (!stopRef.current) {
        const my = idx++;
        if (my >= queue.length) return;
        const result = await extractOne(queue[my]);
        setRunner((r) => ({
          ...r,
          done: r.done + 1,
          inputTokens: r.inputTokens + (result.ok ? result.usage.input_tokens : 0),
          outputTokens: r.outputTokens + (result.ok ? result.usage.output_tokens : 0),
          errors: result.ok ? r.errors : [...r.errors, `card ${queue[my].slice(0, 8)}: ${result.error}`],
        }));
      }
    };
    await Promise.all([worker(), worker()]);
    setRunner((r) => ({ ...r, running: false }));
    refresh();
  }, [pending, extractOne, refresh]);

  // ---- review actions ----
  const saveDraft = useCallback(
    async (extra: Record<string, unknown> = {}) => {
      if (!selected?.extraction) return;
      setBusy(true);
      await fetch(`/api/extractions/${selected.extraction.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, ...extra }),
      });
      setBusy(false);
    },
    [selected, draft]
  );

  const approveAndAdvance = useCallback(async () => {
    if (!selected?.extraction) return;
    await saveDraft({ reviewed: true });
    void syncCards([selected.card.id]); // don't block advancing on the upload
    const data = await refresh();
    const next = data.find(
      (i) => i.extraction && !i.extraction.reviewed && i.card.id !== selected.card.id
    );
    setSelectedId(next?.card.id ?? null);
  }, [selected, saveDraft, refresh, syncCards]);

  const rerun = useCallback(async () => {
    if (!selected) return;
    if (
      selected.extraction?.reviewed &&
      !confirm("This card has a human-reviewed extraction. Re-running will create a new unreviewed extraction. Continue?")
    ) {
      return;
    }
    setBusy(true);
    const result = await extractOne(selected.card.id, true);
    setBusy(false);
    if (!result.ok) alert(`Extraction failed: ${result.error}`);
    await refresh();
  }, [selected, extractOne, refresh]);

  // The card was scanned back-up: swap the exported files server-side, then
  // mirror the transcription swap in the local draft (keeps unsaved edits).
  const swapFaces = useCallback(async () => {
    if (!selected) return;
    setBusy(true);
    const res = await fetch(`/api/cards/${selected.card.id}/swap-faces`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(`Swap failed: ${err.error ?? res.status}`);
      return;
    }
    setDraft((d) => ({
      ...d,
      transcription_front: d.transcription_back ?? null,
      transcription_back: d.transcription_front ?? null,
    }));
    setImgV((v) => v + 1);
    void syncCards([selected.card.id]); // swap cleared synced_at — push the swapped files
    await refresh();
  }, [selected, refresh, syncCards]);

  const publishReviewed = useCallback(async () => {
    const reviewed = items.filter((i) => i.card.status === "reviewed");
    for (const i of reviewed) {
      await fetch(`/api/cards/${i.card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "published" }),
      });
    }
    if (reviewed.length > 0) void syncCards(reviewed.map((i) => i.card.id));
    refresh();
  }, [items, refresh, syncCards]);

  // ---- keyboard ----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
      if (e.key === "f" && !typing) {
        setShowBack((b) => !b);
      }
      if (e.key === "Enter" && !typing && selected?.extraction) {
        e.preventDefault();
        approveAndAdvance();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected, approveAndAdvance]);

  const estCostUsd =
    runner.inputTokens * USD_PER_INPUT_TOKEN + runner.outputTokens * USD_PER_OUTPUT_TOKEN;

  return (
    <div className="flex h-full">
      {/* sidebar: card list */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
        <div className="border-b border-zinc-800 p-3">
          <h1 className="font-semibold text-amber-50">Review queue</h1>
          <p className="mt-1 text-xs text-zinc-500">
            {pending.length} to extract · {unreviewed.length} to review
          </p>
          <button
            onClick={runner.running ? () => (stopRef.current = true) : runAll}
            disabled={!runner.running && pending.length === 0}
            className="mt-2 w-full rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-black hover:bg-amber-500 disabled:opacity-40"
          >
            {runner.running
              ? `Stop (${runner.done}/${runner.total})`
              : `Extract all pending (${pending.length})`}
          </button>
          {(runner.running || runner.done > 0) && (
            <div className="mt-2 text-xs text-zinc-500">
              <div className="h-1.5 w-full overflow-hidden rounded bg-zinc-800">
                <div
                  className="h-full bg-amber-500 transition-all"
                  style={{ width: `${runner.total ? (runner.done / runner.total) * 100 : 0}%` }}
                />
              </div>
              <p className="mt-1">
                {runner.inputTokens.toLocaleString()} in / {runner.outputTokens.toLocaleString()} out
                tokens · ~${estCostUsd.toFixed(2)}
              </p>
              {runner.errors.length > 0 && (
                <p className="text-red-400">{runner.errors.length} failed</p>
              )}
            </div>
          )}
          <button
            onClick={publishReviewed}
            className="mt-2 w-full rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
          >
            Publish all reviewed
          </button>
          {syncState.status !== "idle" && (
            <p
              className={`mt-2 text-xs ${
                syncState.status === "error"
                  ? "text-red-400"
                  : syncState.status === "syncing"
                    ? "text-zinc-500"
                    : "text-emerald-500"
              }`}
              title={syncState.detail}
            >
              {syncState.status === "syncing" && "Syncing to Supabase…"}
              {syncState.status === "ok" && "Synced to Supabase ✓"}
              {syncState.status === "error" && `Sync failed: ${syncState.detail}`}
            </p>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {items.map((i) => (
            <button
              key={i.card.id}
              onClick={() => setSelectedId(i.card.id)}
              className={`flex w-full items-center gap-2 border-b border-zinc-900 px-3 py-2 text-left text-sm ${
                selectedId === i.card.id ? "bg-zinc-900" : "hover:bg-zinc-900/50"
              }`}
            >
              <span className="text-xs text-zinc-600">
                {i.card.batch_number}.{i.card.position}
              </span>
              <span className="flex-1 truncate text-zinc-200">
                {i.extraction?.title ?? <em className="text-zinc-600">not extracted</em>}
              </span>
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  i.card.status === "published"
                    ? "bg-emerald-400"
                    : i.card.status === "reviewed"
                      ? "bg-cyan-400"
                      : i.extraction
                        ? "bg-amber-400"
                        : "bg-zinc-700"
                }`}
              />
            </button>
          ))}
          {items.length === 0 && (
            <p className="p-4 text-sm text-zinc-600">
              No cropped cards yet. <Link href="/admin/batches" className="text-cyan-400">Crop a batch</Link> first.
            </p>
          )}
        </div>
      </aside>

      {/* main: image + fields */}
      {selected ? (
        <div className="flex min-w-0 flex-1">
          <div className="flex w-1/2 flex-col items-center justify-center gap-3 bg-black p-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/files/${showBack ? selected.card.back_image : selected.card.front_image}?v=${imgV}`}
              alt={showBack ? "Card back" : "Card front"}
              className="max-h-[75vh] max-w-full rounded object-contain shadow-2xl"
            />
            <div className="flex items-center gap-3 text-sm">
              <button
                onClick={() => setShowBack((b) => !b)}
                disabled={!selected.card.back_image}
                className="rounded-md border border-zinc-700 px-4 py-1.5 text-zinc-200 hover:bg-zinc-900 disabled:opacity-40"
              >
                Flip to {showBack ? "front" : "back"} (f)
              </button>
              <button
                onClick={swapFaces}
                disabled={busy || !selected.card.back_image}
                className="rounded-md border border-zinc-700 px-4 py-1.5 text-zinc-200 hover:bg-zinc-900 disabled:opacity-40"
                title="Scanned back-up? Swap which image is the front — also swaps the transcriptions"
              >
                ⇄ Swap front/back
              </button>
              <span className="text-zinc-600">
                Batch {selected.card.batch_number}, card {selected.card.position}
                {selected.card.slug && ` · /${selected.card.slug}`}
              </span>
            </div>
          </div>

          <div className="w-1/2 overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-5">
            {selected.extraction ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-zinc-100">Extraction</h2>
                  <span className="text-xs text-zinc-600">
                    {selected.extraction.model} · confidence{" "}
                    <b
                      className={
                        selected.extraction.confidence === "high"
                          ? "text-emerald-400"
                          : selected.extraction.confidence === "medium"
                            ? "text-amber-400"
                            : "text-red-400"
                      }
                    >
                      {selected.extraction.confidence}
                    </b>
                    {selected.extraction.reviewed && " · reviewed ✓"}
                  </span>
                </div>

                <ExtractionFields draft={draft} onChange={setDraft} />

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={approveAndAdvance}
                    disabled={busy}
                    className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-black hover:bg-emerald-500 disabled:opacity-50"
                  >
                    Approve &amp; next (enter)
                  </button>
                  <button
                    onClick={() => saveDraft()}
                    disabled={busy}
                    className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-900 disabled:opacity-50"
                  >
                    Save edits
                  </button>
                  <button
                    onClick={rerun}
                    disabled={busy}
                    className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-900 disabled:opacity-50"
                  >
                    Re-run extraction
                  </button>
                  {selected.card.status === "reviewed" && (
                    <button
                      onClick={async () => {
                        await fetch(`/api/cards/${selected.card.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ status: "published" }),
                        });
                        void syncCards([selected.card.id]);
                        refresh();
                      }}
                      className="rounded-md border border-emerald-800 px-4 py-2 text-sm text-emerald-300 hover:bg-emerald-950"
                    >
                      Publish
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-500">
                <p>No extraction yet for this card.</p>
                <button
                  onClick={rerun}
                  disabled={busy}
                  className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-black hover:bg-amber-500 disabled:opacity-50"
                >
                  {busy ? "Extracting…" : "Extract now"}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-zinc-600">
          Select a card from the list.
        </div>
      )}
    </div>
  );
}
