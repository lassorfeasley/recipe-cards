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
  /** Owner / physical recipe box this card came from, e.g. "Phoebe Butler". */
  collection: string | null;
  /** Estimated total time in minutes (active + passive). Null when unknown. */
  totalMinutes: number | null;
}

/**
 * Time-to-cook buckets for the advanced filter. Each `test` is applied to a
 * recipe's `totalMinutes`; cards with no time estimate match no bucket and so
 * only show when the time filter is "Any".
 */
const TIME_RANGES: { id: string; label: string; test: (m: number) => boolean }[] = [
  { id: "quick", label: "Under 30 min", test: (m) => m <= 30 },
  { id: "medium", label: "30–60 min", test: (m) => m > 30 && m <= 60 },
  { id: "long", label: "1–2 hours", test: (m) => m > 60 && m <= 120 },
  { id: "epic", label: "Over 2 hours", test: (m) => m > 120 },
];

/** Title-case a lowercase category tag for display, e.g. "dessert" → "Dessert". */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Max lean for piled index cards, in degrees (±) — small, so the stack reads
    as hand-tossed rather than chaotic. */
const STACK_TILT_DEG = 2.2;

/** Deterministic small rotation (degrees) per card id, so each card keeps the
    same lean every render and as it scrolls through the pile. */
function cardTilt(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const r = ((Math.imul(h ^ 0x9e3779b9, 2654435761) >>> 0) % 1000) / 1000;
  return (r * 2 - 1) * STACK_TILT_DEG;
}

interface Option {
  value: string;
  label: string;
  count?: number;
}

/**
 * A dropdown combo box that allows selecting any number of options. The
 * trigger summarizes the selection ("Meal type", "Dessert", or "Meal type · 3")
 * and the panel is a checklist. Closes on outside click or Escape.
 */
function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (value: string) =>
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );

  const summary =
    selected.length === 0
      ? label
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? label)
        : `${label} · ${selected.length}`;

  const active = selected.length > 0;

  return (
    <div ref={ref} className="relative w-full md:w-auto md:shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`flex h-9 w-full items-center gap-1.5 border bg-zinc-900 px-3 text-sm transition-colors md:w-auto ${
          active
            ? "border-zinc-400 text-zinc-100"
            : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"
        }`}
      >
        <span className="flex-1 truncate text-left">{summary}</span>
        <svg
          viewBox="0 0 12 12"
          aria-hidden
          className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M2.5 4.5 6 8l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable
          className="absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-auto border border-zinc-700 bg-zinc-950 py-1 shadow-xl md:right-auto md:min-w-56"
        >
          {options.map((o) => {
            const isSel = selected.includes(o.value);
            return (
              <button
                key={o.value}
                role="option"
                aria-selected={isSel}
                onClick={() => toggle(o.value)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-zinc-800"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center border ${
                    isSel ? "border-zinc-100 bg-zinc-100 text-zinc-900" : "border-zinc-600"
                  }`}
                >
                  {isSel && (
                    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2.5 6.5 5 9l4.5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="flex-1 truncate">{o.label}</span>
                {o.count != null && (
                  <span className="text-xs text-zinc-500">{o.count}</span>
                )}
              </button>
            );
          })}
          {active && (
            <button
              onClick={() => onChange([])}
              className="mt-1 w-full border-t border-zinc-800 px-3 py-2 text-left text-xs text-zinc-400 transition-colors hover:text-white"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Collapsed strip height, in px. */
const MIN_H = 60;
/** Max card width, in px — cards never grow wider than a real index card. */
const CARD_MAX_W = 575;
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
/**
 * Fallback pin line used only for the first paint before the top nav's height
 * is measured. Once measured, both the stack and focus lines are derived from
 * the real nav height. Cards are sticky, so instead of scrolling off the top
 * they stop at the stack line and later cards slide up and pile on top (later
 * DOM order paints above).
 */
const STACK_TOP_DESKTOP = 96;
/** Breathing room between the header bottom and where the top card pins, in px. */
const STACK_GAP = 40;
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

/** A card mid-flight: a fixed-position clone. "out" cards were just filtered
    away and sail off the sides; "in" cards were just added and sail back on. */
interface FlyingCard {
  key: string;
  id: string;
  title: string;
  category: string | null;
  top: number;
  left: number;
  width: number;
  height: number;
  dir: -1 | 1;
  delay: number;
  mode: "out" | "in";
  /** Resting lean (deg) so the clone matches the card it stands in for. */
  rotate: number;
}

/**
 * Client side of the Index mode. Cards are flat white rows on a dark page;
 * the card at the top of the list is expanded, showing its attribution and a
 * teaser of the cleaned-up recipe. Scrolling opens each card in place as it
 * reaches the top.
 */
export default function IndexBrowser({ entries }: { entries: IndexEntry[] }) {
  const [query, setQuery] = useState("");
  // Multi-select filters — each is an array of chosen values; empty = no
  // constraint on that dimension. Within a dimension the values are OR'd;
  // across dimensions they're AND'd.
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedOwners, setSelectedOwners] = useState<string[]>([]);
  // Chosen time-to-cook bucket ids (see TIME_RANGES).
  const [timeRanges, setTimeRanges] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  // Measured height of the fixed top nav — the card-pile geometry is derived
  // from it (position:fixed, since sticky is unreliable in iOS Safari when the
  // URL bar collapses mid-scroll).
  const [headerH, setHeaderH] = useState(0);

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

  const stackTop = headerH > 0 ? headerH + STACK_GAP : STACK_TOP_DESKTOP + STACK_GAP;
  const focusTop = stackTop + MIN_H / 2;

  const [flying, setFlying] = useState<FlyingCard[]>([]);
  // Ids of cards currently sailing back in: the real row is held invisible at
  // its landing spot until its clone lands, so the entrance isn't doubled.
  const [flyingInIds, setFlyingInIds] = useState<Set<string>>(new Set());
  // Last known viewport rects of visible cards, captured synchronously in the
  // filter handlers — by the time React re-renders, the DOM nodes are gone.
  const lastRects = useRef<Map<string, DOMRect>>(new Map());
  // Pending safety-sweep timers, one per fly batch. animationend is the fast
  // path for cleanup, but during rapid filter changes React drops enough of
  // those events that clones (and the invisible real rows they mask) leak —
  // these timers guarantee every batch is torn down. Cleared on unmount.
  const flightTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  useEffect(
    () => () => {
      for (const t of flightTimers.current) clearTimeout(t);
      flightTimers.current.clear();
    },
    []
  );

  // Owners present in the data, with their card counts. The recipe-box combo
  // box only appears when there's more than one box to choose between.
  const owners = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      if (!e.collection) continue;
      counts.set(e.collection, (counts.get(e.collection) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [entries]);

  // True when this card belongs to one of the chosen recipe boxes (or none are
  // chosen). Reused by the count memos and the match filter.
  const inSelectedOwners = (collection: string | null) =>
    selectedOwners.length === 0 || selectedOwners.includes(collection ?? "");

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      if (selectedOwners.length && !selectedOwners.includes(e.collection ?? "")) continue;
      const c = e.category ?? "uncategorized";
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries, selectedOwners]);

  // Card counts per time bucket, scoped to the selected recipe boxes (matching
  // how categoryCounts is scoped) so each option shows how many it would surface.
  const timeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      if (selectedOwners.length && !selectedOwners.includes(e.collection ?? "")) continue;
      if (e.totalMinutes == null) continue;
      const r = TIME_RANGES.find((rr) => rr.test(e.totalMinutes!));
      if (r) counts.set(r.id, (counts.get(r.id) ?? 0) + 1);
    }
    return counts;
  }, [entries, selectedOwners]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ranges = timeRanges
      .map((id) => TIME_RANGES.find((r) => r.id === id))
      .filter((r): r is (typeof TIME_RANGES)[number] => r != null);
    return entries.filter((e) => {
      if (selectedOwners.length && !selectedOwners.includes(e.collection ?? "")) return false;
      if (categories.length && !categories.includes(e.category ?? "uncategorized")) return false;
      if (ranges.length) {
        if (e.totalMinutes == null) return false;
        if (!ranges.some((r) => r.test(e.totalMinutes!))) return false;
      }
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        (e.attribution ?? "").toLowerCase().includes(q) ||
        (e.ingredients ?? []).some((ing) => ing.includes(q))
      );
    });
  }, [entries, query, categories, selectedOwners, timeRanges]);

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
      const cardW = Math.min(list.clientWidth, CARD_MAX_W);
      const lastMaxH = Math.max(
        maxH,
        Math.min(
          Math.round(cardW * (3 / 5)),
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

  // Mobile pinch-to-zoom preview: two-finger pinch scales the whole list
  // between 0.5× and 1.5×, anchored at the pinch midpoint, then springs
  // elastically back to 1× the moment a finger lifts. Purely transient —
  // written straight to the DOM so the gesture never triggers a React
  // re-render, and it always resets, so it can't corrupt the scroll-driven
  // layout below it.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    /** Min/max scale: ±50% from the 1× default. */
    const MIN_SCALE = 0.5;
    const MAX_SCALE = 1.5;
    let startDist = 0;
    let active = false;

    const dist = (t: TouchList) =>
      Math.hypot(
        t[0].clientX - t[1].clientX,
        t[0].clientY - t[1].clientY
      );

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      active = true;
      startDist = dist(e.touches) || 1;
      const rect = el.getBoundingClientRect();
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      // Anchor the zoom under the fingers so it grows/shrinks in place.
      el.style.transformOrigin = `${midX - rect.left}px ${midY - rect.top}px`;
      el.style.transition = "none";
      el.style.willChange = "transform";
    };

    const onMove = (e: TouchEvent) => {
      if (!active || e.touches.length !== 2) return;
      // Stop the browser's own page zoom so ours is the only one.
      e.preventDefault();
      const raw = dist(e.touches) / startDist;
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, raw));
      el.style.transform = `scale(${scale})`;
    };

    const end = () => {
      if (!active) return;
      active = false;
      // Elastic snap home: an overshooting curve gives the springy rebound.
      el.style.transition = "transform 480ms cubic-bezier(0.22, 1.35, 0.4, 1)";
      el.style.transform = "scale(1)";
    };

    const clearWillChange = (e: TransitionEvent) => {
      if (e.propertyName === "transform" && !active) el.style.willChange = "";
    };

    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    el.addEventListener("transitionend", clearWillChange);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
      el.removeEventListener("transitionend", clearWillChange);
    };
  }, []);

  // Spawn fly clones on every match-set change: cards that just left sail off
  // the sides ("out"), cards that just arrived sail back on ("in"). prev is
  // tracked in a ref so this runs once per matches change.
  const prevMatches = useRef(matches);
  const flightSeq = useRef(0);
  useEffect(() => {
    const prev = prevMatches.current;
    prevMatches.current = matches;
    if (prev === matches) return;
    const prevIds = new Set(prev.map((m) => m.id));
    const nextIds = new Set(matches.map((m) => m.id));

    const removed = prev
      .filter((e) => !nextIds.has(e.id) && lastRects.current.has(e.id))
      .map((e) => ({ entry: e, rect: lastRects.current.get(e.id)! }))
      .sort((a, b) => a.rect.top - b.rect.top)
      .slice(0, MAX_FLYERS);

    // Landing spots for newly added cards are read straight from the freshly
    // committed DOM — one <a> per match, in order — and only those on screen
    // are worth animating in.
    const list = listRef.current;
    const anchors = list
      ? (Array.from(list.children).filter((el) => el.tagName === "A") as HTMLElement[])
      : [];
    const added: { entry: IndexEntry; rect: DOMRect }[] = [];
    for (let i = 0; i < anchors.length && i < matches.length; i++) {
      if (prevIds.has(matches[i].id)) continue;
      const rect = anchors[i].getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < window.innerHeight) {
        added.push({ entry: matches[i], rect });
      }
    }
    const addedCapped = added.slice(0, MAX_FLYERS);

    if (removed.length === 0 && addedCapped.length === 0) return;
    const stamp = ++flightSeq.current;

    const outFlyers: FlyingCard[] = removed.map(({ entry, rect }, i) => ({
      key: `${entry.id}-out-${stamp}`,
      id: entry.id,
      title: entry.title,
      category: entry.category,
      top: rect.top,
      left: rect.left,
      width: rect.width,
      // Fly at full 3×5 proportions, not the collapsed strip height — a
      // sliver flying off looks decapitated; we want the whole card to sail.
      height: Math.max(rect.height, Math.round(rect.width * (3 / 5))),
      dir: (i % 2 === 0 ? -1 : 1) as -1 | 1,
      delay: i * 25,
      mode: "out" as const,
      rotate: cardTilt(entry.id),
    }));
    const inFlyers: FlyingCard[] = addedCapped.map(({ entry, rect }, i) => ({
      key: `${entry.id}-in-${stamp}`,
      id: entry.id,
      title: entry.title,
      category: entry.category,
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: Math.max(rect.height, Math.round(rect.width * (3 / 5))),
      dir: (i % 2 === 0 ? -1 : 1) as -1 | 1,
      delay: i * 25,
      mode: "in" as const,
      rotate: cardTilt(entry.id),
    }));

    if (inFlyers.length > 0) {
      setFlyingInIds((prevSet) => {
        const next = new Set(prevSet);
        for (const f of inFlyers) next.add(f.id);
        return next;
      });
    }
    setFlying((f) => [...f, ...outFlyers, ...inFlyers]);

    // Guaranteed teardown for this batch. animationend (below) removes each
    // clone the instant it lands, but that event is unreliable when filter
    // changes stack up fast — without this sweep, orphaned clones pile up and
    // the real rows they mask stay visibility:hidden (invisible, unclickable).
    // Fire just past the slowest clone's window: 450ms anim + its stagger.
    const batchKeys = new Set([...outFlyers, ...inFlyers].map((f) => f.key));
    const inIds = inFlyers.map((f) => f.id);
    const maxDelay = Math.max(
      0,
      ...outFlyers.map((f) => f.delay),
      ...inFlyers.map((f) => f.delay)
    );
    const timer = setTimeout(() => {
      flightTimers.current.delete(timer);
      setFlying((cur) => cur.filter((x) => !batchKeys.has(x.key)));
      if (inIds.length > 0) {
        setFlyingInIds((prevSet) => {
          if (inIds.every((id) => !prevSet.has(id))) return prevSet;
          const next = new Set(prevSet);
          for (const id of inIds) next.delete(id);
          return next;
        });
      }
    }, 450 + maxDelay + 250);
    flightTimers.current.add(timer);
  }, [matches]);

  // Each combo box captures the on-screen card rects before its change so the
  // fly-out/in animation has last-frame positions to work from.
  const changeCategories = (next: string[]) => {
    captureRects();
    setCategories(next);
  };
  const changeTimeRanges = (next: string[]) => {
    captureRects();
    setTimeRanges(next);
  };
  const changeOwners = (next: string[]) => {
    captureRects();
    setSelectedOwners(next);
  };

  const clearFilters = () => {
    captureRects();
    setQuery("");
    setCategories([]);
    setTimeRanges([]);
    setSelectedOwners([]);
  };

  const filtered =
    query.trim() !== "" ||
    categories.length > 0 ||
    timeRanges.length > 0 ||
    selectedOwners.length > 0;

  // Count shown in "N of M cards": M is scoped to the selected recipe boxes.
  const ownerTotal =
    selectedOwners.length > 0
      ? entries.filter((e) => inSelectedOwners(e.collection)).length
      : entries.length;

  const clearInline = filtered ? (
    <>
      {" · "}
      <button
        onClick={clearFilters}
        className="text-zinc-300 underline underline-offset-2 hover:text-white"
      >
        clear
      </button>
    </>
  ) : null;

  const categoryOptions: Option[] = categoryCounts.map(([c, n]) => ({
    value: c,
    label: cap(c),
    count: n,
  }));
  const timeOptions: Option[] = TIME_RANGES.map((r) => ({
    value: r.id,
    label: r.label,
    count: timeCounts.get(r.id) ?? 0,
  }));
  const ownerOptions: Option[] = owners.map(([name, n]) => ({
    value: name,
    label: name,
    count: n,
  }));

  return (
    <div className="mx-auto max-w-5xl px-4">
      {/* Full-width top nav. position:fixed (not sticky) so iOS Safari can't
          detach it while the URL bar collapses mid-scroll; the card pile pins
          just below its measured height on every breakpoint. */}
      <nav
        ref={headerRef}
        className="fixed inset-x-0 top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/95 pb-3 pt-[max(0.6rem,env(safe-area-inset-top))] backdrop-blur"
      >
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 md:flex-row md:flex-wrap md:items-center md:gap-3">
          <input
            type="search"
            value={query}
            onChange={(e) => {
              captureRects();
              setQuery(e.target.value);
            }}
            placeholder="Search recipes…"
            className="h-9 min-w-0 flex-1 rounded-none border border-zinc-700 bg-zinc-900 px-3 text-base text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-400 md:min-w-[14rem] md:text-sm"
          />

          <MultiSelect
            label="Meal type"
            options={categoryOptions}
            selected={categories}
            onChange={changeCategories}
          />
          <MultiSelect
            label="Time to cook"
            options={timeOptions}
            selected={timeRanges}
            onChange={changeTimeRanges}
          />
          {owners.length >= 2 && (
            <MultiSelect
              label="Recipe box"
              options={ownerOptions}
              selected={selectedOwners}
              onChange={changeOwners}
            />
          )}
        </div>
      </nav>

      {/* Discreet card count, tucked into the bottom-left over the dark page.
          Fixed so it stays put as the pile scrolls; a faint backdrop keeps it
          legible when a white card slides behind it. */}
      <p className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-4 z-30 whitespace-nowrap rounded-full border border-zinc-800/80 bg-zinc-950/80 px-2.5 py-1 text-xs text-zinc-500 backdrop-blur">
        {matches.length} of {ownerTotal} cards
        {clearInline}
      </p>

      {/* the list. The end-of-scroll room must be a real child of this div
          (not padding — sticky containment only spans the content box), so
          the pile, including the last card fully expanded, stays pinned at
          the stack line to the very end of the scroll instead of being
          pushed up off the viewport. */}
      <div
        ref={listRef}
        className="flex min-w-0 flex-col"
        style={{
          paddingTop: (headerH > 0 ? headerH : STACK_TOP_DESKTOP) + STACK_GAP + 4,
          // Let single-finger scroll pass through while we own pinch gestures.
          touchAction: "pan-y",
        }}
      >
        {matches.length === 0 ? (
          <p className="pt-8 text-sm text-zinc-500">No recipes match.</p>
        ) : (
          matches.map((r) => (
            <Link
              key={r.id}
              href={`/card/${r.slug}`}
              className="group sticky block w-full max-w-[575px] shrink-0 self-center outline-none"
              style={{
                height: MIN_H,
                top: stackTop,
                visibility: flyingInIds.has(r.id) ? "hidden" : undefined,
              }}
            >
              {/* The card visual + its off-kilter lean live on this inner
                  wrapper, not the sticky <a>. Rotating a child leaves the <a>'s
                  own box axis-aligned, so the scroll-driven pile/fisheye code
                  that reads its getBoundingClientRect stays exact.

                  It's absolutely positioned at full 3×5 height (aspect-[5/3]),
                  bleeding below the <a>'s short flow box. Later cards paint on
                  top, so how much of each card shows is set by the gap to the
                  next card (the fisheye height on the <a>), while the always-
                  full body means neighbours overlap — no black ever shows
                  through the tilt gaps. */}
              <div
                className="absolute inset-x-0 top-0 aspect-[5/3] overflow-hidden border-[0.5px] border-zinc-300 bg-white px-6 shadow-[0_2px_8px_rgba(0,0,0,0.18)] transition-colors group-hover:bg-zinc-50 group-focus-visible:ring-2 group-focus-visible:ring-white"
                style={{ rotate: `${cardTilt(r.id)}deg` }}
              >
                <span
                  className="flex items-center justify-between gap-4"
                  style={{ height: MIN_H }}
                >
                  <span className="font-card truncate text-lg tracking-tight">{r.title}</span>
                  <span className="font-card shrink-0 text-sm lowercase text-zinc-400">
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
              </div>
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
              onAnimationEnd={() => {
                setFlying((cur) => cur.filter((x) => x.key !== f.key));
                if (f.mode === "in") {
                  setFlyingInIds((prevSet) => {
                    const next = new Set(prevSet);
                    next.delete(f.id);
                    return next;
                  });
                }
              }}
              className="index-card-fly absolute overflow-hidden border-[0.5px] border-zinc-300 bg-white px-6 shadow-[0_2px_8px_rgba(0,0,0,0.18)]"
              style={{
                top: f.top,
                left: f.left,
                width: f.width,
                height: f.height,
                // Match the resting lean; the fly keyframes drive `transform`,
                // so this individual `rotate` composes without being clobbered.
                rotate: `${f.rotate}deg`,
                animationName:
                  f.mode === "in"
                    ? f.dir < 0
                      ? "index-card-flyin-left"
                      : "index-card-flyin-right"
                    : f.dir < 0
                      ? "index-card-fly-left"
                      : "index-card-fly-right",
                // Exits accelerate off (class default); entrances decelerate in.
                animationTimingFunction:
                  f.mode === "in" ? "cubic-bezier(0.16, 1, 0.3, 1)" : undefined,
                animationDelay: `${f.delay}ms`,
              }}
            >
              <span
                className="flex items-center justify-between gap-4"
                style={{ height: MIN_H }}
              >
                <span className="font-card truncate text-lg tracking-tight text-zinc-900">
                  {f.title}
                </span>
                <span className="font-card shrink-0 text-sm lowercase text-zinc-400">
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
