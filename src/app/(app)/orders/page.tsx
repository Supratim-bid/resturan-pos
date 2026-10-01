import { can } from "@/lib/permissions";
import Link from "next/link";
import { and, desc, eq, gte, lte, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/auth";
import { paidByOrder, payStatus } from "@/lib/orders";
import { lookupValues } from "@/lib/options";
import { addDays, fmtDate, inr, todayIST } from "@/lib/format";
import { Badge, Empty, LinkBtn, PageHeader, Stat } from "@/components/ui";

type SP = Promise<{ from?: string; to?: string; show?: string; type?: string; q?: string }>;

export default async function OrdersPage({ searchParams }: { searchParams: SP }) {
  const u = await requirePage("orders");
  const sp = await searchParams;
  const today = todayIST();
  const from = sp.from || today, to = sp.to || from;
  const show = sp.show || "all";
  const conds = [eq(schema.orders.tenantId, u.tenantId), gte(schema.orders.date, from), lte(schema.orders.date, to)];
  if (show === "cancelled") conds.push(eq(schema.orders.status, "CANCELLED"));
  else if (show === "cancelreq") conds.push(eq(schema.orders.cancelStatus, "REQUESTED"));
  else if (show === "preorder") conds.push(eq(schema.orders.isPreorder, true), ne(schema.orders.status, "CANCELLED"));
  else conds.push(ne(schema.orders.status, "CANCELLED"));
  if (sp.type) conds.push(eq(schema.orders.orderType, sp.type));
  let rows = await db.query.orders.findMany({
    where: and(...conds), with: { customer: true, items: true }, orderBy: [desc(schema.orders.date), desc(schema.orders.id)],
  });
  if (sp.q) { const q = sp.q.toLowerCase(); rows = rows.filter((o) => (o.customer?.name ?? "").toLowerCase().includes(q) || o.billNo.toLowerCase().includes(q)); }
  const paid = await paidByOrder(u.tenantId, rows.map((r) => r.id));
  let list = rows.map((o) => ({ o, paid: paid.get(o.id) ?? 0, st: payStatus(Number(o.total), paid.get(o.id) ?? 0) }));
  if (show === "due") list = list.filter((x) => x.st.due > 0);
  const types = await lookupValues(u.tenantId, "ORDER_TYPE");
  const [{ pendingCancels }] = await db.select({ pendingCancels: sql<number>`count(*)` }).from(schema.orders)
    .where(and(eq(schema.orders.tenantId, u.tenantId), eq(schema.orders.cancelStatus, "REQUESTED")));
  const sum = list.reduce((a, x) => ({ total: a.total + Number(x.o.total), paid: a.paid + x.paid, due: a.due + x.st.due }), { total: 0, paid: 0, due: 0 });
  const quick = [
    { l: "Today", f: today, t: today }, { l: "Yesterday", f: addDays(today, -1), t: addDays(today, -1) },
    { l: "Last 7 days", f: addDays(today, -6), t: today }, { l: "This month", f: today.slice(0, 8) + "01", t: today },
  ];
  const qs = (p: Record<string, string>) => "?" + new URLSearchParams({ from, to, show, ...(sp.type ? { type: sp.type } : {}), ...p }).toString();

  return (
    <div>
      <PageHeader title="Orders & Bills" subtitle={from === to ? fmtDate(from) : `${fmtDate(from)} – ${fmtDate(to)}`} actions={<>{can(u, "preorders") && <LinkBtn href="/orders/new?preorder=1" variant="ghost">🗓️ Pre-order</LinkBtn>}<LinkBtn href="/orders/new">+ New order</LinkBtn></>} />
      {Number(pendingCancels) > 0 && show !== "cancelreq" && (
        <Link href="/orders?show=cancelreq&from=2000-01-01&to=2100-12-31" className="mb-3 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900">
          <span>⚠ {Number(pendingCancels)} bill{Number(pendingCancels) > 1 ? "s" : ""} waiting for cancellation approval</span><span>View →</span>
        </Link>
      )}
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {quick.map((q) => (
          <Link key={q.l} href={qs({ from: q.f, to: q.t })} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${from === q.f && to === q.t ? "bg-ink text-white ring-ink" : "bg-white ring-line"}`}>{q.l}</Link>
        ))}
      </div>
      <form className="card mb-4 grid grid-cols-2 gap-2 !p-3 sm:grid-cols-6">
        <div><label className="label">From</label><input type="date" name="from" defaultValue={from} className="input !py-1.5" /></div>
        <div><label className="label">To</label><input type="date" name="to" defaultValue={to} className="input !py-1.5" /></div>
        <div><label className="label">Show</label>
          <select name="show" defaultValue={show} className="input !py-1.5"><option value="all">All</option><option value="due">Unpaid / due</option><option value="preorder">Pre-orders</option><option value="cancelreq">Cancel requests</option><option value="cancelled">Cancelled</option></select></div>
        <div><label className="label">Type</label>
          <select name="type" defaultValue={sp.type ?? ""} className="input !py-1.5"><option value="">All types</option>{types.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div><label className="label">Customer / #</label><input name="q" defaultValue={sp.q ?? ""} className="input !py-1.5" /></div>
        <div className="flex items-end"><button className="btn-ghost w-full !py-2">Apply</button></div>
      </form>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Orders" value={list.length} />
        <Stat label="Billed" value={inr(sum.total)} />
        <Stat label="Collected" value={inr(sum.paid)} tone="green" />
        <Stat label="Due" value={inr(sum.due)} tone={sum.due > 0 ? "red" : undefined} />
      </div>
      {list.length === 0 ? <Empty>No orders for this filter.</Empty> : (
        <div className="space-y-2">
          {list.map(({ o, st }) => (
            <Link key={o.id} href={`/orders/${o.id}`} className="card flex items-center justify-between gap-3 !p-3 hover:border-brand">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold">{o.billNo}</span>
                  {/* order TYPE (how it's served) - not its status */}
                  <span className="text-xs font-semibold text-muted">{/deliver/i.test(o.orderType) ? "🛵" : /take|pick|parcel/i.test(o.orderType) ? "🥡" : /dine/i.test(o.orderType) ? "🍽️" : "🧾"} {o.orderType}</span>
                  {o.status === "CANCELLED" && <Badge tone="gray">Cancelled</Badge>}
                  {o.cancelStatus === "REQUESTED" && <Badge tone="amber">Cancel requested</Badge>}
                  {o.isPreorder && <Badge tone="amber">🗓️ {o.mealSlot || "Pre-order"}</Badge>}
                  {!o.isPreorder && o.status === "ACTIVE" && o.fulfilStatus === "DELIVERED" && <Badge tone="green">✓ Delivered</Badge>}
                  {o.isPreorder && o.status === "ACTIVE" && (o.fulfilStatus === "DELIVERED" ? <Badge tone="green">✓ Delivered</Badge> : o.fulfilStatus === "READY" ? <Badge tone="brand">Ready</Badge> : <Badge tone="gray">⏳ Pending</Badge>)}
                </div>
                <div className="truncate text-sm">{o.customer?.name ?? "Walk-in"}{o.tableNo ? ` · Table ${o.tableNo}` : ""}</div>
                <div className="truncate text-xs text-muted">{fmtDate(o.date)} · {o.items.map((i) => `${i.name}×${Number(i.qty)}`).join(", ")}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-bold tabular-nums">{inr(Number(o.total))}</div>
                <Badge tone={st.tone}>{st.label}{st.due > 0 && st.label !== "Unpaid" ? ` · ${inr(st.due)} due` : ""}</Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
