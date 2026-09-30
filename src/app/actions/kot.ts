"use server";
import { and, eq, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireAction } from "@/lib/auth";

type R = { ok: true } | { ok: false; error: string };
const STATUSES = ["NEW", "PREPARING", "READY", "SERVED"];

/** Kitchen moves a KOT along: New -> Preparing -> Ready -> Served (or back one step) */
export async function setKotStatusAction(orderId: number, status: string): Promise<R> {
  try {
    const u = await requireAction("kot");
    if (!STATUSES.includes(status)) throw new Error("Unknown status.");
    const [r] = await db.update(schema.orders).set({ kotStatus: status, ...(status === "PREPARING" ? { kotUpdated: false } : {}) })
      .where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, u.tenantId), isNotNull(schema.orders.kotNo))).returning({ id: schema.orders.id });
    if (!r) throw new Error("KOT not found.");
    revalidatePath("/kot");
    return { ok: true };
  } catch (e) { return { ok: false, error: String((e as Error).message ?? e) }; }
}
