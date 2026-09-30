import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, schema } from "@/db";
import { COOKIE, TENANT_COOKIE, verifySession } from "@/lib/session";

// Logo of a restaurant: ?r=<code>, else the logged-in restaurant, else the last restaurant used on this device.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  let tenantId: number | null = null;
  const code = (url.searchParams.get("r") || "").trim().toLowerCase();
  if (code) tenantId = (await db.query.tenants.findFirst({ where: eq(schema.tenants.code, code) }))?.id ?? null;
  if (!tenantId) tenantId = (await verifySession(jar.get(COOKIE)?.value))?.tid ?? null;
  if (!tenantId) {
    const remembered = jar.get(TENANT_COOKIE)?.value;
    if (remembered) tenantId = (await db.query.tenants.findFirst({ where: eq(schema.tenants.code, remembered) }))?.id ?? null;
  }
  const s = tenantId ? await db.query.settings.findFirst({ where: eq(schema.settings.tenantId, tenantId) }).catch(() => null) : null;
  const target = s?.logoImageId ? `/img/${s.logoImageId}` : "/platform-logo.svg";
  return new Response(null, { status: 307, headers: { Location: new URL(target, req.url).toString(), "Cache-Control": "no-store" } });
}
