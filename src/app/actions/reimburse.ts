"use server";
import { and, eq, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireAction } from "@/lib/auth";

type R = { ok: true; msg?: string } | { ok: false; error: string };

/** Mark everything a person is owed (money they paid from their own pocket) as repaid. */
export async function settleReimbursementAction(paidFrom: string, name: string, mode: string): Promise<R> {
  try {
    const u = await requireAction("reimbursements");
    if (paidFrom !== "Owner" && paidFrom !== "Staff") throw new Error("Nothing to settle.");
    const res = await db.update(schema.expenses).set({ reimbursedAt: new Date(), reimbursedById: u.id, reimbursedMode: mode || "Cash" })
      .where(and(
        eq(schema.expenses.tenantId, u.tenantId),
        eq(schema.expenses.paidFrom, paidFrom),
        eq(schema.expenses.paidByName, name),
        ne(schema.expenses.paymentMode, "Credit"),
        isNull(schema.expenses.reimbursedAt),
      )).returning({ id: schema.expenses.id });
    revalidatePath("/reimbursements"); revalidatePath("/expenses");
    return { ok: true, msg: `Marked ${res.length} expense${res.length === 1 ? "" : "s"} as repaid to ${name}.` };
  } catch (e) { return { ok: false, error: String((e as Error).message) }; }
}

/** Undo a settlement for one expense (in case it was marked by mistake). */
export async function unsettleReimbursementAction(expenseId: number): Promise<R> {
  try {
    const u = await requireAction("reimbursements");
    await db.update(schema.expenses).set({ reimbursedAt: null, reimbursedById: null, reimbursedMode: "" })
      .where(and(eq(schema.expenses.tenantId, u.tenantId), eq(schema.expenses.id, expenseId)));
    revalidatePath("/reimbursements");
    return { ok: true };
  } catch (e) { return { ok: false, error: String((e as Error).message) }; }
}
