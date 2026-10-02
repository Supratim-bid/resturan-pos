"use server";
import { kotAnyOn, kotScreenOn } from "@/lib/features";
import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { notifyTenant } from "@/lib/push";
import { activeGateway, createOnlineOrderLink, GATEWAY_LABEL, type Gateway } from "@/lib/gateway";
import { db, schema } from "@/db";
import { requireAction } from "@/lib/auth";
import { cookies, headers } from "next/headers";
import { DEVICE_COOKIE, billCounts, deviceHash, loadStorefront, newDeviceId, priceCart, type OnlineLine } from "@/lib/online";
import { saveOrder } from "@/lib/orders";
import { lookupValues } from "@/lib/options";
import { addDays, round2, todayIST } from "@/lib/format";
import { assertNotLocked, clientIp, recordFailure } from "@/lib/throttle";
import { PHONE_COOKIE, signPhone, verifyPhone } from "@/lib/session";
import { sendSms, smsReady } from "@/lib/sms";

type R<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const fail = (e: unknown) => ({ ok: false as const, error: String((e as Error)?.message ?? e).replace(/^Error:\s*/, "") });
const clean = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

export type PlaceOrderInput = {
  name: string; phone: string; kind: "DELIVERY" | "TAKEAWAY";
  isPreorder: boolean; date?: string; mealSlot?: string; slotTime?: string;
  flat?: string; area?: string; notes?: string; payMethod?: "UPI" | "COD";
  lat?: number; lng?: number; // optional delivery-location pin shared by the customer
  items: { menuItemId: number; qty: number }[];
  website?: string; // honeypot: real people never fill this
};

// ---------------- customers (public, no login) ----------------
export async function placeOnlineOrderAction(code: string, v: PlaceOrderInput): Promise<R> {
  let dest = "";
  try {
    const store = await loadStorefront(code);
    if (!store) throw new Error("This restaurant is not taking online orders.");
    const { tenant, config } = store;
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
    // payment: only the ways the restaurant allows
    const payMethod = v.payMethod === "COD" ? "COD" : "UPI";
    if (payMethod === "UPI" && !config.payUpi) throw new Error("Paying by UPI is not available. Please choose another way to pay.");
    if (payMethod === "COD" && !config.payCash) throw new Error("Cash payment is not available. Please pay by UPI.");
    // mobile verified by OTP (only when the restaurant turned it on and SMS is connected)
    if (config.otp && (await verifyPhone((await cookies()).get(PHONE_COOKIE)?.value, tenant.id)) !== p10) {
      throw new Error("Please verify your mobile number with the OTP first.");
    }
    // anti-spam: at most 10 orders per network and 5 per phone in 15 minutes, 3 waiting orders per phone
    const ip = await clientIp();
    const keys = [`order-ip:${ip}`, `order-phone:${tenant.id}:${p10}`];
    await assertNotLocked(keys).catch(() => { throw new Error("Too many orders from this phone or network. Please wait a few minutes or call the restaurant."); });
    const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(schema.onlineOrders)
      .where(and(eq(schema.onlineOrders.tenantId, tenant.id), eq(schema.onlineOrders.phone, p10), eq(schema.onlineOrders.status, "NEW")));
    if (Number(n) >= 3) throw new Error("You already have orders waiting for the restaurant to confirm. Please wait, or call them.");

    // find the customer by mobile number (blocked numbers stop here)
    let cust = await db.query.customers.findFirst({
      where: and(eq(schema.customers.tenantId, tenant.id), sql`right(regexp_replace(${schema.customers.phone}, '\\D', '', 'g'), 10) = ${p10}`),
    });
    if (cust?.onlineBlocked) throw new Error("Sorry, we can't take this order online. Please call the restaurant.");
    const isNew = !cust || !(await billCounts(tenant.id, [cust.id])).get(cust.id);

    const priced = await priceCart(tenant.id, v.items ?? [], { delivery: kind === "DELIVERY", markup: payMethod === "UPI" ? config.payMarkup : 0 });
    if (priced.itemsTotal < Number(config.minOrder || 0)) throw new Error(`Minimum order is ₹${config.minOrder}. Please add a little more.`);
    if (isNew && config.newMax > 0 && priced.total > config.newMax) throw new Error(`For a first order the limit is ₹${config.newMax}. Please call the restaurant for bigger orders.`);

    if (!cust) {
      [cust] = await db.insert(schema.customers).values({ tenantId: tenant.id, name, phone: p10, flat, area, notes: "Added from online order" }).returning();
    } else if (kind === "DELIVERY" && (!cust.flat || !cust.area)) {
      await db.update(schema.customers).set({ flat: cust.flat || flat, area: cust.area || area }).where(eq(schema.customers.id, cust.id));
    }
    // this browser's id, so the customer can see "My orders" without logging in
    const jar = await cookies();
    let dev = jar.get(DEVICE_COOKIE)?.value;
    if (!deviceHash(tenant.id, dev)) {
      dev = newDeviceId();
      jar.set(DEVICE_COOKIE, dev, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 400 * 86400 });
    }
    const token = crypto.randomBytes(18).toString("base64url");
    await db.insert(schema.onlineOrders).values({
      tenantId: tenant.id, token, customerId: cust.id, name, phone: p10,
      address: kind === "DELIVERY" ? [flat, area].filter(Boolean).join(", ") : "",
      kind, isPreorder: !!v.isPreorder, date, mealSlot, slotTime,
      items: JSON.stringify(priced.lines), estTotal: priced.total, discount: priced.discount, payMethod, notes: clean(v.notes, 300), ip,
      device: deviceHash(tenant.id, dev),
      destLat: kind === "DELIVERY" && Number.isFinite(Number(v.lat)) && Math.abs(Number(v.lat)) <= 90 ? String(Number(v.lat)) : "",
      destLng: kind === "DELIVERY" && Number.isFinite(Number(v.lng)) && Math.abs(Number(v.lng)) <= 180 ? String(Number(v.lng)) : "",
    });
    await recordFailure([{ key: keys[0], limit: 10 }, { key: keys[1], limit: 5 }]); // counts orders, not failures
    revalidatePath("/online-orders"); revalidatePath("/");
    const summary = priced.lines.slice(0, 3).map((l) => `${l.qty}× ${l.name}`).join(", ") + (priced.lines.length > 3 ? "…" : "");
    after(() => notifyTenant(tenant.id, {
      title: `🛎️ New online order · ₹${Math.round(priced.total)}`, body: `${name} · ${kind === "DELIVERY" ? "Delivery" : "Pickup"}${v.isPreorder ? ` · ${mealSlot} ${date}` : ""} · ${summary}`,
      url: "/online-orders", tag: `online-${token}`, icon: `/pwa/${tenant.code}/icon-192.png`, sticky: true,
    }));
    dest = `/${tenant.code}/order/${token}`;
    // pay now through the restaurant's gateway: go straight to its payment page (UPI QR stays as the fallback)
    if (payMethod === "UPI" && store.s && activeGateway(store.s)) {
      const h = await headers();
      const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? ""}`;
      const w = await db.query.onlineOrders.findFirst({ where: eq(schema.onlineOrders.token, token), columns: { id: true } });
      if (w) dest = await createOnlineOrderLink(tenant.id, w.id, origin, tenant.code).catch((e) => { console.error("online pay link", e); return dest; });
    }
  } catch (e) { return fail(e); }
  redirect(dest);
}

// ---------------- SMS OTP for the customer's mobile (off until an SMS provider is connected) ----------------
const otpHash = (tid: number, phone: string, code: string) =>
  crypto.createHmac("sha256", process.env.AUTH_SECRET ?? "").update(`${tid}:${phone}:${code}`).digest("hex");

export async function sendPhoneOtpAction(code: string, phone: string): Promise<R> {
  try {
    const store = await loadStorefront(code);
    if (!store || !store.config.otp) throw new Error("OTP is not available.");
    const tid = store.tenant.id;
    const p10 = String(phone ?? "").replace(/\D/g, "").slice(-10);
    if (!/^[6-9]\d{9}$/.test(p10)) throw new Error("Please enter a valid 10-digit mobile number.");
    const ip = await clientIp();
    const keys = [`otp-phone:${tid}:${p10}`, `otp-ip:${ip}`];
    await assertNotLocked(keys).catch(() => { throw new Error("Too many codes requested. Please wait a few minutes."); });
    const last = await db.query.phoneOtps.findFirst({ where: and(eq(schema.phoneOtps.tenantId, tid), eq(schema.phoneOtps.phone, p10)), orderBy: (t, { desc }) => [desc(t.id)] });
    const age = last ? Date.now() - last.createdAt.getTime() : Infinity;
    if (age >= 0 && age < 45_000) throw new Error("A code was just sent. Please wait a moment before asking again.");
    const otp = String(crypto.randomInt(100000, 1000000));
    const [row] = await db.insert(schema.phoneOtps).values({ tenantId: tid, phone: p10, codeHash: otpHash(tid, p10, otp), expiresAt: new Date(Date.now() + 10 * 60_000) }).returning({ id: schema.phoneOtps.id });
    try {
      await sendSms(p10, `${otp} is your code to order from ${store.config.name}. It is valid for 10 minutes.`);
    } catch (e) {
      await db.delete(schema.phoneOtps).where(eq(schema.phoneOtps.id, row.id));
      throw e;
    }
    await recordFailure([{ key: keys[0], limit: 5 }, { key: keys[1], limit: 20 }]); // counts codes sent
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function verifyPhoneOtpAction(code: string, phone: string, otp: string): Promise<R> {
  try {
    const store = await loadStorefront(code);
    if (!store || !store.config.otp || !smsReady()) throw new Error("OTP is not available.");
    const tid = store.tenant.id;
    const p10 = String(phone ?? "").replace(/\D/g, "").slice(-10);
    const row = await db.query.phoneOtps.findFirst({ where: and(eq(schema.phoneOtps.tenantId, tid), eq(schema.phoneOtps.phone, p10), eq(schema.phoneOtps.used, false)), orderBy: (t, { desc }) => [desc(t.id)] });
    if (!row || row.expiresAt < new Date()) throw new Error("Code expired. Please ask for a new one.");
    if (row.attempts >= 5) throw new Error("Too many wrong tries. Please ask for a new code.");
    const a = Buffer.from(otpHash(tid, p10, String(otp ?? "").replace(/\D/g, ""))), b = Buffer.from(row.codeHash);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      await db.update(schema.phoneOtps).set({ attempts: sql`${schema.phoneOtps.attempts} + 1` }).where(eq(schema.phoneOtps.id, row.id));
      throw new Error("Wrong code. Please check the SMS and try again.");
    }
    await db.update(schema.phoneOtps).set({ used: true }).where(eq(schema.phoneOtps.id, row.id));
    (await cookies()).set(PHONE_COOKIE, await signPhone(tid, p10), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 90 * 86400 });
    return { ok: true };
  } catch (e) { return fail(e); }
}

const PROOF_TYPES = ["image/jpeg", "image/png", "image/webp"];
/** Customer attaches a screenshot of their UPI payment (optional). Only staff can see it. */
export async function addPaymentProofAction(code: string, token: string, fd: FormData): Promise<R> {
  try {
    const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.code, String(code).toLowerCase()) });
    const o = t && /^[\w-]{16,40}$/.test(token) ? await db.query.onlineOrders.findFirst({ where: and(eq(schema.onlineOrders.token, token), eq(schema.onlineOrders.tenantId, t.id)) }) : null;
    if (!o) throw new Error("Order not found.");
    if (o.status !== "NEW") throw new Error("The restaurant has already handled this order.");
    const f = fd.get("file");
    if (!(f instanceof Blob)) throw new Error("No photo received.");
    if (!PROOF_TYPES.includes(f.type)) throw new Error("Please choose a photo (JPG or PNG).");
    if (f.size > 1_500_000) throw new Error("The photo is too large. Please try again.");
    const ip = await clientIp();
    const key = `proof-ip:${ip}`;
    await assertNotLocked([key]).catch(() => { throw new Error("Too many uploads. Please wait a few minutes."); });
    const [img] = await db.insert(schema.images).values({ tenantId: o.tenantId, mime: f.type, data: Buffer.from(await f.arrayBuffer()), width: Number(fd.get("w")) || null, height: Number(fd.get("h")) || null }).returning({ id: schema.images.id });
    await db.update(schema.onlineOrders).set({ payProofImageId: img.id }).where(eq(schema.onlineOrders.id, o.id));
    if (o.payProofImageId) await db.delete(schema.images).where(and(eq(schema.images.id, o.payProofImageId), eq(schema.images.tenantId, o.tenantId)));
    await recordFailure([{ key, limit: 20 }]); // counts uploads
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
      const notes = [`Online order (${claimed.phone})`, Number(claimed.discount) > 0 ? "Pickup discount" : "", delivery && claimed.address ? `Deliver to: ${claimed.address}` : "", claimed.notes].filter(Boolean).join(" · ").slice(0, 500);
      const orderId = await saveOrder(u.tenantId, {
        date: claimed.date < todayIST() ? todayIST() : claimed.date,
        customerId: claimed.customerId, orderType,
        // keep the price the customer saw (includes the online-payment price when they paid online)
        items: lines.map((l) => ({ menuItemId: l.menuItemId, qty: l.qty, discount: 0, rate: Number(l.rate) })),
        deliveryCharge: delivery ? Number(s?.defaultDeliveryCharge ?? 0) : 0, packingCharge: 0, orderDiscount: Number(claimed.discount ?? 0),
        notes, isPreorder: claimed.isPreorder, mealSlot: claimed.mealSlot, slotTime: claimed.slotTime,
        kot: kotAnyOn(u.features), kotScreen: kotScreenOn(u.features),
      }, u.id);
      if (Number(claimed.paidOnline) > 0 && claimed.payLinkId) {
        // already paid through the gateway: put it on the bill (same reference, so a late webhook can't add it twice)
        const o = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) });
        if (o) await db.insert(schema.payments).values({
          tenantId: u.tenantId, orderId, customerId: o.customerId, amount: round2(Math.min(Number(claimed.paidOnline), Number(o.total) + 0.5)),
          mode: `Online (${GATEWAY_LABEL[(claimed.payLinkProvider || "razorpay") as Gateway]})`, date: todayIST(), ref: claimed.payLinkId, notes: "Paid online with the order",
        });
      } else if (upiReceived) {
        const o = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) });
        if (o) await db.insert(schema.payments).values({
          tenantId: u.tenantId, orderId, customerId: o.customerId, amount: round2(Number(o.total)), mode: "UPI", date: todayIST(),
          notes: "Online order - paid by UPI (checked by staff)",
        });
      }
      // carry the customer's delivery-location pin (if shared at checkout) onto the bill, for live ETA
      if (delivery && claimed.destLat && claimed.destLng) {
        await db.update(schema.orders).set({ destLat: claimed.destLat, destLng: claimed.destLng }).where(eq(schema.orders.id, orderId));
      }
      await db.update(schema.onlineOrders).set({ status: "ACCEPTED", orderId }).where(eq(schema.onlineOrders.id, id));
      revalidatePath("/online-orders"); revalidatePath("/orders"); revalidatePath("/kot"); revalidatePath("/");
      return { ok: true, data: orderId };
    } catch (e) {
      await db.update(schema.onlineOrders).set({ status: "NEW", decidedById: null, decidedAt: null }).where(eq(schema.onlineOrders.id, id));
      throw e;
    }
  } catch (e) { return fail(e); }
}

export async function rejectOnlineOrderAction(id: number, reason: string, block = false): Promise<R> {
  try {
    const u = await requireAction("onlineOrders");
    const why = clean(reason, 200);
    if (why.length < 3) throw new Error("Write a short reason - the customer sees it.");
    const [r] = await db.update(schema.onlineOrders).set({ status: "REJECTED", rejectReason: why, decidedById: u.id, decidedAt: new Date() })
      .where(and(eq(schema.onlineOrders.id, id), eq(schema.onlineOrders.tenantId, u.tenantId), eq(schema.onlineOrders.status, "NEW"))).returning({ id: schema.onlineOrders.id, customerId: schema.onlineOrders.customerId });
    if (!r) throw new Error("This order was already handled.");
    if (block && r.customerId) await db.update(schema.customers).set({ onlineBlocked: true }).where(and(eq(schema.customers.id, r.customerId), eq(schema.customers.tenantId, u.tenantId)));
    revalidatePath("/online-orders"); revalidatePath("/");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function saveOnlineSettingsAction(v: Record<string, string>): Promise<R> {
  try {
    const u = await requireAction("settings");
    const min = Number(v.onlineMinOrder || 0);
    if (!Number.isFinite(min) || min < 0) throw new Error("Minimum order must be a number.");
    const pickPct = Number(v.pickupDiscountPct || 0);
    if (!Number.isFinite(pickPct) || pickPct < 0 || pickPct > 50) throw new Error("Pickup discount must be between 0 and 50 %.");
    if (v.pickupDiscountOn === "true" && !(pickPct > 0)) throw new Error("Enter the pickup discount % (or switch it off).");
    const markup = Number(v.onlinePayMarkup || 0);
    if (!Number.isFinite(markup) || markup < 0 || markup > 25) throw new Error("Online payment price increase must be between 0 and 25 %.");
    const newMax = Number(v.onlineNewMax || 0);
    if (!Number.isFinite(newMax) || newMax < 0) throw new Error("First-order limit must be a number.");
    if (v.onlinePayUpi !== "true" && v.onlinePayCash !== "true") throw new Error("Choose at least one way customers can pay.");
    await db.update(schema.settings).set({
      onlineOpen: v.onlineOpen === "true", onlineClosedMsg: clean(v.onlineClosedMsg, 200), onlineNote: clean(v.onlineNote, 300),
      onlineDelivery: v.onlineDelivery === "true", onlineTakeaway: v.onlineTakeaway === "true", onlinePreorder: v.onlinePreorder === "true",
      onlineMinOrder: round2(min), onlineNewMax: round2(newMax), onlinePayMarkup: round2(markup), pickupDiscountOn: v.pickupDiscountOn === "true", pickupDiscountPct: round2(pickPct),
      onlinePayUpi: v.onlinePayUpi === "true", onlinePayCash: v.onlinePayCash === "true", onlineOtp: v.onlineOtp === "true" && smsReady(),
      onlineDeliveryType: clean(v.onlineDeliveryType, 40) || "Delivery", onlineTakeawayType: clean(v.onlineTakeawayType, 40) || "Takeaway",
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

/** Block / unblock a customer's number from online ordering */
export async function setBlockedAction(customerId: number, blocked: boolean): Promise<R> {
  try {
    const u = await requireAction("onlineOrders");
    const [r] = await db.update(schema.customers).set({ onlineBlocked: blocked })
      .where(and(eq(schema.customers.id, customerId), eq(schema.customers.tenantId, u.tenantId))).returning({ id: schema.customers.id });
    if (!r) throw new Error("Customer not found.");
    revalidatePath("/online-orders");
    return { ok: true };
  } catch (e) { return fail(e); }
}
