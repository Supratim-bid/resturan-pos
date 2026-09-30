import "server-only";
import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { round2, todayIST } from "./format";

// ---- secrets at rest: AES-256-GCM with a key derived from AUTH_SECRET ----
function key() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET is missing");
  return crypto.createHash("sha256").update("gateway:" + s).digest();
}
export function sealSecret(plain: string) {
  if (!plain) return "";
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return "v1:" + Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64");
}
export function openSecret(sealed: string) {
  if (!sealed) return "";
  if (!sealed.startsWith("v1:")) return sealed;
  const b = Buffer.from(sealed.slice(3), "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
}

const RZP = "https://api.razorpay.com/v1";

async function rzp(tenantId: number) {
  const s = await db.query.settings.findFirst({ where: eq(schema.settings.tenantId, tenantId) });
  if (!s?.razorpayKeyId || !s.razorpayKeySecret) throw new Error("Razorpay is not set up. Owner: Settings → Online payments.");
  const auth = "Basic " + Buffer.from(`${s.razorpayKeyId}:${openSecret(s.razorpayKeySecret)}`).toString("base64");
  const call = async (path: string, init?: { method?: string; body?: unknown }) => {
    const r = await fetch(RZP + path, {
      method: init?.method ?? "GET",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    }).catch(() => { throw new Error("Could not reach Razorpay. Check the internet connection."); });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error("Razorpay: " + (j?.error?.description ?? `error ${r.status}`));
    return j;
  };
  return { s, call };
}

async function orderDue(tenantId: number, orderId: number) {
  const o = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)), with: { customer: true, payments: true } });
  if (!o) throw new Error("Order not found.");
  const paid = o.payments.reduce((a, p) => a + Number(p.amount), 0);
  return { o, due: round2(Number(o.total) - paid) };
}

/** Create (or reuse) a Razorpay payment link for what is due on this order */
export async function createPaymentLink(tenantId: number, orderId: number) {
  const { s, call } = await rzp(tenantId);
  const { o, due } = await orderDue(tenantId, orderId);
  if (o.status !== "ACTIVE") throw new Error("This bill is cancelled.");
  if (due <= 0.5) throw new Error("Nothing is due on this bill.");
  // reuse an open link for the same amount
  if (o.payLinkId && o.payLinkStatus === "created" && Math.abs(Number(o.payLinkAmount ?? 0) - due) < 0.01) return o.payLinkShort;
  if (o.payLinkId && o.payLinkStatus === "created") await call(`/payment_links/${o.payLinkId}/cancel`, { method: "POST" }).catch(() => {});
  const phone = (o.customer?.phone ?? "").replace(/\D/g, "").slice(-10);
  const link = await call("/payment_links", {
    method: "POST",
    body: {
      amount: Math.round(due * 100), currency: "INR", accept_partial: false,
      description: `${s.name} - Bill ${o.billNo}`.slice(0, 250),
      reference_id: `${o.billNo}-${Date.now().toString(36)}`.slice(0, 40),
      customer: o.customer ? { name: o.customer.name, ...(phone.length === 10 ? { contact: "+91" + phone } : {}), ...(o.customer.email ? { email: o.customer.email } : {}) } : undefined,
      notify: { sms: false, email: false }, reminder_enable: false,
      notes: { tenant_id: String(tenantId), order_id: String(o.id), bill_no: o.billNo },
    },
  });
  await db.update(schema.orders).set({ payLinkId: link.id, payLinkShort: link.short_url, payLinkAmount: due, payLinkStatus: link.status })
    .where(and(eq(schema.orders.id, o.id), eq(schema.orders.tenantId, tenantId)));
  return link.short_url as string;
}

/** Record whatever was paid on a link (safe to call many times) */
export async function recordLinkPayment(tenantId: number, orderId: number, linkId: string, amountPaidPaise: number, status: string) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${tenantId}, ${orderId})`);
    const o = await tx.query.orders.findFirst({ where: and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)) });
    if (!o || o.payLinkId !== linkId) return;
    const [{ got }] = await tx.select({ got: sql<number>`coalesce(sum(${schema.payments.amount}),0)` }).from(schema.payments)
      .where(and(eq(schema.payments.tenantId, tenantId), eq(schema.payments.orderId, orderId), eq(schema.payments.ref, linkId)));
    const add = round2(amountPaidPaise / 100 - Number(got));
    if (add > 0) {
      await tx.insert(schema.payments).values({ tenantId, orderId, customerId: o.customerId, amount: add, mode: "Online (Razorpay)", date: todayIST(), ref: linkId, notes: "Razorpay payment link" });
    }
    await tx.update(schema.orders).set({ payLinkStatus: status }).where(eq(schema.orders.id, orderId));
  });
}

/** Ask Razorpay whether the link was paid */
export async function checkPaymentLink(tenantId: number, orderId: number) {
  const { call } = await rzp(tenantId);
  const { o } = await orderDue(tenantId, orderId);
  if (!o.payLinkId) throw new Error("No payment link on this bill yet.");
  const link = await call(`/payment_links/${o.payLinkId}`);
  await recordLinkPayment(tenantId, orderId, o.payLinkId, Number(link.amount_paid ?? 0), String(link.status));
  return String(link.status);
}

export function verifyWebhook(raw: string, signature: string, secret: string) {
  const exp = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(exp), b = Buffer.from(signature || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
