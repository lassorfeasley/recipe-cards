"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Batch, Card, CropRect, Settings } from "@/lib/types";
import { marginPx as computeMarginPx } from "@/lib/types";
import type { CropBox, CropCanvasHandle } from "./CropCanvas";
import { detectCards } from "@/lib/detect";
import { readingOrder, mirrorHorizontal, mirrorVertical } from "@/lib/cropGeometry";

const CropCanvas = dynamic(() => import("./CropCanvas"), { ssr: false });

type ScanDims = { width: number; height: number } | null;

interface BatchDetail extends Batch {
  front_dims?: ScanDims;
  back_dims?: ScanDims;
}

/** One physical card: its crop box on each scan, paired by key. */
interface Pair {
  key: string; // card id once persisted, temp key before
  front: CropRect;
  back: CropRect;
  rotate180: boolean;
  label: number;
}

let keyCounter = 0;
function newKey() {
  return `new-${Date.now()}-${keyCounter++}`;
}

export default function AlignWorkbench({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [activePane, setActivePane] = useState<"front" | "back">("front");
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [frontReady, setFrontReady] = useState(false);
  const [backImgLoaded, setBackImgLoaded] = useState(false);

  const frontImgRef = useRef<HTMLImageElement | null>(null);
  const backImgRef = useRef<HTMLImageElement | null>(null);
  const frontCanvasRef = useRef<CropCanvasHandle>(null);
  const backCanvasRef = useRef<CropCanvasHandle>(null);
  const backInitRef = useRef(false);

  const cardsRef = useRef<Card[]>([]);
  const batchRef = useRef<BatchDetail | null>(null);
  const pairsRef = useRef<Pair[]>([]);
  useEffect(() => {
    cardsRef.current = cards;
    batchRef.current = batch;
    pairsRef.current = pairs;
  }, [cards, batch, pairs]);

  useEffect(() => {
    (async () => {
      const [b, s, c] = await Promise.all([
        fetch(`/api/batches/${batchId}`).then((r) => r.json()),
        fetch("/api/settings").then((r) => r.json()),
        fetch(`/api/batches/${batchId}/cards`).then((r) => r.json()),
      ]);
      setBatch(b);
      setSettings(s);
      setCards(c);
    })();
  }, [batchId]);

  const dpi = batch?.dpi ?? settings?.default_dpi ?? 300;
  const margin = settings ? computeMarginPx(dpi, settings.margin_inches) : 60;

  /** Map a front-scan rect into back-scan coordinates (scan canvases can differ). */
  const scaleFrontRect = useCallback((rect: CropRect): CropRect => {
    const b = batchRef.current;
    if (!b?.front_dims || !b?.back_dims) return rect;
    const sx = b.back_dims.width / b.front_dims.width;
    const sy = b.back_dims.height / b.front_dims.height;
    return { x: rect.x * sx, y: rect.y * sy, w: rect.w * sx, h: rect.h * sy, rotation: rect.rotation };
  }, []);

  const relabel = useCallback((list: Pair[]): Pair[] => {
    const order = readingOrder(list.map((p) => p.front));
    const next = [...list];
    order.forEach((idx, i) => {
      next[idx] = { ...next[idx], label: i + 1 };
    });
    return next;
  }, []);

  // ---- detection ----

  const detectBackAndMap = useCallback(
    (img: HTMLImageElement, base: Pair[]): Pair[] => {
      const rects = detectCards(img); // reading order
      const ordered = [...base].sort((a, b) => a.label - b.label);
      if (rects.length !== ordered.length) {
        setNotice(
          `Back auto-detect found ${rects.length} cards, expected ${ordered.length} — back boxes copied from front positions instead. Adjust manually or re-run Auto-detect.`
        );
        return base.map((p) => ({ ...p, back: scaleFrontRect(p.front) }));
      }
      setNotice(null);
      const byKey = new Map(ordered.map((p, i) => [p.key, rects[i]]));
      return base.map((p) => ({ ...p, back: byKey.get(p.key) ?? p.back }));
    },
    [scaleFrontRect]
  );

  const runAutoDetect = useCallback(() => {
    const fImg = frontImgRef.current;
    if (!fImg) return;
    const rects = detectCards(fImg);
    const current = pairsRef.current;
    let base: Pair[];
    if (rects.length === current.length && current.length > 0) {
      // Same count: keep card identities, refresh geometry.
      const ordered = [...current].sort((a, b) => a.label - b.label);
      base = ordered.map((p, i) => ({ ...p, front: rects[i], label: i + 1 }));
    } else {
      base = rects.map((rect, i) => ({
        key: newKey(),
        front: rect,
        back: scaleFrontRect(rect),
        rotate180: false,
        label: i + 1,
      }));
    }
    const bImg = backImgRef.current;
    setPairs(bImg ? detectBackAndMap(bImg, base) : base);
    setSelectedKey(null);
  }, [detectBackAndMap, scaleFrontRect]);

  // ---- initialization ----

  const onFrontLoad = useCallback(
    (img: HTMLImageElement) => {
      frontImgRef.current = img;
      if (frontReady) return;
      const saved = cardsRef.current.filter((c) => c.front_crop);
      if (saved.length > 0) {
        // Resume: load everything as last saved.
        setPairs(
          saved.map((c) => ({
            key: c.id,
            front: c.front_crop!,
            back: c.back_crop ?? scaleFrontRect(c.front_crop!),
            rotate180: c.back_rotate180,
            label: c.position,
          }))
        );
        backInitRef.current = true;
      } else {
        const rects = detectCards(img);
        setPairs(
          rects.map((rect, i) => ({
            key: newKey(),
            front: rect,
            back: scaleFrontRect(rect),
            rotate180: false,
            label: i + 1,
          }))
        );
      }
      setFrontReady(true);
    },
    [frontReady, scaleFrontRect]
  );

  const onBackLoad = useCallback((img: HTMLImageElement) => {
    backImgRef.current = img;
    setBackImgLoaded(true);
  }, []);

  // Back detection waits for both the back image and the front pairs.
  useEffect(() => {
    if (!backImgLoaded || !frontReady || backInitRef.current) return;
    backInitRef.current = true;
    const img = backImgRef.current;
    if (img && pairsRef.current.length > 0) {
      setPairs((prev) => detectBackAndMap(img, prev));
    }
  }, [backImgLoaded, frontReady, detectBackAndMap]);

  // ---- editing ----

  const frontBoxes: CropBox[] = pairs.map((p) => ({ key: p.key, rect: p.front, label: p.label }));
  const backBoxes: CropBox[] = pairs.map((p) => ({
    key: p.key,
    rect: p.back,
    label: p.label,
    rotate180: p.rotate180,
  }));

  const handleFrontChange = useCallback(
    (next: CropBox[]) => {
      setPairs((prev) => {
        if (next.length < prev.length) {
          // Deletion on the front removes the whole pair.
          const keep = new Set(next.map((b) => b.key));
          return relabel(prev.filter((p) => keep.has(p.key)));
        }
        const byKey = new Map(next.map((b) => [b.key, b.rect]));
        return relabel(prev.map((p) => ({ ...p, front: byKey.get(p.key) ?? p.front })));
      });
    },
    [relabel]
  );

  const handleBackChange = useCallback((next: CropBox[]) => {
    setPairs((prev) => {
      if (next.length < prev.length) return prev; // back boxes can't be deleted
      const byKey = new Map(next.map((b) => [b.key, b.rect]));
      return prev.map((p) => ({ ...p, back: byKey.get(p.key) ?? p.back }));
    });
  }, []);

  const toggle180 = useCallback((key: string) => {
    setPairs((prev) =>
      prev.map((p) => (p.key === key ? { ...p, rotate180: !p.rotate180 } : p))
    );
  }, []);

  const addPair = useCallback(() => {
    const fImg = frontImgRef.current;
    if (!fImg) return;
    const center = frontCanvasRef.current?.viewCenter() ?? {
      x: fImg.naturalWidth / 2,
      y: fImg.naturalHeight / 2,
    };
    const median = (dim: (p: Pair) => number) =>
      pairs.length
        ? [...pairs].map(dim).sort((a, b) => a - b)[Math.floor(pairs.length / 2)]
        : 0;
    const w = pairs.length ? median((p) => p.front.w) : fImg.naturalWidth / 4;
    const h = pairs.length ? median((p) => p.front.h) : (w * 3) / 5;
    const front = { x: center.x - w / 2, y: center.y - h / 2, w, h, rotation: 0 };
    const key = newKey();
    setPairs((prev) =>
      relabel([
        ...prev,
        { key, front, back: scaleFrontRect(front), rotate180: false, label: prev.length + 1 },
      ])
    );
    setSelectedKey(key);
  }, [pairs, relabel, scaleFrontRect]);

  const deleteSelected = useCallback(() => {
    if (!selectedKey) return;
    setPairs((prev) => relabel(prev.filter((p) => p.key !== selectedKey)));
    setSelectedKey(null);
  }, [selectedKey, relabel]);

  const copyFromFront = useCallback(() => {
    setPairs((prev) => prev.map((p) => ({ ...p, back: scaleFrontRect(p.front) })));
  }, [scaleFrontRect]);

  // Rotate the stored scan file(s) 180° server-side (crops are transformed
  // along with them), then reload so images and geometry come back fresh.
  const [flipping, setFlipping] = useState(false);
  const flipScans = useCallback(
    async (side: "front" | "back" | "both") => {
      setFlipping(true);
      try {
        const res = await fetch(`/api/batches/${batchId}/rotate-scans`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ side }),
        });
        if (!res.ok) throw new Error(`Rotating scan failed (${res.status})`);
        window.location.reload();
      } catch (err) {
        setNotice(err instanceof Error ? err.message : String(err));
        setFlipping(false);
      }
    },
    [batchId]
  );

  const applyMirror = useCallback((axis: "h" | "v") => {
    const img = backImgRef.current;
    if (!img) return;
    setPairs((prev) =>
      prev.map((p) => ({
        ...p,
        back:
          axis === "h"
            ? mirrorHorizontal(p.back, img.naturalWidth)
            : mirrorVertical(p.back, img.naturalHeight),
      }))
    );
  }, []);

  // ---- accept all ----

  const acceptAll = useCallback(async () => {
    if (!batch || pairs.length === 0) return;
    setSaving(true);
    try {
      const existingIds = new Set(cardsRef.current.map((c) => c.id));
      const ordered = [...pairs].sort((a, b) => a.label - b.label);

      const frontRes = await fetch(`/api/batches/${batchId}/cards`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          face: "front",
          crops: ordered.map((p, i) => ({
            card_id: existingIds.has(p.key) ? p.key : undefined,
            position: i + 1,
            crop: p.front,
          })),
        }),
      });
      if (!frontRes.ok) throw new Error(`Saving front crops failed (${frontRes.status})`);
      const savedCards = (await frontRes.json()) as Card[];
      const byPosition = new Map(savedCards.map((c) => [c.position, c]));

      const backRes = await fetch(`/api/batches/${batchId}/cards`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          face: "back",
          crops: ordered.map((p, i) => ({
            card_id: byPosition.get(i + 1)!.id,
            position: i + 1,
            crop: p.back,
            back_rotate180: p.rotate180,
          })),
        }),
      });
      if (!backRes.ok) throw new Error(`Saving back crops failed (${backRes.status})`);

      await fetch(`/api/batches/${batchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "backs_aligned" }),
      });

      router.push(`/admin/batches/${batchId}/cards`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }, [batch, batchId, pairs, router]);

  const selectedPair = pairs.find((p) => p.key === selectedKey) ?? null;

  if (!batch || !settings) {
    return <div className="p-8 text-zinc-500">Loading…</div>;
  }

  const btn =
    "rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-40 disabled:pointer-events-none";

  return (
    <div className="flex h-full flex-col">
      {/* toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 bg-zinc-950 px-4 py-2">
        <Link href="/admin/batches" className="text-sm text-zinc-500 hover:text-zinc-200">
          ← Batches
        </Link>
        <span className="font-medium text-zinc-100">Batch {batch.batch_number} — Align</span>
        <span className="text-xs text-zinc-600">
          {dpi} dpi · margin {settings.margin_inches}&quot; = {margin}px · {pairs.length} cards
        </span>

        <div className="mx-2 h-5 w-px bg-zinc-800" />

        <button
          className={btn}
          onClick={() => {
            frontCanvasRef.current?.fitView();
            backCanvasRef.current?.fitView();
          }}
          title="Fit (f)"
        >
          Fit
        </button>
        <button className={btn} onClick={runAutoDetect}>
          Auto-detect both
        </button>
        <button className={btn} onClick={addPair}>
          + Add card
        </button>
        <button className={btn} onClick={deleteSelected} disabled={!selectedPair}>
          Delete
        </button>

        <div className="mx-2 h-5 w-px bg-zinc-800" />

        <button className={btn} onClick={copyFromFront} title="Reset back boxes to front positions">
          Back ⇐ front
        </button>
        <button className={btn} onClick={() => applyMirror("h")} title="Mirror back boxes horizontally">
          Mirror ↔
        </button>
        <button className={btn} onClick={() => applyMirror("v")} title="Mirror back boxes vertically">
          Mirror ↕
        </button>
        <button
          className={`${btn} ${selectedPair?.rotate180 ? "border-amber-500 text-amber-300" : ""}`}
          onClick={() => selectedKey && toggle180(selectedKey)}
          disabled={!selectedPair}
          title="Back reads upside-down (r)"
        >
          ⤾ 180°
        </button>

        <div className="mx-2 h-5 w-px bg-zinc-800" />

        <span className="text-xs text-zinc-600">Scan upside-down?</span>
        <button
          className={btn}
          onClick={() => flipScans("front")}
          disabled={flipping}
          title="Rotate the front scan file 180° (crops follow)"
        >
          Flip front
        </button>
        <button
          className={btn}
          onClick={() => flipScans("back")}
          disabled={flipping}
          title="Rotate the back scan file 180° (crops follow)"
        >
          Flip back
        </button>
        <button
          className={btn}
          onClick={() => flipScans("both")}
          disabled={flipping}
          title="Rotate both scan files 180° (crops follow)"
        >
          Flip both
        </button>

        <div className="ml-auto flex items-center gap-3">
          {flipping && <span className="text-xs text-zinc-500">Rotating scans…</span>}
          <button
            onClick={acceptAll}
            disabled={saving || pairs.length === 0}
            className="rounded-md bg-amber-600 px-4 py-1.5 text-sm font-medium text-black hover:bg-amber-500 disabled:opacity-50"
          >
            {saving ? "Saving…" : `Accept all → review ${pairs.length} cards`}
          </button>
        </div>
      </div>

      {/* notice + hint bar */}
      {notice && (
        <div className="shrink-0 border-b border-amber-900 bg-amber-950/50 px-4 py-1.5 text-xs text-amber-300">
          {notice}
        </div>
      )}
      <div className="shrink-0 border-b border-zinc-900 bg-black px-4 py-1 text-[11px] text-zinc-600">
        click a pane to make it active · scroll = zoom · drag background = pan · tab = next card ·
        arrows = nudge 1px (shift 10px) · [ ] = rotate 0.5° (shift 0.1°) · r = back reads upside-down ·
        dashed line = card edge, solid line = export boundary with {margin}px margin
      </div>

      {/* dual canvases */}
      <div className="flex min-h-0 flex-1">
        <div
          className={`relative min-w-0 flex-1 border-r-2 ${
            activePane === "front" ? "border-cyan-700" : "border-zinc-800"
          }`}
          onMouseDownCapture={() => setActivePane("front")}
        >
          <span
            className={`pointer-events-none absolute left-3 top-2 z-10 rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wider ${
              activePane === "front" ? "bg-cyan-950/90 text-cyan-300" : "bg-black/70 text-zinc-500"
            }`}
          >
            Front {activePane === "front" && "· active"}
          </span>
          <CropCanvas
            ref={frontCanvasRef}
            imageUrl={`/api/files/${batch.front_path}`}
            marginPx={margin}
            boxes={frontBoxes}
            onBoxesChange={handleFrontChange}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
            onImageLoad={onFrontLoad}
            keyboardActive={activePane === "front"}
          />
        </div>
        <div
          className="relative min-w-0 flex-1"
          onMouseDownCapture={() => setActivePane("back")}
        >
          <span
            className={`pointer-events-none absolute left-3 top-2 z-10 rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wider ${
              activePane === "back" ? "bg-cyan-950/90 text-cyan-300" : "bg-black/70 text-zinc-500"
            }`}
          >
            Back {activePane === "back" && "· active"}
          </span>
          <CropCanvas
            ref={backCanvasRef}
            imageUrl={`/api/files/${batch.back_path}`}
            marginPx={margin}
            boxes={backBoxes}
            onBoxesChange={handleBackChange}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
            onToggle180={toggle180}
            onImageLoad={onBackLoad}
            keyboardActive={activePane === "back"}
          />
        </div>
      </div>
    </div>
  );
}
