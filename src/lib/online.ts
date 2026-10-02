import "server-only";
import { activeGateway } from "./gateway";
import { featureInfo, tenantWithPlan } from "./plans";
import { isLive } from "./tenant-status";
import crypto from "node:crypto";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { lookupValues } from "./options";
import { calcTotals } from "./orders";
import { restaurantPhones, round2 } from "./format";
import { smsReady } from "./sms";

export type StoreDish = { id: number; name: string; price: number; category: string; vegType: string; imageId: number | null };
export type OnlineLine = { menuItemId: number; name: string; qty: number; rate: number };

/** Everything the public order page needs, or null when this restaurant doesn't take online orders */
export async function loadStorefront(codeRaw: string) {
  const code = codeRaw.trim().toLowerCase();
  const tp = await tenantWithPlan({ code });
  if (!tp) return null;
  const t = tp.t, feats = featureInfo(t, tp.plan).active;
  if (!isLive(t) || !feats.includes("onlineOrders")) return null;
  const [s, items, slots] = await Promise.all([
    db.query.settings.findFirst({ where: eq(schema.settings.tenantId, t.id) }),
    db.query.menuItems.findMany({ where: and(eq(schema.menuItems.tenantId, t.id), eq(schema.menuItems.active, true), eq(schema.menuItems.available, true)), with: { category: true } }),
    lookupValues(t.id, "MEAL_SLOT"),
  ]);
  if (!s) return null;
  items.sort((a, b) => a.category.sortOrder - b.category.sortOrder || a.category.name.localeCompare(b.category.name) || a.name.localeCompare(b.name));
  const dishes: StoreDish[] = items.map((i) => ({ id: i.id, name: i.name, price: Number(i.price), category: i.category.name, vegType: i.vegType, imageId: i.imageId }));
  const preorderOk = s.onlinePreorder && feats.includes("preorders");
  const gateway = activeGateway(s);
  const payUpi = s.onlinePayUpi && !!(s.upiId || s.qrImageId || gateway); // pay-now needs a UPI ID / QR in Settings, or a payment gateway
  const payCash = s.onlinePayCash;
  return {
    tenant: { id: t.id, code: t.code },
    s,
    dishes,
    config: {
      name: s.name, tagline: s.tagline, note: s.onlineNote, phone: restaurantPhones(s).join(" / "), whatsapp: s.whatsapp, address: s.address,
      // no payment method the customer can use = can't take orders
      open: s.onlineOpen && (payUpi || payCash),
      closedMsg: payUpi || payCash ? s.onlineClosedMsg : "Online ordering isn't available yet. Please call us to order.",
      delivery: s.onlineDelivery, takeaway: s.onlineTakeaway, preorder: preorderOk,
      minOrder: Number(s.onlineMinOrder), deliveryCharge: Number(s.defaultDeliveryCharge), gstRate: Number(s.gstRate),
      payUpi, payCash, payGateway: !!gateway,
      // % added to dish prices for "Pay online now" (only with a gateway)
      payMarkup: gateway && payUpi ? Math.max(0, Math.min(25, Number(s.onlinePayMarkup) || 0)) : 0,
      pickupDiscount: s.onlineTakeaway ? pickupPct(s) : 0,
      otp: s.onlineOtp && smsReady(),
      newMax: Number(s.onlineNewMax),
      mealSlots: slots.length ? slots : ["Breakfast", "Lunch", "Evening Snacks", "Dinner"],
      primary: s.primaryColor, accent: s.accentColor, hasLogo: !!s.logoImageId,
    },
  };
}
export type StoreConfig = NonNullable<Awaited<ReturnType<typeof loadStorefront>>>["config"];

/** Price a cart from the database (never trust prices from the browser) */
export async function priceCart(tenantId: number, cart: { menuItemId: number; qty: number }[], opts: { delivery: boolean; markup?: number }) {
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
    lines.push({ menuItemId: m.id, name: m.name, qty, rate: onlinePrice(Number(m.price), opts.markup ?? 0) });
  }
  const deliveryCharge = opts.delivery ? Number(s.defaultDeliveryCharge) : 0;
  const itemsRaw = lines.reduce((a, l) => a + l.qty * l.rate, 0);
  // pickup discount (whole rupees), only when the restaurant switched it on
  const pct = pickupPct(s);
  const discount = !opts.delivery && pct > 0 ? Math.round((itemsRaw * pct) / 100) : 0;
  const t = calcTotals(lines.map((l) => ({ qty: l.qty, rate: l.rate, discount: 0 })), { orderDiscount: discount, deliveryCharge, packingCharge: 0, gstRate: Number(s.gstRate) });
  return { lines, itemsTotal: t.itemsTotal, discount, discountPct: discount ? pct : 0, deliveryCharge: round2(deliveryCharge), gst: t.gstAmount, total: t.total, s };
}

/** Pickup discount % in force (0 = off) */
export const pickupPct = (s: { pickupDiscountOn: boolean; pickupDiscountPct: unknown }) => s.pickupDiscountOn ? Math.max(0, Math.min(50, Number(s.pickupDiscountPct) || 0)) : 0;

/** Dish price when the customer pays online and the restaurant adds a % for it (whole rupees, never lower) */
export const onlinePrice = (price: number, markup: number) => markup > 0 ? Math.round(price * (1 + markup / 100)) : price;

/** UPI link / QR for paying an online order before it is accepted */
export function upiForOnline(s: { upiId: string; name: string; qrImageId: number | null }, amount: number, ref: string) {
  if (s.upiId) return { kind: "upi" as const, text: `upi://pay?pa=${encodeURIComponent(s.upiId)}&pn=${encodeURIComponent(s.name)}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(ref)}` };
  if (s.qrImageId) return { kind: "image" as const, imageId: s.qrImageId };
  return null;
}

// ---------- stopping fake orders (free, no SMS) ----------
export const DEVICE_COOKIE = "ao_dev";
/** Hash of the customer's browser id, per restaurant - used for "My orders" (never shown) */
export function deviceHash(tenantId: number, dev: string | undefined) {
  if (!dev || !/^[\w-]{16,64}$/.test(dev)) return "";
  return crypto.createHash("sha256").update(`${tenantId}:${dev}`).digest("hex").slice(0, 40);
}
export const newDeviceId = () => crypto.randomBytes(18).toString("base64url");

/** Bills (not cancelled) per customer - to show "new number" vs "regular" */
export async function billCounts(tenantId: number, customerIds: number[]) {
  const ids = [...new Set(customerIds.filter(Boolean))];
  if (!ids.length) return new Map<number, number>();
  const rows = await db.select({ c: schema.orders.customerId, n: sql<number>`count(*)` }).from(schema.orders)
    .where(and(eq(schema.orders.tenantId, tenantId), inArray(schema.orders.customerId, ids), ne(schema.orders.status, "CANCELLED")))
    .groupBy(schema.orders.customerId);
  return new Map(rows.map((r) => [r.c!, Number(r.n)]));
}
