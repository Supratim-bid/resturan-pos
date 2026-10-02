import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { todayIST } from "@/lib/format";
import { isLive } from "@/lib/tenant-status";
import { closeShop } from "@/lib/dayend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Runs ~1:00 AM IST (19:30 UTC) via Vercel cron. For every live restaurant that set day-end emails and
 *  hasn't had the report sent today, it closes the shop (incl. online) and emails today's sheet. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  }
  const today = todayIST();
  // candidates: settings that have at least one email and weren't sent today
  const rows = await db.select({ tenantId: schema.settings.tenantId })
    .from(schema.settings)
    .where(and(ne(schema.settings.dayEndEmails, ""), ne(schema.settings.dayEndSentFor, today)));

  const results: { tenantId: number; sent: boolean; reason?: string }[] = [];
  for (const { tenantId } of rows) {
    const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId) });
    if (!t || !isLive(t)) continue;
    try {
      const r = await closeShop(tenantId);
      results.push({ tenantId, sent: r.sent, reason: "reason" in r ? r.reason : undefined });
    } catch (e) {
      results.push({ tenantId, sent: false, reason: String((e as Error).message).slice(0, 120) });
    }
  }
  return Response.json({ ok: true, date: today, processed: results.length, results });
}
