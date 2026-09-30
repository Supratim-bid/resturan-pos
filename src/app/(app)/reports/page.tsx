import { requirePage } from "@/lib/auth";
import { inr, monthEnd, monthLabel, todayIST } from "@/lib/format";
import { collectionsByMode, dailySeries, expensesByCategory, itemSales, monthlySeries, orderTypeSales, platformCommission, rawMaterialSpend, salesSummary, wastageTotal } from "@/lib/reports";
import { Card, PageHeader, Stat } from "@/components/ui";
import { DailySalesChart, HBars, MonthlyTrendChart, SERIES } from "@/components/charts";
import { DateJump } from "@/components/date-jump";

export default async function Reports({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const u = await requirePage("reports");
  const T = u.tenantId;
  const month = (await searchParams).month || todayIST().slice(0, 7);
  const from = month + "-01", to = monthEnd(from);
  const prevM = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  const [s, ps, cats, comm, series, trend, items, types, modes, waste, raw] = await Promise.all([
    salesSummary(T, from, to), salesSummary(T, prevM + "-01", monthEnd(prevM + "-01")), expensesByCategory(T, from, to), platformCommission(T, from, to),
    dailySeries(T, from, to), monthlySeries(T, month, 12), itemSales(T, from, to), orderTypeSales(T, from, to), collectionsByMode(T, from, to),
    wastageTotal(T, from, to), rawMaterialSpend(T, from, to),
  ]);
  const exp = cats.reduce((a, c) => a + c.amount, 0);
  const totalCost = exp + comm.commission;
  const profit = s.netSales - totalCost;
  const change = ps.netSales ? ((s.netSales - ps.netSales) / ps.netSales) * 100 : null;
  const line = (l: string, v: number, o: { bold?: boolean; neg?: boolean; sub?: boolean } = {}) => (
    <div className={`flex justify-between py-1 ${o.bold ? "border-t border-line font-bold" : ""} ${o.sub ? "pl-4 text-muted" : ""}`}>
      <span>{l}</span><span className={`tabular-nums ${o.neg ? "text-red-700" : ""}`}>{o.neg ? "−" : ""}{inr(Math.abs(v))}</span>
    </div>
  );
  const q = `from=${from}&to=${to}`;
  return (
    <div>
      <PageHeader title="Reports & Profit / Loss" subtitle={monthLabel(month)} actions={<DateJump value={month} param="month" type="month" />} />
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Net sales" value={inr(s.netSales)} hint={change == null ? "" : `${change >= 0 ? "▲" : "▼"} ${Math.abs(change).toFixed(0)}% vs ${monthLabel(prevM)}`} tone={change != null && change < 0 ? "red" : undefined} />
        <Stat label="All expenses" value={inr(totalCost)} />
        <Stat label="Net profit" value={inr(profit)} tone={profit < 0 ? "red" : "green"} hint={s.netSales ? `${((profit / s.netSales) * 100).toFixed(0)}% of sales` : ""} />
        <Stat label="Orders" value={s.orders} hint={`avg ${inr(s.orders ? s.netSales / s.orders : 0)}`} />
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
            <p className="mt-2 text-xs text-muted">GST collected {inr(s.gst)} is not income - it is paid to the government. Profit counts expenses by the date they were paid.</p>
          </div>
        </Card>
        <Card title="Food cost check">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span>Recipe cost of what was sold</span><b className="tabular-nums">{inr(s.foodCost)}</b></div>
            <div className="flex justify-between"><span>Raw material actually bought</span><b className="tabular-nums">{inr(raw)}</b></div>
            <div className="flex justify-between"><span>Wastage recorded</span><b className="tabular-nums">{inr(waste)}</b></div>
            <div className="flex justify-between border-t border-line pt-1"><span>Food cost % (recipe)</span><b>{s.netSales ? ((s.foodCost / s.netSales) * 100).toFixed(1) + "%" : "—"}</b></div>
            <div className="flex justify-between"><span>Food cost % (actual purchases)</span><b>{s.netSales ? ((raw / s.netSales) * 100).toFixed(1) + "%" : "—"}</b></div>
            <p className="pt-1 text-xs text-muted">If purchases stay well above recipe cost + wastage month after month, look for over-portioning, unrecorded wastage or leakage. (Stock left over also explains a gap.)</p>
          </div>
        </Card>
        <Card title={`Daily sales · ${monthLabel(month)}`}><DailySalesChart data={series} monthLabel={monthLabel(month)} /></Card>
        <Card title="Last 12 months"><MonthlyTrendChart data={trend} /></Card>
        <Card title="Expenses by category"><HBars rows={cats.map((c) => ({ label: c.category, value: c.amount, note: exp ? `${((c.amount / exp) * 100).toFixed(0)}%` : "" }))} /></Card>
        <Card title="Sales by order type"><HBars color={SERIES.sales} rows={types.map((t) => ({ label: `${t.type} (${t.orders})`, value: t.sales }))} /></Card>
        <Card title="Money received by mode">
          <HBars color={SERIES.profit} rows={modes.filter((m) => m.amount > 0).map((m) => ({ label: m.mode, value: m.amount }))} />
          {modes.some((m) => m.refunded > 0) && (
            <p className="mt-3 text-xs text-muted">After refunds for cancelled bills: {modes.filter((m) => m.refunded > 0).map((m) => `${m.mode} ₹${m.received.toLocaleString("en-IN")} in − ₹${m.refunded.toLocaleString("en-IN")} refunded`).join(" · ")}</p>
          )}
        </Card>
        <Card title="Download (CSV for Excel)">
          <div className="grid grid-cols-2 gap-2">
            {[["orders", "Orders"], ["order-items", "Dish-wise lines"], ["payments", "Payments"], ["expenses", "Expenses"], ["customers", "Customers & dues"], ["stock", "Stock movements"]].map(([k, l]) => (
              <a key={k} href={`/api/export/${k}?${q}`} className="btn-ghost btn-sm">⬇ {l}</a>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">Files cover {monthLabel(month)} (customers: all). Open them in Excel or Google Sheets.</p>
        </Card>
      </div>
      <Card title="Dish-wise sales & profit" className="mt-4">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Dish</th><th className="!text-right">Plates</th><th className="!text-right">Sales</th><th className="!text-right">Cost</th><th className="!text-right">Profit</th><th className="!text-right">Share</th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}><td>{i.name}</td><td className="num">{i.qty}</td><td className="num">{inr(i.sales)}</td><td className="num">{inr(i.cost)}</td>
                  <td className={`num font-semibold ${i.profit < 0 ? "text-red-700" : ""}`}>{inr(i.profit)}</td><td className="num">{s.itemsTotal ? ((i.sales / s.itemsTotal) * 100).toFixed(1) + "%" : ""}</td></tr>
              ))}
              {!items.length && <tr><td colSpan={6} className="text-center text-muted">No sales this month.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
