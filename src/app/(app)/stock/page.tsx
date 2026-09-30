import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/auth";
import { canSeeCosts } from "@/lib/permissions";
import { effectiveRate } from "@/lib/costing";
import { inr, monthStart, num, todayIST } from "@/lib/format";
import { Badge, Help, PageHeader, Stat } from "@/components/ui";
import { StockCount } from "@/components/stock-count";

export default async function Stock() {
  const u = await requirePage("stock");
  const today = todayIST(), ms = monthStart(today);
  const [ings, all, month] = await Promise.all([
    db.query.ingredients.findMany({ where: eq(schema.ingredients.tenantId, u.tenantId), orderBy: (t, { asc }) => [asc(t.category), asc(t.name)] }),
    db.select({ id: schema.stockMovements.ingredientId, q: sql<number>`sum(${schema.stockMovements.qty})`, started: sql<boolean>`bool_or(${schema.stockMovements.type} in ('PURCHASE','COUNT'))` }).from(schema.stockMovements).where(eq(schema.stockMovements.tenantId, u.tenantId)).groupBy(schema.stockMovements.ingredientId),
    db.select({ id: schema.stockMovements.ingredientId, type: schema.stockMovements.type, q: sql<number>`sum(${schema.stockMovements.qty})` })
      .from(schema.stockMovements).where(and(eq(schema.stockMovements.tenantId, u.tenantId), gte(schema.stockMovements.date, ms))).groupBy(schema.stockMovements.ingredientId, schema.stockMovements.type),
  ]);
  const cur = new Map(all.map((a) => [a.id, Number(a.q)]));
  const started = new Set(all.filter((a) => a.started).map((a) => a.id));
  const mm = new Map<string, number>();
  for (const r of month) mm.set(`${r.id}:${r.type}`, Number(r.q));
  const tracked = ings.filter((i) => i.trackStock);
  const rows = tracked.map((i) => {
    const q = cur.get(i.id) ?? 0, lvl = i.reorderLevel == null ? null : Number(i.reorderLevel);
    return {
      i, q, lvl, started: started.has(i.id), low: started.has(i.id) && lvl != null && q <= lvl, value: Math.max(0, q) * effectiveRate(i),
      bought: mm.get(`${i.id}:PURCHASE`) ?? 0, used: -(mm.get(`${i.id}:SALE`) ?? 0), wasted: -(mm.get(`${i.id}:WASTAGE`) ?? 0), counted: mm.get(`${i.id}:COUNT`) ?? 0,
    };
  });
  const low = rows.filter((r) => r.low);
  const value = rows.reduce((s, r) => s + r.value, 0);
  const costs = canSeeCosts(u);
  return (
    <div>
      <PageHeader title="Stock" subtitle="Bought (from Expenses) − used by orders (from recipes) − wastage ± counts" actions={<StockCount today={today} items={rows.map((r) => ({ id: r.i.id, name: r.i.name, unit: r.i.unit, current: r.q }))} />} />
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Items to reorder" value={low.length} tone={low.length ? "red" : "green"} />
        <Stat label="Items tracked" value={tracked.length} />
        {costs && <Stat label="Stock value (approx.)" value={inr(value)} />}
      </div>
      <Help>Stock goes up when you log a purchase in Expenses with a stock item and qty. It goes down automatically for every order (using the recipe) and wastage. Do a physical count weekly: the “Count adj.” column shows the gap between the app and reality.</Help>
      <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-white">
        <table className="tbl">
          <thead><tr><th>Item</th><th className="!text-right">In stock</th><th className="!text-right">Reorder at</th><th>Status</th>
            <th className="!text-right">Bought (month)</th><th className="!text-right">Used (month)</th><th className="!text-right">Wasted</th><th className="!text-right">Count adj.</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.i.id} className={r.low ? "bg-red-50/50" : ""}>
                <td className="font-medium">{r.i.name}<div className="text-[11px] text-muted">{r.i.category}</div></td>
                <td className={`num font-bold ${r.q < 0 ? "text-red-700" : ""}`}>{num(r.q)} {r.i.unit}</td>
                <td className="num">{r.lvl == null ? "—" : `${num(r.lvl)} ${r.i.unit}`}</td>
                <td>{!r.started ? <Badge>Not counted yet</Badge> : r.q < 0 ? <Badge tone="amber">Count needed</Badge> : r.low ? <Badge tone="red">Reorder</Badge> : <Badge tone="green">OK</Badge>}</td>
                <td className="num">{num(r.bought)}</td><td className="num">{num(r.used)}</td><td className="num">{num(r.wasted)}</td>
                <td className={`num ${r.counted < 0 ? "text-red-700" : ""}`}>{r.counted ? num(r.counted) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">Negative stock means purchases weren't logged with a stock item, or no opening count was entered. Enter a physical count to fix.</p>
    </div>
  );
}
