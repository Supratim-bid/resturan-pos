import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { openSecret, recordAnyLink, tenantOfLink, verifyInstamojoMac } from "@/lib/gateway";

// Instamojo webhook (form POST) for bills and online orders. Checked with the restaurant's private salt.
export async function POST(req: Request) {
  const fields: Record<string, string> = {};
  try { for (const [k, v] of new URLSearchParams(await req.text())) fields[k] = v; } catch { return new Response("bad body", { status: 400 }); }
  const reqId = fields.payment_request_id;
  if (!reqId || !fields.mac) return new Response("ignored", { status: 200 });
  const tid = await tenantOfLink("instamojo", reqId);
  if (!tid) return new Response("ignored", { status: 200 });
  const s = await db.query.settings.findFirst({ where: eq(schema.settings.tenantId, tid) });
  const salt = s?.instamojoSalt ? openSecret(s.instamojoSalt) : "";
  if (!salt || !verifyInstamojoMac(fields, salt)) return new Response("bad signature", { status: 401 });
  if (fields.status === "Credit") await recordAnyLink("instamojo", reqId, Number(fields.amount ?? 0), "Completed", tid);
  return new Response("ok");
}
