"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import exifr from "exifr";
import type { BatchWithCounts, Collection, Settings } from "@/lib/types";
import { marginPx } from "@/lib/types";
import { BATCH_STATUS, batchNextStep } from "@/lib/status";

interface ParsedBatch {
  batchNumber: number;
  front: File | null;
  back: File | null;
  detectedDpi: number | null;
}

type UploadState = "pending" | "uploading" | "done" | "error";

async function detectDpi(file: File): Promise<number | null> {
  try {
    const meta = (await exifr.parse(file, { tiff: true, jfif: true } as never)) as
      | Record<string, unknown>
      | undefined;
    if (!meta) return null;
    const xres = meta.XResolution ?? meta.xResolution;
    if (typeof xres === "number" && xres > 1) {
      // ResolutionUnit 3 = centimeters
      const unit = meta.ResolutionUnit;
      const isCm = unit === 3 || unit === "cm";
      return Math.round(isCm ? xres * 2.54 : xres);
    }
    return null;
  } catch {
    return null;
  }
}

const IMAGE_EXT = /\.(jpe?g|png|tiff?|webp)$/i;
function isFront(name: string) {
  return /front/i.test(name) && IMAGE_EXT.test(name);
}
function isBack(name: string) {
  return /back/i.test(name) && IMAGE_EXT.test(name);
}

/**
 * The batch number is the nearest ancestor folder that's a bare number, so
 * both `12/Front.jpeg` and `10-18/12/Front.jpeg` (range folders grouping the
 * scans) resolve to batch 12.
 */
function batchNumberFromPath(parts: string[]): number | null {
  for (let i = parts.length - 2; i >= 0; i--) {
    if (/^\d+$/.test(parts[i])) {
      const n = Number(parts[i]);
      if (Number.isInteger(n) && n > 0) return n;
    }
  }
  return null;
}

export default function BatchesPage() {
  const [batches, setBatches] = useState<BatchWithCounts[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [uploadCollectionId, setUploadCollectionId] = useState<string>("");
  const [addingCollection, setAddingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [savingCollection, setSavingCollection] = useState(false);
  const [parsed, setParsed] = useState<ParsedBatch[] | null>(null);
  // Files in the picked folder that didn't map to a batch — shown as a
  // diagnostic when detection comes up empty or incomplete.
  const [skippedPaths, setSkippedPaths] = useState<string[]>([]);
  const [uploadStates, setUploadStates] = useState<Record<number, UploadState>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const [b, s, c] = await Promise.all([
      fetch("/api/batches").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/collections").then((r) => r.json()),
    ]);
    setBatches(b);
    setSettings(s);
    setCollections(c);
  }, []);

  useEffect(() => {
    // Fetch-on-mount: state updates happen after the awaited response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  // ---- folder parsing ----
  const onFolderPicked = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const map = new Map<number, ParsedBatch>();
    const skipped: string[] = [];
    for (const file of Array.from(files)) {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const parts = rel.split("/");
      const name = parts[parts.length - 1];
      // macOS resource forks (._Front.jpeg) and .DS_Store etc.
      if (name.startsWith(".")) continue;
      const front = isFront(name);
      const back = isBack(name);
      if (!front && !back) {
        skipped.push(rel);
        continue;
      }
      // Batch number: nearest numeric ancestor folder, else a number in the
      // filename itself ("Front 12.jpeg").
      const num = batchNumberFromPath(parts) ?? Number(name.match(/\d+/)?.[0] ?? NaN);
      if (!Number.isInteger(num) || num <= 0) {
        skipped.push(rel);
        continue;
      }
      if (!map.has(num)) map.set(num, { batchNumber: num, front: null, back: null, detectedDpi: null });
      const entry = map.get(num)!;
      if (front) entry.front = file;
      else entry.back = file;
    }
    setSkippedPaths(skipped);
    const list = [...map.values()].sort((a, b) => a.batchNumber - b.batchNumber);
    // Detect DPI from each front (fast — exifr reads only headers).
    await Promise.all(
      list.map(async (b) => {
        const probe = b.front ?? b.back;
        if (probe) b.detectedDpi = await detectDpi(probe);
      })
    );
    setParsed(list);
    setUploadStates({});
    setUploadError(null);
  }, []);

  const manifest = useMemo(() => {
    if (!parsed) return null;
    const complete = parsed.filter((b) => b.front && b.back);
    const problems = parsed
      .filter((b) => !b.front || !b.back)
      .map(
        (b) =>
          `Batch ${b.batchNumber} missing ${[!b.front && "Front.jpeg", !b.back && "Back.jpeg"]
            .filter(Boolean)
            .join(" and ")}`
      );
    const images = parsed.reduce((n, b) => n + (b.front ? 1 : 0) + (b.back ? 1 : 0), 0);
    const noDpi = parsed.filter((b) => b.front && b.back && !b.detectedDpi).length;
    // Uploading an existing batch number REPLACES that batch's scans (its
    // cards are kept) — flag it loudly so a new box isn't uploaded over an
    // old one that reused the same numbers.
    const existingNumbers = new Set(batches.map((b) => b.batch_number));
    const conflicts = complete
      .map((b) => b.batchNumber)
      .filter((n) => existingNumbers.has(n));
    return { complete, problems, images, noDpi, conflicts };
  }, [parsed, batches]);

  const startUpload = useCallback(async () => {
    if (!parsed || !settings) return;
    setUploading(true);
    setUploadError(null);
    const failures: string[] = [];
    for (const b of parsed) {
      if (!b.front || !b.back) continue;
      setUploadStates((s) => ({ ...s, [b.batchNumber]: "uploading" }));
      const form = new FormData();
      form.set("batch_number", String(b.batchNumber));
      form.set("dpi", String(b.detectedDpi ?? settings.default_dpi));
      if (uploadCollectionId) form.set("collection_id", uploadCollectionId);
      form.set("front", b.front);
      form.set("back", b.back);
      let ok = false;
      let lastError = "";
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        try {
          const res = await fetch("/api/batches", { method: "POST", body: form });
          ok = res.ok;
          if (!ok) {
            const err = (await res.json().catch(() => null)) as { error?: string } | null;
            lastError = err?.error ?? `HTTP ${res.status}`;
            // Client-side problem (bad file, missing field): retrying won't help.
            if (res.status < 500) break;
          }
        } catch (e) {
          ok = false;
          lastError = e instanceof Error ? e.message : String(e);
        }
        if (!ok) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
      setUploadStates((s) => ({ ...s, [b.batchNumber]: ok ? "done" : "error" }));
      if (!ok) failures.push(`Batch ${b.batchNumber}: ${lastError}`);
    }
    setUploading(false);
    if (failures.length > 0) {
      // Keep the manifest open so the per-batch ✗ marks and the reason stay visible.
      setUploadError(failures.join("\n"));
    } else {
      setParsed(null);
    }
    refresh();
  }, [parsed, settings, uploadCollectionId, refresh]);

  const deleteBatch = useCallback(
    async (b: BatchWithCounts) => {
      const ok = window.confirm(
        `Delete batch ${b.batch_number}? This removes its scans, ${b.card_count} card(s) and their exported images. This cannot be undone.`
      );
      if (!ok) return;
      const res = await fetch(`/api/batches/${b.id}`, { method: "DELETE" });
      if (!res.ok) {
        window.alert(`Delete failed (${res.status})`);
        return;
      }
      refresh();
    },
    [refresh]
  );

  const createCollection = useCallback(
    async (selectForUpload: boolean) => {
      const name = newCollectionName.trim();
      if (!name) return;
      setSavingCollection(true);
      try {
        const res = await fetch("/api/collections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          window.alert(`Could not create collection: ${err.error ?? res.status}`);
          return;
        }
        const created = (await res.json()) as Collection;
        setCollections((prev) => {
          if (prev.some((c) => c.id === created.id)) return prev;
          return [...prev, created].sort((a, b) => a.name.localeCompare(b.name));
        });
        if (selectForUpload) setUploadCollectionId(created.id);
        setNewCollectionName("");
        setAddingCollection(false);
      } finally {
        setSavingCollection(false);
      }
    },
    [newCollectionName]
  );

  const setBatchCollection = useCallback(
    async (b: BatchWithCounts, collectionId: string) => {
      await fetch(`/api/batches/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection_id: collectionId || null }),
      });
      refresh();
    },
    [refresh]
  );

  const updateSetting = useCallback(async (patch: Partial<Settings>) => {
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSettings(await res.json());
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-amber-50">Batches</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Upload scan folders (1/, 2/, … each with Front.jpeg + Back.jpeg)
          </p>
        </div>
        {settings && (
          <div className="flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm">
            <label className="flex items-center gap-2 text-zinc-400">
              Default DPI
              <input
                type="number"
                value={settings.default_dpi}
                onChange={(e) => updateSetting({ default_dpi: Number(e.target.value) })}
                className="w-20 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
              />
            </label>
            <label className="flex items-center gap-2 text-zinc-400">
              Card aspect
              <select
                value={settings.card_aspect}
                onChange={(e) => updateSetting({ card_aspect: e.target.value })}
                className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
              >
                <option value="5:3">3×5 (5:3)</option>
                <option value="3:2">4×6 (3:2)</option>
              </select>
            </label>
            <span className="text-zinc-600">
              margin {settings.margin_inches}&quot; = {marginPx(settings.default_dpi, settings.margin_inches)}px @
              {settings.default_dpi}dpi
            </span>
          </div>
        )}
      </div>

      {addingCollection && (
        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3">
          <span className="text-sm text-zinc-400">New collection</span>
          <input
            autoFocus
            type="text"
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                createCollection(!!parsed);
              }
              if (e.key === "Escape") {
                setAddingCollection(false);
                setNewCollectionName("");
              }
            }}
            placeholder="e.g. Adeline Feasley"
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 placeholder:text-zinc-600"
          />
          <button
            type="button"
            onClick={() => createCollection(!!parsed)}
            disabled={savingCollection || !newCollectionName.trim()}
            className="rounded bg-cyan-800 px-3 py-1 text-xs text-cyan-100 hover:bg-cyan-700 disabled:opacity-50"
          >
            {savingCollection ? "Adding…" : "Add"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAddingCollection(false);
              setNewCollectionName("");
            }}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            Cancel
          </button>
        </div>
      )}

      {/* upload zone */}
      <div className="mb-8 rounded-xl border border-dashed border-zinc-700 bg-zinc-950 p-6">
        {!parsed ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="text-zinc-400">
              Select the parent folder containing all numbered batch folders
            </p>
            <button
              onClick={() => inputRef.current?.click()}
              className="rounded-lg bg-amber-600 px-5 py-2 font-medium text-black hover:bg-amber-500"
            >
              Choose folder…
            </button>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              // @ts-expect-error webkitdirectory is non-standard
              webkitdirectory=""
              multiple
              onChange={(e) => {
                onFolderPicked(e.target.files);
                // Reset so re-picking the same folder fires change again.
                e.target.value = "";
              }}
            />
          </div>
        ) : (
          <div>
            <h2 className="mb-2 font-medium text-zinc-200">Pre-upload manifest</h2>
            {manifest && (
              <>
                <p className="text-sm text-zinc-400">
                  Found <b className="text-zinc-100">{parsed.length}</b> batches,{" "}
                  <b className="text-zinc-100">{manifest.images}</b> images.{" "}
                  {manifest.noDpi > 0 && (
                    <span className="text-amber-400">
                      {manifest.noDpi} batch(es) missing DPI metadata — default DPI (
                      {settings?.default_dpi}) will be used.
                    </span>
                  )}
                </p>
                {manifest.problems.length > 0 && (
                  <ul className="mt-2 list-inside list-disc text-sm text-red-400">
                    {manifest.problems.map((p) => (
                      <li key={p}>{p} — will be skipped</li>
                    ))}
                  </ul>
                )}
                {skippedPaths.length > 0 && (parsed.length === 0 || manifest.problems.length > 0) && (
                  <div className="mt-3 rounded-lg border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-200/80">
                    <p className="mb-1 font-medium text-amber-200">
                      {parsed.length === 0
                        ? "No batches detected. Files need a numbered folder (1/, 2/, …) or a number in the name, plus “front”/“back” in the filename. Files seen:"
                        : `${skippedPaths.length} file(s) didn't match any batch:`}
                    </p>
                    <ul className="max-h-32 overflow-auto font-mono">
                      {skippedPaths.slice(0, 30).map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                      {skippedPaths.length > 30 && <li>… and {skippedPaths.length - 30} more</li>}
                    </ul>
                  </div>
                )}
                <div className="mt-3 grid max-h-64 grid-cols-2 gap-1 overflow-auto text-xs text-zinc-500 sm:grid-cols-3 md:grid-cols-4">
                  {parsed.map((b) => (
                    <div key={b.batchNumber} className="flex items-center gap-2 rounded bg-zinc-900 px-2 py-1">
                      <span className="text-zinc-300">#{b.batchNumber}</span>
                      <span>{b.front ? "F" : "–"}/{b.back ? "B" : "–"}</span>
                      <span>{b.detectedDpi ? `${b.detectedDpi}dpi` : "no dpi"}</span>
                      <span className="ml-auto">
                        {uploadStates[b.batchNumber] === "uploading" && "⏳"}
                        {uploadStates[b.batchNumber] === "done" && "✓"}
                        {uploadStates[b.batchNumber] === "error" && "✗"}
                      </span>
                    </div>
                  ))}
                </div>
                <label className="mt-4 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
                  Collection
                  <select
                    value={uploadCollectionId}
                    onChange={(e) => setUploadCollectionId(e.target.value)}
                    className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
                  >
                    <option value="">— pick whose box these came from —</option>
                    {collections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setAddingCollection(true)}
                    className="text-xs text-cyan-400 hover:text-cyan-300"
                  >
                    + New
                  </button>
                </label>
                {manifest.conflicts.length > 0 && (
                  <p className="mt-3 rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300">
                    Batch number{manifest.conflicts.length > 1 ? "s" : ""}{" "}
                    {manifest.conflicts.join(", ")} already exist — uploading will REPLACE those
                    batches&apos; scans (their cards are kept). If these are new scans from a
                    different box, renumber the folders first (e.g. continue from{" "}
                    {Math.max(0, ...batches.map((b) => b.batch_number)) + 1}).
                  </p>
                )}
                {uploadError && (
                  <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300">
                    {uploadError}
                  </pre>
                )}
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={startUpload}
                    disabled={uploading || manifest.complete.length === 0}
                    className="rounded-lg bg-amber-600 px-5 py-2 font-medium text-black hover:bg-amber-500 disabled:opacity-50"
                  >
                    {uploading
                      ? `Uploading… (${Object.values(uploadStates).filter((s) => s === "done").length}/${manifest.complete.length})`
                      : `Upload ${manifest.complete.length} batches`}
                  </button>
                  <button
                    onClick={() => {
                      setParsed(null);
                      setUploadError(null);
                    }}
                    disabled={uploading}
                    className="rounded-lg border border-zinc-700 px-5 py-2 text-zinc-300 hover:bg-zinc-900 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* batch list */}
      {batches.length === 0 ? (
        <p className="text-sm text-zinc-600">
          No batches yet — choose your scans folder above to get started. Each numbered folder
          becomes one batch and moves through: align scans → review cards → extract & review
          metadata → publish.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {batches.map((b) => {
            const next = batchNextStep(b);
            const status = BATCH_STATUS[b.status] ?? BATCH_STATUS.uploaded;
            const exported = Math.min(b.fronts_exported, b.backs_exported);
            return (
              <div key={b.id} className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
                <Link href={next.href} className="block" title={next.done ? "Open card review" : next.label}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/files/scans/${b.batch_number}/front_thumb.jpg`}
                    alt={`Batch ${b.batch_number} front scan`}
                    className="h-44 w-full object-cover transition-opacity hover:opacity-80"
                  />
                </Link>
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-zinc-100">Batch {b.batch_number}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${status.pill}`}>
                      {status.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {b.card_count > 0
                      ? `${b.card_count} cards · ${exported} approved · ${b.extracted_count} with metadata`
                      : "cards not detected yet"}
                    {b.dpi ? ` · ${b.dpi} dpi` : ""}
                  </p>
                  <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    Collection
                    <select
                      value={b.collection_id ?? ""}
                      onChange={(e) => setBatchCollection(b, e.target.value)}
                      className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-zinc-300"
                      title="Whose recipe box these cards came from (applies to all cards in the batch)"
                    >
                      <option value="">— none —</option>
                      {collections.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setAddingCollection(true)}
                      className="text-cyan-500 hover:text-cyan-300"
                    >
                      + New
                    </button>
                  </label>
                  <div className="mt-3 flex items-center gap-2 text-sm">
                    {next.done ? (
                      <span className="rounded-md bg-emerald-950 px-3 py-1.5 text-emerald-300">
                        ✓ {next.label}
                      </span>
                    ) : (
                      <Link
                        href={next.href}
                        className="rounded-md bg-amber-600 px-3 py-1.5 font-medium text-black hover:bg-amber-500"
                      >
                        {next.label} →
                      </Link>
                    )}
                    <Link
                      href={`/admin/batches/${b.id}/align`}
                      className="rounded-md px-2 py-1.5 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
                      title="Re-open scan alignment"
                    >
                      Align
                    </Link>
                    {b.card_count > 0 && (
                      <Link
                        href={`/admin/batches/${b.id}/cards`}
                        className="rounded-md px-2 py-1.5 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
                        title="Re-open per-card review"
                      >
                        Cards
                      </Link>
                    )}
                    <button
                      onClick={() => deleteBatch(b)}
                      className="ml-auto rounded-md px-2 py-1.5 text-zinc-700 hover:bg-red-950/60 hover:text-red-300"
                      title={`Delete batch ${b.batch_number} and all its data`}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
