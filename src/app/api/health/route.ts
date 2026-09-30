import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

// For uptime monitors: 200 when the app and database answer, 503 otherwise. Shows no private data.
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, time: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, error: "database not reachable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
