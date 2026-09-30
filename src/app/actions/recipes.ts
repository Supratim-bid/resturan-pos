"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireAction } from "@/lib/auth";
import { canSeeCosts } from "@/lib/permissions";
import { convert } from "@/lib/units";

export type RecipeInput = {
  platesPerBatch: number; portion: string; gasCost: number; miscPct: number; method: string; tasteNotes: string; madeBy: string;
  lines: { ingredientId: number; qty: number; unit: string }[];
  packs: { packagingId: number; qtyPerPlate: number }[];
  comps: { menuItemId: number; qtyPerPlate: number }[];
};

export async function saveRecipeAction(menuItemId: number, r: RecipeInput): Promise<{ ok: boolean; error?: string }> {
  try {
    const u = await requireAction("recipes");
    if (!canSeeCosts(u)) throw new Error("You don't have permission to change recipes.");
    const tenantId = u.tenantId;
    const dish = await db.query.menuItems.findFirst({ where: and(eq(schema.menuItems.id, menuItemId), eq(schema.menuItems.tenantId, tenantId)) });
    if (!dish) throw new Error("Dish not found.");
    const lines = r.lines.filter((l) => l.ingredientId && l.qty > 0);
    const packs = r.packs.filter((p) => p.packagingId && p.qtyPerPlate > 0);
    const comps = r.comps.filter((c) => c.menuItemId && c.qtyPerPlate > 0 && c.menuItemId !== menuItemId);
    if (lines.length && !(r.platesPerBatch > 0)) throw new Error("Enter how many plates this batch makes.");
    const ings = await db.query.ingredients.findMany({ where: eq(schema.ingredients.tenantId, tenantId) });
    const im = new Map(ings.map((i) => [i.id, i]));
    for (const l of lines) {
      const i = im.get(l.ingredientId);
      if (!i) throw new Error("An ingredient no longer exists.");
      if (convert(1, l.unit, i.unit) == null) throw new Error(`${i.name}: use a unit like ${i.unit} (it is bought per ${i.unit}).`);
    }
    const okPacks = new Set((await db.query.packaging.findMany({ where: eq(schema.packaging.tenantId, tenantId) })).map((p) => p.id));
    const okDishes = new Set((await db.query.menuItems.findMany({ where: eq(schema.menuItems.tenantId, tenantId) })).map((m) => m.id));
    if (packs.some((p) => !okPacks.has(p.packagingId)) || comps.some((c) => !okDishes.has(c.menuItemId))) throw new Error("Packaging or dish not found.");
    await db.transaction(async (tx) => {
      const vals = {
        platesPerBatch: r.platesPerBatch || 1, portion: r.portion, gasCost: r.gasCost || 0, miscPct: r.miscPct || 0,
        method: r.method, tasteNotes: r.tasteNotes, madeBy: r.madeBy, updatedAt: new Date(),
      };
      const [rec] = await tx.insert(schema.recipes).values({ tenantId, menuItemId, ...vals })
        .onConflictDoUpdate({ target: schema.recipes.menuItemId, set: vals }).returning();
      await tx.delete(schema.recipeIngredients).where(eq(schema.recipeIngredients.recipeId, rec.id));
      await tx.delete(schema.recipePackaging).where(eq(schema.recipePackaging.recipeId, rec.id));
      await tx.delete(schema.recipeComponents).where(eq(schema.recipeComponents.recipeId, rec.id));
      if (lines.length) await tx.insert(schema.recipeIngredients).values(lines.map((l) => ({ ...l, recipeId: rec.id })));
      if (packs.length) await tx.insert(schema.recipePackaging).values(packs.map((p) => ({ ...p, recipeId: rec.id })));
      if (comps.length) await tx.insert(schema.recipeComponents).values(comps.map((c) => ({ ...c, recipeId: rec.id })));
    });
    revalidatePath("/recipes"); revalidatePath("/menu");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error).message) };
  }
}

export async function deleteRecipeAction(menuItemId: number) {
  const u = await requireAction("recipes");
  if (!canSeeCosts(u)) throw new Error("Not allowed");
  await db.delete(schema.recipes).where(and(eq(schema.recipes.menuItemId, menuItemId), eq(schema.recipes.tenantId, u.tenantId)));
  revalidatePath("/recipes");
}
