"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireAction } from "@/lib/auth";
import { ENTITIES, type EntityKey } from "@/lib/entities";
import { loadCosts, effectiveRate } from "@/lib/costing";
import { round2 } from "@/lib/format";
import { deleteImageIfUnused } from "./images";
import { customerByPhone, phone10 } from "@/lib/customers";

const TABLES = {
  customers: schema.customers, categories: schema.categories, menuItems: schema.menuItems, ingredients: schema.ingredients,
  packaging: schema.packaging, vendors: schema.vendors, vendorPayments: schema.vendorPayments, staff: schema.staff,
  reminders: schema.reminders, settlements: schema.settlements, expenses: schema.expenses, wastage: schema.wastage,
  dailyMenus: schema.dailyMenus, lookups: schema.lookups,
} as const;

export type ActionResult = { ok: true; id?: number } | { ok: false; error: string };

function friendly(e: unknown): string {
  const m = String((e as Error)?.message || e);
  const code = (e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
  const all = m + " " + String((e as { cause?: unknown })?.cause ?? "");
  if (code === "23505" || /duplicate key|unique/i.test(all)) return "This already exists - use a different name.";
  if (code === "23503" || /foreign key/i.test(all)) return "Can't delete: it is used elsewhere (orders, recipes or expenses). Mark it inactive instead.";
  return m.replace(/^Error:\s*/, "");
}

function parse(key: EntityKey, input: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of ENTITIES[key].fields) {
    let v = input[f.name];
    if (f.type === "checkbox") { out[f.name] = !!v; continue; }
    if (v === undefined || v === null || String(v).trim() === "") {
      if (f.required) throw new Error(`${f.label} is required.`);
      out[f.name] = ["text", "textarea", "tel"].includes(f.type) || (f.type === "select" && !f.numericValue) ? "" : null;
      continue;
    }
    v = String(v).trim();
    if (f.type === "number" || f.type === "money" || f.numericValue) {
      const n = Number(v);
      if (!isFinite(n)) throw new Error(`${f.label} must be a number.`);
      if (n < 0 && f.name !== "qty") throw new Error(`${f.label} can't be negative.`);
      out[f.name] = f.type === "money" ? round2(n) : n;
    } else if (f.type === "date") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v as string)) throw new Error(`${f.label} must be a date.`);
      out[f.name] = v;
    } else out[f.name] = v;
  }
  return out;
}

/** Every id a form points to (category, vendor, dish, photo…) must belong to the same restaurant */
const REF_TABLES = {
  vendors: schema.vendors, categories: schema.categories, menuItems: schema.menuItems, ingredients: schema.ingredients,
  staff: schema.staff, customers: schema.customers,
} as const;
async function checkRefs(tenantId: number, key: EntityKey, data: Record<string, unknown>) {
  for (const f of ENTITIES[key].fields) {
    const v = data[f.name];
    if (v == null || v === "") continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let t: any = null;
    if (f.type === "image") t = schema.images;
    else if (f.source && "entity" in f.source) t = REF_TABLES[f.source.entity];
    if (!t) continue;
    const [row] = await db.select({ id: t.id }).from(t).where(and(eq(t.id, Number(v)), eq(t.tenantId, tenantId))).limit(1);
    if (!row) throw new Error(`${f.label}: not found.`);
  }
}

async function afterSave(tenantId: number, key: EntityKey, id: number) {
  if (key === "expenses") {
    await db.delete(schema.stockMovements).where(and(eq(schema.stockMovements.tenantId, tenantId), eq(schema.stockMovements.refType, "expense"), eq(schema.stockMovements.refId, id)));
    const e = await db.query.expenses.findFirst({ where: and(eq(schema.expenses.id, id), eq(schema.expenses.tenantId, tenantId)) });
    if (e?.ingredientId && e.qty) {
      await db.insert(schema.stockMovements).values({ tenantId, date: e.date, ingredientId: e.ingredientId, qty: Number(e.qty), type: "PURCHASE", refType: "expense", refId: id });
    }
  }
  if (key === "wastage") {
    await db.delete(schema.stockMovements).where(and(eq(schema.stockMovements.tenantId, tenantId), eq(schema.stockMovements.refType, "wastage"), eq(schema.stockMovements.refId, id)));
    const w = await db.query.wastage.findFirst({ where: and(eq(schema.wastage.id, id), eq(schema.wastage.tenantId, tenantId)) });
    if (!w) return;
    const { costs, ingMap } = await loadCosts(tenantId);
    let cost = 0;
    const moves: { ingredientId: number; qty: number }[] = [];
    if (w.menuItemId && w.plates) {
      const c = costs.get(w.menuItemId);
      cost += (c?.hasRecipe ? c.foodPerPlate : c?.costUsed ?? 0) * Number(w.plates);
      for (const [ing, q] of c?.usagePerPlate ?? []) if (ingMap.get(ing)?.trackStock) moves.push({ ingredientId: ing, qty: -q * Number(w.plates) });
    }
    if (w.ingredientId && w.qty) {
      const ing = ingMap.get(w.ingredientId);
      if (ing) { cost += effectiveRate(ing) * Number(w.qty); moves.push({ ingredientId: ing.id, qty: -Number(w.qty) }); }
    }
    await db.update(schema.wastage).set({ cost: round2(cost) }).where(and(eq(schema.wastage.id, id), eq(schema.wastage.tenantId, tenantId)));
    if (moves.length) await db.insert(schema.stockMovements).values(moves.map((m) => ({ ...m, qty: Math.round(m.qty * 10000) / 10000, tenantId, date: w.date, type: "WASTAGE", refType: "wastage", refId: id })));
  }
}

export async function saveRecord(key: EntityKey, id: number | null, input: Record<string, unknown>, path?: string): Promise<ActionResult> {
  try {
    const u = await requireAction(ENTITIES[key].perm);
    const tenantId = u.tenantId;
    const data = parse(key, input);
    await checkRefs(tenantId, key, data);
    if (key === "wastage" && !data.menuItemId && !data.ingredientId) throw new Error("Pick a dish or an ingredient.");
    if (key === "wastage" && data.menuItemId && !data.plates) throw new Error("Enter how many plates.");
    if (key === "expenses" && data.ingredientId && !data.qty) throw new Error("Enter the quantity bought, so stock updates.");
    if (key === "expenses") {
      if ((data.paidFrom === "Owner" || data.paidFrom === "Staff") && !String(data.paidByName ?? "").trim())
        throw new Error("Enter the name of the owner/staff who paid, so you know whom to reimburse.");
      if (data.paidFrom === "Company") data.paidByName = "";
      if (!id) data.createdById = u.id;
    }
    if (key === "ingredients") data.updatedAt = new Date();
    const oldPhone = key === "customers" && id ? (await db.query.customers.findFirst({ where: and(eq(schema.customers.id, id), eq(schema.customers.tenantId, tenantId)), columns: { phone: true } }))?.phone ?? "" : "";
    if (key === "customers" && data.phone && phone10(String(data.phone)) !== phone10(oldPhone)) {
      // one customer per mobile number: the earlier record (and its name) is kept
      const dup = await customerByPhone(tenantId, String(data.phone), id);
      if (dup) throw new Error(`This mobile number is already saved for “${dup.name}”${dup.area ? ` (${dup.area})` : ""}. Open that customer instead.`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = TABLES[key] as any;
    let rid = id;
    if (key === "packaging" && data.barcode) {
      const dup = await db.query.packaging.findFirst({ where: and(eq(schema.packaging.tenantId, tenantId), eq(schema.packaging.barcode, String(data.barcode))) });
      if (dup && dup.id !== id) throw new Error(`Barcode already used for “${dup.name}”.`);
    }
    const oldImage = !id ? null
      : key === "menuItems" ? (await db.query.menuItems.findFirst({ where: and(eq(schema.menuItems.id, id), eq(schema.menuItems.tenantId, tenantId)) }))?.imageId
      : key === "packaging" ? (await db.query.packaging.findFirst({ where: and(eq(schema.packaging.id, id), eq(schema.packaging.tenantId, tenantId)) }))?.imageId
      : null;
    if (id) {
      const r = await db.update(table).set(data).where(and(eq(table.id, id), eq(table.tenantId, tenantId))).returning({ id: table.id });
      if (!r.length) throw new Error("Record not found.");
    } else {
      const [row] = await db.insert(table).values({ ...data, tenantId }).returning({ id: table.id });
      rid = row.id;
    }
    await afterSave(tenantId, key, rid!);
    if (oldImage && oldImage !== data.imageId) await deleteImageIfUnused(tenantId, oldImage);
    if (path) revalidatePath(path);
    return { ok: true, id: rid! };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

export async function deleteRecord(key: EntityKey, id: number, path?: string): Promise<ActionResult> {
  try {
    const u = await requireAction(ENTITIES[key].perm);
    const tenantId = u.tenantId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = TABLES[key] as any;
    if (key === "expenses" || key === "wastage") {
      await db.delete(schema.stockMovements).where(and(eq(schema.stockMovements.tenantId, tenantId), eq(schema.stockMovements.refType, key === "expenses" ? "expense" : "wastage"), eq(schema.stockMovements.refId, id)));
    }
    const img = key === "menuItems" ? (await db.query.menuItems.findFirst({ where: and(eq(schema.menuItems.id, id), eq(schema.menuItems.tenantId, tenantId)) }))?.imageId
      : key === "packaging" ? (await db.query.packaging.findFirst({ where: and(eq(schema.packaging.id, id), eq(schema.packaging.tenantId, tenantId)) }))?.imageId : null;
    await db.delete(table).where(and(eq(table.id, id), eq(table.tenantId, tenantId)));
    if (img) await deleteImageIfUnused(tenantId, img);
    if (path) revalidatePath(path);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}
