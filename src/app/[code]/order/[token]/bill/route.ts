import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { renderBillPdf } from "@/lib/bill-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Customer's bill PDF, reachable only with their secret order link
export async function GET(_: Request, { params }: { params: Promise<{ code: string; token: string }> }) {
  const { code, token } = await params;
  if (!/^[\w-]{16,40}$/.test(token)) return new Response("Not found", { status: 404 });
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.code, code.toLowerCase()) });
  const o = t ? await db.query.onlineOrders.findFirst({ where: and(eq(schema.onlineOrders.token, token), eq(schema.onlineOrders.tenantId, t.id)) }) : null;
  if (!t || !o || o.status !== "ACCEPTED" || !o.orderId) return new Response("Not found", { status: 404 });
  const pdf = await renderBillPdf(t.id, o.orderId);
  if (!pdf) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(pdf.buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${pdf.filename}"`, "Cache-Control": "private, no-store" },
  });
}
