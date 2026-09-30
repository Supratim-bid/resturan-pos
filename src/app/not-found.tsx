import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-5 text-center">
      <div>
        <div className="text-4xl">🍽️</div>
        <h1 className="mt-3 font-display text-2xl font-bold text-brand">Page not found</h1>
        <p className="mt-2 text-sm text-muted">Check the link, or go back to the start.</p>
        <Link href="/" className="btn-primary mt-5 inline-block">Go to the app</Link>
      </div>
    </main>
  );
}
