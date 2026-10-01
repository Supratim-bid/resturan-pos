import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/auth";
import { addDays, fmtDate, inr, monthEnd, monthLabel, todayIST } from "@/lib/format";
import {
  categorySales, collectionsByMode, dailySeries, expensesByCategory, hourlySales, itemSales, materialUsage, monthlySeries, orderTypeSales,
  packagingUsed, platformCommission, rawMaterialSpend, salesSummary, staffSales, topCustomers, wastageTotal,
} from "@/lib/reports";
import { Card, PageHeader, Stat } from "@/components/ui";
import { DailySalesChart, HBars, MonthlyTrendChart, SERIES } from "@/components/charts";

export const dynamic = "force-dynamic";

type SP = Promise<{ p?: string; from?: string; to?: string; month?: string }>;
const isDate = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;
const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;

/** Which dates the report covers: preset (today, 7 days, this month…), a custom from–to, or the old ?month= links */
function period(sp: Awaited<SP>, today: string) {
  const ms = today.slice(0, 8) + "01";
  const lmStart = addDays(ms, -1).slice(0, 8) + "01";
  const presets: Record<string, [string, string, string]> = {
    today: [today, today, "Today"],
    yesterday: [addDays(today, -1), addDays(today, -1), "Yesterday"],
    "7d": [addDays(today, -6), today, "Last 7 days"],
    "30d": [addDays(today, -29), today, "Last 30 days"],
    month: [ms, today, "This month"],
    lastmonth: [lmStart, addDays(ms, -1), "Last month"],
  };
  if (sp.p && presets[sp.p]) { const [f, t, l] = presets[sp.p]; return { key: sp.p, from: f, to: t, label: l }; }
  if (isDate(sp.from)) {
    let f = sp.from!, t = isDate(sp.to) ? sp.to! : f;
    if (t < f) [f, t] = [t, f];
    if (days(f, t) > 731) f = addDays(t, -730); // keep it to 2 years
    return { key: "custom", from: f, to: t, label: f === t ? fmtDate(f) : `${fmtDate(f)} – ${fmtDate(t)}` };
  }
  if (sp.month && /^\d{4}-\d{2}$/.test(sp.month)) {
    const f = sp.month + "-01";
    return { key: "custom", from: f, to: monthEnd(f), label: monthLabel(sp.month) };
  }
  const [f, t, l] = presets.month;
  return { key: "month", from: f, to: t, label: l };
}

export default async function Reports({ searchParams }: { searchParams: SP }) {
  const u = await requirePage("reports");
  const T = u.tenantId;
  const today = todayIST();
  const { key, from, to, label } = period(await searchParams, today);
  const n = days(from, to);
  const pTo = addDays(from, -1), pFrom = addDays(from, -n); // the same number of days just before
  const oneDay = from === to;
  const [s, ps, cats, comm, series, trend, items, types, modes, waste, raw] = await Promise.all([
    salesSummary(T, from, to), salesSummary(T, pFrom, pTo), expensesByCategory(T, from, to), platformCommission(T, from, to),
    dailySeries(T, from, to), monthlySeries(T, to.slice(0, 7), 12), itemSales(T, from, to), orderTypeSales(T, from, to), collectionsByMode(T, from, to),
    wastageTotal(T, from, to), rawMaterialSpend(T, from, to),
  ]);
  const [staff, hours, catSales, custs, material, packs, menu] = await Promise.all([
    staffSales(T, from, to), hourlySales(T, from, to), categorySales(T, from, to), topCustomers(T, from, to, 10),
    materialUsage(T, from, to).catch(() => []), packagingUsed(T, from, to),
    db.query.menuItems.findMany({ where: and(eq(schema.menuItems.tenantId, T), eq(schema.menuItems.active, true)), columns: { id: true, name: true } }),
  ]);
  const exp = cats.reduce((a, c) => a + c.amount, 0);
  const totalCost = exp + comm.commission;
  const profit = s.netSales - totalCost;
  const change = ps.netSales ? ((s.netSales - ps.netSales) / ps.netSales) * 100 : null;
  const prevName = key === "today" ? "yesterday" : key === "month" || key === "lastmonth" ? "the month before" : oneDay ? "the day before" : `the ${n} days before`;
  const byQty = [...items].sort((a, b) => b.qty - a.qty);
  const sold = new Set(items.map((i) => i.id));
  const notSold = menu.filter((m) => !sold.has(m.id));
  const plates = items.reduce((a, i) => a + i.qty, 0);
  const matCost = material.reduce((a, m) => a + m.cost, 0);
  const chart = series.map((d) => ({ ...d, label: n > 31 ? `${Number(d.date.slice(8))}/${Number(d.date.slice(5, 7))}` : d.label }));
  const line = (l: string, v: number, o: { bold?: boolean; neg?: boolean; sub?: boolean } = {}) => (
    <div key={l} className={`flex justify-between py-1 ${o.bold ? "border-t border-line font-bold" : ""} ${o.sub ? "pl-4 text-muted" : ""}`}>
      <span>{l}</span><span className={`tabular-nums ${o.neg ? "text-red-700" : ""}`}>{o.neg ? "−" : ""}{inr(Math.abs(v))}</span>
    </div>
  );
  const q = `from=${from}&to=${to}`;
  const chip = (k: string, l: string) => (
    <Link key={k} href={`/reports?p=${k}`} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${key === k ? "bg-brand text-white" : "bg-white ring-1 ring-line hover:ring-brand"}`}>{l}</Link>
  );
  return (
    <div>
      <PageHeader title="Reports & Profit / Loss" subtitle={`${label}${oneDay || key === "today" ? "" : ` · ${n} days`}`} />
      <div className="mb-4 space-y-2 rounded-2xl bg-white p-3 ring-1 ring-line">
        <div className="flex flex-wrap gap-2">
          {chip("today", "Today")}{chip("yesterday", "Yesterday")}{chip("7d", "Last 7 days")}{chip("30d", "Last 30 days")}{chip("month", "This month")}{chip("lastmonth", "Last month")}
        </div>
        <form method="get" action="/reports" className="flex flex-wrap items-end gap-2 text-sm">
          <label className="grid gap-0.5"><span className="text-xs font-semibold text-muted">From</span><input type="date" name="from" defaultValue={from} max={today} className="input !w-auto !py-1.5" /></label>
          <label className="grid gap-0.5"><span className="text-xs font-semibold text-muted">To</span><input type="date" name="to" defaultValue={to} className="input !w-auto !py-1.5" /></label>
          <button className={key === "custom" ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>Show custom dates</button>
        </form>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Net sales" value={inr(s.netSales)} hint={change == null ? `nothing in ${prevName}` : `${change >= 0 ? "▲" : "▼"} ${Math.abs(change).toFixed(0)}% vs ${prevName} (${inr(ps.netSales)})`} tone={change != null && change < 0 ? "red" : undefined} />
        <Stat label="All expenses" value={inr(totalCost)} />
        <Stat label="Net profit" value={inr(profit)} tone={profit < 0 ? "red" : "green"} hint={s.netSales ? `${((profit / s.netSales) * 100).toFixed(0)}% of sales` : ""} />
        <Stat label="Orders" value={s.orders} hint={`avg ${inr(s.orders ? s.netSales / s.orders : 0)} · ${plates} plates`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Profit & Loss statement">
          <div className="text-sm">
            {line("Food sales (menu price)", s.itemsTotal)}
            {line("Less: discounts", s.discounts, { neg: true, sub: true })}
            {line("Add: delivery & packing charges", s.charges, { sub: true })}
            {line("Net sales", s.netSales, { bold: true })}
            {cats.map((c) => line(c.category, c.amount, { neg: true, sub: true }))}
            {comm.commission > 0 && line("Swiggy/Zomato commission (actual)", comm.commission, { neg: true, sub: true })}
            {line("Total expenses", totalCost, { bold: true, neg: true })}
            <div className={`mt-1 flex justify-between rounded-lg px-2 py-2 text-base font-bold ${profit < 0 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}><span>NET PROFIT</span><span className="tabular-nums">{inr(profit)}</span></div>
            <p className="mt-2 text-xs text-muted">GST collected {inr(s.gst)} is not income - it is paid to the government. Profit counts expenses by the date they were paid{oneDay ? ", so a single day can look high or low depending on what was bought that day" : ""}.</p>
          </div>
        </Card>
        <Card title="Food cost check">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span>Recipe cost of what was sold</span><b className="tabular-nums">{inr(s.foodCost)}</b></div>
            <div className="flex justify-between"><span>Raw material actually bought</span><b className="tabular-nums">{inr(raw)}</b></div>
            <div className="flex justify-between"><span>Wastage recorded</span><b className="tabular-nums">{inr(waste)}</b></div>
            <div className="flex justify-between border-t border-line pt-1"><span>Food cost % (recipe)</span><b>{s.netSales ? ((s.foodCost / s.netSales) * 100).toFixed(1) + "%" : "—"}</b></div>
            <div className="flex justify-between"><span>Food cost % (actual purchases)</span><b>{s.netSales ? ((raw / s.netSales) * 100).toFixed(1) + "%" : "—"}</b></div>
            <p className="pt-1 text-xs text-muted">If purchases stay well above recipe cost + wastage over weeks, look for over-portioning, unrecorded wastage or leakage. (Stock left over also explains a gap.)</p>
          </div>
        </Card>
        {oneDay
          ? <Card title={`Sales by hour · ${label}`}>{hours.length ? <HBars color={SERIES.sales} rows={hours.map((h) => ({ label: `${hourLabel(h.hour)} (${h.orders})`, value: h.sales }))} /> : <p className="text-sm text-muted">No orders.</p>}</Card>
          : <Card title={`Daily sales · ${label}`}><DailySalesChart data={chart} monthLabel={label} /></Card>}
        <Card title={`Last 12 months (to ${monthLabel(to.slice(0, 7))})`}><MonthlyTrendChart data={trend} /></Card>

        <Card title={`Most sold dishes · by plates`}>
          {byQty.length ? <HBars color={SERIES.sales} count rows={byQty.slice(0, 10).map((i) => ({ label: i.name, value: i.qty, note: `plates · ${inr(i.sales)}` }))} /> : <p className="text-sm text-muted">No sales.</p>}
        </Card>
        <Card title="Slow dishes">
          <div className="space-y-3 text-sm">
            {byQty.length > 3 && <div><div className="mb-1 text-[11px] font-semibold uppercase text-muted">Sold the least</div>
              <ul className="space-y-1">{byQty.slice(-5).reverse().map((i) => <li key={i.id} className="flex justify-between"><span>{i.name}</span><span className="tabular-nums text-muted">{i.qty} · {inr(i.sales)}</span></li>)}</ul></div>}
            <div><div className="mb-1 text-[11px] font-semibold uppercase text-muted">Not sold at all ({notSold.length} of {menu.length} on the menu)</div>
              {notSold.length ? <p className="text-muted">{notSold.slice(0, 40).map((m) => m.name).join(", ")}{notSold.length > 40 ? ` and ${notSold.length - 40} more` : ""}</p> : <p className="text-muted">Every dish sold at least once. 🎉</p>}</div>
          </div>
        </Card>
        <Card title="Sales by category"><HBars color={SERIES.sales} rows={catSales.map((c) => ({ label: `${c.name} (${c.qty})`, value: c.sales }))} /></Card>
        <Card title="Bills made by each staff login">
          {staff.length ? (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted"><th className="py-1">Staff</th><th className="py-1 text-right">Bills</th><th className="py-1 text-right">Sales</th><th className="py-1 text-right">Avg bill</th></tr></thead>
              <tbody>{staff.map((r) => <tr key={r.name} className="border-t border-line"><td className="py-1">{r.name}</td><td className="py-1 text-right tabular-nums font-semibold">{r.bills}</td><td className="py-1 text-right tabular-nums">{inr(r.sales)}</td><td className="py-1 text-right tabular-nums text-muted">{inr(r.bills ? r.sales / r.bills : 0)}</td></tr>)}</tbody>
            </table>
          ) : <p className="text-sm text-muted">No bills.</p>}
          <p className="mt-2 text-xs text-muted">&quot;Online / system&quot; = online orders accepted into bills without a staff login attached.</p>
        </Card>
        {!oneDay && <Card title="Busiest hours"><HBars color={SERIES.sales} count rows={hours.map((h) => ({ label: hourLabel(h.hour), value: h.orders, note: `orders · ${inr(h.sales)}` }))} /></Card>}
        <Card title="Top customers">
          {custs.length ? <ol className="space-y-1 text-sm">{custs.map((c, i) => (
            <li key={c.id}><Link href={`/customers/${c.id}`} className="flex justify-between gap-2 hover:text-brand"><span className="truncate">{i + 1}. {c.name}</span><span className="shrink-0 tabular-nums text-muted">{c.orders} orders · <b className="text-ink">{inr(c.sales)}</b></span></Link></li>
          ))}</ol> : <p className="text-sm text-muted">No named customers in this period.</p>}
        </Card>
        <Card title={`Raw material used (from recipes) · ${inr(matCost)}`} className="lg:col-span-2">
          {material.length ? (
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted"><th className="py-1">Ingredient</th><th className="py-1 text-right">Used</th><th className="py-1 text-right">Cost</th><th className="py-1 text-right">Share</th></tr></thead>
                <tbody>{material.map((m) => <tr key={m.id} className="border-t border-line"><td className="py-1">{m.name}</td><td className="py-1 text-right tabular-nums">{m.qty.toLocaleString("en-IN", { maximumFractionDigits: 2 })} {m.unit}</td><td className="py-1 text-right tabular-nums">{inr(m.cost)}</td><td className="py-1 text-right tabular-nums text-muted">{matCost ? ((m.cost / matCost) * 100).toFixed(1) + "%" : ""}</td></tr>)}</tbody>
              </table>
            </div>
          ) : <p className="text-sm text-muted">Nothing to show - add recipes to your dishes (Recipes & Costing) to see which ingredients are used the most.</p>}
          <p className="mt-2 text-xs text-muted">Worked out from the recipes of the plates sold, sorted by cost. Use it to plan buying.</p>
        </Card>
        <Card title="Packaging used">{packs.length ? <HBars count rows={packs.map((p) => ({ label: p.name, value: p.qty, note: "pcs" }))} /> : <p className="text-sm text-muted">No packaging used (or not set on dishes).</p>}</Card>
        <Card title="Expenses by category"><HBars rows={cats.map((c) => ({ label: c.category, value: c.amount, note: exp ? `${((c.amount / exp) * 100).toFixed(0)}%` : "" }))} /></Card>
        <Card title="Sales by order type"><HBars color={SERIES.sales} rows={types.map((t) => ({ label: `${t.type} (${t.orders})`, value: t.sales }))} /></Card>
        <Card title="Money received by mode">
          <HBars color={SERIES.profit} rows={modes.filter((m) => m.amount > 0).map((m) => ({ label: m.mode, value: m.amount }))} />
          {modes.some((m) => m.refunded > 0) && (
            <p className="mt-3 text-xs text-muted">After refunds for cancelled bills: {modes.filter((m) => m.refunded > 0).map((m) => `${m.mode} ₹${m.received.toLocaleString("en-IN")} in − ₹${m.refunded.toLocaleString("en-IN")} refunded`).join(" · ")}</p>
          )}
        </Card>
        <Card title="Download">
          <a href={`/api/export/workbook?${q}`} className="btn-primary mb-3 block text-center">📊 Download Excel (all sheets)</a>
          <p className="mb-2 text-xs text-muted">One Excel file with Orders, Items, Payments, Expenses, Reimbursements and Customers — each row shows who took the order, who delivered and who took the payment.</p>
          <div className="grid grid-cols-2 gap-2">
            {[["orders", "Orders (CSV)"], ["order-items", "Dish-wise lines (CSV)"], ["payments", "Payments (CSV)"], ["expenses", "Expenses (CSV)"], ["customers", "Customers & dues (CSV)"], ["stock", "Stock movements (CSV)"]].map(([k, l]) => (
              <a key={k} href={`/api/export/${k}?${q}`} className="btn-ghost btn-sm">⬇ {l}</a>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">Files cover {label} (customers: all).</p>
        </Card>
      </div>
      <Card title="Dish-wise sales & profit" className="mt-4">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Dish</th><th className="!text-right">Plates</th><th className="!text-right">Sales</th><th className="!text-right">Cost</th><th className="!text-right">Profit</th><th className="!text-right">Margin</th><th className="!text-right">Share</th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}><td>{i.name}</td><td className="num">{i.qty}</td><td className="num">{inr(i.sales)}</td><td className="num">{inr(i.cost)}</td>
                  <td className={`num font-semibold ${i.profit < 0 ? "text-red-700" : ""}`}>{inr(i.profit)}</td>
                  <td className="num">{i.sales ? ((i.profit / i.sales) * 100).toFixed(0) + "%" : ""}</td>
                  <td className="num">{s.itemsTotal ? ((i.sales / s.itemsTotal) * 100).toFixed(1) + "%" : ""}</td></tr>
              ))}
              {!items.length && <tr><td colSpan={7} className="text-center text-muted">No sales in this period.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
