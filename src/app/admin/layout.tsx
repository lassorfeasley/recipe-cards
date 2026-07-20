import Link from "next/link";
import AdminNav from "@/components/AdminNav";
import AdminSignOut from "@/components/AdminSignOut";
import { adminEmailsConfigured } from "@/lib/adminAuth";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let email: string | null = null;
  const gated = adminEmailsConfigured();

  if (gated) {
    try {
      const supabase = await createServerSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      email = user?.email ?? null;
    } catch {
      email = null;
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center gap-6 border-b border-zinc-800 bg-zinc-950 px-5 py-2.5">
        <Link href="/admin/batches" className="font-semibold tracking-wide text-amber-100">
          Recipe Card Archive
        </Link>
        <AdminNav />
        {gated ? (
          email ? <AdminSignOut email={email} /> : <span className="ml-auto" />
        ) : (
          <span className="ml-auto text-xs text-zinc-600">local · open</span>
        )}
      </header>
      <main className="min-h-0 flex-1 overflow-auto">{children}</main>
    </div>
  );
}
