"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MODES = [
  { href: "/", label: "Wall", hint: "Every card at a glance" },
  { href: "/list", label: "Index", hint: "The recipes as a card index" },
  { href: "/3d", label: "Box", hint: "The recipe box — coming soon", soon: true },
];

/** Minimal floating mode switcher for the public site. */
export default function ModeSwitch() {
  const pathname = usePathname();

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center">
      <nav className="pointer-events-auto mt-3 flex items-center gap-1 rounded-full border border-zinc-800/80 bg-black/70 px-2 py-1 text-xs tracking-wide backdrop-blur transition-opacity hover:opacity-100 sm:opacity-70">
        {MODES.map((m) => {
          const active = m.href === "/" ? pathname === "/" : pathname.startsWith(m.href);
          return (
            <Link
              key={m.href}
              href={m.href}
              title={m.hint}
              className={`rounded-full px-3 py-1 transition-colors ${
                active
                  ? "bg-amber-100 text-black"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
              }`}
            >
              {m.label}
              {m.soon && <span className="ml-1 text-[9px] text-zinc-500">soon</span>}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
