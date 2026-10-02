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
import { TrackMap, SetMyLocation } from "@/components/track-map";
import { etaRange } from "@/lib/eta";
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
  const bill = o.orderId ? await db.query.orders.findFirst({ where: eq(schema.orders.id, o.orderId), with: { payments: true, rider: true } }) : null;
  const lines = JSON.parse(o.items) as OnlineLine[];
  const total = bill ? Number(bill.total) : Number(o.estTotal);
  const paid = bill ? bill.payments.reduce((a, p) => a + Number(p.amount), 0) : Number(o.paidOnline);
  const paidOnline = Number(o.paidOnline);
  const gateway = s ? activeGateway(s) : "";
  const due = Math.max(0, Math.round((total - paid) * 100) / 100);
  const showUpi = o.payMethod === "UPI" && o.status !== "REJECTED" && due > 0.5 && s;
  const payOnline = !!showUpi && !!gateway;
  // with a payment gateway the customer pays only through it; our own UPI QR is for restaurants without one
  const upi = showUpi && !payOnline ? upiForOnline(s!, due, `Online order ${o.id}`) : null;
  const qr = upi?.kind === "upi" ? await qrDataUrl(upi.text, 260) : upi?.kind === "image" ? `/img/${upi.imageId}` : null;
  const phones = s ? restaurantPhones(s) : [];
  const isDelivery = o.kind === "DELIVERY";
  const fulfil = bill?.fulfilStatus ?? ""; // "" | PENDING | READY | OUT | DELIVERED
  const state = o.status === "REJECTED" ? { icon: "❌", title: "Order not accepted", tone: "bg-red-50 text-red-800" }
    : o.status === "ACCEPTED"
      ? fulfil === "DELIVERED" ? { icon: "✅", title: isDelivery ? "Delivered" : "Picked up", tone: "bg-emerald-50 text-emerald-800" }
        : fulfil === "OUT" ? { icon: "🛵", title: "Out for delivery", tone: "bg-amber-50 text-amber-900" }
        : fulfil === "READY" ? { icon: "🍽️", title: isDelivery ? "Ready - leaving soon" : "Ready for pickup", tone: "bg-emerald-50 text-emerald-800" }
        : { icon: "👨‍🍳", title: "Order confirmed - being prepared", tone: "bg-emerald-50 text-emerald-800" }
    : { icon: "⏳", title: "Waiting for the restaurant to confirm", tone: "bg-amber-50 text-amber-900" };
  // delivery progress steps
  const steps = isDelivery ? ["Confirmed", "Preparing", "Out for delivery", "Delivered"] : ["Confirmed", "Preparing", "Ready for pickup"];
  const stepIdx = o.status !== "ACCEPTED" ? -1 : fulfil === "DELIVERED" ? steps.length - 1 : fulfil === "OUT" ? 2 : fulfil === "READY" ? (isDelivery ? 1 : 2) : 0;
  const showMap = isDelivery && o.status === "ACCEPTED" && fulfil !== "DELIVERED";
  const etaFresh = bill?.etaMin != null && bill.etaAt && Date.now() - new Date(bill.etaAt).getTime() < 30 * 60 * 1000;
  const hasDest = !!(bill?.destLat);
  const liveRefresh = o.status === "ACCEPTED" && (fulfil === "OUT" || fulfil === "" || fulfil === "PENDING" || fulfil === "READY");
  return (
    <div className="min-h-dvh bg-cream pb-10">
      <style dangerouslySetInnerHTML={{ __html: themeCss(s?.primaryColor, s?.accentColor) }} />
      {o.status === "NEW" || o.status === "ACCEPTING" ? <AutoRefresh seconds={sp.paid && paidOnline === 0 ? 5 : 15} /> : liveRefresh ? <AutoRefresh seconds={30} /> : null}
      <header className="bg-brand px-4 py-5 text-center text-white">
        <div className="font-display text-xl font-bold">{s?.name}</div>
      </header>
      <main className="mx-auto max-w-lg space-y-4 px-4 pt-4">
        <section className={`rounded-2xl px-4 py-4 text-center ${state.tone}`}>
          <div className="text-3xl">{state.icon}</div>
          <h1 className="mt-1 text-lg font-bold">{state.title}</h1>
          {o.status === "NEW" && <p className="text-sm">{o.payMethod === "UPI" && due > 0.5 ? (payOnline ? "Please pay below to confirm your order." : "Please pay by UPI below. The restaurant will check the payment and confirm your order.") : paidOnline > 0 ? "Payment received. The restaurant will confirm your order shortly." : "This page updates by itself. Keep it open or come back to this link."}</p>}
          {o.status === "ACCEPTED" && bill && <p className="text-sm">Bill no. <b>{bill.billNo}</b>. {o.kind === "DELIVERY" ? "We'll deliver it to you." : "We'll have it ready for pickup."}</p>}
          {fulfil === "OUT" && etaFresh && <p className="mt-1 text-lg font-bold">⏱️ Arriving in about {etaRange(bill!.etaMin!)}</p>}
          {fulfil === "OUT" && bill?.rider && <p className="text-sm">Your delivery partner: <b>{bill.rider.name}</b></p>}
          {o.status === "REJECTED" && <p className="text-sm">Reason: {o.rejectReason}</p>}
        </section>

        {o.status === "ACCEPTED" && stepIdx >= 0 && (
          <section className="card">
            <ol className="flex items-center">
              {steps.map((label, i) => (
                <li key={label} className="flex flex-1 flex-col items-center text-center last:flex-none">
                  <div className="flex w-full items-center">
                    <span className={`mx-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i <= stepIdx ? "bg-brand text-white" : "bg-cream text-muted ring-1 ring-line"}`}>{i < stepIdx ? "✓" : i + 1}</span>
                    {i < steps.length - 1 && <span className={`h-0.5 flex-1 ${i < stepIdx ? "bg-brand" : "bg-line"}`} />}
                  </div>
                  <span className={`mt-1 text-[11px] ${i === stepIdx ? "font-bold text-brand" : "text-muted"}`}>{label}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {showMap && (
          <>
            {!hasDest && <section className="card bg-gold-light/40 text-center"><p className="mb-2 text-sm font-semibold">Share your location so we can show a live ETA and the rider can find you faster.</p><SetMyLocation code={code} token={token} has={hasDest} /></section>}
            <TrackMap code={code} token={token} />
            {hasDest && <SetMyLocation code={code} token={token} has={hasDest} />}
          </>
        )}

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
            {sp.payerr && <p className="text-sm text-red-700">Couldn&apos;t open the payment page. Please try again in a moment, or call the restaurant.</p>}
            {sp.paid && !sp.payerr && <p className="text-sm text-amber-800">We haven&apos;t received the payment yet. If money was deducted, it will show here in a minute.</p>}
            <a href={`/${code}/order/${token}/pay`} className="btn-primary inline-block text-lg">💳 Pay {inr(due)} now</a>
          </section>
        )}

        {qr && (
          <section className="card space-y-2 text-center">
            <h2 className="font-bold">Pay {inr(due)} by UPI</h2>
            <img src={qr} alt="UPI QR code" className="mx-auto h-56 w-56 object-contain" />
            {upi?.kind === "upi" && <a href={upi.text} className="btn-primary inline-block">Open UPI app</a>}
            {s?.upiId && <p className="text-xs text-muted">UPI ID: {s.upiId}</p>}
            {o.status === "NEW" && <PaymentProof code={code} token={token} has={!!o.payProofImageId} />}
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
          <a className="btn-ghost" href={`/${code}/order/${token}/again`}>Order again</a>
          <Link className="btn-ghost" href={`/${code}/order/my`}>My orders</Link>
        </div>
      </main>
    </div>
  );
}
