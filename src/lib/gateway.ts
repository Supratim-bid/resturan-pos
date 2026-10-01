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
    const e = j as { error?: { description?: string } | string; message?: unknown; error_description?: string };
    // field errors like {"amount":["Ensure this value is greater than or equal to 9."]} or {"message":{"phone":["..."]}}
    const fields = (o: unknown): string => o && typeof o === "object" ? Object.entries(o as Record<string, unknown>)
      .filter(([k]) => !["success", "status"].includes(k))
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(" ") : typeof v === "object" ? fields(v) : String(v)}`).join("; ") : "";
    const why = typeof e.error === "object" ? e.error?.description
      : typeof e.message === "string" ? e.message
      : e.error_description || (typeof e.error === "string" ? e.error : "") || fields(e.message) || fields(j);
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

export type LinkReq = { amount: number; purpose: string; ref: string; phone?: string; origin?: string; returnUrl?: string; notes?: Record<string, string> };
/** phoneCheck: "ok" = the gateway accepted the customer's mobile, "invalid" = it refused it (or it isn't a mobile number), "" = not checked */
export type Link = { provider: Gateway; id: string; url: string; status: string; phoneCheck: "" | "ok" | "invalid" };

/** Make a payment link with the restaurant's gateway (used for bills and for customers' online orders) */
export async function createGatewayLink(tenantId: number, r: LinkReq): Promise<Link> {
  const s = await settingsOf(tenantId);
  const g = activeGateway(s);
  if (!g) throw new Error("No payment gateway is set up. Owner: Settings → Online payments.");
  // Only the customer's mobile is ever sent (never their name): the gateway pre-fills it and, by accepting or refusing it,
  // tells us whether it looks like a real number. Refused -> the link is made without it, and phoneCheck says "invalid".
  const cust = (r.phone ?? "").replace(/\D/g, "").slice(-10);
  const custOk = /^[6-9]\d{9}$/.test(cust);
  let phoneBad = !!r.phone && !custOk, phoneUsed = false;
  const isPhoneErr = (m: string) => /phone|contact|mobile/i.test(m);
  const https = /^https:\/\//.test(r.origin ?? "");
  const ret = r.returnUrl && /^https?:\/\//.test(r.returnUrl) ? r.returnUrl : "";
  let id = "", url = "", status = "";
  if (g === "razorpay") {
    const rzBody = (withPhone: boolean) => ({
      method: "POST" as const,
      body: {
        ...(withPhone && custOk ? { customer: { contact: "+91" + cust } } : {}),
        amount: Math.round(r.amount * 100), currency: "INR", accept_partial: false,
        description: r.purpose.slice(0, 250), reference_id: `${r.ref}-${Date.now().toString(36)}`.slice(0, 40),
        notify: { sms: false, email: false }, reminder_enable: false,
        notes: { tenant_id: String(tenantId), ...(r.notes ?? {}) },
        ...(ret ? { callback_url: ret, callback_method: "get" } : {}),
      },
    });
    let link: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    try { link = await rzp(s)("/payment_links", rzBody(true)); phoneUsed = custOk; }
    catch (e) {
      const m = String((e as Error).message);
      if (!custOk || /key|auth/i.test(m)) throw e;
      if (isPhoneErr(m)) phoneBad = true;
      link = await rzp(s)("/payment_links", rzBody(false));
    }
    id = link.id; url = link.short_url; status = link.status;
  } else if (g === "instamojo") {
    if (r.amount < 9) throw new Error("Instamojo: the smallest payment it allows is ₹9.");
    const call = await instamojo(s);
    const req = (withPhone: boolean, back: boolean) => ({
      ...(withPhone && custOk ? { phone: cust } : {}),
      amount: r.amount.toFixed(2), purpose: r.purpose.replace(/[^\w\s-]/g, "").slice(0, 30), allow_repeated_payments: "false", send_email: "false", send_sms: "false",
      ...(https ? { webhook: `${r.origin}/api/pay/instamojo` } : {}), ...(back && ret ? { redirect_url: ret } : {}),
    });
    // a refused mobile or return address -> try again without it
    let q: Record<string, any> | null = null; let first = ""; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const [withPhone, back] of [...(custOk ? [[true, true]] : []), [false, true], [false, false]] as [boolean, boolean][]) {
      try { q = await call("/payment_requests/", req(withPhone, back)); phoneUsed = withPhone; break; }
      catch (e) {
        const m = String((e as Error).message);
        if (/token|credential|client|unauthor|authentic/i.test(m)) throw e;
        if (withPhone && isPhoneErr(m)) phoneBad = true;
        first ||= m; console.error("instamojo request refused, retrying with less:", m);
      }
    }
    if (!q) throw new Error(first);
    id = q.id; url = q.longurl; status = q.status || "Pending";
  } else {
    const linkId = `t${tenantId}${r.ref}-${Date.now().toString(36)}`.replace(/[^\w-]/g, "").slice(0, 50);
    const own = (s.phone ?? "").replace(/\D/g, "").slice(-10);
    const meta: Record<string, string> = {};
    if (https) meta.notify_url = `${r.origin}/api/pay/cashfree`;
    if (ret) meta.return_url = ret;
    // Cashfree insists on a phone: the customer's if we have a good one, else the restaurant's own
    let usePhone = custOk;
    const cfPhone = () => usePhone ? cust : own.length === 10 ? own : "9999999999";
    const cf = async (path: string, mk: () => unknown) => {
      try { const out = await cashfree(s)(path, mk()); phoneUsed = usePhone; return out; }
      catch (e) {
        if (!usePhone || !isPhoneErr(String((e as Error).message))) throw e;
        usePhone = false; phoneBad = true;
        return cashfree(s)(path, mk());
      }
    };
    const body = (withMeta: boolean) => ({
      link_id: withMeta ? linkId : `${linkId}r`.slice(0, 50), link_amount: r.amount, link_currency: "INR", link_purpose: r.purpose.slice(0, 500),
      customer_details: { customer_phone: cfPhone() },
      link_partial_payments: false, link_notify: { send_sms: false, send_email: false },
      link_notes: { tenant_id: String(tenantId), ...(r.notes ?? {}) },
      ...(withMeta && Object.keys(meta).length ? { link_meta: meta } : {}),
    });
    let q: Record<string, any> | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any
    let linksOff = false;
    try {
      q = await cf("/links", () => body(true));
    } catch (e) {
      const m = String((e as Error).message);
      if (/not enabled|not approved|not activated/i.test(m)) linksOff = true; // Payment Links API not switched on for this account
      else if (!Object.keys(meta).length || /authentication|client|secret|credential/i.test(m)) throw e;
      else {
        // a return / notify address Cashfree won't accept (e.g. domain not whitelisted yet): make the link without them -
        // the customer's order page still checks the payment by itself
        console.error("cashfree link with return url failed, retrying without:", m);
        try { q = await cf("/links", () => body(false)); }
        catch (e2) { if (/not enabled|not approved|not activated/i.test(String((e2 as Error).message))) linksOff = true; else throw e2; }
      }
    }
    if (q) { id = q.link_id || linkId; url = q.link_url; status = q.link_status || "ACTIVE"; }
    else if (linksOff) {
      // fall back to Cashfree's standard checkout (Orders API - on for every live account); our own page opens it
      const orderId = `cfo_${linkId}`.slice(0, 45);
      const order = (withMeta: boolean) => ({
        order_id: orderId, order_amount: r.amount, order_currency: "INR", order_note: r.purpose.slice(0, 200),
        customer_details: { customer_id: `t${tenantId}`, customer_phone: cfPhone() },
        order_tags: { tenant_id: String(tenantId), ...(r.notes ?? {}) },
        ...(withMeta && Object.keys(meta).length ? { order_meta: { ...(meta.return_url ? { return_url: meta.return_url } : {}), ...(meta.notify_url ? { notify_url: meta.notify_url } : {}) } } : {}),
      });
      let o: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      try { o = await cf("/orders", () => order(true)); }
      catch (e) {
        if (!Object.keys(meta).length || /authentication|client|secret|credential/i.test(String((e as Error).message))) throw e;
        console.error("cashfree order with return url failed, retrying without:", (e as Error).message);
        o = await cf("/orders", () => order(false));
      }
      id = String(o.order_id || orderId); status = String(o.order_status || "ACTIVE");
      url = `${r.origin || ""}/api/pay/checkout/${encodeURIComponent(id)}`;
    }
  }
  if (!id || !url) throw new Error(`${GATEWAY_LABEL[g]}: no link came back. Check the keys.`);
  return { provider: g, id, url, status, phoneCheck: !r.phone ? "" : phoneBad ? "invalid" : phoneUsed ? "ok" : "" };
}

/** Cashfree checkout orders (used when the Payment Links API is off) carry this prefix */
export const isCfOrder = (id: string) => id.startsWith("cfo_");
/** What the checkout page needs: the payment session for a Cashfree order, or that it's already paid */
export async function cashfreeCheckout(id: string) {
  const tid = await tenantOfLink("cashfree", id);
  if (!tid || !isCfOrder(id)) return null;
  const s = await settingsOf(tid);
  const o = await cashfree(s)(`/orders/${encodeURIComponent(id)}`);
  const st = String(o.order_status ?? "");
  if (st === "PAID") await recordAnyLink("cashfree", id, Number(o.order_amount ?? 0), st, tid);
  return { status: st, session: String(o.payment_session_id ?? ""), amount: Number(o.order_amount ?? 0), test: !!s.cashfreeTest, name: s.name, returnUrl: String(o.order_meta?.return_url ?? "") };
}

/** Owner's "Test connection": make a ₹1 link to prove the keys and account work (nothing is charged unless someone pays it) */
export async function testGatewayLink(tenantId: number, origin: string) {
  const s = await settingsOf(tenantId);
  const g = activeGateway(s);
  if (!g) throw new Error("Choose a gateway and save its keys first.");
  const link = await createGatewayLink(tenantId, { amount: g === "instamojo" ? 10 : 1, purpose: `${s.name} - connection test`, ref: "test", origin, returnUrl: /^https:\/\//.test(origin) ? `${origin}/settings` : "", notes: { test: "1" } });
  const mode = g === "cashfree" && link.url.includes("/api/pay/checkout/") ? " using Cashfree Checkout (Payment Links API isn't enabled on your account - that's fine, checkout does the same job)" : "";
  return `${GATEWAY_LABEL[g]} works${mode}${(g === "cashfree" ? s.cashfreeTest : g === "instamojo" ? s.instamojoTest : false) ? " (TEST mode - switch it off for real payments)" : ""}. Test link for ₹${g === "instamojo" ? 10 : 1}: ${link.url}`;
}

/** Ask the gateway how much was paid on a link */
export async function linkStatus(tenantId: number, provider: Gateway, id: string, expected: number): Promise<{ status: string; paid: number; done: boolean }> {
  const s = await settingsOf(tenantId);
  if (provider === "razorpay") {
    const l = await rzp(s)(`/payment_links/${id}`);
    return { status: String(l.status), paid: Number(l.amount_paid ?? 0) / 100, done: l.status === "paid" };
  }
  if (provider === "instamojo") {
    const q = await (await instamojo(s))(`/payment_requests/${id}/`);
    const st = String(q.status ?? "");
    return { status: st, paid: st === "Completed" ? Number(q.amount ?? expected) : 0, done: st === "Completed" };
  }
  if (isCfOrder(id)) {
    const o = await cashfree(s)(`/orders/${encodeURIComponent(id)}`);
    const st = String(o.order_status ?? "");
    return { status: st, paid: st === "PAID" ? Number(o.order_amount ?? expected) : 0, done: st === "PAID" };
  }
  const q = await cashfree(s)(`/links/${encodeURIComponent(id)}`);
  return { status: String(q.link_status ?? ""), paid: Number(q.link_amount_paid ?? 0), done: q.link_status === "PAID" };
}

/** Create (or reuse) a payment link for what is due on this order, with the restaurant's chosen gateway */
export async function createPaymentLink(tenantId: number, orderId: number, origin = "", phone = "") {
  const s = await settingsOf(tenantId);
  const g = activeGateway(s);
  if (!g) throw new Error("No payment gateway is set up. Owner: Settings → Online payments.");
  const { o, due } = await orderDue(tenantId, orderId);
  if (o.status !== "ACTIVE") throw new Error("This bill is cancelled.");
  if (due <= 0.5) throw new Error("Nothing is due on this bill.");
  // reuse an open link of the same gateway for the same amount
  if (!phone && o.payLinkId && o.payLinkProvider === g && isOpen(g, o.payLinkStatus) && Math.abs(Number(o.payLinkAmount ?? 0) - due) < 0.01) return { url: o.payLinkShort, phoneCheck: "" as const };
  if (o.payLinkId && o.payLinkProvider === "razorpay" && o.payLinkStatus === "created" && s.razorpayKeyId && s.razorpayKeySecret) {
    await rzp(s)(`/payment_links/${o.payLinkId}/cancel`, { method: "POST" }).catch(() => {});
  }
  const link = await createGatewayLink(tenantId, {
    amount: due, purpose: `${s.name} - Bill ${o.billNo}`, ref: `o${o.id}`, phone,
    origin, notes: { order_id: String(o.id), bill_no: o.billNo },
  });
  await db.update(schema.orders).set({ payLinkId: link.id, payLinkShort: link.url, payLinkAmount: due, payLinkStatus: link.status, payLinkProvider: link.provider })
    .where(and(eq(schema.orders.id, o.id), eq(schema.orders.tenantId, tenantId)));
  return { url: link.url, phoneCheck: link.phoneCheck };
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
  const { o } = await orderDue(tenantId, orderId);
  if (!o.payLinkId) throw new Error("No payment link on this bill yet.");
  const provider = (o.payLinkProvider || "razorpay") as Gateway;
  const r = await linkStatus(tenantId, provider, o.payLinkId, Number(o.payLinkAmount ?? 0));
  await recordLinkPaid(tenantId, orderId, o.payLinkId, r.paid, r.status);
  return r.done ? "paid" : r.status.toLowerCase() || "pending";
}

export function verifyWebhook(raw: string, signature: string, secret: string) {
  const exp = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(exp), b = Buffer.from(signature || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------------- customers' online orders (paid before the restaurant accepts) ----------------
/** Payment link for an online order; the customer is sent there straight after ordering */
export async function createOnlineOrderLink(tenantId: number, onlineOrderId: number, origin: string, code: string) {
  const o = await db.query.onlineOrders.findFirst({ where: and(eq(schema.onlineOrders.id, onlineOrderId), eq(schema.onlineOrders.tenantId, tenantId)) });
  if (!o) throw new Error("Order not found.");
  const s = await settingsOf(tenantId);
  const g = activeGateway(s);
  if (!g) throw new Error("No payment gateway is set up.");
  const due = round2(Number(o.estTotal) - Number(o.paidOnline));
  if (due <= 0.5) throw new Error("Already paid.");
  if (o.payLinkId && o.payLinkProvider === g && isOpen(g, o.payLinkStatus)) return o.payLinkUrl;
  const link = await createGatewayLink(tenantId, {
    amount: due, purpose: `${s.name} Online order ${o.id}`, ref: `w${o.id}`, phone: o.phone,
    origin, returnUrl: /^https?:\/\//.test(origin) ? `${origin}/${code}/order/${o.token}?paid=1` : "", notes: { online_order_id: String(o.id) },
  }).catch(async (e) => {
    // keep the gateway's reason so staff can see why the customer couldn't pay online
    await db.update(schema.onlineOrders).set({ payLinkStatus: `error: ${String((e as Error).message).slice(0, 300)}` }).where(eq(schema.onlineOrders.id, o.id));
    throw e;
  });
  await db.update(schema.onlineOrders).set({ payLinkId: link.id, payLinkUrl: link.url, payLinkStatus: link.status, payLinkProvider: link.provider, ...(link.phoneCheck ? { phoneCheck: `${link.phoneCheck}:${link.provider}` } : {}) })
    .where(eq(schema.onlineOrders.id, o.id));
  return link.url;
}

/** Record what the gateway says was paid on an online order's link; also onto its bill once accepted (safe to repeat) */
export async function recordOnlinePaid(tenantId: number, onlineOrderId: number, linkId: string, amountPaid: number, status: string) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${tenantId}, ${-onlineOrderId})`);
    const w = await tx.query.onlineOrders.findFirst({ where: and(eq(schema.onlineOrders.id, onlineOrderId), eq(schema.onlineOrders.tenantId, tenantId)) });
    if (!w || w.payLinkId !== linkId) return;
    const paid = round2(Math.max(Number(w.paidOnline), amountPaid));
    await tx.update(schema.onlineOrders).set({ paidOnline: paid, payLinkStatus: status }).where(eq(schema.onlineOrders.id, w.id));
    if (w.orderId && paid > 0) {
      const o = await tx.query.orders.findFirst({ where: eq(schema.orders.id, w.orderId) });
      const [{ got }] = await tx.select({ got: sql<number>`coalesce(sum(${schema.payments.amount}),0)` }).from(schema.payments)
        .where(and(eq(schema.payments.tenantId, tenantId), eq(schema.payments.orderId, w.orderId), eq(schema.payments.ref, linkId)));
      const add = round2(paid - Number(got));
      if (o && add > 0) await tx.insert(schema.payments).values({ tenantId, orderId: o.id, customerId: o.customerId, amount: add, mode: `Online (${GATEWAY_LABEL[(w.payLinkProvider || "razorpay") as Gateway]})`, date: todayIST(), ref: linkId, notes: "Paid online with the order" });
    }
  });
}

/** Ask the gateway about an online order's link (customer came back, or the page refreshed) */
export async function checkOnlineLink(tenantId: number, onlineOrderId: number) {
  const w = await db.query.onlineOrders.findFirst({ where: and(eq(schema.onlineOrders.id, onlineOrderId), eq(schema.onlineOrders.tenantId, tenantId)) });
  if (!w?.payLinkId) return null;
  const r = await linkStatus(tenantId, (w.payLinkProvider || "razorpay") as Gateway, w.payLinkId, Number(w.estTotal));
  if (r.paid > 0 || r.status !== w.payLinkStatus) await recordOnlinePaid(tenantId, w.id, w.payLinkId, r.paid, r.status);
  return r;
}

/** Webhooks: find which bill or online order a link belongs to and record the payment */
export async function recordAnyLink(provider: Gateway, linkId: string, amountPaid: number, status: string, tenantHint?: number) {
  const o = await db.query.orders.findFirst({ where: and(eq(schema.orders.payLinkId, linkId), eq(schema.orders.payLinkProvider, provider)) });
  if (o && (!tenantHint || o.tenantId === tenantHint)) { await recordLinkPaid(o.tenantId, o.id, linkId, amountPaid, status); return true; }
  const w = await db.query.onlineOrders.findFirst({ where: and(eq(schema.onlineOrders.payLinkId, linkId), eq(schema.onlineOrders.payLinkProvider, provider)) });
  if (w && (!tenantHint || w.tenantId === tenantHint)) { await recordOnlinePaid(w.tenantId, w.id, linkId, amountPaid, status); return true; }
  return false;
}
/** Which restaurant a link belongs to (webhooks check the signature with that restaurant's secret) */
export async function tenantOfLink(provider: Gateway, linkId: string) {
  const o = await db.query.orders.findFirst({ where: and(eq(schema.orders.payLinkId, linkId), eq(schema.orders.payLinkProvider, provider)), columns: { tenantId: true } });
  if (o) return o.tenantId;
  const w = await db.query.onlineOrders.findFirst({ where: and(eq(schema.onlineOrders.payLinkId, linkId), eq(schema.onlineOrders.payLinkProvider, provider)), columns: { tenantId: true } });
  return w?.tenantId ?? null;
}
