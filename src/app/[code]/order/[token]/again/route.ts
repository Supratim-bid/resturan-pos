import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { PHONE_COOKIE, signPhone } from "@/lib/session";
import { phone10 } from "@/lib/customers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Order again": the tracking link logs the customer in (their own phone) and sends them to the order page.
export async function GET(req: Request, { params }: { params: Promise<{ code: string; token: string }> }) {
  const { code, token } = await params;
  const base = new URL(req.url);
  const to = new URL(`/${code}/order`, base);
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.code, code.toLowerCase()) });
  const o = t ? await db.query.onlineOrders.findFirst({ where: and(eq(schema.onlineOrders.token, token), eq(schema.onlineOrders.tenantId, t.id)) }) : null;
  if (t && o) {
    const p10 = phone10(o.phone);
    if (p10.length === 10) {
      (await cookies()).set(PHONE_COOKIE, await signPhone(t.id, p10), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 90 * 86400 });
    }
  }
  return NextResponse.redirect(to);
}
