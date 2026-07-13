"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function GridIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden
    >
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

const MODES = [
  { href: "/", label: "Wall", hint: "Every card at a glance", icon: GridIcon },
  {
    href: "/list",
    label: "Index",
    hint: "The recipes as a card index",
    icon: ListIcon,
  },
];

/** Floating mode switcher for the public site: icon buttons, bottom right. */
export default function ModeSwitch() {
  const pathname = usePathname();

  return (
    <nav className="fixed right-5 bottom-5 z-40 flex items-center gap-2 rounded-2xl border border-zinc-800/80 bg-black/70 p-1.5 backdrop-blur">
      {MODES.map((m) => {
        const active =
          m.href === "/" ? pathname === "/" : pathname.startsWith(m.href);
        const Icon = m.icon;
        return (
          <Link
            key={m.href}
            href={m.href}
            title={m.hint}
            aria-label={m.label}
            aria-current={active ? "page" : undefined}
            className={`flex h-12 w-12 items-center justify-center rounded-xl transition-colors ${
              active
                ? "bg-amber-100 text-black"
                : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
            }`}
          >
            <Icon />
          </Link>
        );
      })}
    </nav>
  );
}
