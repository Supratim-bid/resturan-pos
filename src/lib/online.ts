import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { lookupValues } from "./options";
import { calcTotals } from "./orders";
import { round2 } from "./format";

export type StoreDish = { id: number; name: string; price: number; category: string; vegType: string; imageId: number | null };
export type OnlineLine = { menuItemId: number; name: string; qty: number; rate: number };

/** Everything the public order page needs, or null when this restaurant doesn't take online orders */
export async function loadStorefront(codeRaw: string) {
  const code = codeRaw.trim().toLowerCase();
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.code, code) });
  if (!t || !t.active || !(t.features ?? []).includes("onlineOrders")) return null;
  const [s, items, slots] = await Promise.all([
    db.query.settings.findFirst({ where: eq(schema.settings.tenantId, t.id) }),
    db.query.menuItems.findMany({ where: and(eq(schema.menuItems.tenantId, t.id), eq(schema.menuItems.active, true), eq(schema.menuItems.available, true)), with: { category: true } }),
    lookupValues(t.id, "MEAL_SLOT"),
  ]);
  if (!s) return null;
  items.sort((a, b) => a.category.sortOrder - b.category.sortOrder || a.category.name.localeCompare(b.category.name) || a.name.localeCompare(b.name));
  const dishes: StoreDish[] = items.map((i) => ({ id: i.id, name: i.name, price: Number(i.price), category: i.category.name, vegType: i.vegType, imageId: i.imageId }));
  const preorderOk = s.onlinePreorder && (t.features ?? []).includes("preorders");
  return {
    tenant: { id: t.id, code: t.code },
    s,
    dishes,
    config: {
      name: s.name, tagline: s.tagline, note: s.onlineNote, phone: s.phone, address: s.address,
      open: s.onlineOpen, closedMsg: s.onlineClosedMsg,
      delivery: s.onlineDelivery, takeaway: s.onlineTakeaway, preorder: preorderOk,
      minOrder: Number(s.onlineMinOrder), deliveryCharge: Number(s.defaultDeliveryCharge), gstRate: Number(s.gstRate),
      upi: !!(s.upiId || s.qrImageId),
      mealSlots: slots.length ? slots : ["Breakfast", "Lunch", "Evening Snacks", "Dinner"],
      primary: s.primaryColor, accent: s.accentColor, hasLogo: !!s.logoImageId,
    },
  };
}
export type StoreConfig = NonNullable<Awaited<ReturnType<typeof loadStorefront>>>["config"];

/** Price a cart from the database (never trust prices from the browser) */
export async function priceCart(tenantId: number, cart: { menuItemId: number; qty: number }[], opts: { delivery: boolean }) {
  const s = await db.query.settings.findFirst({ where: eq(schema.settings.tenantId, tenantId) });
  if (!s) throw new Error("Restaurant not set up.");
  const want = new Map<number, number>();
  for (const c of cart) {
    const id = Math.trunc(Number(c.menuItemId)), q = Math.trunc(Number(c.qty));
    if (!Number.isInteger(id) || id <= 0 || !(q > 0)) continue;
    want.set(id, Math.min(50, (want.get(id) ?? 0) + q));
  }
  if (!want.size) throw new Error("Your cart is empty.");
  if (want.size > 40) throw new Error("Too many different dishes in one order.");
  const rows = await db.query.menuItems.findMany({ where: and(eq(schema.menuItems.tenantId, tenantId), eq(schema.menuItems.active, true)), orderBy: [asc(schema.menuItems.name)] });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const lines: OnlineLine[] = [];
  for (const [id, qty] of want) {
    const m = byId.get(id);
    if (!m) throw new Error("A dish in your cart is no longer on the menu. Please refresh the page.");
    if (!m.available) throw new Error(`${m.name} is sold out right now. Please remove it.`);
    lines.push({ menuItemId: m.id, name: m.name, qty, rate: Number(m.price) });
  }
  const deliveryCharge = opts.delivery ? Number(s.defaultDeliveryCharge) : 0;
  const t = calcTotals(lines.map((l) => ({ qty: l.qty, rate: l.rate, discount: 0 })), { orderDiscount: 0, deliveryCharge, packingCharge: 0, gstRate: Number(s.gstRate) });
  return { lines, itemsTotal: t.itemsTotal, deliveryCharge: round2(deliveryCharge), gst: t.gstAmount, total: t.total, s };
}

/** UPI link / QR for paying an online order before it is accepted */
export function upiForOnline(s: { upiId: string; name: string; qrImageId: number | null }, amount: number, ref: string) {
  if (s.upiId) return { kind: "upi" as const, text: `upi://pay?pa=${encodeURIComponent(s.upiId)}&pn=${encodeURIComponent(s.name)}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(ref)}` };
  if (s.qrImageId) return { kind: "image" as const, imageId: s.qrImageId };
  return null;
}
