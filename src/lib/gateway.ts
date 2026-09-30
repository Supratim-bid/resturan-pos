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

export type Gateway = "razorpay" | "instamojo" | "cashfree";
export const GATEWAY_LABEL: Record<Gateway, string> = { razorpay: "Razorpay", instamojo: "Instamojo", cashfree: "Cashfree" };
type S = typeof schema.settings.$inferSelect;

/** Which gateway this restaurant uses for payment links ("" = none / not fully set up) */
export function activeGateway(s: S | null | undefined): Gateway | "" {
  if (!s) return "";
  const g = s.payGateway as Gateway | "";
  if (g === "razorpay" && s.razorpayKeyId && s.razorpayKeySecret) return g;
  if (g === "instamojo" && s.instamojoClientId && s.instamojoClientSecret) return g;
  if (g === "cashfree" && s.cashfreeAppId && s.cashfreeSecret) return g;
  return "";
}

async function settingsOf(tenantId: number) {
  const s = await db.query.settings.findFirst({ where: eq(schema.settings.tenantId, tenantId) });
  if (!s) throw new Error("Restaurant settings missing.");
  return s;
}

async function http(name: string, url: string, init: RequestInit) {
  const r = await fetch(url, { ...init, cache: "no-store" }).catch(() => { throw new Error(`Could not reach ${name}. Check the internet connection.`); });
  const text = await r.text();
  let j: Record<string, unknown> = {};
  try { j = text ? JSON.parse(text) : {}; } catch { /* not json */ }
  if (!r.ok) {
    const e = j as { error?: { description?: string } | string; message?: string; error_description?: string };
    const why = typeof e.error === "object" ? e.error?.description : e.message || e.error_description || (typeof e.error === "string" ? e.error : "");
    throw new Error(`${name}: ${why || `error ${r.status}`}`);
  }
  return j as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

// ---------------- Razorpay ----------------
const RZP = () => process.env.RAZORPAY_API_BASE || "https://api.razorpay.com/v1";
function rzp(s: S) {
  if (!s.razorpayKeyId || !s.razorpayKeySecret) throw new Error("Razorpay is not set up. Owner: Settings → Online payments.");
  const auth = "Basic " + Buffer.from(`${s.razorpayKeyId}:${openSecret(s.razorpayKeySecret)}`).toString("base64");
  return (path: string, init?: { method?: string; body?: unknown }) => http("Razorpay", RZP() + path, {
    method: init?.method ?? "GET", headers: { Authorization: auth, "Content-Type": "application/json" }, body: init?.body ? JSON.stringify(init.body) : undefined,
  });
}

// ---------------- Instamojo (v2, OAuth client credentials) ----------------
const IM = (test: boolean) => ({
  token: process.env.INSTAMOJO_TOKEN_URL || (test ? "https://test.instamojo.com/oauth2/token/" : "https://www.instamojo.com/oauth2/token/"),
  api: process.env.INSTAMOJO_API_BASE || (test ? "https://test.instamojo.com/v2" : "https://api.instamojo.com/v2"),
});
async function instamojo(s: S) {
  if (!s.instamojoClientId || !s.instamojoClientSecret) throw new Error("Instamojo is not set up. Owner: Settings → Online payments.");
  const u = IM(s.instamojoTest);
  const tok = await http("Instamojo", u.token, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: s.instamojoClientId, client_secret: openSecret(s.instamojoClientSecret) }).toString(),
  });
  if (!tok.access_token) throw new Error("Instamojo: could not log in - check the Client ID and secret.");
  const auth = `Bearer ${tok.access_token}`;
  return (path: string, form?: Record<string, string>) => http("Instamojo", u.api + path, {
    method: form ? "POST" : "GET", headers: { Authorization: auth, ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
}
/** Instamojo webhook check: HMAC-SHA1 of the values (sorted by key, joined by "|") with the private salt */
export function verifyInstamojoMac(fields: Record<string, string>, salt: string) {
  const mac = fields.mac ?? "";
  const msg = Object.keys(fields).filter((k) => k !== "mac").sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).map((k) => fields[k]).join("|");
  const exp = crypto.createHmac("sha1", salt).update(msg).digest("hex");
  const a = Buffer.from(exp), b = Buffer.from(mac);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------------- Cashfree (Payment Links) ----------------
const CF = (test: boolean) => process.env.CASHFREE_API_BASE || (test ? "https://sandbox.cashfree.com/pg" : "https://api.cashfree.com/pg");
const CF_VERSION = "2023-08-01";
function cashfree(s: S) {
  if (!s.cashfreeAppId || !s.cashfreeSecret) throw new Error("Cashfree is not set up. Owner: Settings → Online payments.");
  const h = { "x-client-id": s.cashfreeAppId, "x-client-secret": openSecret(s.cashfreeSecret), "x-api-version": CF_VERSION, "Content-Type": "application/json" };
  return (path: string, body?: unknown) => http("Cashfree", CF(s.cashfreeTest) + path, { method: body ? "POST" : "GET", headers: h, body: body ? JSON.stringify(body) : undefined });
}
/** Cashfree webhook check: base64(HMAC-SHA256(timestamp + raw body, secret key)) */
export function verifyCashfreeSignature(raw: string, timestamp: string, signature: string, secret: string) {
  const exp = crypto.createHmac("sha256", secret).update(timestamp + raw).digest("base64");
  const a = Buffer.from(exp), b = Buffer.from(signature || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------------- common ----------------
async function orderDue(tenantId: number, orderId: number) {
  const o = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)), with: { customer: true, payments: true } });
  if (!o) throw new Error("Order not found.");
  const paid = o.payments.reduce((a, p) => a + Number(p.amount), 0);
  return { o, due: round2(Number(o.total) - paid) };
}
const OPEN: Record<string, string[]> = { razorpay: ["created"], instamojo: ["Pending", "Sent"], cashfree: ["ACTIVE"] };
const isOpen = (provider: string, status: string) => (OPEN[provider] ?? []).includes(status);

/** Create (or reuse) a payment link for what is due on this order, with the restaurant's chosen gateway */
export async function createPaymentLink(tenantId: number, orderId: number, origin = "") {
  const s = await settingsOf(tenantId);
  const g = activeGateway(s);
  if (!g) throw new Error("No payment gateway is set up. Owner: Settings → Online payments.");
  const { o, due } = await orderDue(tenantId, orderId);
  if (o.status !== "ACTIVE") throw new Error("This bill is cancelled.");
  if (due <= 0.5) throw new Error("Nothing is due on this bill.");
  // reuse an open link of the same gateway for the same amount
  if (o.payLinkId && o.payLinkProvider === g && isOpen(g, o.payLinkStatus) && Math.abs(Number(o.payLinkAmount ?? 0) - due) < 0.01) return o.payLinkShort;
  if (o.payLinkId && o.payLinkProvider === "razorpay" && o.payLinkStatus === "created" && s.razorpayKeyId && s.razorpayKeySecret) {
    await rzp(s)(`/payment_links/${o.payLinkId}/cancel`, { method: "POST" }).catch(() => {});
  }
  const phone = (o.customer?.phone ?? "").replace(/\D/g, "").slice(-10);
  const purpose = `${s.name} - Bill ${o.billNo}`.slice(0, 30);
  const https = /^https:\/\//.test(origin);
  let id = "", url = "", status = "";
  if (g === "razorpay") {
    const link = await rzp(s)("/payment_links", {
      method: "POST",
      body: {
        amount: Math.round(due * 100), currency: "INR", accept_partial: false,
        description: `${s.name} - Bill ${o.billNo}`.slice(0, 250), reference_id: `${o.billNo}-${Date.now().toString(36)}`.slice(0, 40),
        customer: o.customer ? { name: o.customer.name, ...(phone.length === 10 ? { contact: "+91" + phone } : {}), ...(o.customer.email ? { email: o.customer.email } : {}) } : undefined,
        notify: { sms: false, email: false }, reminder_enable: false,
        notes: { tenant_id: String(tenantId), order_id: String(o.id), bill_no: o.billNo },
      },
    });
    id = link.id; url = link.short_url; status = link.status;
  } else if (g === "instamojo") {
    const call = await instamojo(s);
    const r = await call("/payment_requests/", {
      amount: due.toFixed(2), purpose, allow_repeated_payments: "false", send_email: "false", send_sms: "false",
      ...(o.customer?.name ? { buyer_name: o.customer.name.slice(0, 100) } : {}), ...(phone.length === 10 ? { phone } : {}),
      ...(https ? { webhook: `${origin}/api/pay/instamojo` } : {}),
    });
    id = r.id; url = r.longurl; status = r.status || "Pending";
  } else {
    const linkId = `t${tenantId}o${o.id}-${Date.now().toString(36)}`;
    const own = (s.phone ?? "").replace(/\D/g, "").slice(-10);
    const r = await cashfree(s)("/links", {
      link_id: linkId, link_amount: due, link_currency: "INR", link_purpose: `${s.name} - Bill ${o.billNo}`.slice(0, 500),
      customer_details: { customer_phone: phone.length === 10 ? phone : own.length === 10 ? own : "9999999999", ...(o.customer?.name ? { customer_name: o.customer.name } : {}) },
      link_partial_payments: false, link_notify: { send_sms: false, send_email: false },
      link_notes: { tenant_id: String(tenantId), order_id: String(o.id), bill_no: o.billNo },
      ...(https ? { link_meta: { notify_url: `${origin}/api/pay/cashfree` } } : {}),
    });
    id = r.link_id || linkId; url = r.link_url; status = r.link_status || "ACTIVE";
  }
  if (!id || !url) throw new Error(`${GATEWAY_LABEL[g]}: no link came back. Check the keys.`);
  await db.update(schema.orders).set({ payLinkId: id, payLinkShort: url, payLinkAmount: due, payLinkStatus: status, payLinkProvider: g })
    .where(and(eq(schema.orders.id, o.id), eq(schema.orders.tenantId, tenantId)));
  return url;
}

/** Record whatever was paid on a link (safe to call many times) - amount in rupees */
export async function recordLinkPaid(tenantId: number, orderId: number, linkId: string, amountPaid: number, status: string) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${tenantId}, ${orderId})`);
    const o = await tx.query.orders.findFirst({ where: and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)) });
    if (!o || o.payLinkId !== linkId) return;
    const provider = (o.payLinkProvider || "razorpay") as Gateway;
    const [{ got }] = await tx.select({ got: sql<number>`coalesce(sum(${schema.payments.amount}),0)` }).from(schema.payments)
      .where(and(eq(schema.payments.tenantId, tenantId), eq(schema.payments.orderId, orderId), eq(schema.payments.ref, linkId)));
    const add = round2(amountPaid - Number(got));
    if (add > 0) {
      await tx.insert(schema.payments).values({ tenantId, orderId, customerId: o.customerId, amount: add, mode: `Online (${GATEWAY_LABEL[provider]})`, date: todayIST(), ref: linkId, notes: `${GATEWAY_LABEL[provider]} payment link` });
    }
    await tx.update(schema.orders).set({ payLinkStatus: status }).where(eq(schema.orders.id, orderId));
  });
}
/** Razorpay sends paise */
export const recordLinkPayment = (tenantId: number, orderId: number, linkId: string, amountPaidPaise: number, status: string) =>
  recordLinkPaid(tenantId, orderId, linkId, amountPaidPaise / 100, status);

/** Ask the gateway whether the link was paid, record it, and return a simple status */
export async function checkPaymentLink(tenantId: number, orderId: number): Promise<string> {
  const s = await settingsOf(tenantId);
  const { o } = await orderDue(tenantId, orderId);
  if (!o.payLinkId) throw new Error("No payment link on this bill yet.");
  const provider = (o.payLinkProvider || "razorpay") as Gateway;
  if (provider === "razorpay") {
    const link = await rzp(s)(`/payment_links/${o.payLinkId}`);
    await recordLinkPaid(tenantId, orderId, o.payLinkId, Number(link.amount_paid ?? 0) / 100, String(link.status));
    return String(link.status);
  }
  if (provider === "instamojo") {
    const r = await (await instamojo(s))(`/payment_requests/${o.payLinkId}/`);
    const st = String(r.status ?? "");
    const paid = st === "Completed" ? Number(r.amount ?? o.payLinkAmount ?? 0) : 0;
    await recordLinkPaid(tenantId, orderId, o.payLinkId, paid, st);
    return st === "Completed" ? "paid" : st.toLowerCase() || "pending";
  }
  const r = await cashfree(s)(`/links/${encodeURIComponent(o.payLinkId)}`);
  const st = String(r.link_status ?? "");
  await recordLinkPaid(tenantId, orderId, o.payLinkId, Number(r.link_amount_paid ?? 0), st);
  return st === "PAID" ? "paid" : st.toLowerCase();
}

export function verifyWebhook(raw: string, signature: string, secret: string) {
  const exp = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(exp), b = Buffer.from(signature || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
