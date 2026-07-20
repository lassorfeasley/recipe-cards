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
  /** Owner / physical recipe box this card came from, e.g. "Phebe Butler". */
  collection: string | null;
}

/** Collapsed strip height, in px. */
const MIN_H = 60;
/** Spacing of the blue ruled lines in the card body (23px gap + 1px line). */
const RULE_SPACING = 24;
/**
 * Fully focused card height: the title strip plus enough body below the red
 * rule to expose 2.5 ruled-line spacings — a peek at the paper, not the
 * whole card.
 */
const MAX_H = MIN_H + Math.round(2.5 * RULE_SPACING);
/** Distance (px) from the focus line over which a card decays back to a strip.
    Tuned down with the smaller expanded height so the open/close still reads. */
const FALLOFF = 160;
/** Desktop viewport y of the focus line — the top of the list, so card 1 opens at rest. */
const FOCUS_TOP_DESKTOP = 126;
/**
 * Desktop viewport y where cards pin — the top card's resting position on load
 * (the container's pt-24). Cards are sticky, so instead of scrolling off the
 * top they stop at the stack and the cards after them slide up and pile on
 * top (later DOM order paints above). On mobile both lines are derived from
 * the measured fixed-header height instead.
 */
const STACK_TOP_DESKTOP = FOCUS_TOP_DESKTOP - MIN_H / 2;
/** Vertical offset between successive cards in the pile, in px. */
const STAGGER = 3;
/**
 * Max cards visibly staggered at once. New arrivals pin STAGGER below the
 * previous card until the pile is this deep; after that the pile stops
 * growing (its top never leaves STACK_TOP) and the oldest cards shift north
 * to overlap each other exactly, so only the 20 most recent slivers show.
 */
const STACK_VISIBLE = 20;

/** Cap on simultaneous fly-out clones — beyond this the rest just vanish. */
const MAX_FLYERS = 24;

/** A filtered-out card mid-flight: a fixed-position clone of its last frame. */
interface FlyingCard {
  key: string;
  title: string;
  category: string | null;
  top: number;
  left: number;
  width: number;
  height: number;
  dir: -1 | 1;
  delay: number;
}

/**
 * Client side of the Index mode. Cards are flat white rows on a dark page;
 * the card at the top of the list is expanded, showing its attribution and a
 * teaser of the cleaned-up recipe. Scrolling opens each card in place as it
 * reaches the top.
 */
export default function IndexBrowser({ entries }: { entries: IndexEntry[] }) {
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<Set<string>>(new Set());
  // Selected owner (recipe box); null = show every owner's cards.
  const [owner, setOwner] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  // Height of the fixed mobile header; 0 on desktop where it's display:none.
  const [headerH, setHeaderH] = useState(0);

  // The mobile header is position:fixed (sticky is unreliable in iOS Safari
  // when the URL bar collapses), so the card-pile geometry must be derived
  // from its real rendered height.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => setHeaderH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const stackTop = headerH > 0 ? headerH + 8 : STACK_TOP_DESKTOP;
  const focusTop = stackTop + MIN_H / 2;

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [flying, setFlying] = useState<FlyingCard[]>([]);
  // Last known viewport rects of visible cards, captured synchronously in the
  // filter handlers — by the time React re-renders, the DOM nodes are gone.
  const lastRects = useRef<Map<string, DOMRect>>(new Map());

  // Owners present in the data, with their card counts. The toggle only
  // appears when there's more than one box to switch between.
  const owners = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      if (!e.collection) continue;
      counts.set(e.collection, (counts.get(e.collection) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [entries]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      if (owner && (e.collection ?? null) !== owner) continue;
      const c = e.category ?? "uncategorized";
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries, owner]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (owner && (e.collection ?? null) !== owner) return false;
      if (categories.size > 0 && !categories.has(e.category ?? "uncategorized")) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        (e.attribution ?? "").toLowerCase().includes(q) ||
        (e.ingredients ?? []).some((ing) => ing.includes(q))
      );
    });
  }, [entries, query, categories, owner]);

  /** Snapshot the on-screen position of every visible card, keyed by id.
      The list renders one <a> per match in order, so pair them by index. */
  const captureRects = () => {
    const list = listRef.current;
    if (!list) return;
    const map = new Map<string, DOMRect>();
    const anchors = Array.from(list.children).filter(
      (el) => el.tagName === "A"
    );
    for (let i = 0; i < anchors.length && i < matches.length; i++) {
      const r = anchors[i].getBoundingClientRect();
      if (r.bottom > 0 && r.top < window.innerHeight) {
        map.set(matches[i].id, r);
      }
    }
    lastRects.current = map;
  };

  // Scroll-driven fisheye + pile stagger: size every card from its distance
  // to the focus line, and assign each pinned card its slot in the pile.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let raf = 0;
    let settleBudget = 0;

    const update = () => {
      raf = 0;
      // Only the card links — the list also holds the end-of-scroll spacer.
      const cards = Array.from(list.children).filter(
        (el): el is HTMLElement => el.tagName === "A"
      );
      if (cards.length === 0) return;

      const maxH = MAX_H;
      // The very last card opens into a complete 3×5 index card (h = w × 3/5)
      // rather than the partial peek — it's the end of the road, and the
      // h-screen spacer below gives it the room. Clamped so it still fits
      // under the stack line on short viewports.
      const lastMaxH = Math.max(
        maxH,
        Math.min(
          Math.round(list.clientWidth * (3 / 5)),
          window.innerHeight - stackTop - 24
        )
      );
      // The pile fans out over this many px; a card reaches full height this
      // far before the focus line, so it's already full-size when it docks
      // at the pile's lowest slot (no height jump on pinning).
      const pileDepth = STAGGER * (STACK_VISIBLE - 1);

      // Read phase. Rects report real sticky positions: a stuck card sits
      // exactly at its assigned top, so "reached its assigned top" IS the
      // pinned test — the browser does the flow math for us. Cards pin
      // strictly in list order, so the pinned set is the leading run.
      const tops = cards.map((c) => c.getBoundingClientRect().top);
      let pinnedCount = 0;
      while (
        pinnedCount < cards.length &&
        tops[pinnedCount] <=
          (parseFloat(cards[pinnedCount].style.top) || stackTop) + 0.5
      ) {
        pinnedCount++;
      }

      // Write phase. Pile slots, newest (deepest in the pile) card lowest:
      // the most recent STACK_VISIBLE pinned cards fan out by STAGGER;
      // anything older overlaps exactly at stackTop. Pinned cards hold full
      // height (constant, so the document doesn't churn); unpinned cards get
      // the pile's next open slot so they ride in seamlessly, sized by their
      // distance to the focus line.
      const deepest = Math.min(pinnedCount - 1, STACK_VISIBLE - 1);
      const nextSlot =
        stackTop + STAGGER * Math.min(pinnedCount, STACK_VISIBLE - 1);
      let changed = false;
      for (let i = 0; i < cards.length; i++) {
        const cardMaxH = i === cards.length - 1 ? lastMaxH : maxH;
        let top: number;
        let h: number;
        if (i < pinnedCount) {
          const fromNewest = pinnedCount - 1 - i;
          top = stackTop + STAGGER * Math.max(0, deepest - fromNewest);
          h = cardMaxH;
        } else {
          top = nextSlot;
          const d = Math.max(
            0,
            Math.abs(tops[i] + MIN_H / 2 - focusTop) - pileDepth
          );
          const t = Math.max(0, 1 - d / FALLOFF);
          const ease = t * t * (3 - 2 * t); // smoothstep
          h = Math.round(MIN_H + (cardMaxH - MIN_H) * ease);
        }
        const hPx = `${h}px`;
        const tPx = `${top}px`;
        if (cards[i].style.height !== hPx || cards[i].style.top !== tPx) {
          cards[i].style.height = hPx;
          cards[i].style.top = tPx;
          changed = true;
        }
      }
      // Height writes change the document length and flow positions, which
      // can change who's pinned — re-run until the layout settles (bounded,
      // in case rounding makes two states ping-pong).
      if (changed && settleBudget-- > 0) {
        if (document.hidden) update();
        else if (!raf) raf = requestAnimationFrame(update);
      }
    };

    const schedule = () => {
      settleBudget = 10;
      // rAF never fires while the tab is hidden — run synchronously there so
      // the layout is right the moment the tab is shown.
      if (document.hidden) update();
      else if (!raf) raf = requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [matches, stackTop, focusTop]);

  // Spawn fly-out clones for cards that just left the match list. prev is
  // tracked in a ref so this runs once per matches change.
  const prevMatches = useRef(matches);
  const flightSeq = useRef(0);
  useEffect(() => {
    const prev = prevMatches.current;
    prevMatches.current = matches;
    if (prev === matches) return;
    const nextIds = new Set(matches.map((m) => m.id));
    const removed = prev
      .filter((e) => !nextIds.has(e.id) && lastRects.current.has(e.id))
      .map((e) => ({ entry: e, rect: lastRects.current.get(e.id)! }))
      .sort((a, b) => a.rect.top - b.rect.top)
      .slice(0, MAX_FLYERS);
    if (removed.length === 0) return;
    const stamp = ++flightSeq.current;
    setFlying((f) => [
      ...f,
      ...removed.map(({ entry, rect }, i) => ({
        key: `${entry.id}-${stamp}`,
        title: entry.title,
        category: entry.category,
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        dir: (i % 2 === 0 ? -1 : 1) as -1 | 1,
        delay: i * 25,
      })),
    ]);
  }, [matches]);

  const toggleCategory = (c: string) => {
    captureRects();
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  const clearFilters = () => {
    captureRects();
    setQuery("");
    setCategories(new Set());
  };

  const selectOwner = (value: string | null) => {
    if (value === owner) return;
    captureRects();
    setOwner(value);
  };

  const filtered = query.trim() !== "" || categories.size > 0;

  const ownerToggle =
    owners.length >= 2 ? (
      <div className="flex divide-x divide-zinc-700 border border-zinc-700 md:flex-col md:divide-x-0 md:divide-y">
        {[{ label: "All", value: null as string | null }, ...owners.map(([name]) => ({ label: name, value: name as string | null }))].map(
          ({ label, value }) => {
            const active = owner === value;
            return (
              <button
                key={label}
                onClick={() => selectOwner(value)}
                aria-pressed={active}
                className={`min-w-0 flex-1 truncate px-2.5 py-1.5 text-center text-xs transition-colors md:text-left ${
                  active
                    ? "bg-zinc-100 font-medium text-zinc-900"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                }`}
              >
                {label}
              </button>
            );
          }
        )}
      </div>
    ) : null;

  const categoryChips = (
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
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col md:flex-row md:gap-10 px-4 md:pt-24">
      {/* Mobile: fixed search/filter bar. position:fixed (not sticky) so iOS
          Safari can't detach it while the URL bar collapses mid-scroll. The
          card pile pins just below its measured height. The category panel
          drops over the list from the bar's bottom edge. */}
      <div
        ref={headerRef}
        className="fixed inset-x-0 top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur md:hidden"
      >
        <div className="flex items-baseline justify-between">
          <h1 className="text-[10px] font-medium uppercase tracking-[0.35em] text-zinc-500">
            Recipe Index
          </h1>
          <p className="text-xs text-zinc-500">
            {matches.length} of {entries.length}
            {filtered && (
              <>
                {" · "}
                <button
                  onClick={clearFilters}
                  className="text-zinc-300 underline underline-offset-2 hover:text-white"
                >
                  clear
                </button>
              </>
            )}
          </p>
        </div>
        <div className="mt-2 flex gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => {
              captureRects();
              setQuery(e.target.value);
            }}
            placeholder="Search recipes…"
            className="h-10 min-w-0 flex-1 rounded-none border border-zinc-700 bg-zinc-900 px-3 text-base text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-400"
          />
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className={`flex h-10 shrink-0 items-center gap-1.5 border px-3 text-sm transition-colors ${
              filtersOpen || categories.size > 0
                ? "border-zinc-100 bg-zinc-100 text-zinc-900"
                : "border-zinc-700 bg-zinc-900 text-zinc-300"
            }`}
          >
            Filter
            {categories.size > 0 && (
              <span className="text-xs">· {categories.size}</span>
            )}
          </button>
        </div>
        {ownerToggle && <div className="mt-2">{ownerToggle}</div>}
        {filtersOpen && (
          <div className="absolute inset-x-0 top-full max-h-[60vh] overflow-y-auto border-b border-zinc-800 bg-zinc-950/95 px-4 pb-4 pt-3 backdrop-blur">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
              Category
            </p>
            {categoryChips}
            <div className="mt-3 flex justify-end">
              <button
                onClick={() => setFiltersOpen(false)}
                className="border border-zinc-700 px-4 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Desktop: sidebar on the dark background */}
      <aside className="hidden shrink-0 md:sticky md:top-24 md:block md:h-fit md:w-56">
        <h1 className="text-xs font-medium uppercase tracking-[0.35em] text-zinc-500">
          Recipe Index
        </h1>

        <input
          type="search"
          value={query}
          onChange={(e) => {
            captureRects();
            setQuery(e.target.value);
          }}
          placeholder="Search recipes…"
          className="mt-5 w-full border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-400"
        />
        <p className="mt-2 text-xs text-zinc-500">
          Searches titles, attributions & ingredients
        </p>

        {ownerToggle && (
          <div className="mt-7">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
              Owner
            </p>
            {ownerToggle}
          </div>
        )}

        <div className="mt-7">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
            Category
          </p>
          {categoryChips}
        </div>

        <p className="mt-7 text-xs text-zinc-500">
          {matches.length} of {entries.length} cards
          {filtered && (
            <>
              {" · "}
              <button
                onClick={clearFilters}
                className="text-zinc-300 underline underline-offset-2 hover:text-white"
              >
                clear
              </button>
            </>
          )}
        </p>
      </aside>

      {/* the list. The end-of-scroll room must be a real child of this div
          (not padding — sticky containment only spans the content box), so
          the pile, including the last card fully expanded, stays pinned at
          the stack line to the very end of the scroll instead of being
          pushed up off the viewport. */}
      <div
        ref={listRef}
        className="flex min-w-0 flex-1 flex-col md:pt-0"
        style={{ paddingTop: headerH > 0 ? headerH + 12 : undefined }}
      >
        {matches.length === 0 ? (
          <p className="pt-8 text-sm text-zinc-500">No recipes match.</p>
        ) : (
          matches.map((r) => (
            <Link
              key={r.id}
              href={`/card/${r.slug}`}
              className="sticky block shrink-0 overflow-hidden border-[0.5px] border-zinc-300 bg-white px-6 shadow-[0_2px_8px_rgba(0,0,0,0.18)] outline-none transition-colors hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-white"
              style={{ height: MIN_H, top: stackTop }}
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
              {/* blank index-card body: light blue ruled lines under the red
                  header rule */}
              <span
                className="pointer-events-none absolute inset-x-0 bottom-0"
                style={{
                  top: MIN_H,
                  background:
                    "repeating-linear-gradient(to bottom, transparent 0, transparent 23px, rgba(112, 146, 190, 0.35) 23px, rgba(112, 146, 190, 0.35) 24px)",
                }}
              />
              {/* the index card's red header rule — full bleed, doubles as the row separator */}
              <span
                className="pointer-events-none absolute inset-x-0 z-10 h-px bg-[#c45850]/40"
                style={{ top: MIN_H - 1 }}
              />
            </Link>
          ))
        )}
        {/* end-of-scroll room, inside the sticky containing block */}
        <div aria-hidden className="h-screen shrink-0" />
      </div>

      {/* fly-out clones of cards that were just filtered away */}
      {flying.length > 0 && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
        >
          {flying.map((f) => (
            <div
              key={f.key}
              onAnimationEnd={() =>
                setFlying((cur) => cur.filter((x) => x.key !== f.key))
              }
              className="index-card-fly absolute overflow-hidden border-[0.5px] border-zinc-300 bg-white px-6 shadow-[0_2px_8px_rgba(0,0,0,0.18)]"
              style={{
                top: f.top,
                left: f.left,
                width: f.width,
                height: f.height,
                animationName:
                  f.dir < 0 ? "index-card-fly-left" : "index-card-fly-right",
                animationDelay: `${f.delay}ms`,
              }}
            >
              <span
                className="flex items-center justify-between gap-4"
                style={{ height: MIN_H }}
              >
                <span className="truncate text-lg font-medium tracking-tight text-zinc-900">
                  {f.title}
                </span>
                <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">
                  {f.category ?? ""}
                </span>
              </span>
              <span
                className="pointer-events-none absolute inset-x-0 bottom-0"
                style={{
                  top: MIN_H,
                  background:
                    "repeating-linear-gradient(to bottom, transparent 0, transparent 23px, rgba(112, 146, 190, 0.35) 23px, rgba(112, 146, 190, 0.35) 24px)",
                }}
              />
              <span
                className="pointer-events-none absolute inset-x-0 z-10 h-px bg-[#c45850]/40"
                style={{ top: MIN_H - 1 }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
