import Link from "next/link";
import { headers } from "next/headers";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { lookupValues } from "@/lib/options";
import { qrDataUrl } from "@/lib/bill";
import { fmtDate, fmtDateTime, fmtTime, inr, todayIST } from "@/lib/format";
import type { OnlineLine } from "@/lib/online";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { CopyLink, LiveOrders, OnlineOrderActions, OnlineSettings, OpenSwitch } from "@/components/online-orders";

export const dynamic = "force-dynamic";

export default async function OnlineOrders({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const u = await requirePage("onlineOrders");
  const show = (await searchParams).show ?? "new";
  const T = u.tenantId;
  const since = new Date(Date.now() - 36 * 3600e3);
  const [s, newOnes, done, types] = await Promise.all([
    db.query.settings.findFirst({ where: eq(schema.settings.tenantId, T) }),
    db.query.onlineOrders.findMany({ where: and(eq(schema.onlineOrders.tenantId, T), inArray(schema.onlineOrders.status, ["NEW", "ACCEPTING"])), orderBy: [desc(schema.onlineOrders.createdAt)] }),
    db.query.onlineOrders.findMany({
      where: and(eq(schema.onlineOrders.tenantId, T), eq(schema.onlineOrders.status, show === "rejected" ? "REJECTED" : "ACCEPTED"), gte(schema.onlineOrders.createdAt, since)),
      orderBy: [desc(schema.onlineOrders.createdAt)], limit: 50,
    }),
    lookupValues(T, "ORDER_TYPE"),
  ]);
  const billNos = new Map((done.some((d) => d.orderId) ? await db.query.orders.findMany({ where: inArray(schema.orders.id, done.map((d) => d.orderId!).filter(Boolean)) }) : []).map((o) => [o.id, o.billNo]));
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const link = `${origin}/${u.tenantCode}/order`;
  const qr = await qrDataUrl(link, 300);
  const list = show === "new" ? newOnes : done;
  const wa = `https://wa.me/?text=${encodeURIComponent(`Order from ${s?.name ?? "us"} online: ${link}`)}`;
  const tab = (k: string, label: string) => <Link href={`/online-orders?show=${k}`} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${show === k ? "bg-brand text-white" : "bg-white ring-1 ring-line"}`}>{label}</Link>;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="Online Orders" subtitle="Orders customers place from your online menu. Accept to turn them into bills." actions={<><OpenSwitch open={!!s?.onlineOpen} /><LiveOrders newCount={newOnes.length} /></>} />
      <div className="flex flex-wrap gap-2">{tab("new", `New (${newOnes.length})`)}{tab("accepted", "Accepted · last 36 h")}{tab("rejected", "Rejected · last 36 h")}</div>

      {list.length === 0 ? <Empty>{show === "new" ? "No new orders. This page checks every 15 seconds." : "Nothing here in the last 36 hours."}</Empty> : (
        <div className="space-y-3">
          {list.map((o) => {
            const lines = JSON.parse(o.items) as OnlineLine[];
            return (
              <Card key={o.id} title={<span className="flex flex-wrap items-center gap-2">
                <span>{o.name}</span>
                <Badge tone={o.kind === "DELIVERY" ? "brand" : "gray"}>{o.kind === "DELIVERY" ? "🛵 Delivery" : "🥡 Pickup"}</Badge>
                {o.isPreorder && <Badge tone="amber">🗓️ {fmtDate(o.date)} · {o.mealSlot}{o.slotTime ? ` · ${fmtTime(o.slotTime)}` : ""}</Badge>}
                <Badge tone={o.payMethod === "UPI" ? "green" : "gray"}>{o.payMethod === "UPI" ? `UPI${o.upiRef ? " · UTR sent" : ""}` : "Pay on delivery/pickup"}</Badge>
              </span>}>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <div className="space-y-1 text-sm">
                    <div><a className="font-semibold text-brand" href={`tel:${o.phone}`}>📞 {o.phone}</a> · <span className="text-muted">{fmtDateTime(o.createdAt)}</span></div>
                    {o.address && <div>📍 {o.address}</div>}
                    <ul className="list-disc pl-5">{lines.map((l) => <li key={l.menuItemId}>{l.qty} × {l.name} <span className="text-muted">({inr(l.rate)})</span></li>)}</ul>
                    {o.notes && <div className="rounded-lg bg-cream px-2 py-1">📝 {o.notes}</div>}
                    {o.status === "REJECTED" && <div className="text-red-700">Rejected: {o.rejectReason}</div>}
                    {o.status === "ACCEPTED" && o.orderId && <div>Bill: <Link className="font-semibold text-brand underline" href={`/orders/${o.orderId}`}>{billNos.get(o.orderId) ?? "open"}</Link></div>}
                  </div>
                  <div className="text-right text-lg font-bold tabular-nums">{inr(Number(o.estTotal))}<div className="text-xs font-normal text-muted">estimate</div></div>
                </div>
                {(o.status === "NEW") && <div className="mt-3 border-t border-line pt-3"><OnlineOrderActions id={o.id} payMethod={o.payMethod} upiRef={o.upiRef} /></div>}
                {o.status === "ACCEPTING" && <p className="mt-2 text-sm text-muted">Being accepted…</p>}
              </Card>
            );
          })}
        </div>
      )}

      <Card title="Your online order link">
        <div className="flex flex-wrap items-center gap-4">
          <img src={qr} alt="QR code for the order page" className="h-32 w-32 rounded-lg border border-line" />
          <div className="min-w-0 flex-1 space-y-2 text-sm">
            <div className="break-all rounded-lg bg-cream px-2 py-1 font-mono text-xs">{link}</div>
            <div className="flex flex-wrap gap-2">
              <CopyLink url={link} />
              <a className="btn-ghost btn-sm" href={link} target="_blank" rel="noreferrer">Open order page</a>
              <a className="btn-ghost btn-sm" href={wa} target="_blank" rel="noreferrer">Share on WhatsApp</a>
              <a className="btn-ghost btn-sm" href={qr} download={`order-qr-${u.tenantCode}.png`}>Download QR</a>
            </div>
            <p className="text-xs text-muted">Print the QR for tables, bags and flyers, or put the link in your Instagram bio and WhatsApp status. {todayIST() && ""}</p>
          </div>
        </div>
      </Card>

      {can(u, "settings") && (
        <details className="card">
          <summary className="cursor-pointer font-bold">⚙️ Online ordering settings</summary>
          <div className="mt-3">
            <OnlineSettings preorderFeature={u.features.includes("preorders")} orderTypes={types.length ? types : ["Delivery", "Takeaway"]} initial={{
              onlineDelivery: String(s?.onlineDelivery ?? true), onlineTakeaway: String(s?.onlineTakeaway ?? true), onlinePreorder: String(s?.onlinePreorder ?? true),
              onlineMinOrder: String(Number(s?.onlineMinOrder ?? 0)), onlineNote: s?.onlineNote ?? "", onlineClosedMsg: s?.onlineClosedMsg ?? "",
              onlineDeliveryType: s?.onlineDeliveryType ?? "Delivery", onlineTakeawayType: s?.onlineTakeawayType ?? "Takeaway", onlineOpen: String(s?.onlineOpen ?? true),
            }} />
          </div>
        </details>
      )}
    </div>
  );
}
