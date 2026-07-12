import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center gap-6 border-b border-zinc-800 bg-zinc-950 px-5 py-3">
        <Link href="/admin/batches" className="font-semibold tracking-wide text-amber-100">
          Recipe Card Archive
        </Link>
        <nav className="flex gap-4 text-sm text-zinc-400">
          <Link href="/admin/batches" className="hover:text-zinc-100">
            Batches
          </Link>
          <Link href="/admin/review" className="hover:text-zinc-100">
            Review
          </Link>
          <Link href="/admin/library" className="hover:text-zinc-100">
            Library
          </Link>
        </nav>
        <span className="ml-auto text-xs text-zinc-600">local admin · no auth</span>
      </header>
      <main className="min-h-0 flex-1 overflow-auto">{children}</main>
    </div>
  );
}
