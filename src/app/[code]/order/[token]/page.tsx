import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { isRestaurantPath } from "@/lib/reserved";
import { themeCss } from "@/lib/theme";
import { upiForOnline, type OnlineLine } from "@/lib/online";
import { qrDataUrl } from "@/lib/bill";
import { fmtDate, fmtTime, inr } from "@/lib/format";
import { AutoRefresh, UpiRefForm } from "@/components/order-status";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your order", robots: { index: false } };

// Customer's private status page (the link is the secret): /<code>/order/<token>
export default async function OrderStatus({ params }: { params: Promise<{ code: string; token: string }> }) {
  const { code: raw, token } = await params;
  const code = raw.toLowerCase();
  if (!isRestaurantPath(code) || !/^[\w-]{16,40}$/.test(token)) notFound();
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.code, code) });
  if (!t) notFound();
  const o = await db.query.onlineOrders.findFirst({ where: and(eq(schema.onlineOrders.token, token), eq(schema.onlineOrders.tenantId, t.id)) });
  if (!o) notFound();
  const s = await db.query.settings.findFirst({ where: eq(schema.settings.tenantId, t.id) });
  const bill = o.orderId ? await db.query.orders.findFirst({ where: eq(schema.orders.id, o.orderId), with: { payments: true } }) : null;
  const lines = JSON.parse(o.items) as OnlineLine[];
  const total = bill ? Number(bill.total) : Number(o.estTotal);
  const paid = bill ? bill.payments.reduce((a, p) => a + Number(p.amount), 0) : 0;
  const due = Math.max(0, Math.round((total - paid) * 100) / 100);
  const showUpi = o.payMethod === "UPI" && o.status !== "REJECTED" && due > 0.5 && s;
  const upi = showUpi ? upiForOnline(s!, due, `Online order ${o.id}`) : null;
  const qr = upi?.kind === "upi" ? await qrDataUrl(upi.text, 260) : upi?.kind === "image" ? `/img/${upi.imageId}` : null;
  const phone = (s?.phone ?? "").replace(/\D/g, "");
  const state = o.status === "REJECTED" ? { icon: "❌", title: "Order not accepted", tone: "bg-red-50 text-red-800" }
    : o.status === "ACCEPTED" ? { icon: "✅", title: "Order confirmed", tone: "bg-emerald-50 text-emerald-800" }
    : { icon: "⏳", title: "Waiting for the restaurant to confirm", tone: "bg-amber-50 text-amber-900" };
  return (
    <div className="min-h-dvh bg-cream pb-10">
      <style dangerouslySetInnerHTML={{ __html: themeCss(s?.primaryColor, s?.accentColor) }} />
      {o.status === "NEW" || o.status === "ACCEPTING" ? <AutoRefresh seconds={15} /> : null}
      <header className="bg-brand px-4 py-5 text-center text-white">
        <div className="font-display text-xl font-bold">{s?.name}</div>
      </header>
      <main className="mx-auto max-w-lg space-y-4 px-4 pt-4">
        <section className={`rounded-2xl px-4 py-4 text-center ${state.tone}`}>
          <div className="text-3xl">{state.icon}</div>
          <h1 className="mt-1 text-lg font-bold">{state.title}</h1>
          {o.status === "NEW" && <p className="text-sm">This page updates by itself. Keep it open or come back to this link.</p>}
          {o.status === "ACCEPTED" && bill && <p className="text-sm">Bill no. <b>{bill.billNo}</b>. {o.kind === "DELIVERY" ? "We'll deliver it to you." : "We'll have it ready for pickup."}</p>}
          {o.status === "REJECTED" && <p className="text-sm">Reason: {o.rejectReason}</p>}
        </section>

        {qr && (
          <section className="card space-y-2 text-center">
            <h2 className="font-bold">Pay {inr(due)} by UPI</h2>
            <img src={qr} alt="UPI QR code" className="mx-auto h-56 w-56 object-contain" />
            {upi?.kind === "upi" && <a href={upi.text} className="btn-primary inline-block">Open UPI app</a>}
            {s?.upiId && <p className="text-xs text-muted">UPI ID: {s.upiId}</p>}
            {o.status !== "ACCEPTED" && <UpiRefForm code={code} token={token} current={o.upiRef} />}
          </section>
        )}

        <section className="card space-y-1 text-sm">
          <div className="flex justify-between text-xs text-muted"><span>{o.kind === "DELIVERY" ? "🛵 Delivery" : "🥡 Pickup"}</span><span>{o.isPreorder ? `${fmtDate(o.date)} · ${o.mealSlot}${o.slotTime ? ` · ${fmtTime(o.slotTime)}` : ""}` : "As soon as possible"}</span></div>
          {lines.map((l) => <div key={l.menuItemId} className="flex justify-between"><span>{l.qty} × {l.name}</span><span className="tabular-nums">{inr(l.qty * l.rate)}</span></div>)}
          <div className="flex justify-between border-t border-line pt-1 font-bold"><span>Total</span><span className="tabular-nums">{inr(total)}</span></div>
          {paid > 0 && <div className="flex justify-between text-emerald-700"><span>Paid</span><span className="tabular-nums">{inr(paid)}</span></div>}
          {o.address && <p className="pt-1 text-xs text-muted">Deliver to: {o.address}</p>}
          {o.payMethod === "COD" && o.status !== "REJECTED" && <p className="pt-1 text-xs text-muted">Pay {o.kind === "DELIVERY" ? "on delivery" : "at pickup"} (cash or UPI).</p>}
        </section>

        {o.status === "ACCEPTED" && bill && <a href={`/${code}/order/${token}/bill`} className="btn-ghost block text-center">📄 Download bill (PDF)</a>}
        <div className="flex flex-wrap justify-center gap-2 text-sm">
          {phone && <a className="btn-ghost" href={`tel:${phone}`}>📞 Call {phone}</a>}
          <Link className="btn-ghost" href={`/${code}/order`}>Order again</Link>
        </div>
      </main>
    </div>
  );
}
