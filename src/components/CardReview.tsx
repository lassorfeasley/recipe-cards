"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { Batch, Card, CropRect, Settings } from "@/lib/types";
import { marginPx as computeMarginPx } from "@/lib/types";
import { withRotationAboutCenter } from "@/lib/cropGeometry";
import { renderCrop, canvasToJpeg, uploadCardImage } from "@/lib/cropExport";
import ShortcutsHelp from "./ShortcutsHelp";

const SHORTCUTS = [
  { keys: "click pane", action: "Make that side active for keyboard input" },
  { keys: "drag card", action: "Position the card under the fixed crop marks" },
  { keys: "scroll", action: "Zoom" },
  { keys: "arrows (+⇧)", action: "Nudge card 1px (10px)" },
  { keys: "[ ] (+⇧)", action: "Rotate card 0.5° (0.1°)" },
  { keys: "r", action: "Spin active face 180°" },
  { keys: "s", action: "Swap front/back (card scanned back-up)" },
  { keys: "enter", action: "Approve & go to next card" },
  { keys: "n / p", action: "Next / previous card" },
];

const RefineCanvas = dynamic(() => import("./RefineCanvas"), { ssr: false });

const isApproved = (c: Card) => !!c.front_image && !!c.back_image;

export default function CardReview({ batchId }: { batchId: string }) {
  const [batch, setBatch] = useState<Batch | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [idx, setIdx] = useState(0);
  const [front, setFront] = useState<CropRect | null>(null);
  const [back, setBack] = useState<CropRect | null>(null);
  const [frontRotate180, setFrontRotate180] = useState(false);
  const [rotate180, setRotate180] = useState(false);
  const [swapped, setSwapped] = useState(false);
  const [activePane, setActivePane] = useState<"front" | "back">("front");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<{ front: string | null; back: string | null }>({
    front: null,
    back: null,
  });
  const [imgsLoaded, setImgsLoaded] = useState(0);

  const frontImgRef = useRef<HTMLImageElement | null>(null);
  const backImgRef = useRef<HTMLImageElement | null>(null);

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
      const firstPending = (c as Card[]).findIndex((card) => !isApproved(card));
      setIdx(firstPending === -1 ? 0 : firstPending);
    })();
  }, [batchId]);

  const dpi = batch?.dpi ?? settings?.default_dpi ?? 300;
  const margin = settings ? computeMarginPx(dpi, settings.margin_inches) : 60;
  const card = cards[idx] ?? null;

  // Load the current card's geometry into the editors (adjust-during-render).
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (card && loadedFor !== card.id) {
    setLoadedFor(card.id);
    setFront(card.front_crop);
    setBack(card.back_crop ?? card.front_crop);
    setFrontRotate180(card.front_rotate180);
    setRotate180(card.back_rotate180);
    setSwapped(card.faces_swapped);
  }

  // Debounced export previews so the user sees exactly what will be saved
  // (including the 180° flip on the back).
  useEffect(() => {
    const t = setTimeout(() => {
      const make = (img: HTMLImageElement | null, rect: CropRect | null, flip: boolean) => {
        if (!img || !rect) return null;
        const full = renderCrop(img, rect, margin, flip);
        const scale = 260 / full.height;
        const small = document.createElement("canvas");
        small.width = Math.round(full.width * scale);
        small.height = 260;
        small.getContext("2d")!.drawImage(full, 0, 0, small.width, small.height);
        return small.toDataURL("image/jpeg", 0.8);
      };
      const a = make(frontImgRef.current, front, frontRotate180); // front-scan pane
      const b = make(backImgRef.current, back, rotate180); // back-scan pane
      setPreviews(swapped ? { front: b, back: a } : { front: a, back: b });
    }, 250);
    return () => clearTimeout(t);
  }, [front, back, frontRotate180, rotate180, swapped, margin, imgsLoaded]);

  const goTo = useCallback(
    (nextIdx: number) => {
      if (nextIdx < 0 || nextIdx >= cards.length) return;
      setIdx(nextIdx);
      setError(null);
    },
    [cards.length]
  );

  const approve = useCallback(async () => {
    const fImg = frontImgRef.current;
    const bImg = backImgRef.current;
    if (!card || !front || !back || !fImg || !bImg || busy) return;
    setBusy(true);
    setError(null);
    try {
      const patch = await fetch(`/api/cards/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          front_crop: front,
          back_crop: back,
          front_rotate180: frontRotate180,
          back_rotate180: rotate180,
          faces_swapped: swapped,
        }),
      });
      if (!patch.ok) throw new Error(`Saving crops failed (${patch.status})`);

      // When swapped, front.jpg comes from the back scan and vice versa.
      const fromFrontScan = renderCrop(fImg, front, margin, frontRotate180);
      const fromBackScan = renderCrop(bImg, back, margin, rotate180);
      await uploadCardImage(
        card.id,
        "front",
        await canvasToJpeg(swapped ? fromBackScan : fromFrontScan)
      );
      await uploadCardImage(
        card.id,
        "back",
        await canvasToJpeg(swapped ? fromFrontScan : fromBackScan)
      );

      const updated: Card = {
        ...card,
        front_crop: front,
        back_crop: back,
        front_rotate180: frontRotate180,
        back_rotate180: rotate180,
        faces_swapped: swapped,
        front_image: `cards/${card.id}/front.jpg`,
        back_image: `cards/${card.id}/back.jpg`,
      };
      const nextCards = cards.map((c) => (c.id === card.id ? updated : c));
      setCards(nextCards);

      const remaining = nextCards.findIndex((c, i) => i !== idx && !isApproved(c));
      if (remaining === -1) {
        await fetch(`/api/batches/${batchId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "complete" }),
        });
        setBatch((prev) => (prev ? { ...prev, status: "complete" } : prev));
      } else {
        setIdx(remaining);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [card, cards, front, back, frontRotate180, rotate180, swapped, margin, batchId, idx, busy]);

  const resetCard = useCallback(() => {
    if (!card) return;
    setFront(card.front_crop);
    setBack(card.back_crop ?? card.front_crop);
    setFrontRotate180(card.front_rotate180);
    setRotate180(card.back_rotate180);
    setSwapped(card.faces_swapped);
  }, [card]);

  // Keyboard: enter = approve & next, n/p = navigate. Nudge/rotate keys are
  // handled by whichever pane is active.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")
        return;
      if (e.key === "Enter") {
        e.preventDefault();
        approve();
      } else if (e.key === "n") {
        goTo(idx + 1);
      } else if (e.key === "p") {
        goTo(idx - 1);
      } else if (e.key === "s") {
        setSwapped((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [approve, goTo, idx]);

  // Rotate the card's apparent orientation by `delta` clockwise; the crop
  // marks stay fixed, so the rect rotation moves the opposite way.
  const rotateCard = useCallback(
    (face: "front" | "back", delta: number) => {
      const set = face === "front" ? setFront : setBack;
      set((prev) => (prev ? withRotationAboutCenter(prev, prev.rotation - delta) : prev));
    },
    []
  );

  if (!batch || !settings || cards.length === 0) {
    return (
      <div className="p-8 text-zinc-500">
        {batch && cards.length === 0 ? (
          <>
            No cards yet —{" "}
            <Link href={`/admin/batches/${batchId}/align`} className="text-cyan-400">
              align this batch
            </Link>{" "}
            first.
          </>
        ) : (
          "Loading…"
        )}
      </div>
    );
  }

  const approvedCount = cards.filter(isApproved).length;
  const allDone = approvedCount === cards.length;

  const btn =
    "rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-40 disabled:pointer-events-none";

  const paneHeader = (
    face: "front" | "back",
    label: string
  ) => (
    <div
      className={`flex shrink-0 items-center gap-2 border-b border-zinc-800 px-3 py-1.5 text-xs ${
        activePane === face ? "bg-cyan-950/40 text-cyan-300" : "bg-zinc-950 text-zinc-500"
      }`}
    >
      <span className="font-medium uppercase tracking-wider">
        {label} {activePane === face && "· active"}
      </span>
      <button className={`${btn} !px-2 !py-0.5 !text-xs`} onClick={() => rotateCard(face, -0.5)}>
        ⟲ 0.5°
      </button>
      <button className={`${btn} !px-2 !py-0.5 !text-xs`} onClick={() => rotateCard(face, 0.5)}>
        ⟳ 0.5°
      </button>
      <button
        className={`${btn} !px-2 !py-0.5 !text-xs ${
          (face === "front" ? frontRotate180 : rotate180) ? "border-amber-500 text-amber-300" : ""
        }`}
        onClick={() =>
          face === "front" ? setFrontRotate180((v) => !v) : setRotate180((v) => !v)
        }
        title={`${face === "front" ? "Front" : "Back"} reads upside-down (r)`}
      >
        ⤾ 180°
      </button>
      <span className="ml-auto">
        {face === "front"
          ? `card ${(0 - (front?.rotation ?? 0)).toFixed(1)}°${frontRotate180 ? " +180°" : ""}`
          : `card ${(0 - (back?.rotation ?? 0)).toFixed(1)}°${rotate180 ? " +180°" : ""}`}
      </span>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      {/* toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 bg-zinc-950 px-4 py-2">
        <Link
          href={`/admin/batches/${batchId}/align`}
          className="text-sm text-zinc-500 hover:text-zinc-200"
        >
          ← Align
        </Link>
        <span className="font-medium text-zinc-100">
          Batch {batch.batch_number} — Card {card ? card.position : "?"} of {cards.length}
        </span>
        <span className="text-xs text-zinc-600">
          {approvedCount}/{cards.length} approved
        </span>

        <div className="mx-2 h-5 w-px bg-zinc-800" />

        {/* card chips */}
        <div className="flex items-center gap-1">
          {cards.map((c, i) => (
            <button
              key={c.id}
              onClick={() => goTo(i)}
              className={`h-7 w-7 rounded-full text-xs font-bold ${
                i === idx
                  ? "bg-cyan-500 text-black"
                  : isApproved(c)
                    ? "bg-emerald-900 text-emerald-300"
                    : "bg-zinc-800 text-zinc-400"
              }`}
              title={isApproved(c) ? "approved" : "pending"}
            >
              {c.position}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {error && <span className="text-sm text-red-400">{error}</span>}
          <ShortcutsHelp shortcuts={SHORTCUTS} />
          <button
            className={`${btn} ${swapped ? "border-amber-500 text-amber-300" : ""}`}
            onClick={() => setSwapped((v) => !v)}
            title="This card was scanned back-up: swap which scan is the front (s)"
          >
            ⇄ Swap F/B
          </button>
          <button className={btn} onClick={resetCard} title="Discard adjustments and reload this card's saved crops">
            Reset
          </button>
          <button className={btn} onClick={() => goTo(idx - 1)} disabled={idx === 0}>
            ← Prev (p)
          </button>
          <button className={btn} onClick={() => goTo(idx + 1)} disabled={idx >= cards.length - 1}>
            Next (n) →
          </button>
          <button
            onClick={approve}
            disabled={busy || !front || !back}
            className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-black hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy ? "Saving…" : card && isApproved(card) ? "Re-approve (enter)" : "Approve (enter)"}
          </button>
          {allDone && (
            <Link href="/admin/review" className="text-sm text-cyan-400 hover:text-cyan-300">
              All approved — extract & review →
            </Link>
          )}
        </div>
      </div>

      <div className="shrink-0 border-b border-zinc-900 bg-black px-4 py-1 text-[11px] text-zinc-600">
        The crop marks stay put — <span className="text-zinc-400">drag the card</span> to position
        it under them. The previews below show exactly what will be saved. Press{" "}
        <kbd className="text-zinc-400">?</kbd> for keyboard shortcuts.
      </div>

      {/* editors */}
      <div className="flex min-h-0 flex-1">
        <div
          className={`flex min-w-0 flex-1 flex-col border-r-2 ${
            activePane === "front" ? "border-cyan-700" : "border-zinc-800"
          }`}
          onMouseDownCapture={() => setActivePane("front")}
        >
          {paneHeader("front", swapped ? "Back ⇄" : "Front")}
          <div className="min-h-0 flex-1">
            {front && card && (
              <RefineCanvas
                imageUrl={`/api/files/${batch.front_path}`}
                marginPx={margin}
                rect={front}
                rotate180={frontRotate180}
                onRectChange={setFront}
                onToggle180={() => setFrontRotate180((v) => !v)}
                onImageLoad={(img) => {
                  frontImgRef.current = img;
                  setImgsLoaded((n) => n + 1);
                }}
                keyboardActive={activePane === "front"}
                fitKey={card.id}
              />
            )}
          </div>
        </div>
        <div
          className="flex min-w-0 flex-1 flex-col"
          onMouseDownCapture={() => setActivePane("back")}
        >
          {paneHeader("back", swapped ? "Front ⇄" : "Back")}
          <div className="min-h-0 flex-1">
            {back && card && (
              <RefineCanvas
                imageUrl={`/api/files/${batch.back_path}`}
                marginPx={margin}
                rect={back}
                rotate180={rotate180}
                onRectChange={setBack}
                onToggle180={() => setRotate180((v) => !v)}
                onImageLoad={(img) => {
                  backImgRef.current = img;
                  setImgsLoaded((n) => n + 1);
                }}
                keyboardActive={activePane === "back"}
                fitKey={card.id}
              />
            )}
          </div>
        </div>
      </div>

      {/* export previews */}
      <div className="flex shrink-0 items-center gap-4 border-t border-zinc-800 bg-zinc-950 px-4 py-2">
        <span className="text-xs uppercase tracking-wider text-zinc-600">Export preview</span>
        {previews.front ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previews.front} alt="Front export preview" className="h-28 rounded" />
        ) : (
          <div className="h-28 w-44 animate-pulse rounded bg-zinc-900" />
        )}
        {previews.back ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previews.back} alt="Back export preview" className="h-28 rounded" />
        ) : (
          <div className="h-28 w-44 animate-pulse rounded bg-zinc-900" />
        )}
        <span className="text-xs text-zinc-600">
          exactly what will be saved — previews include any 180° flips
        </span>
      </div>
    </div>
  );
}
