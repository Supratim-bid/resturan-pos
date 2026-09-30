import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { openSecret, recordLinkPayment, verifyWebhook } from "@/lib/gateway";

// Razorpay webhook (event: payment_link.paid). Each restaurant uses its own webhook secret.
export async function POST(req: Request) {
  const raw = await req.text();
  let body: { event?: string; payload?: { payment_link?: { entity?: { id: string; amount_paid: number; status: string; notes?: Record<string, string> } } } };
  try { body = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
  const link = body.payload?.payment_link?.entity;
  const tenantId = Number(link?.notes?.tenant_id), orderId = Number(link?.notes?.order_id);
  if (!link || !tenantId || !orderId) return new Response("ignored", { status: 200 });
  const s = await db.query.settings.findFirst({ where: eq(schema.settings.tenantId, tenantId) });
  const secret = s?.razorpayWebhookSecret ? openSecret(s.razorpayWebhookSecret) : "";
  if (!secret || !verifyWebhook(raw, req.headers.get("x-razorpay-signature") ?? "", secret)) return new Response("bad signature", { status: 401 });
  if (body.event === "payment_link.paid" || body.event === "payment_link.partially_paid") {
    await recordLinkPayment(tenantId, orderId, link.id, Number(link.amount_paid ?? 0), link.status);
  }
  return new Response("ok");
}
