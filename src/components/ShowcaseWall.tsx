"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

export interface WallRecipe {
  id: string;
  slug: string;
  title: string;
  thumb: string;
  backThumb: string | null;
}

/** Vertical pan speed, in pixels per second. */
const PAN_SPEED = 30;

/** Temporarily freeze the pan while tuning the wave. Set false to resume. */
const PAN_PAUSED = false;

/**
 * Seconds for one full flip cycle: a wave flips cards over, then a second
 * wave half a period later flips them back. One cycle spans 2·TILE_COLS
 * diagonal steps, so the wave front advances one diagonal every
 * WAVE_PERIOD / (2·TILE_COLS) seconds (~0.33s).
 */
const WAVE_PERIOD = 13.333;

/**
 * Columns in one tiled grid copy — deliberately wider than the viewport
 * (which shows 3–9 columns depending on breakpoint). One full flip cycle
 * spans two tile-widths of diagonals (2·TILE_COLS = 40 steps), so the
 * flip-over wave and the flip-back wave (half a cycle apart) sit 20 diagonals
 * from each other, at every breakpoint.
 */
const TILE_COLS = 20;

/**
 * Per-card animation delay: one identical step (WAVE_PERIOD / (2·TILE_COLS))
 * per row down and per column left, so every "\" diagonal (top-left →
 * bottom-right) is in exact lockstep, and each diagonal to the left trails the
 * one to its right by one step. Collectively the staggered diagonals read as
 * a wave flowing from the top-right corner to the bottom-left.
 *
 * Wrap constraint: every tiled copy shares these delays, so the delay span
 * across one copy must be a whole number of HALF-periods per axis. Half a
 * period is invisible at the seam because the cycle is symmetric under a
 * half-period shift: the flip-over window (0–17.5%) maps exactly onto the
 * flip-back window (50–67.5%), so the wave stripes line up — the neighboring
 * copy merely shows the opposite face mid-stripe, which is unnoticeable since
 * the twin cards are never in view together. Horizontally the span is exactly
 * half a period (TILE_COLS · P/(2·TILE_COLS)); vertically it is
 * rows/(2·TILE_COLS) periods, a multiple of one half because the deck pads
 * rows to a multiple of TILE_COLS. The negative offset just starts the wall
 * in steady state.
 */
function waveDelay(index: number, rows: number): string {
  const row = Math.floor(index / TILE_COLS);
  const col = index % TILE_COLS;
  const periods = (row + (TILE_COLS - 1 - col)) / (2 * TILE_COLS);
  const offset = rows / TILE_COLS + 2;
  return `${((periods - offset) * WAVE_PERIOD).toFixed(2)}s`;
}

/**
 * Pad the deck (repeating a run from the middle, far from any twin) so the
 * TILE_COLS-wide grid is perfectly rectangular with rows a multiple of
 * TILE_COLS — required for the wave delays to wrap seamlessly (see waveDelay).
 * Also closes the partial-row gap at the vertical tiling seam.
 */
function padDeck(recipes: WallRecipe[]): WallRecipe[] {
  const rawRows = Math.ceil(recipes.length / TILE_COLS);
  const rows = Math.ceil(rawRows / TILE_COLS) * TILE_COLS;
  const padCount = rows * TILE_COLS - recipes.length;
  if (padCount === 0) return recipes;
  const mid = Math.floor((recipes.length - padCount) / 2);
  const pad = recipes
    .slice(mid, mid + padCount)
    .map((r) => ({ ...r, id: `${r.id}-pad` }));
  return [...recipes, ...pad];
}

/**
 * Deterministic coin flip per card: roughly half the wall starts back-side-up,
 * so both faces are always represented between waves (each passing wave then
 * turns backs to fronts and fronts to backs). Hash-based rather than
 * Math.random() so the server and client render identically and all four
 * tiled copies agree.
 */
function startsFlipped(id: string): boolean {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (h & 1) === 1;
}

/** Viewport columns per Tailwind breakpoint (sm/md/lg/xl). */
function visibleCols(viewportWidth: number): number {
  if (viewportWidth >= 1280) return 9;
  if (viewportWidth >= 1024) return 7;
  if (viewportWidth >= 768) return 6;
  if (viewportWidth >= 640) return 4;
  return 3;
}

function CardGrid({
  recipes,
  visCols,
  eager,
  hidden,
}: {
  recipes: WallRecipe[];
  visCols: number | null;
  eager?: boolean;
  hidden?: boolean;
}) {
  const rows = Math.ceil(recipes.length / TILE_COLS);
  return (
    // Cards keep the size of a visCols-wide viewport grid, but each tile lays
    // them out TILE_COLS wide (~2-7 viewport widths). Width is exactly
    // TILE_COLS/visCols viewports so the gap+pr-2 seams between tiled copies
    // match the interior gaps. Before the first client measure (visCols null)
    // we fall back to a plain viewport-wide responsive grid, no wave.
    <div
      data-grid
      aria-hidden={hidden || undefined}
      className={`grid shrink-0 gap-2 pr-2 pb-2 ${
        visCols
          ? ""
          : "w-screen grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-9"
      }`}
      style={
        visCols
          ? {
              width: `calc(${(TILE_COLS / visCols) * 100}vw)`,
              gridTemplateColumns: `repeat(${TILE_COLS}, minmax(0, 1fr))`,
            }
          : undefined
      }
    >
      {recipes.map((r, i) => {
        // Half the cards start back-side-up: their content is swapped across
        // the two animation faces, so the same wave shows a mix of fronts and
        // backs at all times. face-front is visible at rest; face-back is
        // pre-mirrored so it reads correctly while the parent is rotated 180°.
        const flipped = startsFlipped(r.id);
        const faceFront =
          "face-front absolute inset-0 h-full w-full rounded object-contain transition-shadow duration-200 group-hover:shadow-[0_8px_40px_rgba(255,220,150,0.15)]";
        const faceBack =
          "face-back absolute inset-0 h-full w-full -scale-x-100 rounded object-contain opacity-0";
        return (
          <Link
            key={r.id}
            href={`/card/${r.slug}`}
            title={r.title}
            tabIndex={hidden ? -1 : undefined}
            className="group relative block aspect-[5/3] transition-transform duration-200 ease-out hover:z-10 hover:scale-[1.06] focus-visible:z-10 focus-visible:scale-[1.06]"
          >
            {/*
              Flattened 3D flip: one perspective() rotateY() transform per card,
              with the faces cross-faded at the 90° points. True per-card
              perspective + preserve-3d created 3D rendering contexts, which made
              the GPU drop tiles (cards randomly rendered black).
            */}
            <div
              className={`relative h-full w-full ${visCols ? "card-wave" : ""}`}
              style={
                visCols
                  ? ({ "--wd": waveDelay(i, rows) } as React.CSSProperties)
                  : undefined
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={r.thumb}
                alt={hidden ? "" : r.title}
                loading={!flipped && eager && i < 36 ? "eager" : "lazy"}
                className={flipped ? faceBack : faceFront}
              />
              {/* Real card back when we have one, otherwise a plain index
                  card with the recipe's name. */}
              {r.backThumb ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={r.backThumb}
                  alt=""
                  loading={flipped && eager && i < 36 ? "eager" : "lazy"}
                  className={flipped ? faceFront : faceBack}
                />
              ) : (
                <div
                  className={`${
                    flipped ? faceFront : faceBack
                  } flex items-center justify-center border border-[#d8cdb0] bg-[#f3ecd7] px-2`}
                >
                  <span className="line-clamp-3 text-center font-serif text-[clamp(9px,0.85vw,15px)] leading-snug text-[#4a4234]">
                    {r.title}
                  </span>
                </div>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Fullscreen, no-scroll wall of cards that pans diagonally forever — upward and
 * to the right, toward where the flip wave originates. The grid is tiled 2×2
 * (identical copies, each TILE_COLS wide), and the block translates by one
 * copy in each axis per loop, so the pan is seamless both vertically and
 * horizontally. Durations are derived from the measured tile size to keep the
 * pan speed constant.
 */
export default function ShowcaseWall({ recipes }: { recipes: WallRecipe[] }) {
  const container = useRef<HTMLDivElement>(null);
  const [durY, setDurY] = useState<number | null>(null);
  const [durX, setDurX] = useState<number | null>(null);
  const [visCols, setVisCols] = useState<number | null>(null);

  const deck = useMemo(() => padDeck(recipes), [recipes]);

  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const measure = () => {
      const grid = root.querySelector<HTMLElement>("[data-grid]");
      if (!grid) return;
      setVisCols(visibleCols(window.innerWidth));
      // Pan along the card diagonal: cross one column in the same time as one
      // row, so the drift is up-and-right through opposite cell corners
      // regardless of the cards' aspect ratio. Vertical speed is PAN_SPEED, so
      // one row takes cellH/PAN_SPEED seconds and one tile of TILE_COLS
      // columns takes TILE_COLS times that.
      const rows = deck.length / TILE_COLS;
      const cellH = grid.offsetHeight / rows;
      setDurY(grid.offsetHeight / PAN_SPEED);
      setDurX((TILE_COLS * cellH) / PAN_SPEED);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [deck]);

  const ready = durX != null && durY != null;

  return (
    <main className="fixed inset-0 overflow-hidden bg-black">
      {/* Two independent seamless loops composed: outer drifts up, inner drifts
          right — together the cards pan toward the top right. */}
      <div
        ref={container}
        className="pan-y w-max will-change-transform"
        style={
          ready && !PAN_PAUSED
            ? { animationDuration: `${durY}s` }
            : { animationPlayState: "paused" }
        }
      >
        <div
          className="pan-x flex w-max flex-col will-change-transform"
          style={
            ready && !PAN_PAUSED
              ? { animationDuration: `${durX}s` }
              : { animationPlayState: "paused" }
          }
        >
          <div className="flex">
            <CardGrid recipes={deck} visCols={visCols} eager />
            <CardGrid recipes={deck} visCols={visCols} hidden />
          </div>
          <div className="flex">
            <CardGrid recipes={deck} visCols={visCols} hidden />
            <CardGrid recipes={deck} visCols={visCols} hidden />
          </div>
        </div>
      </div>
      <p className="pointer-events-none fixed inset-x-0 bottom-3 text-center text-[10px] tracking-widest text-zinc-700">
        {recipes.length} RECIPES FROM GRANDMA&apos;S KITCHEN
      </p>
    </main>
  );
}
