"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db, schema } from "@/db";
import { requireAction } from "@/lib/auth";
import { checkPaymentLink, createPaymentLink } from "@/lib/gateway";
import { round2, todayIST } from "@/lib/format";
import { estimateEtaMin } from "@/lib/eta";

// Actions for the Delivery tab - the delivery person only needs the "Delivery" tab, not Orders & Bills.
type R<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: String((e as Error)?.message || e) });

async function deliveryOrder(tenantId: number, orderId: number) {
  const o = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)), with: { payments: true } });
  if (!o) throw new Error("Order not found.");
  if (o.status !== "ACTIVE") throw new Error("This bill is cancelled.");
  return { o, due: round2(Number(o.total) - o.payments.reduce((a, p) => a + Number(p.amount), 0)) };
}

/** Gateway QR / link for what is due */
export async function deliveryLinkAction(orderId: number): Promise<R<string>> {
  try {
    const u = await requireAction("delivery");
    if (!u.features.includes("paymentGateways")) throw new Error("Payment links are not in your plan.");
    await deliveryOrder(u.tenantId, orderId);
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? ""}`;
    const { url } = await createPaymentLink(u.tenantId, orderId, origin);
    return { ok: true, data: url };
  } catch (e) { return fail(e); }
}
export async function deliveryCheckAction(orderId: number): Promise<R<string>> {
  try {
    const u = await requireAction("delivery");
    const st = await checkPaymentLink(u.tenantId, orderId);
    revalidatePath("/delivery");
    return { ok: true, data: st };
  } catch (e) { return fail(e); }
}
/** Money collected at the door: cash, or UPI to the restaurant's QR */
export async function deliveryCollectAction(orderId: number, _amount: number, mode: string): Promise<R> {
  try {
    const u = await requireAction("delivery");
    const { o, due } = await deliveryOrder(u.tenantId, orderId);
    if (due <= 0.5) throw new Error("Nothing is due on this bill.");
    await db.insert(schema.payments).values({
      tenantId: u.tenantId, orderId, customerId: o.customerId, amount: due, mode: mode === "UPI" ? "UPI" : "Cash", date: todayIST(),
      notes: `Collected on delivery by ${u.name}`, createdById: u.id,
    });
    revalidatePath("/delivery"); revalidatePath(`/orders/${orderId}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}
/** Rider taps "Out for delivery" (or undoes it). */
export async function setOutForDeliveryAction(orderId: number, out: boolean): Promise<R> {
  try {
    const u = await requireAction("delivery");
    await deliveryOrder(u.tenantId, orderId);
    await db.update(schema.orders).set({ fulfilStatus: out ? "OUT" : "" }).where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, u.tenantId)));
    revalidatePath("/delivery"); revalidatePath(`/orders/${orderId}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Assign (or clear) the delivery person for an order. */
export async function assignRiderAction(orderId: number, riderId: number | null): Promise<R> {
  try {
    const u = await requireAction("delivery");
    await deliveryOrder(u.tenantId, orderId);
    await db.update(schema.orders).set({ riderId: riderId || null }).where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, u.tenantId)));
    revalidatePath("/delivery");
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Rider's phone shares its live location while out for delivery; we also recompute the ETA. */
export async function shareLocationAction(orderId: number, lat: number, lng: number): Promise<R> {
  try {
    const u = await requireAction("delivery");
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error("Bad location.");
    const o = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, u.tenantId)), columns: { destLat: true, destLng: true } });
    const eta = o ? estimateEtaMin(lat, lng, o.destLat ? Number(o.destLat) : null, o.destLng ? Number(o.destLng) : null) : null;
    await db.update(schema.orders).set({ trackLat: String(lat), trackLng: String(lng), trackAt: new Date(), ...(eta != null ? { etaMin: eta, etaAt: new Date() } : {}) })
      .where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, u.tenantId)));
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function deliveredAction(orderId: number, done: boolean): Promise<R> {
  try {
    const u = await requireAction("delivery");
    await deliveryOrder(u.tenantId, orderId);
    await db.update(schema.orders).set({ fulfilStatus: done ? "DELIVERED" : "", deliveredById: done ? u.id : null, deliveredAt: done ? new Date() : null }).where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, u.tenantId)));
    revalidatePath("/delivery"); revalidatePath("/preorders"); revalidatePath(`/orders/${orderId}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}
