import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { convert } from "./units";

export type IngredientRow = { id: number; name: string; unit: string; price: number; wastagePct: number };
export type DishCost = {
  menuItemId: number;
  hasRecipe: boolean;
  plates: number;
  batchIngredients: number; // ingredient cost of the batch (with wastage)
  batchCost: number;        // + gas + misc
  componentsPerPlate: number;
  foodPerPlate: number;     // incl. components (thali)
  packagingPerPlate: number;
  totalPerPlate: number;    // food + packaging
  costUsed: number;         // recipe total, else manual estimate
  suggestedPrice: number;
  /** stock usage per plate, ingredientId -> qty in ingredient's own unit (incl. wastage & components) */
  usagePerPlate: Map<number, number>;
  problems: string[];
};

export function effectiveRate(i: { price: number; wastagePct: number }) {
  const w = Number(i.wastagePct || 0) / 100;
  return w > 0 && w < 1 ? Number(i.price) / (1 - w) : Number(i.price);
}

/** Loads everything once and computes cost of every dish (handles thali components recursively). */
export async function loadCosts(tenantId: number) {
  const [items, recs, ings, packs, setting] = await Promise.all([
    db.query.menuItems.findMany({ where: eq(schema.menuItems.tenantId, tenantId) }),
    db.query.recipes.findMany({ where: eq(schema.recipes.tenantId, tenantId), with: { ingredients: true, packaging: true, components: true } }),
    db.query.ingredients.findMany({ where: eq(schema.ingredients.tenantId, tenantId) }),
    db.query.packaging.findMany({ where: eq(schema.packaging.tenantId, tenantId) }),
    db.query.settings.findFirst({ where: eq(schema.settings.tenantId, tenantId) }),
  ]);
  const mult = Number(setting?.priceMultiplier ?? 3);
  const ingMap = new Map(ings.map((i) => [i.id, i]));
  const packMap = new Map(packs.map((p) => [p.id, p]));
  const recByItem = new Map(recs.map((r) => [r.menuItemId, r]));
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const memo = new Map<number, DishCost>();

  function compute(itemId: number, stack: number[] = []): DishCost {
    const cached = memo.get(itemId);
    if (cached) return cached;
    const item = itemMap.get(itemId);
    const r = recByItem.get(itemId);
    const usage = new Map<number, number>();
    const problems: string[] = [];
    let batchIng = 0, batchCost = 0, compPP = 0, foodPP = 0, packPP = 0, plates = 0;
    if (r) {
      plates = Number(r.platesPerBatch) || 0;
      for (const l of r.ingredients) {
        const ing = ingMap.get(l.ingredientId);
        if (!ing) continue;
        const q = convert(Number(l.qty), l.unit, ing.unit);
        if (q == null) { problems.push(`${ing.name}: unit ${l.unit} doesn't match ${ing.unit}`); continue; }
        batchIng += q * effectiveRate(ing);
        const w = Number(ing.wastagePct || 0) / 100;
        const raw = w > 0 && w < 1 ? q / (1 - w) : q;
        if (plates > 0) usage.set(ing.id, (usage.get(ing.id) ?? 0) + raw / plates);
      }
      batchCost = batchIng * (1 + Number(r.miscPct || 0) / 100) + Number(r.gasCost || 0);
      for (const c of r.components) {
        if (stack.includes(c.menuItemId) || c.menuItemId === itemId) { problems.push("Thali uses itself (loop)"); continue; }
        const sub = compute(c.menuItemId, [...stack, itemId]);
        const q = Number(c.qtyPerPlate);
        compPP += sub.foodPerPlate * q;
        for (const [k, v] of sub.usagePerPlate) usage.set(k, (usage.get(k) ?? 0) + v * q);
      }
      for (const p of r.packaging) {
        const pk = packMap.get(p.packagingId);
        if (pk) packPP += (Number(pk.packPrice) / Math.max(1, pk.piecesPerPack)) * Number(p.qtyPerPlate);
      }
      if (plates <= 0 && (r.ingredients.length || batchCost)) problems.push("Enter plates made");
      foodPP = (plates > 0 ? batchCost / plates : 0) + compPP;
    }
    const hasRecipe = !!r && (plates > 0 || r.components.length > 0) && foodPP + packPP > 0;
    const total = foodPP + packPP;
    const costUsed = hasRecipe ? total : Number(item?.manualCost ?? 0);
    const res: DishCost = {
      menuItemId: itemId, hasRecipe, plates, batchIngredients: batchIng, batchCost, componentsPerPlate: compPP,
      foodPerPlate: foodPP, packagingPerPlate: packPP, totalPerPlate: total, costUsed,
      suggestedPrice: costUsed > 0 ? Math.ceil((costUsed * mult) / 5) * 5 : 0,
      usagePerPlate: usage, problems,
    };
    memo.set(itemId, res);
    return res;
  }
  for (const it of items) compute(it.id);
  return { costs: memo, multiplier: mult, ingMap, packMap, itemMap, recByItem };
}

/** Is packaging used for this order type? (Dine-in = no packaging) */
export function usesPackaging(orderType: string) {
  return !/dine/i.test(orderType);
}
