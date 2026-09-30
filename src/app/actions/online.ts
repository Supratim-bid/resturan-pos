"use server";
import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { requireAction } from "@/lib/auth";
import { loadStorefront, priceCart, type OnlineLine } from "@/lib/online";
import { saveOrder } from "@/lib/orders";
import { lookupValues } from "@/lib/options";
import { addDays, round2, todayIST } from "@/lib/format";
import { assertNotLocked, clientIp, recordFailure } from "@/lib/throttle";

type R<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const fail = (e: unknown) => ({ ok: false as const, error: String((e as Error)?.message ?? e).replace(/^Error:\s*/, "") });
const clean = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

export type PlaceOrderInput = {
  name: string; phone: string; kind: "DELIVERY" | "TAKEAWAY";
  isPreorder: boolean; date?: string; mealSlot?: string; slotTime?: string;
  flat?: string; area?: string; notes?: string; payMethod: "COD" | "UPI";
  items: { menuItemId: number; qty: number }[];
  website?: string; // honeypot: real people never fill this
};

// ---------------- customers (public, no login) ----------------
export async function placeOnlineOrderAction(code: string, v: PlaceOrderInput): Promise<R> {
  let dest = "";
  try {
    const store = await loadStorefront(code);
    if (!store) throw new Error("This restaurant is not taking online orders.");
    const { tenant, s, config } = store;
    if (!config.open) throw new Error(config.closedMsg || "Online orders are closed right now.");
    if (v.website) throw new Error("Could not place the order.");
    const name = clean(v.name, 60);
    const p10 = String(v.phone ?? "").replace(/\D/g, "").slice(-10);
    if (name.length < 2) throw new Error("Please enter your name.");
    if (!/^[6-9]\d{9}$/.test(p10)) throw new Error("Please enter a valid 10-digit mobile number.");
    const kind = v.kind === "DELIVERY" ? "DELIVERY" : "TAKEAWAY";
    if (kind === "DELIVERY" && !config.delivery) throw new Error("Delivery is not available right now.");
    if (kind === "TAKEAWAY" && !config.takeaway) throw new Error("Takeaway is not available right now.");
    const flat = clean(v.flat, 80), area = clean(v.area, 120);
    if (kind === "DELIVERY" && (flat.length < 2 || area.length < 3)) throw new Error("Please enter your full delivery address.");
    const today = todayIST();
    let date = today, mealSlot = "", slotTime = "";
    if (v.isPreorder) {
      if (!config.preorder) throw new Error("Pre-orders are not available.");
      date = String(v.date ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today || date > addDays(today, 30)) throw new Error("Pick a date from today up to 30 days ahead.");
      mealSlot = clean(v.mealSlot, 40);
      if (!config.mealSlots.includes(mealSlot)) throw new Error("Pick the meal (breakfast / lunch / dinner).");
      slotTime = /^\d{2}:\d{2}$/.test(v.slotTime ?? "") ? v.slotTime! : "";
    }
    const payMethod = v.payMethod === "UPI" && config.upi ? "UPI" : "COD";
    // anti-spam: at most 10 orders per network and 5 per phone in 15 minutes, 3 waiting orders per phone
    const ip = await clientIp();
    const keys = [`order-ip:${ip}`, `order-phone:${tenant.id}:${p10}`];
    await assertNotLocked(keys).catch(() => { throw new Error("Too many orders from this phone or network. Please wait a few minutes or call the restaurant."); });
    const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(schema.onlineOrders)
      .where(and(eq(schema.onlineOrders.tenantId, tenant.id), eq(schema.onlineOrders.phone, p10), eq(schema.onlineOrders.status, "NEW")));
    if (Number(n) >= 3) throw new Error("You already have orders waiting for the restaurant to confirm. Please wait, or call them.");

    const priced = await priceCart(tenant.id, v.items ?? [], { delivery: kind === "DELIVERY" });
    if (priced.itemsTotal < Number(config.minOrder || 0)) throw new Error(`Minimum order is ₹${config.minOrder}. Please add a little more.`);

    // find or create the customer by mobile number
    let cust = await db.query.customers.findFirst({
      where: and(eq(schema.customers.tenantId, tenant.id), sql`right(regexp_replace(${schema.customers.phone}, '\\D', '', 'g'), 10) = ${p10}`),
    });
    if (!cust) {
      [cust] = await db.insert(schema.customers).values({ tenantId: tenant.id, name, phone: p10, flat, area, notes: "Added from online order" }).returning();
    } else if (kind === "DELIVERY" && (!cust.flat || !cust.area)) {
      await db.update(schema.customers).set({ flat: cust.flat || flat, area: cust.area || area }).where(eq(schema.customers.id, cust.id));
    }
    const token = crypto.randomBytes(18).toString("base64url");
    await db.insert(schema.onlineOrders).values({
      tenantId: tenant.id, token, customerId: cust.id, name, phone: p10,
      address: kind === "DELIVERY" ? [flat, area].filter(Boolean).join(", ") : "",
      kind, isPreorder: !!v.isPreorder, date, mealSlot, slotTime,
      items: JSON.stringify(priced.lines), estTotal: priced.total, payMethod, notes: clean(v.notes, 300), ip,
    });
    await recordFailure([{ key: keys[0], limit: 10 }, { key: keys[1], limit: 5 }]); // counts orders, not failures
    revalidatePath("/online-orders"); revalidatePath("/");
    dest = `/${tenant.code}/order/${token}`;
    void s;
  } catch (e) { return fail(e); }
  redirect(dest);
}

/** Customer typed the UPI transaction id after paying */
export async function addUpiRefAction(code: string, token: string, ref: string): Promise<R> {
  try {
    const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.code, code.toLowerCase()) });
    const o = t ? await db.query.onlineOrders.findFirst({ where: and(eq(schema.onlineOrders.token, token), eq(schema.onlineOrders.tenantId, t.id)) }) : null;
    if (!o) throw new Error("Order not found.");
    const r = clean(ref, 40).replace(/[^\w-]/g, "");
    if (r.length < 6) throw new Error("Enter the UPI transaction / reference number (UTR) from your payment app.");
    await db.update(schema.onlineOrders).set({ upiRef: r }).where(eq(schema.onlineOrders.id, o.id));
    revalidatePath("/online-orders");
    return { ok: true };
  } catch (e) { return fail(e); }
}

// ---------------- staff ----------------
async function orderTypeFor(tenantId: number, wanted: string, fallbackRe: RegExp) {
  const types = await lookupValues(tenantId, "ORDER_TYPE");
  return types.find((x) => x === wanted) ?? types.find((x) => fallbackRe.test(x)) ?? wanted;
}

export async function acceptOnlineOrderAction(id: number, upiReceived: boolean): Promise<R<number>> {
  try {
    const u = await requireAction("onlineOrders");
    // claim it first so two people can't accept the same order
    const [claimed] = await db.update(schema.onlineOrders).set({ status: "ACCEPTING", decidedById: u.id, decidedAt: new Date() })
      .where(and(eq(schema.onlineOrders.id, id), eq(schema.onlineOrders.tenantId, u.tenantId), eq(schema.onlineOrders.status, "NEW"))).returning();
    if (!claimed) throw new Error("This order was already handled.");
    try {
      const s = await db.query.settings.findFirst({ where: eq(schema.settings.tenantId, u.tenantId) });
      const lines = JSON.parse(claimed.items) as OnlineLine[];
      const delivery = claimed.kind === "DELIVERY";
      const orderType = delivery ? await orderTypeFor(u.tenantId, s?.onlineDeliveryType || "Delivery", /deliver/i) : await orderTypeFor(u.tenantId, s?.onlineTakeawayType || "Takeaway", /take|pick/i);
      const notes = [`Online order (${claimed.phone})`, delivery && claimed.address ? `Deliver to: ${claimed.address}` : "", claimed.notes].filter(Boolean).join(" · ").slice(0, 500);
      const orderId = await saveOrder(u.tenantId, {
        date: claimed.date < todayIST() ? todayIST() : claimed.date,
        customerId: claimed.customerId, orderType,
        items: lines.map((l) => ({ menuItemId: l.menuItemId, qty: l.qty, discount: 0 })),
        deliveryCharge: delivery ? Number(s?.defaultDeliveryCharge ?? 0) : 0, packingCharge: 0, orderDiscount: 0,
        notes, isPreorder: claimed.isPreorder, mealSlot: claimed.mealSlot, slotTime: claimed.slotTime,
      }, u.id);
      if (upiReceived) {
        const o = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) });
        if (o) await db.insert(schema.payments).values({
          tenantId: u.tenantId, orderId, customerId: o.customerId, amount: round2(Number(o.total)), mode: "UPI", date: todayIST(),
          ref: claimed.upiRef ? `upi:${claimed.upiRef}` : "", notes: claimed.upiRef ? `Online order · UTR ${claimed.upiRef}` : "Online order",
        });
      }
      await db.update(schema.onlineOrders).set({ status: "ACCEPTED", orderId }).where(eq(schema.onlineOrders.id, id));
      revalidatePath("/online-orders"); revalidatePath("/orders"); revalidatePath("/");
      return { ok: true, data: orderId };
    } catch (e) {
      await db.update(schema.onlineOrders).set({ status: "NEW", decidedById: null, decidedAt: null }).where(eq(schema.onlineOrders.id, id));
      throw e;
    }
  } catch (e) { return fail(e); }
}

export async function rejectOnlineOrderAction(id: number, reason: string): Promise<R> {
  try {
    const u = await requireAction("onlineOrders");
    const why = clean(reason, 200);
    if (why.length < 3) throw new Error("Write a short reason - the customer sees it.");
    const [r] = await db.update(schema.onlineOrders).set({ status: "REJECTED", rejectReason: why, decidedById: u.id, decidedAt: new Date() })
      .where(and(eq(schema.onlineOrders.id, id), eq(schema.onlineOrders.tenantId, u.tenantId), eq(schema.onlineOrders.status, "NEW"))).returning({ id: schema.onlineOrders.id });
    if (!r) throw new Error("This order was already handled.");
    revalidatePath("/online-orders"); revalidatePath("/");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function saveOnlineSettingsAction(v: Record<string, string>): Promise<R> {
  try {
    const u = await requireAction("settings");
    const min = Number(v.onlineMinOrder || 0);
    if (!Number.isFinite(min) || min < 0) throw new Error("Minimum order must be a number.");
    await db.update(schema.settings).set({
      onlineOpen: v.onlineOpen === "true", onlineClosedMsg: clean(v.onlineClosedMsg, 200), onlineNote: clean(v.onlineNote, 300),
      onlineDelivery: v.onlineDelivery === "true", onlineTakeaway: v.onlineTakeaway === "true", onlinePreorder: v.onlinePreorder === "true",
      onlineMinOrder: round2(min), onlineDeliveryType: clean(v.onlineDeliveryType, 40) || "Delivery", onlineTakeawayType: clean(v.onlineTakeawayType, 40) || "Takeaway",
    }).where(eq(schema.settings.tenantId, u.tenantId));
    revalidatePath("/online-orders");
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Quick open/close switch from the Online Orders page (staff) */
export async function setOnlineOpenAction(open: boolean): Promise<R> {
  try {
    const u = await requireAction("onlineOrders");
    await db.update(schema.settings).set({ onlineOpen: open }).where(eq(schema.settings.tenantId, u.tenantId));
    revalidatePath("/online-orders");
    return { ok: true };
  } catch (e) { return fail(e); }
}
