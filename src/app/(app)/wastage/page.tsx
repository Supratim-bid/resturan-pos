import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/auth";
import { canSeeCosts } from "@/lib/permissions";
import { ENTITIES } from "@/lib/entities";
import { resolveOptions } from "@/lib/options";
import { inr, monthStart, todayIST } from "@/lib/format";
import { CrudManager } from "@/components/crud";
import { PageHeader, Stat } from "@/components/ui";

export default async function Wastage() {
  const u = await requirePage("wastage");
  const sc = canSeeCosts(u);
  const rows = await db.query.wastage.findMany({ where: eq(schema.wastage.tenantId, u.tenantId), with: { menuItem: true, ingredient: true }, orderBy: [desc(schema.wastage.date), desc(schema.wastage.id)], limit: 300 });
  const f = ENTITIES.wastage.fields;
  const opts = await resolveOptions(u.tenantId, f);
  const ms = monthStart(todayIST());
  const monthCost = rows.filter((r) => r.date >= ms).reduce((s, r) => s + Number(r.cost), 0);
  const data = rows.map((r) => ({
    ...r, what: r.menuItem ? r.menuItem.name : r.ingredient?.name ?? "",
    amount: r.menuItem ? `${Number(r.plates)} plate(s)` : r.ingredient ? `${Number(r.qty)} ${r.ingredient.unit}` : "",
  }));
  return (
    <div>
      <PageHeader title="Wastage" subtitle="Leftover / spoiled food. Cost is worked out from recipes and rates; stock is reduced." />
      <div className="mb-4 grid grid-cols-2 gap-2">{sc && <Stat label="Wastage this month" value={inr(monthCost)} tone={monthCost ? "red" : undefined} />}<Stat label="Entries" value={rows.length} /></div>
      <CrudManager entity="wastage" title="wastage" fields={f} options={opts} rows={data} path="/wastage" addLabel="Wastage"
        columns={[
          { key: "date", label: "Date", kind: "date" },
          { key: "what", label: "What", primary: true },
          { key: "amount", label: "Qty" },
          ...(sc ? [{ key: "cost", label: "Cost", kind: "money" as const }] : []),
          { key: "reason", label: "Reason" },
        ]} />
    </div>
  );
}
