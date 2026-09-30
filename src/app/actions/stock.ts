"use server";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireAction } from "@/lib/auth";
import { todayIST } from "@/lib/format";

/** Physical count: stores the difference as a COUNT movement so stock = what you counted */
export async function stockCountAction(date: string, entries: { ingredientId: number; actual: number }[]) {
  try {
    const u = await requireAction("stock");
    const d = date || todayIST();
    const cur = await db.select({ id: schema.stockMovements.ingredientId, q: sql<number>`sum(${schema.stockMovements.qty})` })
      .from(schema.stockMovements).where(eq(schema.stockMovements.tenantId, u.tenantId)).groupBy(schema.stockMovements.ingredientId);
    const mine = new Set((await db.query.ingredients.findMany({ where: eq(schema.ingredients.tenantId, u.tenantId) })).map((i) => i.id));
    const m = new Map(cur.map((c) => [c.id, Number(c.q)]));
    const rows = entries.filter((e) => mine.has(e.ingredientId) && Number.isFinite(e.actual) && e.actual >= 0).map((e) => ({
      tenantId: u.tenantId, date: d, ingredientId: e.ingredientId, qty: Math.round((e.actual - (m.get(e.ingredientId) ?? 0)) * 10000) / 10000,
      type: "COUNT", notes: `Counted ${e.actual}`,
    })).filter((r) => r.qty !== 0);
    if (rows.length) await db.insert(schema.stockMovements).values(rows);
    revalidatePath("/stock");
    return { ok: true as const, n: rows.length };
  } catch (e) {
    return { ok: false as const, error: String((e as Error).message) };
  }
}

export async function copyDailyMenuAction(fromDate: string, toDate: string) {
  const u = await requireAction("dailyMenu");
  const src = await db.query.dailyMenus.findMany({ where: and(eq(schema.dailyMenus.tenantId, u.tenantId), eq(schema.dailyMenus.date, fromDate)) });
  if (src.length) await db.insert(schema.dailyMenus).values(src.map((s) => ({ tenantId: u.tenantId, date: toDate, menuItemId: s.menuItemId, plannedPlates: s.plannedPlates, notes: "" }))).onConflictDoNothing();
  revalidatePath("/daily-menu");
  return src.length;
}

// ---------------- Packaging stock (pieces) ----------------
async function ownPackaging(tenantId: number, id: number) {
  const p = await db.query.packaging.findFirst({ where: and(eq(schema.packaging.id, id), eq(schema.packaging.tenantId, tenantId)) });
  if (!p) throw new Error("Packaging item not found.");
  return p;
}

/** Bought packaging: adds pieces to stock, and can also record the expense */
export async function addPackagingStockAction(v: {
  packagingId: number; unit: "packs" | "pieces"; qty: number; date: string; addExpense: boolean; amount: number; mode: string; notes: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const u = await requireAction("packaging");
    const p = await ownPackaging(u.tenantId, v.packagingId);
    const qty = Number(v.qty);
    if (!(qty > 0)) throw new Error("Enter how many you bought.");
    const pieces = Math.round(v.unit === "packs" ? qty * Math.max(1, p.piecesPerPack) : qty);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(v.date) ? v.date : todayIST();
    if (v.addExpense) {
      if (!(Number(v.amount) > 0)) throw new Error("Enter the amount paid, or untick “also add as expense”.");
      if (!v.mode) throw new Error("Pick how it was paid.");
    }
    await db.transaction(async (tx) => {
      await tx.insert(schema.packagingMovements).values({ tenantId: u.tenantId, packagingId: p.id, date, qty: pieces, type: "PURCHASE", notes: v.notes?.slice(0, 200) ?? "" });
      if (v.addExpense) {
        await tx.insert(schema.expenses).values({
          tenantId: u.tenantId, date, category: "Packaging", description: `${p.name} × ${pieces} pcs`, amount: Math.round(Number(v.amount) * 100) / 100,
          paymentMode: v.mode, notes: v.notes?.slice(0, 200) ?? "",
        });
      }
    });
    revalidatePath("/packaging"); revalidatePath("/");
    return { ok: true };
  } catch (e) { return { ok: false, error: String((e as Error).message ?? e) }; }
}

/** Counted the packaging on the shelf: stock becomes exactly this */
export async function countPackagingAction(packagingId: number, actual: number, date: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const u = await requireAction("packaging");
    const p = await ownPackaging(u.tenantId, packagingId);
    const a = Math.round(Number(actual));
    if (!Number.isFinite(a) || a < 0) throw new Error("Enter the number of pieces you counted.");
    const [{ q }] = await db.select({ q: sql<number>`coalesce(sum(${schema.packagingMovements.qty}),0)` }).from(schema.packagingMovements)
      .where(and(eq(schema.packagingMovements.tenantId, u.tenantId), eq(schema.packagingMovements.packagingId, p.id)));
    const diff = a - Number(q);
    const any = await db.query.packagingMovements.findFirst({ where: and(eq(schema.packagingMovements.tenantId, u.tenantId), eq(schema.packagingMovements.packagingId, p.id)) });
    if (diff !== 0 || !any) {
      await db.insert(schema.packagingMovements).values({ tenantId: u.tenantId, packagingId: p.id, date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayIST(), qty: diff, type: "COUNT", notes: `Counted ${a}` });
    }
    revalidatePath("/packaging"); revalidatePath("/");
    return { ok: true };
  } catch (e) { return { ok: false, error: String((e as Error).message ?? e) }; }
}
