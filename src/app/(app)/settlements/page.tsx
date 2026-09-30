import { and, desc, eq, gte, lte, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/auth";
import { ENTITIES } from "@/lib/entities";
import { resolveOptions } from "@/lib/options";
import { CrudManager } from "@/components/crud";
import { Help, PageHeader, Stat } from "@/components/ui";
import { inr } from "@/lib/format";

export default async function Settlements() {
  const u = await requirePage("settlements");
  const [rows, setting] = await Promise.all([db.query.settlements.findMany({ where: eq(schema.settlements.tenantId, u.tenantId), orderBy: [desc(schema.settlements.payoutDate)] }), db.query.settings.findFirst({ where: eq(schema.settings.tenantId, u.tenantId) })]);
  const data = await Promise.all(rows.map(async (s) => {
    const [g] = await db.select({ t: sql<number>`coalesce(sum(${schema.orders.total}),0)`, n: sql<number>`count(*)` }).from(schema.orders)
      .where(and(eq(schema.orders.tenantId, u.tenantId), eq(schema.orders.orderType, s.platform), gte(schema.orders.date, s.fromDate), lte(schema.orders.date, s.toDate), ne(schema.orders.status, "CANCELLED")));
    const gross = Number(g.t), cut = gross - Number(s.payout);
    return { ...s, orders: Number(g.n), gross, commission: cut, pct: gross ? ((cut / gross) * 100).toFixed(1) + "%" : "" };
  }));
  const f = ENTITIES.settlements.fields;
  const opts = await resolveOptions(u.tenantId, f);
  const g = data.reduce((a, d) => ({ gross: a.gross + d.gross, cut: a.cut + d.commission }), { gross: 0, cut: 0 });
  return (
    <div>
      <PageHeader title="Swiggy / Zomato Payouts" subtitle={`Assumed commission in Settings: ${Number(setting?.platformCommission ?? 25)}%`} />
      <Help>Save Swiggy/Zomato orders in New Order with order type “Swiggy” or “Zomato”. When the payout arrives, enter the period and amount here - you will see what the app actually took.</Help>
      <div className="my-4 grid grid-cols-3 gap-2">
        <Stat label="Platform sales" value={inr(g.gross)} />
        <Stat label="Actually deducted" value={inr(g.cut)} tone="red" />
        <Stat label="Real commission" value={g.gross ? ((g.cut / g.gross) * 100).toFixed(1) + "%" : "—"} />
      </div>
      <CrudManager entity="settlements" title="payout" fields={f} options={opts} rows={data} path="/settlements" addLabel="Payout"
        columns={[
          { key: "platform", label: "Platform", primary: true },
          { key: "fromDate", label: "From", kind: "date" },
          { key: "toDate", label: "To", kind: "date" },
          { key: "orders", label: "Orders", kind: "num" },
          { key: "gross", label: "Order value", kind: "money" },
          { key: "payout", label: "Received", kind: "money" },
          { key: "commission", label: "Deducted", kind: "money" },
          { key: "pct", label: "Deducted %" },
        ]} />
    </div>
  );
}
