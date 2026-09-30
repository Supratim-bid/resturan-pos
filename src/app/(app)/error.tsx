"use client";
import Link from "next/link";

// Shown inside the app (menu stays visible) when a page fails to load.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg py-10 text-center">
      <div className="text-4xl">🍲</div>
      <h1 className="mt-3 font-display text-2xl font-bold text-brand">Something went wrong on this page</h1>
      <p className="mt-2 text-sm text-muted">Your saved data is safe. Try again; if it keeps happening, tell your app provider{error.digest ? <> and quote code <b className="font-mono">{error.digest}</b></> : null}.</p>
      <div className="mt-5 flex justify-center gap-2">
        <button className="btn-primary" onClick={() => reset()}>Try again</button>
        <Link href="/" className="btn-ghost">Go to dashboard</Link>
      </div>
    </div>
  );
}
