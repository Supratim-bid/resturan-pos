import "server-only";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";

export const KOT_FLOW = ["NEW", "PREPARING", "READY", "SERVED"] as const;
export type KotStatus = (typeof KOT_FLOW)[number];

/** One KOT with its dishes (no prices) */
export async function loadKot(tenantId: number, orderId: number) {
  const [o, s] = await Promise.all([
    db.query.orders.findFirst({
      where: and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)),
      with: { items: { orderBy: (t) => asc(t.id) }, customer: true },
    }),
    db.query.settings.findFirst({ where: eq(schema.settings.tenantId, tenantId) }),
  ]);
  if (!o || !s || !o.kotNo) return null;
  return { o, s };
}

/** KOTs of a day for the kitchen screen */
export async function kotsForDay(tenantId: number, date: string, statuses: string[]) {
  return db.query.orders.findMany({
    where: and(eq(schema.orders.tenantId, tenantId), eq(schema.orders.date, date), isNotNull(schema.orders.kotNo), inArray(schema.orders.kotStatus, statuses)),
    with: { items: { orderBy: (t) => asc(t.id) }, customer: { columns: { name: true } } },
    orderBy: (t, { asc: a }) => [a(t.kotAt), a(t.kotNo)],
  });
}
