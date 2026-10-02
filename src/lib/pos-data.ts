import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { nextBillNo, packPrice } from "./orders";
import { db, schema } from "@/db";
import { lookupValues } from "./options";
import type { PosDish, PosCustomer } from "@/components/pos";

export async function loadPosData(tenantId: number, date: string) {
  const [items, custs, orderTypes, payModes, setting, packs, today, next, slots] = await Promise.all([
    db.query.menuItems.findMany({ where: and(eq(schema.menuItems.tenantId, tenantId), eq(schema.menuItems.active, true)), with: { category: true } }),
    db.select().from(schema.customers).where(eq(schema.customers.tenantId, tenantId)).orderBy(asc(schema.customers.name)),
    lookupValues(tenantId, "ORDER_TYPE"),
    lookupValues(tenantId, "PAYMENT_MODE"),
    db.query.settings.findFirst({ where: eq(schema.settings.tenantId, tenantId) }),
    db.query.packaging.findMany({ where: eq(schema.packaging.tenantId, tenantId), orderBy: (t, { asc }) => [asc(t.type), asc(t.name)] }),
    db.select({ id: schema.dailyMenus.menuItemId }).from(schema.dailyMenus).where(and(eq(schema.dailyMenus.tenantId, tenantId), eq(schema.dailyMenus.date, date))),
    nextBillNo(tenantId, date),
    lookupValues(tenantId, "MEAL_SLOT"),
  ]);
  const todaySet = new Set(today.map((t) => t.id));
  items.sort((a, b) => a.category.sortOrder - b.category.sortOrder || a.category.name.localeCompare(b.category.name) || a.name.localeCompare(b.name));
  const dishes: PosDish[] = items.map((i) => ({ id: i.id, name: i.name, price: Number(i.price), category: i.category.name, vegType: i.vegType, today: todaySet.has(i.id), imageId: i.imageId, available: i.available }));
  const customers: PosCustomer[] = custs.map((c) => ({ id: c.id, name: c.name, phone: c.phone, area: [c.flat, c.area].filter(Boolean).join(", ") }));
  return {
    dishes, customers, orderTypes, payModes: payModes.filter((m) => m !== "Credit"),
    gstRate: Number(setting?.gstRate ?? 0),
    autoPayLater: setting?.autoPayLater ?? true,
    defaults: { deliveryCharge: Number(setting?.defaultDeliveryCharge ?? 0), packingCharge: Number(setting?.defaultPackingCharge ?? 0) },
    nextBill: next,
    mealSlots: slots.length ? slots : ["Breakfast", "Lunch", "Evening Snacks", "Dinner"],
    packaging: packs.map((p) => ({ id: p.id, name: p.name, type: p.type, price: packPrice(p).price, imageId: p.imageId, barcode: p.barcode })),
    scanner: !!setting?.scannerEnabled,
  };
}
