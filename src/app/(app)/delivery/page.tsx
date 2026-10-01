import Link from "next/link";
import { and, asc, eq, ilike } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/auth";
import { activeGateway, GATEWAY_LABEL, type Gateway } from "@/lib/gateway";
import { upiForOnline } from "@/lib/online";
import { addDays, fmtDate, fmtTime, inr, todayIST , fmtDateTime} from "@/lib/format";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { DeliveryActions } from "@/components/delivery";

export const dynamic = "force-dynamic";

// Our own delivery people: today's delivery orders, address, what to collect, and a QR to collect it.
export default async function Delivery({ searchParams }: { searchParams: Promise<{ date?: string; show?: string }> }) {
  const u = await requirePage("delivery");
  const sp = await searchParams;
  const today = todayIST();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : today;
  const show = sp.show === "done" ? "done" : sp.show === "log" ? "log" : "todo";
  const [s, orders] = await Promise.all([
    db.query.settings.findFirst({ where: eq(schema.settings.tenantId, u.tenantId) }),
    db.query.orders.findMany({
      where: and(eq(schema.orders.tenantId, u.tenantId), eq(schema.orders.status, "ACTIVE"), eq(schema.orders.date, date), ilike(schema.orders.orderType, "%deliver%")),
      with: { items: true, payments: { with: { createdBy: true } }, customer: true, deliveredBy: true }, orderBy: [asc(schema.orders.slotTime), asc(schema.orders.createdAt)],
    }),
  ]);
  const gw = s && u.features.includes("paymentGateways") ? activeGateway(s) : "";
  const rows = orders.map((o) => {
    const paid = o.payments.reduce((a, p) => a + Number(p.amount), 0);
    const due = Math.max(0, Math.round((Number(o.total) - paid) * 100) / 100);
    const addr = [o.customer?.flat, o.customer?.area].filter(Boolean).join(", ") || (o.notes.match(/Deliver to:\s*([^·]+)/)?.[1] ?? "").trim();
    // the payment that cleared money at the door (last positive payment with a staff name)
    const collectedBy = [...o.payments].reverse().find((p) => Number(p.amount) > 0 && p.createdBy);
    return { o, paid, due, addr, done: o.fulfilStatus === "DELIVERED", collectedBy };
  });
  const todo = rows.filter((r) => !r.done), done = rows.filter((r) => r.done);
  const list = show === "done" ? done : show === "log" ? rows : todo;
  const toCollect = todo.reduce((a, r) => a + r.due, 0);
  const qrInfo = [gw ? `${GATEWAY_LABEL[gw as Gateway]} QR (payment checked automatically)` : "", s?.qrImageId ? "Static QR - your uploaded QR (customer types the amount)" : !gw && s?.upiId ? `UPI QR for ${s.upiId} (amount filled in)` : ""].filter(Boolean).join(" + ") || "No QR set up - collect cash, or add a UPI ID / QR in Settings";
  const tab = (k: string, label: string) => <Link href={`/delivery?date=${date}&show=${k}`} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${show === k ? "bg-brand text-white" : "bg-white ring-1 ring-line"}`}>{label}</Link>;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Delivery" subtitle={`${fmtDate(date)} · ${todo.length} to deliver · ${inr(toCollect)} to collect`} />
      <div className="flex flex-wrap items-center gap-2">
        <Link className="btn-ghost btn-sm" href={`/delivery?date=${addDays(date, -1)}&show=${show}`}>‹</Link>
        <span className="text-sm font-semibold">{date === today ? "Today" : fmtDate(date)}</span>
        <Link className="btn-ghost btn-sm" href={`/delivery?date=${addDays(date, 1)}&show=${show}`}>›</Link>
        <span className="mx-1" />{tab("todo", `To deliver (${todo.length})`)}{tab("done", `Delivered (${done.length})`)}{tab("log", "Log")}
      </div>
      {show !== "log" && <p className="rounded-xl bg-cream px-3 py-2 text-xs text-muted">Payment QR: <b className="text-ink">{qrInfo}</b></p>}
      {show === "log" ? (
        rows.length === 0 ? <Empty>No delivery orders for this day.</Empty> : (
          <div className="overflow-x-auto rounded-xl ring-1 ring-line">
            <table className="w-full text-sm">
              <thead className="bg-cream text-left text-xs uppercase text-muted"><tr><th className="p-2">Bill</th><th className="p-2">Customer</th><th className="p-2">Delivered by</th><th className="p-2">Payment taken by</th><th className="p-2 text-right">Amount</th></tr></thead>
              <tbody>
                {rows.map(({ o, paid, due, done: isDone, collectedBy }) => (
                  <tr key={o.id} className="border-t border-line align-top">
                    <td className="p-2 font-mono text-xs">{o.billNo}</td>
                    <td className="p-2">{o.customer?.name ?? "Customer"}</td>
                    <td className="p-2">{isDone ? <span className="text-emerald-800">{o.deliveredBy?.name ?? "✓"}{o.deliveredAt ? <span className="block text-xs text-muted">{fmtDateTime(o.deliveredAt)}</span> : null}</span> : <span className="text-muted">not yet</span>}</td>
                    <td className="p-2">{due <= 0.5 ? <span>{collectedBy?.createdBy?.name ?? <span className="text-muted">online/advance</span>}{collectedBy ? <span className="block text-xs text-muted">{collectedBy.mode}</span> : null}</span> : <span className="text-red-700">due {inr(due)}</span>}</td>
                    <td className="p-2 text-right tabular-nums">{inr(paid)}<span className="block text-xs text-muted">of {inr(Number(o.total))}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : list.length === 0 ? <Empty>{show === "done" ? "Nothing delivered yet for this day." : "No delivery orders waiting for this day."}</Empty> : (
        <div className="space-y-3">
          {list.map(({ o, paid, due, addr, done: isDone, collectedBy }) => {
            // the uploaded QR picture is shown whenever there is one; otherwise a UPI QR with the amount
            const staticQr = s?.qrImageId ? `/img/${s.qrImageId}` : "";
            const upi = s && !staticQr ? upiForOnline(s, due, `Bill ${o.billNo}`) : null;
            const phone = o.customer?.phone ?? (o.notes.match(/Online order \(([\d\s+]+)\)/)?.[1] ?? "");
            const p10 = phone.replace(/\D/g, "").slice(-10);
            return (
              <div key={o.id} className="card space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <b>{o.billNo}</b>
                  {o.isPreorder && <Badge tone="amber">🗓️ {o.mealSlot}{o.slotTime ? ` · ${fmtTime(o.slotTime)}` : ""}</Badge>}
                  {isDone ? <Badge tone="green">✓ Delivered</Badge> : due > 0 ? <Badge tone="red">Collect {inr(due)}</Badge> : <Badge tone="green">Paid</Badge>}
                  <span className="ml-auto text-lg font-bold tabular-nums">{inr(Number(o.total))}</span>
                </div>
                <div className="text-sm">
                  <div className="font-semibold">{o.customer?.name ?? "Customer"}</div>
                  {addr && <a className="block text-brand underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`}>📍 {addr}</a>}
                  {p10.length === 10 && <div className="mt-1 flex gap-2"><a className="btn-ghost btn-sm" href={`tel:+91${p10}`}>📞 {phone}</a><a className="btn-ghost btn-sm" target="_blank" rel="noreferrer" href={`https://wa.me/91${p10}`}>WhatsApp</a></div>}
                </div>
                <div className="text-xs text-muted">{o.items.map((i) => `${Number(i.qty)} × ${i.name}`).join(", ")}{paid > 0 ? ` · paid ${inr(paid)}` : ""}</div>
                {o.notes && <div className="rounded-lg bg-cream px-2 py-1 text-xs">{o.notes}</div>}
                {(isDone || collectedBy) && (
                  <div className="flex flex-wrap gap-x-3 text-xs text-emerald-800">
                    {isDone && <span>✓ Delivered by <b>{o.deliveredBy?.name ?? "—"}</b>{o.deliveredAt ? ` · ${fmtDateTime(o.deliveredAt)}` : ""}</span>}
                    {collectedBy && <span>💵 Payment by <b>{collectedBy.createdBy?.name}</b> ({collectedBy.mode})</span>}
                  </div>
                )}
                <DeliveryActions orderId={o.id} due={due} done={isDone} gateway={gw ? GATEWAY_LABEL[gw as Gateway] : ""}
                  upiText={upi?.kind === "upi" ? upi.text : ""} qrImage={staticQr}
                  today={today} restaurant={s?.name ?? ""} billNo={o.billNo} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
