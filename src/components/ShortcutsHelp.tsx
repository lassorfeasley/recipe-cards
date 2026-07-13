"use client";

import { useEffect, useRef, useState } from "react";

export interface Shortcut {
  keys: string;
  action: string;
}

/** Small "⌨ Shortcuts" button with a popover cheat-sheet (also opens with ?). */
export default function ShortcutsHelp({ shortcuts }: { shortcuts: Shortcut[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
      if (e.key === "?" && !typing) setOpen((v) => !v);
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`rounded-md border px-2.5 py-1.5 text-sm ${
          open
            ? "border-amber-600 text-amber-300"
            : "border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        }`}
        title="Keyboard shortcuts (?)"
      >
        ⌨ Shortcuts
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-80 rounded-lg border border-zinc-700 bg-zinc-950 p-3 shadow-2xl">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Keyboard shortcuts
          </p>
          <table className="w-full text-sm">
            <tbody>
              {shortcuts.map((s) => (
                <tr key={s.keys}>
                  <td className="whitespace-nowrap py-1 pr-3 align-top">
                    <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-amber-200">
                      {s.keys}
                    </kbd>
                  </td>
                  <td className="py-1 text-zinc-300">{s.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
