import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifyLoc } from "@/lib/session";
import { estimateEtaMin } from "@/lib/eta";
import { tenantWithPlan, featureInfo } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Customer (or staff) pins the delivery location for ANY order, from /loc/<token> - no login, the token is the secret.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const v = await verifyLoc(token);
  if (!v) return Response.json({ ok: false }, { status: 404 });
  let body: { lat?: number; lng?: number };
  try { body = await req.json(); } catch { return Response.json({ ok: false }, { status: 400 }); }
  const lat = Number(body.lat), lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return Response.json({ ok: false, error: "bad location" }, { status: 400 });
  const o = await db.query.orders.findFirst({ where: eq(schema.orders.id, v.oid), columns: { id: true, tenantId: true, trackLat: true, trackLng: true } });
  if (!o || o.tenantId !== v.tid) return Response.json({ ok: false }, { status: 404 });
  const tp = await tenantWithPlan({ id: v.tid });
  if (!tp || !featureInfo(tp.t, tp.plan).active.includes("deliveryLocation")) return Response.json({ ok: false }, { status: 404 });
  const eta = o.trackLat ? estimateEtaMin(Number(o.trackLat), Number(o.trackLng), lat, lng) : null;
  await db.update(schema.orders).set({ destLat: String(lat), destLng: String(lng), ...(eta != null ? { etaMin: eta, etaAt: new Date() } : {}) }).where(eq(schema.orders.id, o.id));
  // keep the linked online order (if any) in sync so the customer's tracking page matches
  await db.update(schema.onlineOrders).set({ destLat: String(lat), destLng: String(lng) }).where(eq(schema.onlineOrders.orderId, o.id));
  return Response.json({ ok: true });
}
