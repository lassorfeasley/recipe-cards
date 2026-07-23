"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Height of the fixed top nav, in px. Shared so pages that pin their own
 * content (e.g. the Index search bar + card pile) can offset beneath it.
 */
export const TOP_NAV_H = 56;

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

function SearchIcon() {
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
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

const MODES = [
  { href: "/", label: "Wall", hint: "Every card at a glance", icon: GridIcon },
  {
    href: "/list",
    label: "Search",
    hint: "Search the recipe index",
    icon: SearchIcon,
  },
];

/**
 * Shared top nav for the public site. The "Feasley's Recipes" wordmark sits on
 * the left and the grid/search toggle on the right. On the wall (grid) view the
 * bar is translucent + blurred with white text so it floats over the cards
 * without stealing attention; elsewhere it's solid dark chrome.
 */
export default function TopNav() {
  const pathname = usePathname();
  const onWall = pathname === "/";

  return (
    <header
      style={{ height: TOP_NAV_H }}
      className={`fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-4 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] ${
        onWall
          ? "bg-black/40 text-white backdrop-blur-md"
          : "border-b border-zinc-800/80 bg-zinc-950/95 text-zinc-100 backdrop-blur"
      }`}
    >
      <Link
        href="/"
        aria-label="Feasley's Recipes — home"
        className={`font-card truncate py-1 text-xl leading-[1.7] tracking-tight transition-opacity hover:opacity-80 sm:text-2xl ${
          onWall ? "text-white" : "text-amber-50"
        }`}
      >
        Feasley&apos;s Recipes
      </Link>

      <nav className="flex shrink-0 items-center gap-1">
        {MODES.map((m) => {
          const active =
            m.href === "/" ? pathname === "/" : pathname.startsWith(m.href);
          const Icon = m.icon;
          const base =
            "flex h-10 w-10 items-center justify-center rounded-xl transition-colors";
          const state = active
            ? onWall
              ? "bg-white/20 text-white"
              : "bg-amber-100 text-black"
            : onWall
              ? "text-white/70 hover:bg-white/10 hover:text-white"
              : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100";
          return (
            <Link
              key={m.href}
              href={m.href}
              title={m.hint}
              aria-label={m.label}
              aria-current={active ? "page" : undefined}
              className={`${base} ${state}`}
            >
              <Icon />
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
