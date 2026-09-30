import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/** Figures for a cash closing on `date` */
export async function cashFigures(tenantId: number, date: string) {
  const [inRow] = await db.select({ s: sql<number>`coalesce(sum(${schema.payments.amount}),0)` }).from(schema.payments)
    .where(and(eq(schema.payments.tenantId, tenantId), eq(schema.payments.date, date), eq(schema.payments.mode, "Cash")));
  const [outE] = await db.select({ s: sql<number>`coalesce(sum(${schema.expenses.amount}),0)` }).from(schema.expenses)
    .where(and(eq(schema.expenses.tenantId, tenantId), eq(schema.expenses.date, date), eq(schema.expenses.paymentMode, "Cash")));
  const [outV] = await db.select({ s: sql<number>`coalesce(sum(${schema.vendorPayments.amount}),0)` }).from(schema.vendorPayments)
    .where(and(eq(schema.vendorPayments.tenantId, tenantId), eq(schema.vendorPayments.date, date), eq(schema.vendorPayments.mode, "Cash")));
  const prev = await db.query.cashClosings.findFirst({ where: (t, { lt, and: a, eq: e }) => a(e(t.tenantId, tenantId), lt(t.date, date)), orderBy: (t, { desc }) => desc(t.date) });
  return { cashIn: Number(inRow.s), cashOut: Number(outE.s) + Number(outV.s), suggestedOpening: prev ? Number(prev.actual) : 0, prevDate: prev?.date ?? null };
}

