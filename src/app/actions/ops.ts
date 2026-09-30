"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireAction } from "@/lib/auth";
import { round2 } from "@/lib/format";
import { cashFigures } from "@/lib/cash";

export async function setAttendanceAction(staffId: number, date: string, status: string) {
  const u = await requireAction("staff");
  const st = await db.query.staff.findFirst({ where: and(eq(schema.staff.id, staffId), eq(schema.staff.tenantId, u.tenantId)) });
  if (!st) throw new Error("Staff not found.");
  if (!status) await db.delete(schema.attendance).where(and(eq(schema.attendance.staffId, staffId), eq(schema.attendance.date, date)));
  else await db.insert(schema.attendance).values({ staffId, date, status })
    .onConflictDoUpdate({ target: [schema.attendance.staffId, schema.attendance.date], set: { status } });
  revalidatePath("/staff");
}

export async function saveCashClosingAction(date: string, openingCash: number, actual: number, notes: string) {
  try {
    const u = await requireAction("cash");
    const f = await cashFigures(u.tenantId, date);
    const expected = round2(openingCash + f.cashIn - f.cashOut);
    const vals = { openingCash, cashIn: f.cashIn, cashOut: f.cashOut, expected, actual, difference: round2(actual - expected), notes, closedBy: u.name };
    await db.insert(schema.cashClosings).values({ tenantId: u.tenantId, date, ...vals }).onConflictDoUpdate({ target: [schema.cashClosings.tenantId, schema.cashClosings.date], set: vals });
    revalidatePath("/cash");
    return { ok: true as const };
  } catch (e) { return { ok: false as const, error: String((e as Error).message) }; }
}

export async function reminderDoneAction(id: number) {
  const u = await requireAction("reminders");
  const r = await db.query.reminders.findFirst({ where: and(eq(schema.reminders.id, id), eq(schema.reminders.tenantId, u.tenantId)) });
  if (!r) return;
  if (r.repeat === "MONTHLY" || r.repeat === "YEARLY") {
    const d = new Date(r.dueDate + "T00:00:00Z");
    if (r.repeat === "MONTHLY") d.setUTCMonth(d.getUTCMonth() + 1); else d.setUTCFullYear(d.getUTCFullYear() + 1);
    await db.update(schema.reminders).set({ dueDate: d.toISOString().slice(0, 10) }).where(eq(schema.reminders.id, id));
  } else await db.update(schema.reminders).set({ done: true }).where(eq(schema.reminders.id, id));
  revalidatePath("/reminders"); revalidatePath("/");
}
