"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { PublicRecipe } from "@/lib/publicData";

/**
 * The interactive part of a recipe profile: recipe/transcription tabs on the
 * left, and the flip card as the wider, sticky right-hand column.
 */
export default function RecipeView({
  recipe,
  header,
}: {
  recipe: PublicRecipe;
  header?: ReactNode;
}) {
  const [flipped, setFlipped] = useState(false);
  const [tab, setTab] = useState<"recipe" | "transcription">(
    recipe.recipe_markdown ? "recipe" : "transcription"
  );
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const introTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const hasBack = !!recipe.back_image;

  // On load, flip the card over and back once to hint that it's interactive.
  useEffect(() => {
    if (!hasBack) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    introTimers.current = [
      setTimeout(() => setFlipped(true), 800),
      setTimeout(() => setFlipped(false), 2100),
    ];
    return () => introTimers.current.forEach(clearTimeout);
  }, [hasBack]);

  const cancelIntro = () => {
    introTimers.current.forEach(clearTimeout);
    introTimers.current = [];
  };

  const handleFlip = () => {
    if (!hasBack) return;
    cancelIntro();
    setFlipped((v) => !v);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: -py * 5, y: px * 7 });
  };

  const handleMouseLeave = () => setTilt({ x: 0, y: 0 });

  const card = (
    <div>
      <button
        onClick={handleFlip}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className={`mx-auto block w-full max-w-3xl ${hasBack ? "cursor-pointer" : "cursor-default"}`}
        style={{ perspective: "1600px" }}
        title={hasBack ? "Flip the card" : undefined}
      >
        {/* tilt layer — subtle response to the cursor, separate from the flip */}
        <div
          className="relative aspect-[5/3] w-full transition-transform duration-200 ease-out"
          style={{
            transformStyle: "preserve-3d",
            transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          }}
        >
          {/* flip layer */}
          <div
            className="absolute inset-0 transition-transform duration-700"
            style={{
              transformStyle: "preserve-3d",
              transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={recipe.front_image}
              alt={`${recipe.title} — front of the card`}
              className="absolute inset-0 h-full w-full object-contain drop-shadow-[0_12px_50px_rgba(255,220,150,0.08)]"
              style={{ backfaceVisibility: "hidden" }}
            />
            {hasBack && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={recipe.back_image!}
                alt={`${recipe.title} — back of the card`}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-contain"
                style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
              />
            )}
          </div>
        </div>
      </button>
      {hasBack && (
        <p className="mt-3 text-center text-[11px] uppercase tracking-[0.25em] text-zinc-600">
          {flipped ? "· back — tap to flip ·" : "· tap the card to flip it ·"}
        </p>
      )}
    </div>
  );

  const words = (recipe.recipe_markdown || recipe.transcription_front) && (
    <section className="mt-10 lg:mt-8">
      <div className="mb-6 flex justify-center gap-2 text-xs lg:justify-start">
        {recipe.recipe_markdown && (
          <button
            onClick={() => setTab("recipe")}
            className={`rounded-full px-4 py-1.5 tracking-wide transition-colors ${
              tab === "recipe"
                ? "bg-amber-100 text-black"
                : "border border-zinc-800 text-zinc-400 hover:text-zinc-100"
            }`}
          >
            The recipe
          </button>
        )}
        {recipe.transcription_front && (
          <button
            onClick={() => setTab("transcription")}
            className={`rounded-full px-4 py-1.5 tracking-wide transition-colors ${
              tab === "transcription"
                ? "bg-amber-100 text-black"
                : "border border-zinc-800 text-zinc-400 hover:text-zinc-100"
            }`}
          >
            As she wrote it
          </button>
        )}
        <a
          href={`/print/${recipe.slug}`}
          target="_blank"
          rel="noopener"
          title="Open a printable version of this card"
          className="rounded-full border border-zinc-800 px-4 py-1.5 tracking-wide text-zinc-400 transition-colors hover:text-zinc-100"
        >
          Print
        </a>
      </div>

      {tab === "recipe" && recipe.recipe_markdown ? (
        <div className="recipe-preview rounded-xl border border-zinc-900 bg-zinc-950/60 px-8 py-6 text-[15px] leading-relaxed text-zinc-200">
          <ReactMarkdown>{recipe.recipe_markdown}</ReactMarkdown>
        </div>
      ) : (
        <div className="space-y-6">
          {recipe.transcription_front && (
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-zinc-900 bg-zinc-950/60 px-8 py-6 font-mono text-[13px] leading-6 text-zinc-300">
              {recipe.transcription_front}
            </pre>
          )}
          {recipe.transcription_back && (
            <div>
              <p className="mb-2 text-center text-[11px] uppercase tracking-[0.25em] text-zinc-600">
                · on the back ·
              </p>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-zinc-900 bg-zinc-950/60 px-8 py-6 font-mono text-[13px] leading-6 text-zinc-300">
                {recipe.transcription_back}
              </pre>
            </div>
          )}
        </div>
      )}
    </section>
  );

  return (
    <div className="mx-auto max-w-6xl lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-12">
      {/* left column: heading + the words */}
      {header && <div className="lg:col-start-1 lg:row-start-1">{header}</div>}

      {/* right column: the card is the star of the show */}
      <div className="mt-2 lg:sticky lg:top-0 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:mt-0 lg:flex lg:h-screen lg:flex-col lg:justify-center">
        {card}
      </div>

      <div className="lg:col-start-1 lg:row-start-2">{words}</div>
    </div>
  );
}
