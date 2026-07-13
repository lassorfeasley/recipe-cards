"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin/library", label: "Library", hint: "Browse, edit & sync all cards" },
  { href: "/admin/review", label: "Review", hint: "Extract & approve AI metadata" },
];

export default function AdminNav() {
  const pathname = usePathname();
  const inBatchWorkflow = pathname.startsWith("/admin/batches");

  return (
    <nav className="flex flex-1 items-center gap-1 text-sm">
      {LINKS.map((link) => {
        const active =
          pathname.startsWith(link.href) ||
          // Card profiles are opened from the Library.
          (link.href === "/admin/library" && pathname.startsWith("/admin/cards/"));
        return (
          <Link
            key={link.href}
            href={link.href}
            title={link.hint}
            className={`rounded-md px-3 py-1.5 transition-colors ${
              active
                ? "bg-zinc-800 text-amber-100"
                : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
      <Link
        href="/admin/batches"
        title="Upload scan folders and run the batch processing workflow (align → crop → approve)"
        className={`ml-auto rounded-md px-3 py-1.5 font-medium transition-colors ${
          inBatchWorkflow
            ? "bg-amber-600 text-black"
            : "border border-amber-700/60 text-amber-300 hover:bg-amber-950"
        }`}
      >
        + Add batches
      </Link>
    </nav>
  );
}
