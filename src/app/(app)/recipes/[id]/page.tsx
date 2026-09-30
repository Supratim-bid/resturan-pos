import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/auth";
import { canSeeCosts } from "@/lib/permissions";
import { effectiveRate, loadCosts } from "@/lib/costing";
import { num } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui";
import { RecipeEditor } from "@/components/recipe-editor";

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePage("recipes");
  const id = Number((await params).id);
  const item = await db.query.menuItems.findFirst({ where: and(eq(schema.menuItems.id, id), eq(schema.menuItems.tenantId, u.tenantId)), with: { category: true } });
  if (!item) notFound();
  const rec = await db.query.recipes.findFirst({
    where: and(eq(schema.recipes.menuItemId, id), eq(schema.recipes.tenantId, u.tenantId)),
    with: { ingredients: { with: { ingredient: true } }, packaging: { with: { packaging: true } }, components: { with: { menuItem: true } } },
  });

  if (!canSeeCosts(u)) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title={item.name} subtitle={[item.category.name, rec?.portion].filter(Boolean).join(" · ")} actions={<Link href="/recipes" className="btn-ghost">← All recipes</Link>} />
        {!rec ? <Card><p className="text-sm text-muted">No recipe saved yet.</p></Card> : (
          <>
            <Card title={`Ingredients (makes ${num(Number(rec.platesPerBatch))} plates)`}>
              <ul className="divide-y divide-line text-sm">{rec.ingredients.map((l) => <li key={l.id} className="flex justify-between py-1.5"><span>{l.ingredient.name}</span><b>{num(Number(l.qty), 3)} {l.unit}</b></li>)}</ul>
              {rec.components.length > 0 && <ul className="mt-2 text-sm">{rec.components.map((c) => <li key={c.id}>• {c.menuItem.name} × {num(Number(c.qtyPerPlate))}</li>)}</ul>}
            </Card>
            <Card title="Method" className="mt-4"><p className="whitespace-pre-wrap text-sm">{rec.method || "—"}</p></Card>
            {rec.tasteNotes && <Card title="Taste notes" className="mt-4"><p className="whitespace-pre-wrap text-sm">{rec.tasteNotes}</p></Card>}
          </>
        )}
      </div>
    );
  }

  const [ings, packs, others, { costs }, setting] = await Promise.all([
    db.query.ingredients.findMany({ where: eq(schema.ingredients.tenantId, u.tenantId), orderBy: (t, { asc }) => [asc(t.category), asc(t.name)] }),
    db.query.packaging.findMany({ where: eq(schema.packaging.tenantId, u.tenantId), orderBy: (t, { asc }) => asc(t.name) }),
    db.query.menuItems.findMany({ where: eq(schema.menuItems.tenantId, u.tenantId), orderBy: (t, { asc }) => asc(t.name) }),
    loadCosts(u.tenantId),
    db.query.settings.findFirst({ where: eq(schema.settings.tenantId, u.tenantId) }),
  ]);
  return (
    <div>
      <PageHeader title={item.name} subtitle={`${item.category.name} · recipe costing`} actions={<Link href="/recipes" className="btn-ghost">← All recipes</Link>} />
      <RecipeEditor
        menuItemId={id} dish={item.name} price={Number(item.price)} exists={!!rec}
        multiplier={Number(setting?.priceMultiplier ?? 3)} commission={Number(setting?.platformCommission ?? 25)}
        ingredients={ings.map((i) => ({ id: i.id, name: i.name, unit: i.unit, effRate: effectiveRate(i), category: i.category }))}
        packs={packs.map((p) => ({ id: p.id, name: p.name, perPiece: Number(p.packPrice) / Math.max(1, p.piecesPerPack) }))}
        comps={others.filter((o) => o.id !== id).map((o) => ({ id: o.id, name: o.name, foodPerPlate: costs.get(o.id)?.hasRecipe ? costs.get(o.id)!.foodPerPlate : Number(o.manualCost ?? 0) }))}
        initial={{
          platesPerBatch: Number(rec?.platesPerBatch ?? 0), portion: rec?.portion ?? "", gasCost: Number(rec?.gasCost ?? 0), miscPct: Number(rec?.miscPct ?? 0),
          method: rec?.method ?? "", tasteNotes: rec?.tasteNotes ?? "", madeBy: rec?.madeBy ?? "",
          lines: (rec?.ingredients ?? []).map((l) => ({ ingredientId: l.ingredientId, qty: Number(l.qty), unit: l.unit })),
          packs: (rec?.packaging ?? []).map((p) => ({ packagingId: p.packagingId, qtyPerPlate: Number(p.qtyPerPlate) })),
          comps: (rec?.components ?? []).map((c) => ({ menuItemId: c.menuItemId, qtyPerPlate: Number(c.qtyPerPlate) })),
        }}
      />
    </div>
  );
}
