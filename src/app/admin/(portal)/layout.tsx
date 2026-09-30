import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { adminLogoutAction } from "@/app/actions/admin";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const a = await requireAdmin();
  const app = process.env.NEXT_PUBLIC_APP_NAME || "Restaurant Manager";
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-gold/40 bg-ink text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2.5">
          <Link href="/admin" className="flex items-center gap-2"><img src="/platform-logo.svg" alt="" className="h-8 w-8" /><span className="font-display text-lg font-bold">{app}</span><span className="rounded bg-gold px-1.5 text-[10px] font-bold text-ink">SUPER ADMIN</span></Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/admin" className="hover:text-gold">Restaurants</Link>
            <Link href="/admin/admins" className="hover:text-gold">Super admins</Link>
            <span className="hidden text-white/60 sm:inline">{a.email}</span>
            <form action={adminLogoutAction}><button className="rounded-lg bg-white/10 px-2.5 py-1 text-xs hover:bg-white/20">Log out</button></form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
