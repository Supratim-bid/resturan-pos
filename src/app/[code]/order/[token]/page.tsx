import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { isRestaurantPath } from "@/lib/reserved";
import { themeCss } from "@/lib/theme";
import { upiForOnline, type OnlineLine } from "@/lib/online";
import { qrDataUrl } from "@/lib/bill";
import { fmtDate, fmtTime, inr, restaurantPhones } from "@/lib/format";
import { AutoRefresh, PaymentProof } from "@/components/order-status";
import { activeGateway, checkOnlineLink, GATEWAY_LABEL, type Gateway } from "@/lib/gateway";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your order", robots: { index: false } };

// Customer's private status page (the link is the secret): /<code>/order/<token>
export default async function OrderStatus({ params, searchParams }: { params: Promise<{ code: string; token: string }>; searchParams: Promise<{ paid?: string; payerr?: string }> }) {
  const { code: raw, token } = await params;
  const sp = await searchParams;
  const code = raw.toLowerCase();
  if (!isRestaurantPath(code) || !/^[\w-]{16,40}$/.test(token)) notFound();
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.code, code) });
  if (!t) notFound();
  const find = () => db.query.onlineOrders.findFirst({ where: and(eq(schema.onlineOrders.token, token), eq(schema.onlineOrders.tenantId, t.id)) });
  let o = await find();
  if (!o) notFound();
  // back from the payment page (or still waiting): ask the gateway whether it's paid
  if (o.payLinkId && o.status !== "REJECTED" && Number(o.paidOnline) < Number(o.estTotal) - 0.5) {
    await checkOnlineLink(t.id, o.id).catch((e) => console.error("check online link", e));
    o = (await find())!;
  }
  const s = await db.query.settings.findFirst({ where: eq(schema.settings.tenantId, t.id) });
  const bill = o.orderId ? await db.query.orders.findFirst({ where: eq(schema.orders.id, o.orderId), with: { payments: true } }) : null;
  const lines = JSON.parse(o.items) as OnlineLine[];
  const total = bill ? Number(bill.total) : Number(o.estTotal);
  const paid = bill ? bill.payments.reduce((a, p) => a + Number(p.amount), 0) : Number(o.paidOnline);
  const paidOnline = Number(o.paidOnline);
  const gateway = s ? activeGateway(s) : "";
  const due = Math.max(0, Math.round((total - paid) * 100) / 100);
  const showUpi = o.payMethod === "UPI" && o.status !== "REJECTED" && due > 0.5 && s;
  const payOnline = showUpi && !!gateway;
  const upi = showUpi ? upiForOnline(s!, due, `Online order ${o.id}`) : null;
  const qr = upi?.kind === "upi" ? await qrDataUrl(upi.text, 260) : upi?.kind === "image" ? `/img/${upi.imageId}` : null;
  const phones = s ? restaurantPhones(s) : [];
  const state = o.status === "REJECTED" ? { icon: "❌", title: "Order not accepted", tone: "bg-red-50 text-red-800" }
    : o.status === "ACCEPTED" ? { icon: "✅", title: "Order confirmed", tone: "bg-emerald-50 text-emerald-800" }
    : { icon: "⏳", title: "Waiting for the restaurant to confirm", tone: "bg-amber-50 text-amber-900" };
  return (
    <div className="min-h-dvh bg-cream pb-10">
      <style dangerouslySetInnerHTML={{ __html: themeCss(s?.primaryColor, s?.accentColor) }} />
      {o.status === "NEW" || o.status === "ACCEPTING" ? <AutoRefresh seconds={sp.paid && paidOnline === 0 ? 5 : 15} /> : null}
      <header className="bg-brand px-4 py-5 text-center text-white">
        <div className="font-display text-xl font-bold">{s?.name}</div>
      </header>
      <main className="mx-auto max-w-lg space-y-4 px-4 pt-4">
        <section className={`rounded-2xl px-4 py-4 text-center ${state.tone}`}>
          <div className="text-3xl">{state.icon}</div>
          <h1 className="mt-1 text-lg font-bold">{state.title}</h1>
          {o.status === "NEW" && <p className="text-sm">{o.payMethod === "UPI" && due > 0.5 ? (payOnline ? "Please pay below to confirm your order." : "Please pay by UPI below. The restaurant will check the payment and confirm your order.") : paidOnline > 0 ? "Payment received. The restaurant will confirm your order shortly." : "This page updates by itself. Keep it open or come back to this link."}</p>}
          {o.status === "ACCEPTED" && bill && <p className="text-sm">Bill no. <b>{bill.billNo}</b>. {o.kind === "DELIVERY" ? "We'll deliver it to you." : "We'll have it ready for pickup."}</p>}
          {o.status === "REJECTED" && <p className="text-sm">Reason: {o.rejectReason}</p>}
        </section>

        {paidOnline > 0 && o.status !== "REJECTED" && (
          <section className="rounded-2xl bg-emerald-50 px-4 py-3 text-center text-emerald-800">
            <div className="font-bold">✓ Paid {inr(paidOnline)} online{o.payLinkProvider ? ` (${GATEWAY_LABEL[o.payLinkProvider as Gateway] ?? o.payLinkProvider})` : ""}</div>
          </section>
        )}
        {paidOnline > 0 && o.status === "REJECTED" && (
          <section className="rounded-2xl bg-amber-50 px-4 py-3 text-center text-sm text-amber-900">You paid {inr(paidOnline)} online. The restaurant will refund it to the same account - see the refund policy, or call them.</section>
        )}

        {payOnline && (
          <section className="card space-y-2 text-center">
            <h2 className="font-bold">Pay {inr(due)}</h2>
            <p className="text-sm text-muted">UPI, cards, net banking or wallets - secure payment page.</p>
            {sp.payerr && <p className="text-sm text-red-700">Couldn&apos;t open the payment page. Please try again, or pay by UPI QR below.</p>}
            {sp.paid && !sp.payerr && <p className="text-sm text-amber-800">We haven&apos;t received the payment yet. If money was deducted, it will show here in a minute.</p>}
            <a href={`/${code}/order/${token}/pay`} className="btn-primary inline-block text-lg">💳 Pay {inr(due)} now</a>
          </section>
        )}

        {qr && (
          <section className="card space-y-2 text-center">
            {payOnline ? <details><summary className="cursor-pointer text-sm font-semibold">Or pay by scanning a UPI QR</summary><div className="mt-2 space-y-2">
              <img src={qr} alt="UPI QR code" className="mx-auto h-56 w-56 object-contain" />
              {upi?.kind === "upi" && <a href={upi.text} className="btn-ghost inline-block">Open UPI app</a>}
              {s?.upiId && <p className="text-xs text-muted">UPI ID: {s.upiId}</p>}
              {o.status === "NEW" && <PaymentProof code={code} token={token} has={!!o.payProofImageId} />}
            </div></details> : <>
            <h2 className="font-bold">Pay {inr(due)} by UPI</h2>
            <img src={qr} alt="UPI QR code" className="mx-auto h-56 w-56 object-contain" />
            {upi?.kind === "upi" && <a href={upi.text} className="btn-primary inline-block">Open UPI app</a>}
            {s?.upiId && <p className="text-xs text-muted">UPI ID: {s.upiId}</p>}
            {o.status === "NEW" && <PaymentProof code={code} token={token} has={!!o.payProofImageId} />}
            </>}
          </section>
        )}

        <section className="card space-y-1 text-sm">
          <div className="flex justify-between text-xs text-muted"><span>{o.kind === "DELIVERY" ? "🛵 Delivery" : "🥡 Pickup"}</span><span>{o.isPreorder ? `${fmtDate(o.date)} · ${o.mealSlot}${o.slotTime ? ` · ${fmtTime(o.slotTime)}` : ""}` : "As soon as possible"}</span></div>
          {lines.map((l) => <div key={l.menuItemId} className="flex justify-between"><span>{l.qty} × {l.name}</span><span className="tabular-nums">{inr(l.qty * l.rate)}</span></div>)}
          <div className="flex justify-between border-t border-line pt-1 font-bold"><span>Total</span><span className="tabular-nums">{inr(total)}</span></div>
          {paid > 0 && <div className="flex justify-between text-emerald-700"><span>Paid</span><span className="tabular-nums">{inr(paid)}</span></div>}
          {o.address && <p className="pt-1 text-xs text-muted">Deliver to: {o.address}</p>}
          {o.payMethod === "COD" && o.status !== "REJECTED" && <p className="pt-1 text-xs text-muted">Pay cash {o.kind === "DELIVERY" ? "on delivery" : "at pickup"}.</p>}
          {s?.whatsapp && <p className="pt-1 text-xs text-muted">WhatsApp: {s.whatsapp}</p>}
        </section>

        {o.status === "ACCEPTED" && bill && <a href={`/${code}/order/${token}/bill`} className="btn-ghost block text-center">📄 Download bill (PDF)</a>}
        <div className="flex flex-wrap justify-center gap-2 text-sm">
          {phones.map((p) => <a key={p} className="btn-ghost" href={`tel:${p.replace(/[^\d+]/g, "")}`}>📞 Call {p}</a>)}
          <Link className="btn-ghost" href={`/${code}/order`}>Order again</Link>
          <Link className="btn-ghost" href={`/${code}/order/my`}>My orders</Link>
        </div>
      </main>
    </div>
  );
}
