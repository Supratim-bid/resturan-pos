import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { balancesBefore } from "./money";

/** Figures for a cash closing on `date` */
export async function cashFigures(tenantId: number, date: string) {
  const [inRow] = await db.select({ s: sql<number>`coalesce(sum(${schema.payments.amount}),0)` }).from(schema.payments)
    .where(and(eq(schema.payments.tenantId, tenantId), eq(schema.payments.date, date), eq(schema.payments.mode, "Cash")));
  const [outE] = await db.select({ s: sql<number>`coalesce(sum(${schema.expenses.amount}),0)` }).from(schema.expenses)
    .where(and(eq(schema.expenses.tenantId, tenantId), eq(schema.expenses.date, date), eq(schema.expenses.paymentMode, "Cash")));
  const [outV] = await db.select({ s: sql<number>`coalesce(sum(${schema.vendorPayments.amount}),0)` }).from(schema.vendorPayments)
    .where(and(eq(schema.vendorPayments.tenantId, tenantId), eq(schema.vendorPayments.date, date), eq(schema.vendorPayments.mode, "Cash")));
  // manual Cash & Bank entries that move cash (owner took / added cash, cash deposited to bank...)
  const me = await db.query.moneyEntries.findMany({ where: and(eq(schema.moneyEntries.tenantId, tenantId), eq(schema.moneyEntries.date, date)) });
  let meIn = 0, meOut = 0, openingToday = 0;
  for (const m of me) {
    if (m.kind === "OPENING" && m.account === "CASH") openingToday += Number(m.amount);
    const n = Number(m.amount);
    if (m.kind !== "TRANSFER" && m.account === "CASH") { if (m.kind === "OUT") meOut += n; else if (m.kind === "IN") meIn += n; }
    if (m.kind === "TRANSFER") { if (m.account === "CASH") meOut += n; if (m.toAccount === "CASH") meIn += n; }
  }
  // money received online the same day (UPI, card...), by mode - for the full day closing
  const online = await db.select({ mode: schema.payments.mode, s: sql<number>`coalesce(sum(${schema.payments.amount}),0)` }).from(schema.payments)
    .where(and(eq(schema.payments.tenantId, tenantId), eq(schema.payments.date, date), sql`${schema.payments.mode} not in ('Cash','Credit')`)).groupBy(schema.payments.mode);
  const prev = await db.query.cashClosings.findFirst({ where: (t, { lt, and: a, eq: e }) => a(e(t.tenantId, tenantId), lt(t.date, date)), orderBy: (t, { desc }) => desc(t.date) });
  return {
    cashIn: Number(inRow.s) + meIn, cashOut: Number(outE.s) + Number(outV.s) + meOut, suggestedOpening: (prev ? Number(prev.actual) : (await balancesBefore(tenantId, date)).CASH) + openingToday, prevDate: prev?.date ?? null,
    online: online.map((o) => ({ mode: o.mode, amount: Number(o.s) })).filter((o) => Math.abs(o.amount) > 0.001),
  };
}

