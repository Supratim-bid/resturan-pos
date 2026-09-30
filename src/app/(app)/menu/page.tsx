import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/auth";
import { canSeeCosts } from "@/lib/permissions";
import { ENTITIES } from "@/lib/entities";
import { resolveOptions } from "@/lib/options";
import { loadCosts } from "@/lib/costing";
import { CrudManager, type Column } from "@/components/crud";
import { BulkAvailability, MenuCsv } from "@/components/menu-tools";
import { Card, Help, PageHeader } from "@/components/ui";

export default async function MenuPage() {
  const u = await requirePage("menu");
  const T = u.tenantId;
  const [items, cats, { costs, multiplier }] = await Promise.all([
    db.query.menuItems.findMany({ where: eq(schema.menuItems.tenantId, T), with: { category: true } }),
    db.query.categories.findMany({ where: eq(schema.categories.tenantId, T), orderBy: (t, { asc }) => [asc(t.sortOrder), asc(t.name)] }),
    loadCosts(T),
  ]);
  items.sort((a, b) => a.category.sortOrder - b.category.sortOrder || a.category.name.localeCompare(b.category.name) || a.name.localeCompare(b.name));
  const rows = items.map((m) => {
    const c = costs.get(m.id)!;
    const price = Number(m.price), cost = c.costUsed;
    return {
      ...m, categoryName: m.category.name,
      costSource: c.hasRecipe ? "Recipe" : m.manualCost ? "Estimate" : "—",
      cost: cost || null, suggested: c.suggestedPrice || null,
      margin: cost ? price - cost : null, marginPct: cost && price ? ((price - cost) / price * 100).toFixed(0) + "%" : null,
      check: !c.hasRecipe ? "Needs recipe" : price >= c.suggestedPrice ? "On target" : "Below target",
      status: m.active ? "On menu" : "Hidden",
    };
  });
  const sc = canSeeCosts(u);
  const [mf, cf] = [ENTITIES.menuItems.fields.filter((f) => sc || f.name !== "manualCost"), ENTITIES.categories.fields];
  const opts = await resolveOptions(T, mf);
  return (
    <div>
      <PageHeader title="Menu" subtitle={sc ? `Suggested price = cost per plate × ${multiplier} (change in Settings)` : "Dishes, prices and photos"} />
      {sc && <Help>Cost comes from the dish's recipe (Recipes &amp; Costing). Until a recipe exists, your “Est. cost” is used. “Below target” = selling price is less than the suggested price.</Help>}
      <div className="mt-4">
        <CrudManager
          entity="menuItems" title="dish" fields={mf} options={opts} rows={rows} path="/menu" addLabel="Dish"
          searchKeys={["name", "categoryName", "code"]} defaults={{ active: true, vegType: "Veg" }}
          columns={([
            { key: "imageId", label: "", kind: "image" },
            { key: "name", label: "Dish", primary: true },
            { key: "available", label: "Available", kind: "available" },
            { key: "categoryName", label: "Category" },
            { key: "price", label: "Price", kind: "money" },
            { key: "cost", label: "Cost / plate", kind: "money" },
            { key: "costSource", label: "Cost from", hideMobile: true },
            { key: "suggested", label: "Suggested", kind: "money" },
            { key: "margin", label: "Margin", kind: "money", hideMobile: true },
            { key: "marginPct", label: "Margin %", hideMobile: true },
            { key: "check", label: "Price check", kind: "badge", tones: { "On target": "green", "Below target": "red" } },
            { key: "status", label: "Status", kind: "badge", hideMobile: true, tones: { "On menu": "green" } },
          ] as Column[]).filter((c) => canSeeCosts(u) || !["cost", "costSource", "suggested", "margin", "marginPct", "check"].includes(c.key))}
        />
      </div>
      {items.some((m) => !m.available) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>{items.filter((m) => !m.available).length} dish(es) marked <b>not available</b>.</span>
          <BulkAvailability ids={items.filter((m) => !m.available).map((m) => m.id)} />
        </div>
      )}
      <Card title="Update menu from CSV (Excel / Google Sheets)" className="mt-6"><MenuCsv /></Card>
      <Card title="Menu categories" className="mt-6">
        <CrudManager entity="categories" title="category" fields={cf} options={{}} rows={cats} path="/menu" addLabel="Category"
          columns={[{ key: "name", label: "Category", primary: true }, { key: "sortOrder", label: "Order", kind: "num" }]} />
      </Card>
    </div>
  );
}
