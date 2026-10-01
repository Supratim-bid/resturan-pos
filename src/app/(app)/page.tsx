import { packagingStock } from "@/lib/orders";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, ilike, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can, canSeeCosts } from "@/lib/permissions";
import { addDays, fmtDate, inr, monthLabel, monthStart, todayIST } from "@/lib/format";
import { customerBalances } from "@/lib/orders";
import { collectionsByMode, dailySeries, expenseTotal, itemSales, orderTypeSales, salesSummary, platformCommission, unpaidBills, unpaidTotals } from "@/lib/reports";
import { Badge, Card, Empty, LinkBtn, PageHeader, Stat } from "@/components/ui";
import { balancesBefore } from "@/lib/money";
import { DailySalesChart } from "@/components/charts";

export default async function Dashboard() {
  const u = await requireUser();
  if (!can(u, "dashboard")) redirect(can(u, "newOrder") ? "/orders/new" : can(u, "dailyMenu") ? "/daily-menu" : "/more");
  const T = u.tenantId;
  const sc = canSeeCosts(u);
  const today = todayIST(), ms = monthStart(today);
  const [t, m, mExp, comm, series, top, bal, stockRows, ings, rems, custs, todayPaid, plans] = await Promise.all([
    salesSummary(T, today, today), salesSummary(T, ms, today), expenseTotal(T, ms, today), platformCommission(T, ms, today),
    dailySeries(T, addDays(today, -13), today), itemSales(T, ms, today), customerBalances(T),
    db.select({ id: schema.stockMovements.ingredientId, q: sql<number>`sum(${schema.stockMovements.qty})`, started: sql<boolean>`bool_or(${schema.stockMovements.type} in ('PURCHASE','COUNT'))` }).from(schema.stockMovements).where(eq(schema.stockMovements.tenantId, T)).groupBy(schema.stockMovements.ingredientId),
    db.query.ingredients.findMany({ where: and(eq(schema.ingredients.tenantId, T), eq(schema.ingredients.trackStock, true)) }),
    db.query.reminders.findMany({ where: and(eq(schema.reminders.tenantId, T), eq(schema.reminders.done, false), lte(schema.reminders.dueDate, addDays(today, 15))), orderBy: [asc(schema.reminders.dueDate)] }),
    db.query.customers.findMany({ where: eq(schema.customers.tenantId, T) }),
    db.select({ s: sql<number>`coalesce(sum(${schema.payments.amount}),0)` }).from(schema.payments).where(and(eq(schema.payments.tenantId, T), eq(schema.payments.date, today))),
    db.query.dailyMenus.findMany({ where: and(eq(schema.dailyMenus.tenantId, T), eq(schema.dailyMenus.date, today)), with: { menuItem: true } }),
  ]);
  const [todayItems, todayModes, todayTypes, unpaid, unpaidList, delivRows] = await Promise.all([
    itemSales(T, today, today), collectionsByMode(T, today, today), orderTypeSales(T, today, today), unpaidTotals(T, today), unpaidBills(T, 8),
    db.select({ n: sql<number>`count(*)` }).from(schema.orders).where(and(eq(schema.orders.tenantId, T), eq(schema.orders.status, "ACTIVE"), eq(schema.orders.date, today),
      ilike(schema.orders.orderType, "%deliver%"), sql`${schema.orders.fulfilStatus} <> 'DELIVERED'`)),
  ]);
  const delivPending = Number(delivRows[0]?.n ?? 0);
  const todayQty = todayItems.reduce((a, r) => a + r.qty, 0);
  const upcoming = await db.select({ date: schema.orders.date, n: sql<number>`count(*)` }).from(schema.orders)
    .where(and(eq(schema.orders.tenantId, T), eq(schema.orders.isPreorder, true), eq(schema.orders.status, "ACTIVE"), sql`${schema.orders.fulfilStatus} <> 'DELIVERED'`,
      sql`${schema.orders.date} between ${today} and ${addDays(today, 1)}`)).groupBy(schema.orders.date);
  const preToday = Number(upcoming.find((x) => x.date === today)?.n ?? 0), preTomorrow = Number(upcoming.find((x) => x.date !== today)?.n ?? 0);
  const stuck = await db.select({ id: schema.orders.id, billNo: schema.orders.billNo, s: sql<number>`sum(${schema.payments.amount})` }).from(schema.orders)
    .innerJoin(schema.payments, eq(schema.payments.orderId, schema.orders.id))
    .where(and(eq(schema.orders.tenantId, T), eq(schema.orders.status, "CANCELLED"))).groupBy(schema.orders.id, schema.orders.billNo)
    .having(sql`sum(${schema.payments.amount}) > 0.5`).limit(10);
  const onlineNew = can(u, "onlineOrders") ? Number((await db.select({ n: sql<number>`count(*)` }).from(schema.onlineOrders).where(and(eq(schema.onlineOrders.tenantId, T), eq(schema.onlineOrders.status, "NEW"))))[0].n) : 0;
  const money = can(u, "money") ? await balancesBefore(T, addDays(today, 1)) : null;
  const cancelReqs = await db.query.orders.findMany({ where: and(eq(schema.orders.tenantId, T), eq(schema.orders.cancelStatus, "REQUESTED")), limit: 10 });
  const sq = new Map(stockRows.map((s) => [s.id, Number(s.q)]));
  const started = new Set(stockRows.filter((s) => s.started).map((s) => s.id));
  const low = ings.filter((i) => started.has(i.id) && i.reorderLevel != null && (sq.get(i.id) ?? 0) <= Number(i.reorderLevel));
  const [packs, pstock] = await Promise.all([db.query.packaging.findMany({ where: eq(schema.packaging.tenantId, T) }), packagingStock(T)]);
  const lowPack = packs.filter((p) => { const st = pstock.get(p.id); return st?.tracked && p.reorderLevel != null && st.qty <= p.reorderLevel; });
  const noStockYet = started.size === 0 && ings.length > 0;
  const dues = custs.map((c) => ({ c, b: bal.get(c.id)?.balance ?? 0 })).filter((x) => x.b > 0.5).sort((a, b) => b.b - a.b);
  const totalDue = dues.reduce((s, d) => s + d.b, 0);
  const mm = today.slice(5, 7);
  const bdays = custs.filter((c) => c.birthday?.slice(5, 7) === mm).sort((a, b) => a.birthday!.localeCompare(b.birthday!));
  const profit = m.netSales - mExp - comm.commission;
  const foodPct = m.netSales ? (m.foodCost / m.netSales) * 100 : 0;
  const soldToday = new Map<number, number>();
  if (plans.length) {
    const rows = await db.select({ id: schema.orderItems.menuItemId, q: sql<number>`sum(${schema.orderItems.qty})` }).from(schema.orderItems)
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId)).where(and(eq(schema.orders.tenantId, T), eq(schema.orders.date, today), eq(schema.orders.status, "ACTIVE"))).groupBy(schema.orderItems.menuItemId);
    for (const r of rows) soldToday.set(r.id, Number(r.q));
  }

  return (
    <div>
      <PageHeader title={`Namaskar, ${u.name.split(" ")[0]}`} subtitle={fmtDate(today)} actions={<LinkBtn href="/orders/new">+ New order</LinkBtn>} />
      {onlineNew > 0 && (
        <Link href="/online-orders" className="mb-4 flex items-center justify-between rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white shadow">
          <span>📲 {onlineNew} new online order{onlineNew > 1 ? "s" : ""} waiting to be accepted</span><span>Open →</span>
        </Link>
      )}
      {(preToday > 0 || preTomorrow > 0) && (
        <Link href="/preorders" className="mb-4 flex items-center justify-between rounded-xl border border-gold bg-gold-light/50 px-4 py-2.5 text-sm font-semibold">
          <span>🗓️ Pre-orders to prepare: <b>{preToday}</b> today · <b>{preTomorrow}</b> tomorrow</span><span className="text-brand">Open →</span>
        </Link>
      )}
      {delivPending > 0 && can(u, "delivery") && (
        <Link href="/delivery" className="mb-4 flex items-center justify-between rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-semibold hover:ring-1 hover:ring-brand">
          <span>🏍️ <b>{delivPending}</b> delivery order{delivPending > 1 ? "s" : ""} still to deliver today</span><span className="text-brand">Open →</span>
        </Link>
      )}
      {stuck.length > 0 && can(u, "approveCancel") && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
          <b>Cancelled bills still holding money:</b> {stuck.map((x, i) => <span key={x.id}>{i ? ", " : " "}<Link className="font-semibold underline" href={`/orders/${x.id}`}>{x.billNo} (₹{Number(x.s).toLocaleString("en-IN")})</Link></span>)}. Open each to refund it or keep it as advance.
        </div>
      )}
      {money && (
        <Link href="/money" className="mb-5 grid grid-cols-3 gap-2 rounded-2xl bg-white p-3 ring-1 ring-line hover:ring-brand">
          <div><div className="text-[11px] font-semibold uppercase text-muted">💵 Cash in hand</div><div className="text-lg font-extrabold tabular-nums">{inr(money.CASH)}</div></div>
          <div><div className="text-[11px] font-semibold uppercase text-muted">📱 Online / Bank</div><div className="text-lg font-extrabold tabular-nums">{inr(money.BANK)}</div></div>
          <div><div className="text-[11px] font-semibold uppercase text-brand">🏦 Total money</div><div className="text-lg font-extrabold tabular-nums text-brand">{inr(money.CASH + money.BANK)}</div></div>
        </Link>
      )}
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Today</h2>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Orders" value={t.orders} hint={t.orders ? `avg bill ${inr(t.netSales / t.orders)}` : undefined} />
        <Stat label="Sales" value={inr(t.netSales)} hint="before GST" />
        <Stat label="Collected" value={inr(Number(todayPaid[0].s))} tone="green" hint="all payments received today" />
        <Stat label="Unpaid · today's bills" value={inr(unpaid.today)} tone={unpaid.today > 0.5 ? "red" : undefined} hint={`${unpaid.billsToday} bill${unpaid.billsToday === 1 ? "" : "s"}`} />
        <Stat label="All dues (every bill)" value={inr(unpaid.total)} tone={unpaid.total > 0.5 ? "red" : undefined} hint={`${unpaid.bills} unpaid bill${unpaid.bills === 1 ? "" : "s"} · ${dues.length} customer${dues.length === 1 ? "" : "s"}`} />
      </div>
      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <Card title={`Today's dish-wise sales · ${todayQty} plates`} className="lg:col-span-2" actions={sc ? <Link href={`/reports?from=${today}&to=${today}`} className="text-xs font-semibold text-brand">Full report →</Link> : undefined}>
          {todayItems.length ? (
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted"><th className="py-1">Dish</th><th className="py-1 text-right">Qty</th><th className="py-1 text-right">Sales</th>{sc && <th className="py-1 text-right">Profit</th>}</tr></thead>
                <tbody>{todayItems.map((d) => (
                  <tr key={d.id} className="border-t border-line"><td className="py-1">{d.name}</td><td className="py-1 text-right tabular-nums">{d.qty}</td><td className="py-1 text-right tabular-nums">{inr(d.sales)}</td>{sc && <td className="py-1 text-right tabular-nums text-muted">{inr(d.profit)}</td>}</tr>
                ))}</tbody>
                <tfoot><tr className="border-t-2 border-line font-bold"><td className="py-1">Total</td><td className="py-1 text-right tabular-nums">{todayQty}</td><td className="py-1 text-right tabular-nums">{inr(todayItems.reduce((a, r) => a + r.sales, 0))}</td>{sc && <td className="py-1 text-right tabular-nums">{inr(todayItems.reduce((a, r) => a + r.profit, 0))}</td>}</tr></tfoot>
              </table>
            </div>
          ) : <Empty>No dishes sold yet today.</Empty>}
        </Card>
        <Card title="Today by type & payment">
          {todayTypes.length || todayModes.length ? (
            <div className="space-y-3 text-sm">
              {todayTypes.length > 0 && <ul className="space-y-1">{todayTypes.map((r) => <li key={r.type} className="flex justify-between"><span>{r.type} <span className="text-xs text-muted">· {r.orders}</span></span><b className="tabular-nums">{inr(r.sales)}</b></li>)}</ul>}
              {todayModes.length > 0 && <div className="border-t border-line pt-2"><div className="mb-1 text-[11px] font-semibold uppercase text-muted">Money received</div>
                <ul className="space-y-1">{todayModes.map((r) => <li key={r.mode} className="flex justify-between"><span>{r.mode}</span><b className="tabular-nums text-emerald-700">{inr(r.amount)}</b></li>)}</ul></div>}
            </div>
          ) : <Empty>Nothing yet today.</Empty>}
        </Card>
        <Card title={`Unpaid bills · ${inr(unpaid.total)}`} className="lg:col-span-3" actions={<Link href={`/orders?show=due&from=2000-01-01&to=${today}`} className="text-xs font-semibold text-brand">All →</Link>}>
          {unpaidList.length ? <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">{unpaidList.map((b) => (
            <li key={b.id}><Link href={`/orders/${b.id}`} className="flex justify-between gap-2 hover:text-brand"><span className="truncate">{b.billNo} · {b.name} <span className="text-xs text-muted">{b.date === today ? "today" : fmtDate(b.date)}</span></span><b className="shrink-0 tabular-nums text-red-700">{inr(b.due)}</b></Link></li>
          ))}</ul> : <Empty>Every bill is paid. 🎉</Empty>}
        </Card>
      </div>
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{monthLabel(today.slice(0, 7))} so far</h2>
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Sales" value={inr(m.netSales)} hint={`${m.orders} orders · avg ${inr(m.orders ? m.netSales / m.orders : 0)}`} />
        {sc && <Stat label="Expenses" value={inr(mExp + comm.commission)} hint={comm.commission ? `incl. ${inr(comm.commission)} app commission` : undefined} />}
        {sc && <Stat label="Profit" value={inr(profit)} tone={profit < 0 ? "red" : "green"} hint="sales − all expenses" />}
        {sc && <Stat label="Food cost" value={foodPct ? foodPct.toFixed(0) + "%" : "—"} hint="of sales (from recipes)" tone={foodPct > 40 ? "red" : undefined} />}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Sales · last 14 days" className="lg:col-span-2"><DailySalesChart data={series} /></Card>
        <Card title="Top dishes this month">
          {top.length ? <ol className="space-y-1.5 text-sm">{top.slice(0, 6).map((d, i) => (
            <li key={d.id} className="flex justify-between gap-2"><span className="truncate">{i + 1}. {d.name}</span><span className="shrink-0 tabular-nums text-muted">{d.qty} · <b className="text-ink">{inr(d.sales)}</b></span></li>
          ))}</ol> : <Empty>No sales yet this month.</Empty>}
        </Card>
        <Card title="Today's menu" actions={<Link href="/daily-menu" className="text-xs font-semibold text-brand">Open →</Link>}>
          {plans.length ? <ul className="space-y-1 text-sm">{plans.map((p) => {
            const left = p.plannedPlates - (soldToday.get(p.menuItemId) ?? 0);
            return <li key={p.id} className="flex justify-between"><span>{p.menuItem.name}</span>{left <= 0 ? <Badge tone="red">Sold out</Badge> : <span className="tabular-nums text-muted">{left} left</span>}</li>;
          })}</ul> : <Empty>No menu planned for today.</Empty>}
        </Card>
        <Card title="Money to collect" actions={<Link href="/customers" className="text-xs font-semibold text-brand">All →</Link>}>
          {dues.length ? <ul className="space-y-1 text-sm">{dues.slice(0, 6).map((d) => (
            <li key={d.c.id}><Link href={`/customers/${d.c.id}`} className="flex justify-between hover:text-brand"><span className="truncate">{d.c.name}</span><b className="tabular-nums text-red-700">{inr(d.b)}</b></Link></li>
          ))}</ul> : <Empty>No dues. 🎉</Empty>}
        </Card>
        <Card title="Needs attention">
          <ul className="space-y-1.5 text-sm">
            {lowPack.map((p) => <li key={`p${p.id}`}><Link href="/packaging" className="flex justify-between"><span>📦 Reorder {p.name}</span><span className="text-xs text-muted">{(pstock.get(p.id)?.qty ?? 0).toLocaleString("en-IN")} pcs</span></Link></li>)}
            {low.map((i) => <li key={i.id}><Link href="/stock" className="flex justify-between"><span>🏷️ Reorder {i.name}</span><span className="text-xs text-muted">{(sq.get(i.id) ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })} {i.unit}</span></Link></li>)}
            {rems.map((r) => <li key={r.id}><Link href="/reminders" className="flex justify-between"><span>⏰ {r.title}</span>{r.dueDate < today ? <Badge tone="red">Overdue</Badge> : <span className="text-xs text-muted">{fmtDate(r.dueDate)}</span>}</Link></li>)}
            {bdays.map((c) => <li key={c.id} className="flex justify-between"><span>🎂 {c.name}</span><span className="text-xs text-muted">{fmtDate(c.birthday).slice(0, 6)}</span></li>)}
            {cancelReqs.map((o) => <li key={`c${o.id}`}><Link href={`/orders/${o.id}`} className="flex justify-between"><span>🧾 Cancel request: {o.billNo}</span><span className="text-xs font-semibold text-amber-700">Review →</span></Link></li>)}
            {noStockYet && <li><Link href="/stock" className="flex justify-between"><span>🏷️ Start stock tracking: enter an opening count</span><span className="text-xs text-brand">Stock →</span></Link></li>}
            {!low.length && !lowPack.length && !rems.length && !bdays.length && !noStockYet && !cancelReqs.length && <li className="text-muted">All good.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
