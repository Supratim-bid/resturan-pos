"use server";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { getUser, requireAction } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { round2 } from "@/lib/format";

/** Quick "available / not available" switch - allowed for anyone who can take orders or edit the menu */
export async function setAvailabilityAction(ids: number[], available: boolean): Promise<{ ok: boolean; error?: string }> {
  try {
    const u = await getUser();
    if (!u || !(can(u, "menu") || can(u, "newOrder") || can(u, "dailyMenu"))) throw new Error("You don't have access to do this.");
    if (!ids.length) return { ok: true };
    await db.update(schema.menuItems).set({ available })
      .where(and(eq(schema.menuItems.tenantId, u.tenantId), inArray(schema.menuItems.id, ids)));
    revalidatePath("/menu"); revalidatePath("/orders/new"); revalidatePath("/daily-menu");
    return { ok: true };
  } catch (e) { return { ok: false, error: String((e as Error).message) }; }
}

export type MenuCsvRow = {
  code?: string; name: string; category: string; vegType?: string; price: string; estCost?: string; available?: string; active?: string;
};
export type ImportResult = { ok: boolean; created: number; updated: number; newCategories: string[]; hidden: number; errors: string[] };

const yes = (v: string | undefined, dflt: boolean) => {
  const s = (v ?? "").trim().toLowerCase();
  if (!s) return dflt;
  return ["yes", "y", "true", "1", "available", "active", "on"].includes(s);
};
const vegOf = (v?: string) => {
  const s = (v ?? "").trim().toLowerCase().replace(/[\s_-]/g, "");
  if (!s) return "Veg";
  if (s.startsWith("non") || s === "nv") return "Non-Veg";
  if (s.startsWith("egg")) return "Egg";
  return "Veg";
};

/**
 * Add or update dishes from a CSV. Matching is by dish name (not case sensitive).
 * New categories are created. Nothing is deleted; optionally dishes missing from the file are hidden.
 */
export async function importMenuAction(rows: MenuCsvRow[], opts: { hideMissing?: boolean; dryRun?: boolean } = {}): Promise<ImportResult> {
  const out: ImportResult = { ok: false, created: 0, updated: 0, newCategories: [], hidden: 0, errors: [] };
  try {
    const u = await requireAction("menu");
    const T = u.tenantId;
    if (!rows.length) { out.errors.push("The file has no dishes."); return out; }
    if (rows.length > 2000) { out.errors.push("Too many rows (max 2000)."); return out; }
    const [items, cats] = await Promise.all([
      db.query.menuItems.findMany({ where: eq(schema.menuItems.tenantId, T) }),
      db.query.categories.findMany({ where: eq(schema.categories.tenantId, T) }),
    ]);
    const byName = new Map(items.map((i) => [i.name.trim().toLowerCase(), i]));
    const catByName = new Map(cats.map((c) => [c.name.trim().toLowerCase(), c.id]));
    const seen = new Set<string>();
    const clean: { line: number; key: string; name: string; category: string; code: string; vegType: string; price: number; manualCost: number | null; available: boolean; active: boolean }[] = [];
    rows.forEach((r, i) => {
      const line = i + 2; // header is line 1
      const name = (r.name ?? "").trim(), category = (r.category ?? "").trim();
      if (!name && !category && !r.price) return; // blank line
      if (!name) return out.errors.push(`Line ${line}: dish name is empty.`);
      const key = name.toLowerCase();
      if (seen.has(key)) return out.errors.push(`Line ${line}: "${name}" appears twice in the file.`);
      seen.add(key);
      const price = Number(String(r.price ?? "").replace(/[₹,\s]/g, ""));
      if (!isFinite(price) || price < 0 || String(r.price ?? "").trim() === "") return out.errors.push(`Line ${line}: "${name}" has no valid price.`);
      const costRaw = String(r.estCost ?? "").replace(/[₹,\s]/g, "");
      const manualCost = costRaw === "" ? null : Number(costRaw);
      if (manualCost != null && (!isFinite(manualCost) || manualCost < 0)) return out.errors.push(`Line ${line}: "${name}" has an invalid cost.`);
      const existing = byName.get(key);
      if (!category && !existing) return out.errors.push(`Line ${line}: "${name}" needs a category.`);
      clean.push({
        line, key, name, category, code: (r.code ?? "").trim(), vegType: vegOf(r.vegType),
        price: round2(price), manualCost: manualCost == null ? null : round2(manualCost),
        available: yes(r.available, true), active: yes(r.active, true),
      });
    });
    if (out.errors.length) return out; // nothing is saved if any line has a problem
    const newCats = [...new Set(clean.filter((c) => c.category && !catByName.has(c.category.toLowerCase())).map((c) => c.category))];
    out.newCategories = newCats;
    out.created = clean.filter((c) => !byName.has(c.key)).length;
    out.updated = clean.length - out.created;
    const missing = opts.hideMissing ? items.filter((i) => i.active && !seen.has(i.name.trim().toLowerCase())) : [];
    out.hidden = missing.length;
    if (opts.dryRun) { out.ok = true; return out; }

    await db.transaction(async (tx) => {
      if (newCats.length) {
        const [{ mx }] = await tx.select({ mx: sql<number>`coalesce(max(${schema.categories.sortOrder}),0)` }).from(schema.categories).where(eq(schema.categories.tenantId, T));
        const ins = await tx.insert(schema.categories).values(newCats.map((name, i) => ({ tenantId: T, name, sortOrder: Number(mx) + 1 + i }))).returning();
        for (const c of ins) catByName.set(c.name.toLowerCase(), c.id);
      }
      for (const c of clean) {
        const ex = byName.get(c.key);
        const categoryId = c.category ? catByName.get(c.category.toLowerCase())! : ex!.categoryId;
        const vals = { name: c.name, categoryId, vegType: c.vegType, price: c.price, manualCost: c.manualCost, available: c.available, active: c.active, ...(c.code ? { code: c.code } : {}) };
        if (ex) await tx.update(schema.menuItems).set(vals).where(and(eq(schema.menuItems.id, ex.id), eq(schema.menuItems.tenantId, T)));
        else await tx.insert(schema.menuItems).values({ tenantId: T, code: c.code, ...vals });
      }
      if (missing.length) await tx.update(schema.menuItems).set({ active: false })
        .where(and(eq(schema.menuItems.tenantId, T), inArray(schema.menuItems.id, missing.map((m) => m.id)), notInArray(schema.menuItems.id, [-1])));
    });
    revalidatePath("/menu"); revalidatePath("/orders/new");
    out.ok = true;
    return out;
  } catch (e) {
    out.errors.push(String((e as Error).message));
    return out;
  }
}
