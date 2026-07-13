"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import exifr from "exifr";
import type { BatchWithCounts, Settings } from "@/lib/types";
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

function isFront(name: string) {
  return /^front\.(jpe?g)$/i.test(name);
}
function isBack(name: string) {
  return /^back\.(jpe?g)$/i.test(name);
}

export default function BatchesPage() {
  const [batches, setBatches] = useState<BatchWithCounts[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [parsed, setParsed] = useState<ParsedBatch[] | null>(null);
  const [uploadStates, setUploadStates] = useState<Record<number, UploadState>>({});
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const [b, s] = await Promise.all([
      fetch("/api/batches").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ]);
    setBatches(b);
    setSettings(s);
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
    for (const file of Array.from(files)) {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const parts = rel.split("/");
      if (parts.length < 2) continue;
      const folder = parts[parts.length - 2];
      const num = Number(folder);
      if (!Number.isInteger(num) || num <= 0) continue;
      const name = parts[parts.length - 1];
      if (!isFront(name) && !isBack(name)) continue;
      if (!map.has(num)) map.set(num, { batchNumber: num, front: null, back: null, detectedDpi: null });
      const entry = map.get(num)!;
      if (isFront(name)) entry.front = file;
      else entry.back = file;
    }
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
    return { complete, problems, images, noDpi };
  }, [parsed]);

  const startUpload = useCallback(async () => {
    if (!parsed || !settings) return;
    setUploading(true);
    for (const b of parsed) {
      if (!b.front || !b.back) continue;
      setUploadStates((s) => ({ ...s, [b.batchNumber]: "uploading" }));
      const form = new FormData();
      form.set("batch_number", String(b.batchNumber));
      form.set("dpi", String(b.detectedDpi ?? settings.default_dpi));
      form.set("front", b.front);
      form.set("back", b.back);
      let ok = false;
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        try {
          const res = await fetch("/api/batches", { method: "POST", body: form });
          ok = res.ok;
        } catch {
          ok = false;
        }
        if (!ok) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
      setUploadStates((s) => ({ ...s, [b.batchNumber]: ok ? "done" : "error" }));
    }
    setUploading(false);
    setParsed(null);
    refresh();
  }, [parsed, settings, refresh]);

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
              onChange={(e) => onFolderPicked(e.target.files)}
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
                    onClick={() => setParsed(null)}
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
