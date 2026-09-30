import Link from "next/link";
export default function NoAccess() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6 text-center">
      <div><h1 className="text-xl font-bold">No access</h1><p className="mt-1 text-muted">Your role can't open this page. Ask the owner if you need it.</p>
      <Link href="/more" className="btn-primary mt-4">Go back</Link></div>
    </main>
  );
}
