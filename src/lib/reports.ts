import "server-only";
import { and, eq, gte, lte, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { addDays } from "./format";

const O = schema.orders, E = schema.expenses;
const inRange = (tenantId: number, from: string, to: string) => and(eq(O.tenantId, tenantId), gte(O.date, from), lte(O.date, to), ne(O.status, "CANCELLED"));

export async function salesSummary(tenantId: number, from: string, to: string) {
  const [r] = await db.select({
    orders: sql<number>`count(*)`,
    itemsTotal: sql<number>`coalesce(sum(${O.itemsTotal}),0)`,
    discounts: sql<number>`coalesce(sum(${O.itemDiscount} + ${O.orderDiscount}),0)`,
    charges: sql<number>`coalesce(sum(${O.deliveryCharge} + ${O.packingCharge}),0)`,
    netSales: sql<number>`coalesce(sum(${O.taxable}),0)`,
    gst: sql<number>`coalesce(sum(${O.gstAmount}),0)`,
    billed: sql<number>`coalesce(sum(${O.total}),0)`,
    foodCost: sql<number>`coalesce(sum(${O.foodCost}),0)`,
  }).from(O).where(inRange(tenantId, from, to));
  const out = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(v)])) as Record<keyof typeof r, number>;
  return out;
}

export async function expenseTotal(tenantId: number, from: string, to: string) {
  const [r] = await db.select({ s: sql<number>`coalesce(sum(${E.amount}),0)` }).from(E).where(and(eq(E.tenantId, tenantId), gte(E.date, from), lte(E.date, to)));
  return Number(r.s);
}

export async function expensesByCategory(tenantId: number, from: string, to: string) {
  const rows = await db.select({ category: E.category, amount: sql<number>`sum(${E.amount})` }).from(E)
    .where(and(eq(E.tenantId, tenantId), gte(E.date, from), lte(E.date, to))).groupBy(E.category);
  return rows.map((r) => ({ category: r.category, amount: Number(r.amount) })).sort((a, b) => b.amount - a.amount);
}

/** Commission actually deducted by platforms, for payouts received in the range */
export async function platformCommission(tenantId: number, from: string, to: string) {
  const s = await db.query.settlements.findMany({ where: and(eq(schema.settlements.tenantId, tenantId), gte(schema.settlements.payoutDate, from), lte(schema.settlements.payoutDate, to)) });
  let gross = 0, payout = 0;
  for (const x of s) {
    const [g] = await db.select({ t: sql<number>`coalesce(sum(${O.total}),0)` }).from(O)
      .where(and(eq(O.tenantId, tenantId), eq(O.orderType, x.platform), gte(O.date, x.fromDate), lte(O.date, x.toDate), ne(O.status, "CANCELLED")));
    gross += Number(g.t); payout += Number(x.payout);
  }
  return { gross, payout, commission: Math.max(0, gross - payout) };
}

export async function dailySeries(tenantId: number, from: string, to: string) {
  const [s, e] = await Promise.all([
    db.select({ d: O.date, sales: sql<number>`sum(${O.taxable})`, n: sql<number>`count(*)` }).from(O).where(inRange(tenantId, from, to)).groupBy(O.date),
    db.select({ d: E.date, exp: sql<number>`sum(${E.amount})` }).from(E).where(and(eq(E.tenantId, tenantId), gte(E.date, from), lte(E.date, to))).groupBy(E.date),
  ]);
  const sm = new Map(s.map((r) => [r.d, r])), em = new Map(e.map((r) => [r.d, Number(r.exp)]));
  const out: { date: string; label: string; sales: number; expenses: number; orders: number }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    out.push({ date: d, label: String(Number(d.slice(8))), sales: Number(sm.get(d)?.sales ?? 0), expenses: em.get(d) ?? 0, orders: Number(sm.get(d)?.n ?? 0) });
  }
  return out;
}

export async function monthlySeries(tenantId: number, endMonth: string, months = 12) {
  const [y, m] = endMonth.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - months, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const [s, e, st] = await Promise.all([
    db.select({ ym: sql<string>`to_char(${O.date}, 'YYYY-MM')`, sales: sql<number>`sum(${O.taxable})`, food: sql<number>`sum(${O.foodCost})` })
      .from(O).where(inRange(tenantId, start, end)).groupBy(sql`1`),
    db.select({ ym: sql<string>`to_char(${E.date}, 'YYYY-MM')`, exp: sql<number>`sum(${E.amount})` }).from(E)
      .where(and(eq(E.tenantId, tenantId), gte(E.date, start), lte(E.date, end))).groupBy(sql`1`),
    db.query.settlements.findMany({ where: and(eq(schema.settlements.tenantId, tenantId), gte(schema.settlements.payoutDate, start), lte(schema.settlements.payoutDate, end)) }),
  ]);
  const comm = new Map<string, number>();
  for (const x of st) {
    const [g] = await db.select({ t: sql<number>`coalesce(sum(${O.total}),0)` }).from(O)
      .where(and(eq(O.tenantId, tenantId), eq(O.orderType, x.platform), gte(O.date, x.fromDate), lte(O.date, x.toDate), ne(O.status, "CANCELLED")));
    const k = x.payoutDate.slice(0, 7);
    comm.set(k, (comm.get(k) ?? 0) + Math.max(0, Number(g.t) - Number(x.payout)));
  }
  const sm = new Map(s.map((r) => [r.ym, r])), em = new Map(e.map((r) => [r.ym, Number(r.exp)]));
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const ym = d.toISOString().slice(0, 7);
    const sales = Number(sm.get(ym)?.sales ?? 0), expenses = em.get(ym) ?? 0, c = comm.get(ym) ?? 0;
    out.push({ ym, label: d.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" }), sales, expenses: expenses + c, profit: sales - expenses - c, foodCost: Number(sm.get(ym)?.food ?? 0) });
  }
  return out;
}

export async function itemSales(tenantId: number, from: string, to: string) {
  const rows = await db.select({
    id: schema.orderItems.menuItemId, name: schema.orderItems.name,
    qty: sql<number>`sum(${schema.orderItems.qty})`, sales: sql<number>`sum(${schema.orderItems.lineTotal})`,
    cost: sql<number>`sum(${schema.orderItems.unitCost} * ${schema.orderItems.qty})`,
  }).from(schema.orderItems).innerJoin(O, eq(O.id, schema.orderItems.orderId)).where(inRange(tenantId, from, to))
    .groupBy(schema.orderItems.menuItemId, schema.orderItems.name);
  const merged = new Map<number, { id: number; name: string; qty: number; sales: number; cost: number }>();
  for (const r of rows) {
    const e = merged.get(r.id) ?? { id: r.id, name: r.name, qty: 0, sales: 0, cost: 0 };
    e.qty += Number(r.qty); e.sales += Number(r.sales); e.cost += Number(r.cost);
    merged.set(r.id, e);
  }
  return [...merged.values()].map((r) => ({ ...r, profit: r.sales - r.cost })).sort((a, b) => b.sales - a.sales);
}

export async function orderTypeSales(tenantId: number, from: string, to: string) {
  const rows = await db.select({ type: O.orderType, sales: sql<number>`sum(${O.taxable})`, n: sql<number>`count(*)` }).from(O).where(inRange(tenantId, from, to)).groupBy(O.orderType);
  return rows.map((r) => ({ type: r.type, sales: Number(r.sales), orders: Number(r.n) })).sort((a, b) => b.sales - a.sales);
}

export async function collectionsByMode(tenantId: number, from: string, to: string) {
  // net per mode: money in minus refunds (refunds are minus entries in the same mode)
  const rows = await db.select({
    mode: schema.payments.mode, s: sql<number>`sum(${schema.payments.amount})`,
    got: sql<number>`coalesce(sum(${schema.payments.amount}) filter (where ${schema.payments.amount} > 0),0)`,
    back: sql<number>`coalesce(-sum(${schema.payments.amount}) filter (where ${schema.payments.amount} < 0),0)`,
  }).from(schema.payments)
    .where(and(eq(schema.payments.tenantId, tenantId), gte(schema.payments.date, from), lte(schema.payments.date, to))).groupBy(schema.payments.mode);
  return rows.map((r) => ({ mode: r.mode, amount: Number(r.s), received: Number(r.got), refunded: Number(r.back) }))
    .filter((r) => r.received || r.refunded).sort((a, b) => b.amount - a.amount);
}

export async function wastageTotal(tenantId: number, from: string, to: string) {
  const [r] = await db.select({ s: sql<number>`coalesce(sum(${schema.wastage.cost}),0)` }).from(schema.wastage)
    .where(and(eq(schema.wastage.tenantId, tenantId), gte(schema.wastage.date, from), lte(schema.wastage.date, to)));
  return Number(r.s);
}

/** Money spent on food raw material (for actual vs recipe food cost) */
export async function rawMaterialSpend(tenantId: number, from: string, to: string) {
  const cats = ["Vegetables", "Fish & Meat", "Grocery & Spices", "Dairy"];
  const [r] = await db.select({ s: sql<number>`coalesce(sum(${E.amount}),0)` }).from(E)
    .where(and(eq(E.tenantId, tenantId), gte(E.date, from), lte(E.date, to), sql`(${E.ingredientId} is not null or ${E.category} in (${sql.join(cats.map((c) => sql`${c}`), sql`, `)}))`));
  return Number(r.s);
}

// ---------------- more reports (any date range) ----------------

/** Bills made by each staff login */
export async function staffSales(tenantId: number, from: string, to: string) {
  const rows = await db.select({ id: O.createdById, name: schema.users.name, bills: sql<number>`count(*)`, sales: sql<number>`coalesce(sum(${O.taxable}),0)` })
    .from(O).leftJoin(schema.users, eq(schema.users.id, O.createdById)).where(inRange(tenantId, from, to))
    .groupBy(O.createdById, schema.users.name);
  return rows.map((r) => ({ name: r.name ?? "Online / system", bills: Number(r.bills), sales: Number(r.sales) })).sort((a, b) => b.bills - a.bills);
}

/** Orders and sales by hour of the day (India time) - the busy hours */
export async function hourlySales(tenantId: number, from: string, to: string) {
  const h = sql<number>`extract(hour from (${O.createdAt} + interval '5 hours 30 minutes'))::int`;
  const rows = await db.select({ h, n: sql<number>`count(*)`, sales: sql<number>`coalesce(sum(${O.taxable}),0)` }).from(O).where(inRange(tenantId, from, to)).groupBy(h);
  return rows.map((r) => ({ hour: Number(r.h), orders: Number(r.n), sales: Number(r.sales) })).sort((a, b) => a.hour - b.hour);
}

/** Sales by menu category */
export async function categorySales(tenantId: number, from: string, to: string) {
  const I = schema.orderItems, M = schema.menuItems, C = schema.categories;
  const rows = await db.select({ name: C.name, qty: sql<number>`sum(${I.qty})`, sales: sql<number>`sum(${I.lineTotal})` })
    .from(I).innerJoin(O, eq(O.id, I.orderId)).leftJoin(M, eq(M.id, I.menuItemId)).leftJoin(C, eq(C.id, M.categoryId))
    .where(inRange(tenantId, from, to)).groupBy(C.name);
  return rows.map((r) => ({ name: r.name ?? "Other", qty: Number(r.qty), sales: Number(r.sales) })).sort((a, b) => b.sales - a.sales);
}

/** Customers who bought the most */
export async function topCustomers(tenantId: number, from: string, to: string, limit = 10) {
  const rows = await db.select({ id: O.customerId, name: schema.customers.name, n: sql<number>`count(*)`, sales: sql<number>`coalesce(sum(${O.taxable}),0)` })
    .from(O).innerJoin(schema.customers, eq(schema.customers.id, O.customerId)).where(inRange(tenantId, from, to))
    .groupBy(O.customerId, schema.customers.name).orderBy(sql`sum(${O.taxable}) desc`).limit(limit);
  return rows.map((r) => ({ id: Number(r.id), name: r.name, orders: Number(r.n), sales: Number(r.sales) }));
}

/** Raw material used by what was sold (from recipes): which ingredients go out the most */
export async function materialUsage(tenantId: number, from: string, to: string) {
  const [items, { costs, ingMap }] = await Promise.all([itemSales(tenantId, from, to), import("./costing").then((m) => m.loadCosts(tenantId))]);
  const { effectiveRate } = await import("./costing");
  const use = new Map<number, number>();
  for (const it of items) {
    const c = costs.get(it.id);
    if (!c?.hasRecipe) continue;
    for (const [ing, q] of c.usagePerPlate) use.set(ing, (use.get(ing) ?? 0) + q * it.qty);
  }
  return [...use].map(([id, qty]) => {
    const i = ingMap.get(id);
    return { id, name: i?.name ?? "?", unit: i?.unit ?? "", qty: Math.round(qty * 1000) / 1000, cost: i ? Math.round(qty * effectiveRate(i) * 100) / 100 : 0 };
  }).sort((a, b) => b.cost - a.cost);
}

/** Packaging pieces used on orders */
export async function packagingUsed(tenantId: number, from: string, to: string) {
  const M = schema.packagingMovements, P = schema.packaging;
  const rows = await db.select({ name: P.name, q: sql<number>`sum(-${M.qty})` }).from(M).innerJoin(P, eq(P.id, M.packagingId))
    .where(and(eq(M.tenantId, tenantId), eq(M.type, "USE"), gte(M.date, from), lte(M.date, to))).groupBy(P.name);
  return rows.map((r) => ({ name: r.name, qty: Number(r.q) })).filter((r) => r.qty > 0).sort((a, b) => b.qty - a.qty);
}

/** Bills not fully paid (any date), newest first - includes walk-in bills with no customer */
export async function unpaidBills(tenantId: number, limit = 50) {
  const paid = sql<number>`coalesce((select sum(p.amount) from payments p where p.order_id = ${O.id}),0)`;
  const rows = await db.select({ id: O.id, billNo: O.billNo, date: O.date, total: O.total, paid, name: schema.customers.name })
    .from(O).leftJoin(schema.customers, eq(schema.customers.id, O.customerId))
    .where(and(eq(O.tenantId, tenantId), eq(O.status, "ACTIVE"), sql`${O.total} - ${paid} > 0.5`))
    .orderBy(sql`${O.date} desc`, sql`${O.id} desc`).limit(limit);
  return rows.map((r) => ({ id: r.id, billNo: r.billNo, date: r.date, name: r.name ?? "Walk-in", due: Math.round((Number(r.total) - Number(r.paid)) * 100) / 100 }));
}

/** All money still due on bills: total, number of bills, and the part from bills of `today` */
export async function unpaidTotals(tenantId: number, today: string) {
  const paid = sql<number>`coalesce((select sum(p.amount) from payments p where p.order_id = ${O.id}),0)`;
  const due = sql`(${O.total} - ${paid})`;
  const [r] = await db.select({
    total: sql<number>`coalesce(sum(${due}),0)`, n: sql<number>`count(*)`,
    today: sql<number>`coalesce(sum(${due}) filter (where ${O.date} = ${today}),0)`,
    nToday: sql<number>`count(*) filter (where ${O.date} = ${today})`,
  }).from(O).where(and(eq(O.tenantId, tenantId), eq(O.status, "ACTIVE"), sql`${due} > 0.5`));
  return { total: Number(r.total), bills: Number(r.n), today: Number(r.today), billsToday: Number(r.nToday) };
}
