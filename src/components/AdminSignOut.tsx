"use client";

import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export default function AdminSignOut({ email }: { email: string | null }) {
  const router = useRouter();

  const signOut = async () => {
    try {
      const supabase = createBrowserSupabase();
      await supabase.auth.signOut();
    } catch {
      // ignore — still send them to login
    }
    router.replace("/admin/login");
    router.refresh();
  };

  return (
    <div className="ml-auto flex items-center gap-3">
      {email && <span className="hidden text-xs text-zinc-500 sm:inline">{email}</span>}
      <button
        type="button"
        onClick={signOut}
        className="text-xs text-zinc-500 hover:text-zinc-300"
      >
        Sign out
      </button>
    </div>
  );
}
