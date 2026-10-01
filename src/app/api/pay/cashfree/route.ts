import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { openSecret, recordAnyLink, tenantOfLink, verifyCashfreeSignature } from "@/lib/gateway";

// Cashfree webhook (JSON): payment links, and checkout-order payments for bills and online orders. Checked with the restaurant's secret key.
export async function POST(req: Request) {
  const raw = await req.text();
  let body: { type?: string; data?: { link_id?: string; link_status?: string; link_amount_paid?: number; order?: { order_id?: string; order_amount?: number }; payment?: { payment_status?: string; payment_amount?: number } } };
  try { body = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
  const d = body.data;
  const id = d?.link_id || d?.order?.order_id;
  if (!d || !id) return new Response("ignored", { status: 200 });
  const tid = await tenantOfLink("cashfree", id);
  if (!tid) return new Response("ignored", { status: 200 });
  const s = await db.query.settings.findFirst({ where: eq(schema.settings.tenantId, tid) });
  const secret = s?.cashfreeSecret ? openSecret(s.cashfreeSecret) : "";
  if (!secret || !verifyCashfreeSignature(raw, req.headers.get("x-webhook-timestamp") ?? "", req.headers.get("x-webhook-signature") ?? "", secret)) {
    return new Response("bad signature", { status: 401 });
  }
  if (d.link_id && (d.link_status === "PAID" || d.link_status === "PARTIALLY_PAID")) await recordAnyLink("cashfree", d.link_id, Number(d.link_amount_paid ?? 0), d.link_status, tid);
  // checkout orders (used when Payment Links is off): payment webhook
  if (!d.link_id && d.payment?.payment_status === "SUCCESS") await recordAnyLink("cashfree", id, Number(d.payment.payment_amount ?? d.order?.order_amount ?? 0), "PAID", tid);
  return new Response("ok");
}
