"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/admin/library";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const supabase = createBrowserSupabase();
      const { error: signError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signError) {
        setError(signError.message);
        setBusy(false);
        return;
      }
      // Confirm the session is allowlisted (proxy returns 401 otherwise).
      const probe = await fetch("/api/library");
      if (probe.status === 401) {
        await supabase.auth.signOut();
        setError("This account is not authorized for admin access.");
        setBusy(false);
        return;
      }
      router.replace(next.startsWith("/admin") ? next : "/admin/library");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-xs text-zinc-500">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-700"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-xs text-zinc-500">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-700"
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-amber-50 hover:bg-amber-600 disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6">
      <h1 className="mb-2 text-xl font-semibold tracking-wide text-amber-100">
        Recipe Card Archive
      </h1>
      <p className="mb-8 text-sm text-zinc-500">Admin sign-in</p>
      <Suspense fallback={<p className="text-sm text-zinc-600">Loading…</p>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
