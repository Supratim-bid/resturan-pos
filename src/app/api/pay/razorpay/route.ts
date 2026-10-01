import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { openSecret, recordAnyLink, verifyWebhook } from "@/lib/gateway";

// Razorpay webhook (event: payment_link.paid) for bills and online orders. Each restaurant uses its own webhook secret.
export async function POST(req: Request) {
  const raw = await req.text();
  let body: { event?: string; payload?: { payment_link?: { entity?: { id: string; amount_paid: number; status: string; notes?: Record<string, string> } } } };
  try { body = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
  const link = body.payload?.payment_link?.entity;
  const tenantId = Number(link?.notes?.tenant_id);
  if (!link || !tenantId) return new Response("ignored", { status: 200 });
  const s = await db.query.settings.findFirst({ where: eq(schema.settings.tenantId, tenantId) });
  const secret = s?.razorpayWebhookSecret ? openSecret(s.razorpayWebhookSecret) : "";
  if (!secret || !verifyWebhook(raw, req.headers.get("x-razorpay-signature") ?? "", secret)) return new Response("bad signature", { status: 401 });
  if (body.event === "payment_link.paid" || body.event === "payment_link.partially_paid") {
    await recordAnyLink("razorpay", link.id, Number(link.amount_paid ?? 0) / 100, link.status, tenantId); // a bill or an online order
  }
  return new Response("ok");
}
