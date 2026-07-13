"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

export interface IndexEntry {
  id: string;
  slug: string;
  title: string;
  category: string | null;
  attribution: string | null;
  ingredients: string[] | null;
  teaser: string | null;
}

/** Collapsed strip height / fully focused card height, in px. */
const MIN_H = 60;
const MAX_H = 190;
/** Distance (px) from the focus line over which a card decays back to a strip. */
const FALLOFF = 330;
/** Viewport y of the focus line — the top of the list, so card 1 opens at rest. */
const FOCUS_TOP = 126;

/**
 * Client side of the Index mode. Cards are flat white rows on a dark page;
 * the card at the top of the list is expanded, showing its attribution and a
 * teaser of the cleaned-up recipe. Scrolling opens each card in place as it
 * reaches the top.
 */
export default function IndexBrowser({ entries }: { entries: IndexEntry[] }) {
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      const c = e.category ?? "uncategorized";
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (categories.size > 0 && !categories.has(e.category ?? "uncategorized")) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        (e.attribution ?? "").toLowerCase().includes(q) ||
        (e.ingredients ?? []).some((ing) => ing.includes(q))
      );
    });
  }, [entries, query, categories]);

  // Scroll-driven fisheye: size every card from its distance to the focus line.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let raf = 0;

    const update = () => {
      raf = 0;
      const focusY = FOCUS_TOP;
      const cards = list.children as HTMLCollectionOf<HTMLElement>;
      // Measure everything first so height writes don't skew later reads.
      const tops: number[] = [];
      for (const card of cards) tops.push(card.getBoundingClientRect().top);
      for (let i = 0; i < cards.length; i++) {
        // Distance from where the card's strip sits, so its own growth
        // doesn't feed back into the measurement.
        const d = Math.abs(tops[i] + MIN_H / 2 - focusY);
        const t = Math.max(0, 1 - d / FALLOFF);
        const ease = t * t * (3 - 2 * t); // smoothstep
        cards[i].style.height = `${Math.round(MIN_H + (MAX_H - MIN_H) * ease)}px`;
      }
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [matches]);

  const toggleCategory = (c: string) =>
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  const filtered = query.trim() !== "" || categories.size > 0;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 pb-[80vh] pt-24 md:flex-row">
      {/* sidebar — sits directly on the dark background */}
      <aside className="shrink-0 md:sticky md:top-24 md:h-fit md:w-56">
        <h1 className="text-xs font-medium uppercase tracking-[0.35em] text-zinc-500">
          Recipe Index
        </h1>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search recipes…"
          className="mt-5 w-full border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-400"
        />
        <p className="mt-2 text-xs text-zinc-500">
          Searches titles, attributions & ingredients
        </p>

        <div className="mt-7">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
            Category
          </p>
          <div className="flex flex-wrap gap-1.5 md:flex-col md:gap-1">
            {categoryCounts.map(([c, n]) => {
              const active = categories.has(c);
              return (
                <button
                  key={c}
                  onClick={() => toggleCategory(c)}
                  className={`flex items-center justify-between gap-2 px-2.5 py-1.5 text-left text-sm transition-colors ${
                    active
                      ? "bg-zinc-100 text-zinc-900"
                      : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                  }`}
                >
                  <span className="capitalize">{c}</span>
                  <span className={active ? "text-zinc-500" : "text-zinc-600"}>{n}</span>
                </button>
              );
            })}
          </div>
        </div>

        <p className="mt-7 text-xs text-zinc-500">
          {matches.length} of {entries.length} cards
          {filtered && (
            <>
              {" · "}
              <button
                onClick={() => {
                  setQuery("");
                  setCategories(new Set());
                }}
                className="text-zinc-300 underline underline-offset-2 hover:text-white"
              >
                clear
              </button>
            </>
          )}
        </p>
      </aside>

      {/* the list */}
      <div ref={listRef} className="flex min-w-0 flex-1 flex-col">
        {matches.length === 0 ? (
          <p className="pt-8 text-sm text-zinc-500">No recipes match.</p>
        ) : (
          matches.map((r) => (
            <Link
              key={r.id}
              href={`/card/${r.slug}`}
              className="relative block shrink-0 overflow-hidden bg-white px-6 outline-none transition-colors hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-white"
              style={{ height: MIN_H }}
            >
              <span
                className="flex items-center justify-between gap-4"
                style={{ height: MIN_H }}
              >
                <span className="truncate text-lg font-medium tracking-tight">{r.title}</span>
                <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">
                  {r.category ?? ""}
                </span>
              </span>
              {/* subtle fill behind the exposed recipe area, so the clipped edge
                  reads as a crisp line against the next card's white title row */}
              <span
                className="pointer-events-none absolute inset-x-0 bottom-0 bg-zinc-50"
                style={{ top: MIN_H }}
              />
              {/* the index card's red header rule — full bleed, doubles as the row separator */}
              <span
                className="pointer-events-none absolute inset-x-0 z-10 h-px bg-[#c45850]/40"
                style={{ top: MIN_H - 1 }}
              />
              {r.attribution && (
                <span className="relative block text-sm text-zinc-400">
                  from the kitchen of {r.attribution}
                </span>
              )}
              {r.teaser && (
                <span className="relative mt-3 block whitespace-pre-line text-sm leading-6 text-zinc-500">
                  {r.teaser}
                </span>
              )}
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
