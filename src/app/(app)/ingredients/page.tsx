import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/auth";
import { ENTITIES } from "@/lib/entities";
import { resolveOptions } from "@/lib/options";
import { effectiveRate } from "@/lib/costing";
import { CrudManager } from "@/components/crud";
import { Help, PageHeader } from "@/components/ui";

export default async function Ingredients() {
  const u = await requirePage("ingredients");
  const rows = await db.query.ingredients.findMany({ where: eq(schema.ingredients.tenantId, u.tenantId), orderBy: (t, { asc }) => [asc(t.category), asc(t.name)] });
  const f = ENTITIES.ingredients.fields;
  const opts = await resolveOptions(u.tenantId, f);
  const data = rows.map((i) => ({
    ...i, effRate: Math.round(effectiveRate(i) * 100) / 100, per: i.unit,
    updated: i.updatedAt.toISOString().slice(0, 10), wastage: Number(i.wastagePct) ? Number(i.wastagePct) + "%" : null,
  }));
  return (
    <div>
      <PageHeader title="Ingredient Rates" subtitle="What you pay for each ingredient. Change a price and every recipe cost updates." />
      <Help>Wastage % = weight lost in cleaning/peeling. Onion at ₹40/kg with 10% wastage effectively costs ₹44.44/kg in recipes.</Help>
      <div className="mt-4">
        <CrudManager entity="ingredients" title="ingredient" fields={f} options={opts} rows={data} path="/ingredients" addLabel="Ingredient"
          defaults={{ unit: "kg", trackStock: true }}
          columns={[
            { key: "name", label: "Ingredient", primary: true },
            { key: "category", label: "Category", hideMobile: true },
            { key: "price", label: "Price", kind: "money" },
            { key: "per", label: "Per" },
            { key: "wastage", label: "Wastage" },
            { key: "effRate", label: "Effective rate", kind: "money" },
            { key: "updated", label: "Updated", kind: "date", hideMobile: true },
          ]} />
      </div>
    </div>
  );
}
