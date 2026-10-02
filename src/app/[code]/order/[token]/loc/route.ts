import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live rider location for the customer's tracking map (polled). No login - the token is the secret.
export async function GET(_: Request, { params }: { params: Promise<{ code: string; token: string }> }) {
  const { code, token } = await params;
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.code, code.toLowerCase()) });
  const o = t ? await db.query.onlineOrders.findFirst({ where: and(eq(schema.onlineOrders.token, token), eq(schema.onlineOrders.tenantId, t.id)) }) : null;
  const bill = t && o?.orderId ? await db.query.orders.findFirst({ where: eq(schema.orders.id, o.orderId), columns: { fulfilStatus: true, trackLat: true, trackLng: true, trackAt: true } }) : null;
  const fresh = bill?.trackAt && Date.now() - new Date(bill.trackAt).getTime() < 30 * 60 * 1000; // show only if updated in last 30 min
  const lat = fresh && bill!.trackLat ? Number(bill!.trackLat) : null;
  const lng = fresh && bill!.trackLng ? Number(bill!.trackLng) : null;
  return Response.json({
    status: bill?.fulfilStatus ?? "",
    lat: Number.isFinite(lat as number) ? lat : null,
    lng: Number.isFinite(lng as number) ? lng : null,
    at: fresh ? bill!.trackAt : null,
  }, { headers: { "Cache-Control": "no-store" } });
}
