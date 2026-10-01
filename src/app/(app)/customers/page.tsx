import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/auth";
import { ENTITIES } from "@/lib/entities";
import { resolveOptions } from "@/lib/options";
import { customerBalances } from "@/lib/orders";
import { inr } from "@/lib/format";
import { CrudManager } from "@/components/crud";
import { PageHeader, Stat } from "@/components/ui";

export default async function Customers() {
  const u = await requirePage("customers");
  const T = u.tenantId;
  const f = ENTITIES.customers.fields;
  const [rows, opts, bal, stats] = await Promise.all([
    db.select().from(schema.customers).where(eq(schema.customers.tenantId, T)).orderBy(asc(schema.customers.name)),
    resolveOptions(T, f),
    customerBalances(T),
    db.select({ c: schema.orders.customerId, n: sql<number>`count(*)`, last: sql<string>`max(${schema.orders.date})` })
      .from(schema.orders).where(and(eq(schema.orders.tenantId, T), eq(schema.orders.status, "ACTIVE"))).groupBy(schema.orders.customerId),
  ]);
  const st = new Map(stats.map((s) => [s.c, s]));
  const data = rows.map((c) => {
    const b = bal.get(c.id), s = st.get(c.id), n = Number(s?.n ?? 0);
    return {
      ...c, orders: n, spent: b?.billed ?? 0, last: s?.last ?? null, due: b && b.balance > 0.5 ? b.balance : null,
      advance: b && b.balance < -0.5 ? -b.balance : null,
      type: n >= 10 ? "VIP" : n >= 3 ? "Regular" : n >= 1 ? "New" : "No orders",
    };
  });
  const totalDue = data.reduce((s, c) => s + (c.due ?? 0), 0);
  const withDue = data.filter((c) => c.due).length;
  return (
    <div>
      <PageHeader title="Customers & Dues" subtitle="Tap a customer to see their orders and receive payments" />
      <div className="mb-4 grid grid-cols-3 gap-2">
        <Stat label="Customers" value={rows.length} />
        <Stat label="Total dues" value={inr(totalDue)} tone={totalDue > 0 ? "red" : undefined} />
        <Stat label="Owe money" value={withDue} />
      </div>
      <CrudManager
        entity="customers" title="customer" fields={f} options={opts} rows={data} path="/customers" rowHref="/customers" addLabel="Customer"
        searchKeys={["name", "phone", "flat", "area"]}
        filters={[{ key: "name", label: "Name" }, { key: "phone", label: "Phone" }, { key: ["flat", "area"], label: "Flat / society / address" }]}
        checkDuplicates
        columns={[
          { key: "name", label: "Name", primary: true },
          { key: "phone", label: "Phone" },
          { key: "area", label: "Society / Area", hideMobile: true },
          { key: "orders", label: "Orders", kind: "num" },
          { key: "spent", label: "Total spent", kind: "money" },
          { key: "last", label: "Last order", kind: "date", hideMobile: true },
          { key: "due", label: "Due", kind: "money" },
          { key: "type", label: "Type", kind: "badge", tones: { VIP: "amber", Regular: "green" } },
        ]}
      />
    </div>
  );
}
