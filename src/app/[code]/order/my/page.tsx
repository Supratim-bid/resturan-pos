import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { isRestaurantPath } from "@/lib/reserved";
import { themeCss } from "@/lib/theme";
import { DEVICE_COOKIE, deviceHash, loadStorefront } from "@/lib/online";
import { fmtDate, fmtDateTime, inr } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My orders", robots: { index: false } };

// Customer's own orders, from this phone / browser only (no login needed): /<code>/order/my
export default async function MyOrders({ params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toLowerCase();
  if (!isRestaurantPath(code)) notFound();
  const store = await loadStorefront(code);
  if (!store) notFound();
  const dev = deviceHash(store.tenant.id, (await cookies()).get(DEVICE_COOKIE)?.value);
  const list = dev ? await db.query.onlineOrders.findMany({
    where: and(eq(schema.onlineOrders.tenantId, store.tenant.id), eq(schema.onlineOrders.device, dev)),
    orderBy: [desc(schema.onlineOrders.createdAt)], limit: 30,
  }) : [];
  const label = (st: string) => st === "ACCEPTED" ? { t: "Confirmed", c: "bg-emerald-50 text-emerald-800" } : st === "REJECTED" ? { t: "Not accepted", c: "bg-red-50 text-red-800" } : { t: "Waiting", c: "bg-amber-50 text-amber-900" };
  return (
    <div className="min-h-dvh bg-cream pb-10">
      <style dangerouslySetInnerHTML={{ __html: themeCss(store.config.primary, store.config.accent) }} />
      <header className="bg-brand px-4 py-5 text-center text-white">
        <div className="font-display text-xl font-bold">{store.config.name}</div>
        <div className="text-sm opacity-90">My orders</div>
      </header>
      <main className="mx-auto max-w-lg space-y-3 px-4 pt-4">
        {list.length === 0 ? (
          <div className="card text-center text-sm">No orders from this phone yet.<br /><span className="text-muted">Orders show here on the phone they were placed from.</span></div>
        ) : list.map((o) => {
          const l = label(o.status);
          return (
            <Link key={o.id} href={`/${code}/order/${o.token}`} className="card block space-y-1 text-sm">
              <div className="flex items-center justify-between gap-2"><b>Order #{o.id}</b><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${l.c}`}>{l.t}</span></div>
              <div className="flex justify-between text-muted"><span>{o.isPreorder ? `For ${fmtDate(o.date)} · ${o.mealSlot}` : fmtDateTime(o.createdAt)}</span><span className="tabular-nums font-semibold text-ink">{inr(Number(o.estTotal))}</span></div>
            </Link>
          );
        })}
        <Link href={`/${code}/order`} className="btn-primary block text-center">Order now</Link>
      </main>
    </div>
  );
}
