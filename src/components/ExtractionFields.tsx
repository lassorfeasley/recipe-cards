"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import ReactMarkdown from "react-markdown";
import type { Extraction } from "@/lib/types";
import { CATEGORIES, WRITING_MEDIUMS, BACK_RELATIONSHIPS, CONFIDENCES } from "@/lib/types";

const input =
  "w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 focus:border-cyan-600 focus:outline-none";

/** The editable extraction metadata form, shared by the review queue and the card profile. */
export default function ExtractionFields({
  draft,
  onChange,
}: {
  draft: Partial<Extraction>;
  onChange: Dispatch<SetStateAction<Partial<Extraction>>>;
}) {
  const [previewRecipe, setPreviewRecipe] = useState(false);

  const set = (field: keyof Extraction) => (value: string) =>
    onChange((d) => ({ ...d, [field]: value === "" ? null : value }));

  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="col-span-2 text-xs text-zinc-500">
        Title
        <input
          className={input}
          value={draft.title ?? ""}
          onChange={(e) => set("title")(e.target.value)}
        />
      </label>
      <label className="text-xs text-zinc-500">
        Category
        <select className={input} value={draft.category ?? ""} onChange={(e) => set("category")(e.target.value)}>
          <option value="">—</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="text-xs text-zinc-500">
        Writing medium
        <select className={input} value={draft.writing_medium ?? ""} onChange={(e) => set("writing_medium")(e.target.value)}>
          <option value="">—</option>
          {WRITING_MEDIUMS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="text-xs text-zinc-500">
        Attribution
        <input className={input} value={draft.attribution ?? ""} onChange={(e) => set("attribution")(e.target.value)} />
      </label>
      <label className="text-xs text-zinc-500">
        Back relationship
        <select className={input} value={draft.back_relationship ?? ""} onChange={(e) => set("back_relationship")(e.target.value)}>
          <option value="">—</option>
          {BACK_RELATIONSHIPS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="text-xs text-zinc-500">
        Ink colors (comma-separated)
        <input
          className={input}
          value={(draft.ink_colors ?? []).join(", ")}
          onChange={(e) =>
            onChange((d) => ({
              ...d,
              ink_colors: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            }))
          }
        />
      </label>
      <label className="text-xs text-zinc-500">
        Confidence
        <select className={input} value={draft.confidence ?? ""} onChange={(e) => set("confidence")(e.target.value)}>
          <option value="">—</option>
          {CONFIDENCES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="col-span-2 text-xs text-zinc-500">
        Card design
        <input className={input} value={draft.card_design ?? ""} onChange={(e) => set("card_design")(e.target.value)} />
      </label>
      <label className="col-span-2 text-xs text-zinc-500">
        Transcription — front
        <textarea
          className={`${input} min-h-40 font-mono text-[13px] leading-5`}
          value={draft.transcription_front ?? ""}
          onChange={(e) => set("transcription_front")(e.target.value)}
        />
      </label>
      <label className="col-span-2 text-xs text-zinc-500">
        Transcription — back
        <textarea
          className={`${input} min-h-24 font-mono text-[13px] leading-5`}
          value={draft.transcription_back ?? ""}
          onChange={(e) => set("transcription_back")(e.target.value)}
        />
      </label>
      <label className="col-span-2 text-xs text-zinc-500">
        Ingredients (comma-separated tags)
        <input
          className={input}
          value={(draft.ingredients ?? []).join(", ")}
          placeholder="flour, butter, raisin…"
          onChange={(e) =>
            onChange((d) => ({
              ...d,
              ingredients: e.target.value
                .split(",")
                .map((s) => s.trim().toLowerCase())
                .filter(Boolean),
            }))
          }
        />
        {(draft.ingredients ?? []).length > 0 && (
          <span className="mt-1.5 flex flex-wrap gap-1">
            {(draft.ingredients ?? []).map((ing) => (
              <span
                key={ing}
                className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300"
              >
                {ing}
              </span>
            ))}
          </span>
        )}
      </label>
      <div className="col-span-2 text-xs text-zinc-500">
        <div className="flex items-center justify-between">
          <span>Cleaned-up recipe (markdown)</span>
          <button
            type="button"
            onClick={() => setPreviewRecipe((v) => !v)}
            className="rounded px-2 py-0.5 text-[11px] text-cyan-400 hover:bg-zinc-900"
          >
            {previewRecipe ? "Edit" : "Preview"}
          </button>
        </div>
        {previewRecipe ? (
          <div className="recipe-preview mt-1 min-h-40 rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200">
            {draft.recipe_markdown ? (
              <ReactMarkdown>{draft.recipe_markdown}</ReactMarkdown>
            ) : (
              <em className="text-zinc-600">Nothing to preview yet.</em>
            )}
          </div>
        ) : (
          <textarea
            className={`${input} min-h-40 font-mono text-[13px] leading-5`}
            value={draft.recipe_markdown ?? ""}
            placeholder={"## Ingredients\n- 1 cup sugar\n\n## Steps\n1. Cream the sugar…"}
            onChange={(e) => set("recipe_markdown")(e.target.value)}
          />
        )}
      </div>
      <label className="col-span-2 text-xs text-zinc-500">
        AI notes
        <textarea
          className={`${input} min-h-16`}
          value={draft.ai_notes ?? ""}
          onChange={(e) => set("ai_notes")(e.target.value)}
        />
      </label>
    </div>
  );
}
