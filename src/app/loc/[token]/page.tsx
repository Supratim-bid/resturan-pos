import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifyLoc } from "@/lib/session";
import { themeCss } from "@/lib/theme";
import { tenantWithPlan, featureInfo } from "@/lib/plans";
import { PinLocation } from "@/components/pin-location";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public "pin your delivery location" page a customer opens from the link the restaurant sends. No login.
export default async function LocPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const v = await verifyLoc(token);
  if (!v) notFound();
  const o = await db.query.orders.findFirst({ where: eq(schema.orders.id, v.oid), with: { customer: true } });
  if (!o || o.tenantId !== v.tid) notFound();
  const tp = await tenantWithPlan({ id: v.tid });
  if (!tp || !featureInfo(tp.t, tp.plan).active.includes("deliveryLocation")) notFound(); // pro feature, off for this restaurant
  const s = await db.query.settings.findFirst({ where: eq(schema.settings.tenantId, v.tid) });
  const start = o.destLat && o.destLng ? { lat: Number(o.destLat), lng: Number(o.destLng) } : null;
  const name = s?.billName || s?.name || "the restaurant";
  return (
    <div className="min-h-dvh bg-cream py-5">
      <style dangerouslySetInnerHTML={{ __html: themeCss(s?.primaryColor, s?.accentColor, s?.tone3, s?.tone4) }} />
      <div className="mx-auto max-w-md space-y-4 px-3">
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-line">
          <div className="bg-brand-gradient px-5 py-4 text-center text-white">
            <div className="font-display text-xl font-bold">{name}</div>
            <div className="text-xs text-white/80">Share your delivery location</div>
          </div>
          <div className="space-y-3 p-4">
            <p className="text-sm text-muted">
              {o.customer?.name ? <>Hi {o.customer.name.split(" ")[0]}, please</> : "Please"} pin where we should deliver your order{o.billNo ? <> (bill <b>{o.billNo}</b>)</> : ""}. It helps our delivery reach you faster.
            </p>
            <PinLocation token={token} start={start} />
          </div>
        </div>
        <p className="text-center text-[11px] text-muted">Your location is shared only with {name} for this delivery.</p>
      </div>
    </div>
  );
}
