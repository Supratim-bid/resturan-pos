import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { estimateEtaMin } from "@/lib/eta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Customer shares their exact delivery location from the tracking page (no login - the token is the secret).
export async function POST(req: Request, { params }: { params: Promise<{ code: string; token: string }> }) {
  const { code, token } = await params;
  let body: { lat?: number; lng?: number };
  try { body = await req.json(); } catch { return Response.json({ ok: false }, { status: 400 }); }
  const lat = Number(body.lat), lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return Response.json({ ok: false, error: "bad location" }, { status: 400 });
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.code, code.toLowerCase()) });
  const o = t ? await db.query.onlineOrders.findFirst({ where: and(eq(schema.onlineOrders.token, token), eq(schema.onlineOrders.tenantId, t.id)) }) : null;
  if (!t || !o) return Response.json({ ok: false }, { status: 404 });
  await db.update(schema.onlineOrders).set({ destLat: String(lat), destLng: String(lng) }).where(eq(schema.onlineOrders.id, o.id));
  if (o.orderId) {
    const bill = await db.query.orders.findFirst({ where: eq(schema.orders.id, o.orderId), columns: { trackLat: true, trackLng: true } });
    const eta = bill?.trackLat ? estimateEtaMin(Number(bill.trackLat), Number(bill.trackLng), lat, lng) : null;
    await db.update(schema.orders).set({ destLat: String(lat), destLng: String(lng), ...(eta != null ? { etaMin: eta, etaAt: new Date() } : {}) }).where(eq(schema.orders.id, o.orderId));
  }
  return Response.json({ ok: true });
}
