"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db, schema } from "@/db";
import { requireAction } from "@/lib/auth";
import { canEditAnyOrder } from "@/lib/permissions";
import { saveOrder, cancelOrder, restoreOrder, settleCancelledMoney, receiveCustomerPayment, type OrderInput } from "@/lib/orders";
import { round2, todayIST } from "@/lib/format";
import { checkPaymentLink, createPaymentLink } from "@/lib/gateway";

type R<T = undefined> = { ok: true; data?: T; warning?: string } | { ok: false; error: string };
const fail = (e: unknown) => ({ ok: false as const, error: String((e as Error)?.message ?? e).replace(/^Error:\s*/, "") });

export async function saveOrderAction(input: OrderInput): Promise<R<number>> {
  try {
    const u = await requireAction("newOrder");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Pick a valid date.");
    if (!input.orderType) throw new Error("Pick the order type.");
    if (input.isPreorder && !u.features.includes("preorders")) {
      const prev = input.id ? await db.query.orders.findFirst({ where: and(eq(schema.orders.id, input.id), eq(schema.orders.tenantId, u.tenantId)) }) : null;
      if (!prev?.isPreorder) throw new Error("Pre-orders are not switched on for this restaurant. Ask your app provider.");
    }
    if (input.id) {
      const o = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, input.id), eq(schema.orders.tenantId, u.tenantId)) });
      if (!o) throw new Error("Order not found.");
      if (o.status !== "ACTIVE") throw new Error("This bill is cancelled and can't be edited.");
      if (o.cancelStatus === "REQUESTED") throw new Error("A cancellation request is pending for this bill - it can't be edited until the owner decides.");
      const upcoming = o.isPreorder && o.date >= todayIST();
      if (!canEditAnyOrder(u) && o.date !== todayIST() && !upcoming) throw new Error("Only today's orders and upcoming pre-orders can be edited from this login.");
      if (!canEditAnyOrder(u) && !(input.isPreorder && input.date >= todayIST())) input.date = o.date;
    } else if (!canEditAnyOrder(u) && input.date !== todayIST() && !(input.isPreorder && input.date > todayIST())) {
      throw new Error("This login can only create orders for today (or pre-orders for a later date).");
    }
    if (input.isPreorder && !input.id && input.date < todayIST()) throw new Error("A pre-order must be for today or a later date.");
    input.kot = !!input.kot && u.features.includes("kot");
    // prices always come from the menu (or the bill's own earlier prices) - never from the browser
    input.items = (input.items ?? []).map((i) => ({ menuItemId: i.menuItemId, qty: i.qty, discount: i.discount }));
    const id = await saveOrder(u.tenantId, input, u.id);
    revalidatePath("/orders"); revalidatePath("/kot");
    return { ok: true, data: id };
  } catch (e) { return fail(e); }
}

async function ownOrder(tenantId: number, orderId: number) {
  const o = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)) });
  if (!o) throw new Error("Order not found.");
  return o;
}

/** Staff: ask for a bill to be cancelled. The bill stays active (and counted) until someone with permission approves. */
export async function requestCancelAction(orderId: number, reason: string): Promise<R> {
  try {
    const u = await requireAction("orders");
    const o = await ownOrder(u.tenantId, orderId);
    if (o.status !== "ACTIVE") throw new Error("This bill is already cancelled.");
    if (o.cancelStatus === "REQUESTED") throw new Error("A cancellation request is already waiting for approval.");
    if (reason.trim().length < 3) throw new Error("Please write the reason for cancelling.");
    await db.update(schema.orders).set({
      cancelStatus: "REQUESTED", cancelReason: reason.trim().slice(0, 300), cancelRequestedById: u.id, cancelRequestedAt: new Date(),
      cancelDecidedById: null, cancelDecidedAt: null, cancelNote: "",
    }).where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, u.tenantId)));
    revalidatePath(`/orders/${orderId}`); revalidatePath("/orders"); revalidatePath("/");
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Owner / approver: approve or reject a pending request */
export async function decideCancelAction(orderId: number, approve: boolean, note: string, money: "REFUND" | "ADVANCE" = "REFUND"): Promise<R> {
  try {
    const u = await requireAction("approveCancel");
    const o = await ownOrder(u.tenantId, orderId);
    if (o.cancelStatus !== "REQUESTED") throw new Error("There is no pending cancellation request on this bill.");
    await db.update(schema.orders).set({
      cancelStatus: approve ? "APPROVED" : "REJECTED", cancelDecidedById: u.id, cancelDecidedAt: new Date(), cancelNote: note.trim().slice(0, 300),
    }).where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, u.tenantId)));
    if (approve) {
      try { await cancelOrder(u.tenantId, orderId, money); }
      catch (e) { // put the request back so it can be decided again
        await db.update(schema.orders).set({ cancelStatus: "REQUESTED", cancelDecidedById: null, cancelDecidedAt: null }).where(eq(schema.orders.id, orderId));
        throw e;
      }
    }
    revalidatePath(`/orders/${orderId}`); revalidatePath("/orders"); revalidatePath("/");
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Approver: cancel directly (with a reason) or restore a cancelled bill */
export async function setStatusAction(orderId: number, status: "ACTIVE" | "CANCELLED", reason = "", money: "REFUND" | "ADVANCE" = "REFUND"): Promise<R> {
  try {
    const u = await requireAction("approveCancel");
    const o = await ownOrder(u.tenantId, orderId);
    if (status === "CANCELLED") {
      if (reason.trim().length < 3) throw new Error("Please write the reason for cancelling.");
      await db.update(schema.orders).set({
        cancelStatus: "APPROVED", cancelReason: reason.trim().slice(0, 300), cancelRequestedById: o.cancelRequestedById ?? u.id,
        cancelRequestedAt: o.cancelRequestedAt ?? new Date(), cancelDecidedById: u.id, cancelDecidedAt: new Date(),
      }).where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, u.tenantId)));
    } else {
      await db.update(schema.orders).set({ cancelStatus: "", cancelNote: `Restored by ${u.name}` })
        .where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, u.tenantId)));
    }
    if (status === "CANCELLED") {
      if (o.status === "CANCELLED") throw new Error("This bill is already cancelled.");
      const prev = { cancelStatus: o.cancelStatus, cancelReason: o.cancelReason, cancelDecidedById: o.cancelDecidedById, cancelDecidedAt: o.cancelDecidedAt };
      try { await cancelOrder(u.tenantId, orderId, money); }
      catch (e) { await db.update(schema.orders).set(prev).where(eq(schema.orders.id, orderId)); throw e; }
    } else {
      if (o.status !== "CANCELLED") throw new Error("This bill is not cancelled.");
      await restoreOrder(u.tenantId, orderId);
    }
    revalidatePath(`/orders/${orderId}`); revalidatePath("/orders"); revalidatePath("/");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function addPaymentAction(orderId: number, amount: number, mode: string, date: string): Promise<R> {
  try {
    const u = await requireAction("orders");
    if (!(amount > 0)) throw new Error("Enter an amount.");
    if (!mode) throw new Error("Pick how it was paid.");
    const o = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, u.tenantId)) });
    if (!o) throw new Error("Order not found.");
    if (o.status !== "ACTIVE") throw new Error("This bill is cancelled - no payments can be added.");
    await db.insert(schema.payments).values({ tenantId: u.tenantId, orderId, customerId: o.customerId, amount: round2(amount), mode, date: date || todayIST() });
    revalidatePath(`/orders/${orderId}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function deletePaymentAction(paymentId: number): Promise<R> {
  try {
    const u = await requireAction("orders");
    if (!canEditAnyOrder(u)) throw new Error("You don't have permission to delete payments.");
    await db.delete(schema.payments).where(and(eq(schema.payments.id, paymentId), eq(schema.payments.tenantId, u.tenantId)));
    revalidatePath("/orders");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function receivePaymentAction(customerId: number, amount: number, mode: string, date: string, notes: string): Promise<R> {
  try {
    const u = await requireAction("customers");
    if (!(amount > 0)) throw new Error("Enter an amount.");
    if (!mode) throw new Error("Pick how it was paid.");
    await receiveCustomerPayment(u.tenantId, customerId, amount, mode, date || todayIST(), notes);
    revalidatePath(`/customers/${customerId}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function quickCustomerAction(c: { name: string; phone: string; flat: string; area: string }): Promise<R<{ id: number; label: string }>> {
  try {
    const u = await requireAction("newOrder");
    const name = c.name.trim();
    if (!name) throw new Error("Enter the customer's name.");
    const dup = await db.query.customers.findFirst({ where: and(eq(schema.customers.tenantId, u.tenantId), eq(schema.customers.name, name), eq(schema.customers.phone, c.phone.trim())) });
    if (dup) return { ok: true, data: { id: dup.id, label: dup.name } };
    const [row] = await db.insert(schema.customers).values({ tenantId: u.tenantId, name, phone: c.phone.trim(), flat: c.flat.trim(), area: c.area.trim() }).returning();
    return { ok: true, data: { id: row.id, label: row.name } };
  } catch (e) { return fail(e); }
}

/** Payment gateway (Razorpay / Instamojo / Cashfree): make a payment link for what's due (reuses an open one) */
export async function createPayLinkAction(orderId: number, phone = ""): Promise<R<string>> {
  try {
    const u = await requireAction("orders");
    if (!u.features.includes("paymentGateways")) throw new Error("Payment links are not in your plan.");
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? ""}`;
    const p = String(phone ?? "").replace(/\D/g, "").slice(-10);
    if (p && !/^[6-9]\d{9}$/.test(p)) throw new Error("Enter a 10-digit mobile number, or leave it empty.");
    const { url, phoneCheck } = await createPaymentLink(u.tenantId, orderId, origin, p);
    revalidatePath(`/orders/${orderId}`);
    return { ok: true, data: url, ...(phoneCheck === "invalid" ? { warning: "The payment gateway says this mobile number is not valid, so the link was made without it. Check the number with the customer." } : {}) };
  } catch (e) { return fail(e); }
}

/** Ask the gateway whether the link was paid and record the payment */
export async function checkPayLinkAction(orderId: number): Promise<R<string>> {
  try {
    const u = await requireAction("orders");
    const st = await checkPaymentLink(u.tenantId, orderId);
    revalidatePath(`/orders/${orderId}`); revalidatePath("/orders");
    return { ok: true, data: st };
  } catch (e) { return fail(e); }
}

/** Pre-orders: PENDING -> READY -> DELIVERED */
export async function setFulfilAction(orderId: number, st: "PENDING" | "READY" | "DELIVERED"): Promise<R> {
  try {
    const u = await requireAction("preorders").catch(() => requireAction("orders")); // kitchen may only have the Pre-orders tab
    if (!["PENDING", "READY", "DELIVERED"].includes(st)) throw new Error("Unknown status.");
    const o = await ownOrder(u.tenantId, orderId);
    if (!o.isPreorder) throw new Error("This is not a pre-order.");
    await db.update(schema.orders).set({ fulfilStatus: st }).where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, u.tenantId)));
    revalidatePath("/preorders"); revalidatePath(`/orders/${orderId}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Cancelled earlier with money still on it: refund or keep as advance */
export async function settleCancelledMoneyAction(orderId: number, money: "REFUND" | "ADVANCE"): Promise<R> {
  try {
    const u = await requireAction("approveCancel");
    await settleCancelledMoney(u.tenantId, orderId, money);
    revalidatePath(`/orders/${orderId}`); revalidatePath("/orders");
    return { ok: true };
  } catch (e) { return fail(e); }
}
