import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { openSecret, recordLinkPaid, verifyCashfreeSignature } from "@/lib/gateway";

// Cashfree payment-link webhook (JSON). Checked with the restaurant's secret key.
export async function POST(req: Request) {
  const raw = await req.text();
  let body: { type?: string; data?: { link_id?: string; link_status?: string; link_amount_paid?: number; link_notes?: Record<string, string> } };
  try { body = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
  const d = body.data;
  if (!d?.link_id) return new Response("ignored", { status: 200 });
  const o = await db.query.orders.findFirst({ where: and(eq(schema.orders.payLinkId, d.link_id), eq(schema.orders.payLinkProvider, "cashfree")) });
  if (!o) return new Response("ignored", { status: 200 });
  const s = await db.query.settings.findFirst({ where: eq(schema.settings.tenantId, o.tenantId) });
  const secret = s?.cashfreeSecret ? openSecret(s.cashfreeSecret) : "";
  if (!secret || !verifyCashfreeSignature(raw, req.headers.get("x-webhook-timestamp") ?? "", req.headers.get("x-webhook-signature") ?? "", secret)) {
    return new Response("bad signature", { status: 401 });
  }
  if (d.link_status === "PAID" || d.link_status === "PARTIALLY_PAID") await recordLinkPaid(o.tenantId, o.id, d.link_id, Number(d.link_amount_paid ?? 0), d.link_status);
  return new Response("ok");
}
