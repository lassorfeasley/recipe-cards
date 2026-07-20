"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Card, Extraction } from "@/lib/types";
import { CARD_STATUS } from "@/lib/status";

interface Entry {
  card: Card & { batch_number: number };
  extraction: Extraction | null;
}

/** A cropped card pair: front shown, click to flip to the back. */
function FlipCard({ entry }: { entry: Entry }) {
  const [flipped, setFlipped] = useState(false);
  const { card, extraction } = entry;
  const title = extraction?.title ?? `Batch ${card.batch_number} · card ${card.position}`;

  return (
    <figure>
      <button
        onClick={() => setFlipped((v) => !v)}
        className="block w-full cursor-pointer"
        style={{ perspective: "1200px" }}
        title={flipped ? "Show front" : "Show back"}
      >
        <div
          className="relative aspect-[5/3] w-full transition-transform duration-500"
          style={{
            transformStyle: "preserve-3d",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={card.front_image ?? undefined}
            alt={`${title} — front`}
            loading="lazy"
            className="absolute inset-0 h-full w-full rounded-md object-contain"
            style={{ backfaceVisibility: "hidden" }}
          />
          {card.back_image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.back_image}
              alt={`${title} — back`}
              loading="lazy"
              className="absolute inset-0 h-full w-full rounded-md object-contain"
              style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
            />
          )}
        </div>
      </button>
      <figcaption className="mt-2 flex items-center gap-2 px-1">
        <Link
          href={`/admin/cards/${card.id}`}
          className="truncate text-sm text-zinc-300 hover:text-cyan-300 hover:underline"
          title="Open card profile"
        >
          {title}
        </Link>
        <span
          className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] ${CARD_STATUS[card.status].pill}`}
          title={CARD_STATUS[card.status].help}
        >
          {CARD_STATUS[card.status].label}
        </span>
      </figcaption>
    </figure>
  );
}

interface SyncStatus {
  configured: boolean;
  exported: number;
  pendingImages: number;
}

function SyncPanel({ exportedCount }: { exportedCount: number }) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const refresh = async () => {
    const res = await fetch("/api/sync");
    setStatus(await res.json());
  };

  useEffect(() => {
    // Fetch-on-mount: state updates happen after the awaited response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportedCount]);

  const runSync = async (force: boolean) => {
    setSyncing(true);
    setResult(null);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Sync failed (${res.status})`);
      setResult(
        `Synced ${data.cards} card(s), ${data.extractions} extraction(s), uploaded ${data.imagesUploaded} image(s)` +
          (data.errors.length ? ` — ${data.errors.length} error(s): ${data.errors[0]}` : "")
      );
      await refresh();
    } catch (err) {
      setResult(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  };

  if (!status) return null;
  if (!status.configured) {
    return (
      <p className="text-xs text-zinc-600">
        Supabase sync not configured — set keys in <code>.env.local</code>
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm">
      <span className="text-zinc-400">
        Supabase:{" "}
        {status.pendingImages > 0 ? (
          <b className="text-amber-300">{status.pendingImages} pair(s) pending upload</b>
        ) : (
          <span className="text-emerald-400">images up to date</span>
        )}
      </span>
      <button
        onClick={() => runSync(false)}
        disabled={syncing || status.exported === 0}
        className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-black hover:bg-emerald-500 disabled:opacity-50"
      >
        {syncing ? "Syncing…" : "Sync to Supabase"}
      </button>
      <button
        onClick={() => runSync(true)}
        disabled={syncing || status.exported === 0}
        className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:bg-zinc-900 disabled:opacity-50"
        title="Re-upload every image, even ones already synced"
      >
        Force full re-upload
      </button>
      {result && <span className="text-xs text-zinc-500">{result}</span>}
    </div>
  );
}

/**
 * One-time backfill: derive recipe_structured from the already-reviewed
 * recipe_markdown (text-only, no images, rows stay reviewed). Hidden once
 * nothing is left to process.
 */
function BackfillPanel() {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const stopRef = useRef(false);

  const check = async () => {
    const res = await fetch("/api/backfill-structured", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dry_run: true }),
    });
    const data = await res.json();
    setRemaining(typeof data.remaining === "number" ? data.remaining : 0);
  };

  useEffect(() => {
    // Fetch-on-mount: state updates happen after the awaited response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    check();
  }, []);

  const run = async () => {
    stopRef.current = false;
    setRunning(true);
    let done = 0;
    let tokensIn = 0;
    let tokensOut = 0;
    const failures: string[] = [];
    try {
      while (!stopRef.current) {
        const res = await fetch("/api/backfill-structured", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batch_size: 8 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        done += data.processed;
        tokensIn += data.usage?.input_tokens ?? 0;
        tokensOut += data.usage?.output_tokens ?? 0;
        failures.push(...(data.errors ?? []));
        setRemaining(data.remaining);
        const cost = (tokensIn * 3 + tokensOut * 15) / 1_000_000;
        setProgress(
          `${done} structured · ~$${cost.toFixed(2)}` +
            (failures.length ? ` · ${failures.length} failed (${failures[0]})` : "")
        );
        if (data.remaining === 0 || data.processed === 0) break;
      }
    } catch (err) {
      setProgress(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  if (remaining === null || (remaining === 0 && !progress)) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm">
      <span className="text-zinc-400">
        Structured recipes:{" "}
        {remaining > 0 ? (
          <b className="text-amber-300">{remaining} reviewed card(s) to backfill</b>
        ) : (
          <span className="text-emerald-400">all backfilled</span>
        )}
      </span>
      {remaining > 0 && (
        <button
          onClick={running ? () => (stopRef.current = true) : run}
          className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-black hover:bg-amber-500"
        >
          {running ? "Stop" : "Backfill from reviewed recipes"}
        </button>
      )}
      {progress && <span className="text-xs text-zinc-500">{progress}</span>}
    </div>
  );
}

export default function LibraryPage() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [source, setSource] = useState<"supabase" | "local" | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    // Fetch-on-mount: state updates happen after the awaited response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    (async () => {
      const res = await fetch("/api/library");
      const data = (await res.json()) as { source: "supabase" | "local"; entries: Entry[] };
      setEntries(data.entries);
      setSource(data.source);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!entries) return null;
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(({ card, extraction }) => {
      const hay = [
        extraction?.title,
        extraction?.category,
        extraction?.attribution,
        extraction?.transcription_front,
        extraction?.transcription_back,
        `batch ${card.batch_number}`,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [entries, query]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-amber-50">Library</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {entries === null
              ? "Loading…"
              : `${entries.length} card pair(s)${
                  source === "supabase" ? " · live from Supabase" : " · local data"
                } — click a card to flip it, click its title to open the profile`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <BackfillPanel />
          <SyncPanel exportedCount={entries?.length ?? 0} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, text, batch…"
            className="w-72 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
          />
        </div>
      </div>

      {filtered === null ? null : filtered.length === 0 ? (
        <p className="text-sm text-zinc-600">
          {entries && entries.length > 0
            ? "No cards match the search."
            : "No cards yet — use “+ Add batches” to upload and process your first scans."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {filtered.map((e) => (
            <FlipCard key={e.card.id} entry={e} />
          ))}
        </div>
      )}
    </div>
  );
}
