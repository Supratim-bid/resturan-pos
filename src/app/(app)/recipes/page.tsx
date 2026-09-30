import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/auth";
import { canSeeCosts } from "@/lib/permissions";
import { loadCosts } from "@/lib/costing";
import { inr } from "@/lib/format";
import { Badge, Help, PageHeader, Stat } from "@/components/ui";

export default async function Recipes() {
  const u = await requirePage("recipes");
  const showCost = canSeeCosts(u);
  const [items, { costs, multiplier }] = await Promise.all([db.query.menuItems.findMany({ where: eq(schema.menuItems.tenantId, u.tenantId), with: { category: true, recipe: true } }), loadCosts(u.tenantId)]);
  items.sort((a, b) => a.category.sortOrder - b.category.sortOrder || a.name.localeCompare(b.name));
  const done = items.filter((i) => costs.get(i.id)?.hasRecipe).length;
  const below = items.filter((i) => { const c = costs.get(i.id)!; return c.hasRecipe && Number(i.price) < c.suggestedPrice; }).length;
  return (
    <div>
      <PageHeader title="Recipes & Costing" subtitle={showCost ? `Cost per plate from real ingredients · suggested price = ${multiplier}× cost` : "Standard recipes"} />
      {showCost && (
        <div className="mb-4 grid grid-cols-3 gap-2">
          <Stat label="Dishes costed" value={`${done} / ${items.length}`} />
          <Stat label="Below target" value={below} tone={below ? "red" : "green"} />
          <Stat label="Need recipe" value={items.length - done} tone={items.length - done ? "amber" : undefined} />
        </div>
      )}
      {showCost && <div className="mb-4"><Help>Tap a dish to enter what goes into one batch and how many plates it makes. Rates come from Ingredient Rates; packaging from Packaging.</Help></div>}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => {
          const c = costs.get(i.id)!;
          const price = Number(i.price);
          return (
            <Link key={i.id} href={`/recipes/${i.id}`} className="card !p-3 hover:border-brand">
              <div className="flex items-start justify-between gap-2">
                <div><div className="font-semibold">{i.name}</div><div className="text-xs text-muted">{i.category.name}{i.recipe?.portion ? ` · ${i.recipe.portion}` : ""}</div></div>
                {!c.hasRecipe ? <Badge tone="amber">No recipe</Badge> : !showCost ? <Badge tone="green">Recipe</Badge> : price >= c.suggestedPrice ? <Badge tone="green">On target</Badge> : <Badge tone="red">Below target</Badge>}
              </div>
              {showCost && c.hasRecipe && (
                <div className="mt-2 grid grid-cols-3 text-xs">
                  <div><div className="text-muted">Cost/plate</div><b>{inr(c.totalPerPlate, 2)}</b></div>
                  <div><div className="text-muted">Suggested</div><b className="text-emerald-700">{inr(c.suggestedPrice)}</b></div>
                  <div><div className="text-muted">Price</div><b>{inr(price)}</b></div>
                </div>
              )}
              {c.problems.length > 0 && showCost && <div className="mt-1 text-xs text-red-700">⚠ {c.problems[0]}</div>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
