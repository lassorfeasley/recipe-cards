import Link from "next/link";
import AdminNav from "@/components/AdminNav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center gap-6 border-b border-zinc-800 bg-zinc-950 px-5 py-2.5">
        <Link href="/admin/batches" className="font-semibold tracking-wide text-amber-100">
          Recipe Card Archive
        </Link>
        <AdminNav />
        <span className="text-xs text-zinc-600">local admin · no auth</span>
      </header>
      <main className="min-h-0 flex-1 overflow-auto">{children}</main>
    </div>
  );
}
