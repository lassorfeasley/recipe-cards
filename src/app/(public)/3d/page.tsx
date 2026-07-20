import Link from "next/link";

export const metadata = {
  title: "The Recipe Box",
};

/** Placeholder for the 3D skeuomorphic mode (not yet scoped). */
export default function BoxPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-serif text-3xl text-amber-50">The Recipe Box</p>
      <p className="max-w-md text-sm leading-relaxed text-zinc-500">
        A 3D recipe box you can rifle through, card by card. Still in the kitchen —
        check back soon.
      </p>
      <Link
        href="/"
        className="mt-4 rounded-full border border-zinc-800 px-4 py-1.5 text-xs tracking-wide text-zinc-400 hover:border-zinc-600 hover:text-zinc-100"
      >
        ← Back to the wall
      </Link>
    </main>
  );
}
