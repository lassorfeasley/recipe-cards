"use client";

import { useEffect } from "react";

/**
 * Opens the browser print dialog once every image on the page has loaded
 * (printing earlier would produce blank card images). Also renders a manual
 * print button, hidden on paper, in case the user dismisses the dialog.
 */
export default function AutoPrint() {
  useEffect(() => {
    let cancelled = false;
    const whenLoaded = Array.from(document.images).map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          })
    );
    Promise.all(whenLoaded).then(() => {
      // Small delay so layout settles before the print preview snapshots it.
      setTimeout(() => {
        if (!cancelled) window.print();
      }, 300);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <button
      onClick={() => window.print()}
      className="fixed right-5 top-5 z-10 rounded-full bg-zinc-900 px-4 py-2 text-xs tracking-wide text-white shadow-lg transition-colors hover:bg-zinc-700 print:hidden"
    >
      Print or save as PDF
    </button>
  );
}
