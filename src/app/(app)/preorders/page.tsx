import Link from "next/link";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { lookupValues } from "@/lib/options";
import { payStatus } from "@/lib/orders";
import { addDays, fmtDate, fmtTime, inr, todayIST } from "@/lib/format";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { FulfilButtons } from "@/components/order-actions";

type SP = { view?: string; date?: string; slot?: string; done?: string };

export default async function Preorders({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requirePage("preorders");
  const sp = await searchParams;
  const today = todayIST();
  const view = sp.view === "tomorrow" || sp.view === "week" || sp.view === "day" ? sp.view : sp.view === "today" ? "today" : "week";
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : today;
  const [from, to] = view === "today" ? [today, today] : view === "tomorrow" ? [addDays(today, 1), addDays(today, 1)] : view === "day" ? [day, day] : [today, addDays(today, 6)];
  const showDone = sp.done === "1";
  const slotList = await lookupValues(u.tenantId, "MEAL_SLOT");
  const slots = slotList.length ? slotList : ["Breakfast", "Lunch", "Evening Snacks", "Dinner"];
  const money = can(u, "orders");

  const rows = await db.query.orders.findMany({
    where: and(eq(schema.orders.tenantId, u.tenantId), eq(schema.orders.isPreorder, true), eq(schema.orders.status, "ACTIVE"),
      gte(schema.orders.date, from), lte(schema.orders.date, to)),
    with: { items: { orderBy: (t) => asc(t.id) }, customer: true, payments: true },
    orderBy: [asc(schema.orders.date), asc(schema.orders.slotTime), asc(schema.orders.id)],
  });
  const all = rows.filter((o) => !sp.slot || o.mealSlot === sp.slot);
  const list = all.filter((o) => showDone || o.fulfilStatus !== "DELIVERED");
  const slotRank = (s: string) => { const i = slots.indexOf(s); return i < 0 ? 99 : i; };

  // group: date -> slot -> orders
  const byDate = new Map<string, Map<string, typeof list>>();
  for (const o of list) {
    const d = byDate.get(o.date) ?? new Map();
    const k = o.mealSlot || "Any time";
    d.set(k, [...(d.get(k) ?? []), o]);
    byDate.set(o.date, d);
  }
  // kitchen prep totals (all orders not yet delivered)
  const prep = new Map<string, Map<string, number>>(); // "date|slot" -> dish -> qty
  for (const o of all.filter((x) => x.fulfilStatus !== "DELIVERED")) {
    const key = `${o.date}|${o.mealSlot || "Any time"}`;
    const m = prep.get(key) ?? new Map<string, number>();
    for (const i of o.items) m.set(i.name, (m.get(i.name) ?? 0) + Number(i.qty));
    prep.set(key, m);
  }
  const counts = { total: all.length, pending: all.filter((o) => (o.fulfilStatus || "PENDING") === "PENDING").length, ready: all.filter((o) => o.fulfilStatus === "READY").length, done: all.filter((o) => o.fulfilStatus === "DELIVERED").length };
  const q = (p: Partial<SP>) => { const x = { view, date: view === "day" ? day : undefined, slot: sp.slot, done: showDone ? "1" : undefined, ...p }; return "?" + new URLSearchParams(Object.entries(x).filter(([, v]) => v) as [string, string][]).toString(); };
  const chip = (href: string, on: boolean, label: string) => (
    <Link href={href} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${on ? "bg-brand text-white" : "bg-white ring-1 ring-line"}`}>{label}</Link>
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Pre-orders" subtitle="Orders booked for a later date and meal. Date = the day the food is served."
        actions={can(u, "newOrder") ? <Link href="/orders/new?preorder=1" className="btn-primary">+ New pre-order</Link> : undefined} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {chip(q({ view: "today", date: undefined }), view === "today", "Today")}
        {chip(q({ view: "tomorrow", date: undefined }), view === "tomorrow", "Tomorrow")}
        {chip(q({ view: "week", date: undefined }), view === "week", "Next 7 days")}
        <form className="flex items-center gap-1">
          <input type="hidden" name="view" value="day" />
          {sp.slot && <input type="hidden" name="slot" value={sp.slot} />}
          <input type="date" name="date" defaultValue={view === "day" ? day : ""} className="input !w-auto !py-1.5 text-sm" aria-label="Pick a date" />
          <button className="btn-ghost btn-sm">Go</button>
        </form>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {chip(q({ slot: undefined }), !sp.slot, "All meals")}
        {slots.map((s) => chip(q({ slot: s }), sp.slot === s, s))}
        <Link href={q({ done: showDone ? undefined : "1" })} className="ml-auto text-xs text-brand underline">{showDone ? "Hide delivered" : `Show delivered (${counts.done})`}</Link>
      </div>
      <div className="mb-4 grid grid-cols-3 gap-2 text-center text-sm">
        <div className="card !p-2"><div className="text-xl font-bold">{counts.pending}</div><div className="text-xs text-muted">Pending</div></div>
        <div className="card !p-2"><div className="text-xl font-bold">{counts.ready}</div><div className="text-xs text-muted">Ready</div></div>
        <div className="card !p-2"><div className="text-xl font-bold">{counts.done}</div><div className="text-xs text-muted">Delivered</div></div>
      </div>

      {byDate.size === 0 ? <Empty>No pre-orders {view === "week" ? "in the next 7 days" : `for ${fmtDate(from)}`}.</Empty> : (
        <div className="space-y-6">
          {[...byDate].map(([d, bySlot]) => (
            <section key={d}>
              <h2 className="mb-2 font-display text-lg font-bold text-brand">{d === today ? "Today" : d === addDays(today, 1) ? "Tomorrow" : ""} {fmtDate(d)}</h2>
              <div className="space-y-4">
                {[...bySlot].sort((a, b) => slotRank(a[0]) - slotRank(b[0])).map(([slot, os]) => {
                  const pm = prep.get(`${d}|${slot}`);
                  return (
                    <Card key={slot} title={<span>{slot} <span className="text-sm font-normal text-muted">· {os.length} order{os.length > 1 ? "s" : ""}</span></span>}>
                      {pm && pm.size > 0 && (
                        <div className="mb-3 rounded-xl bg-cream p-2.5 text-sm">
                          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Kitchen: cook for {slot.toLowerCase()}</div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1">{[...pm].sort((a, b) => b[1] - a[1]).map(([n, qn]) => <span key={n}><b className="tabular-nums">{qn}</b> × {n}</span>)}</div>
                        </div>
                      )}
                      <ul className="divide-y divide-line">
                        {os.map((o) => {
                          const paid = o.payments.reduce((a, p) => a + Number(p.amount), 0);
                          const st = payStatus(Number(o.total), paid);
                          return (
                            <li key={o.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
                              <div className="min-w-0 flex-1 text-sm">
                                <div className="flex flex-wrap items-center gap-2">
                                  {o.slotTime && <span className="rounded-md bg-ink px-1.5 py-0.5 text-xs font-bold text-white">{fmtTime(o.slotTime)}</span>}
                                  <Link href={`/orders/${o.id}`} className="font-semibold text-brand hover:underline">{o.billNo}</Link>
                                  <span className="text-muted">{o.orderType}</span>
                                  {money && <Badge tone={st.tone}>{st.label}{st.due > 0 ? ` ${inr(st.due)}` : ""}</Badge>}
                                </div>
                                {o.customer && <div className="mt-0.5">{o.customer.name}{o.customer.phone ? ` · ${o.customer.phone}` : ""}{(o.customer.flat || o.customer.area) ? ` · ${[o.customer.flat, o.customer.area].filter(Boolean).join(", ")}` : ""}</div>}
                                <div className="mt-0.5 text-muted">{o.items.map((i) => `${Number(i.qty)}× ${i.name}`).join(", ")}</div>
                                {o.notes && <div className="mt-0.5 text-xs text-amber-800">📝 {o.notes}</div>}
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                {money && <b className="tabular-nums">{inr(Number(o.total))}</b>}
                                <FulfilButtons orderId={o.id} status={o.fulfilStatus || "PENDING"} compact />
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
