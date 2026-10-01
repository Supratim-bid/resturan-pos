import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createOnlineOrderLink } from "@/lib/gateway";

export const dynamic = "force-dynamic";

// /<code>/order/<token>/pay → the restaurant's payment page (Cashfree / Instamojo / Razorpay) for this online order
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string; token: string }> }) {
  const { code: raw, token } = await params;
  const code = raw.toLowerCase();
  const back = new URL(`/${code}/order/${token}`, req.url);
  if (!/^[\w-]{16,40}$/.test(token)) return NextResponse.redirect(back, 303);
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.code, code), columns: { id: true, code: true } });
  const o = t ? await db.query.onlineOrders.findFirst({ where: and(eq(schema.onlineOrders.token, token), eq(schema.onlineOrders.tenantId, t.id)) }) : null;
  if (!t || !o || o.status === "REJECTED") return NextResponse.redirect(back, 303);
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  try {
    const url = await createOnlineOrderLink(t.id, o.id, `${proto}://${host}`, t.code);
    return NextResponse.redirect(url, 303);
  } catch (e) {
    console.error("online pay link", e);
    back.searchParams.set("payerr", "1");
    return NextResponse.redirect(back, 303);
  }
}
