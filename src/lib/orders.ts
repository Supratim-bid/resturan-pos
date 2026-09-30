import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { loadCosts, usesPackaging } from "./costing";
import { round2, todayIST } from "./format";

export type OrderInput = {
  id?: number;
  date: string;
  customerId?: number | null;
  orderType: string;
  tableNo?: string;
  items: { menuItemId: number; qty: number; discount?: number }[];
  orderDiscount?: number;
  deliveryCharge?: number;
  packingCharge?: number;
  /** containers / bags etc. going with this order - for packaging stock + cost. Not on the bill unless chargePackaging */
  packaging?: { packagingId: number; qty: number }[];
  /** add the packaging to the customer's bill (off by default) */
  chargePackaging?: boolean;
  notes?: string;
  payNow?: { amount: number; mode: string } | null;
  /** pre-order for a later date / meal slot ("date" = day it is served) */
  isPreorder?: boolean;
  mealSlot?: string;
  slotTime?: string;
  /** send a KOT to the kitchen (restaurants with the KOT feature) */
  kot?: boolean;
};

/** Your cost for one piece, and the price used only when an order charges packaging (blank = same as cost) */
export function packPrice(p: { packPrice: number; piecesPerPack: number; billPrice?: number | null }) {
  const cost = Number(p.packPrice) / Math.max(1, p.piecesPerPack);
  return { cost: round2(cost), price: round2(p.billPrice == null ? cost : Number(p.billPrice)) };
}

export function calcTotals(
  lines: { qty: number; rate: number; discount: number }[],
  o: { orderDiscount: number; deliveryCharge: number; packingCharge: number; gstRate: number },
) {
  const itemsTotal = round2(lines.reduce((s, l) => s + l.qty * l.rate, 0));
  const itemDiscount = round2(lines.reduce((s, l) => s + (l.discount || 0), 0));
  const taxable = round2(Math.max(0, itemsTotal - itemDiscount - o.orderDiscount + o.deliveryCharge + o.packingCharge));
  const gstAmount = round2((taxable * o.gstRate) / 100);
  const raw = taxable + gstAmount;
  const total = Math.round(raw);
  return { itemsTotal, itemDiscount, taxable, gstAmount, roundOff: round2(total - raw), total };
}

/** Indian financial year for a date, e.g. 2026-09-29 -> "26-27" */
export function financialYear(date: string) {
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
  const start = m >= 4 ? y : y - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}

type BillFormat = { billPrefix: string; billDigits: number; billStart: number; billUseFy: boolean };
export function formatBillNo(f: BillFormat, n: number, fy: string) {
  return `${f.billPrefix}${f.billUseFy && fy ? fy + "/" : ""}${String(n).padStart(Math.max(1, Math.min(8, f.billDigits)), "0")}`;
}

/** Rebuild the stock deductions for one order from current recipes */
async function syncOrderStock(tx: typeof db, tenantId: number, orderId: number) {
  await syncOrderPackaging(tx, tenantId, orderId); // packaging pieces too (removed when the bill is cancelled)
  await tx.delete(schema.stockMovements).where(and(eq(schema.stockMovements.tenantId, tenantId), eq(schema.stockMovements.refType, "order"), eq(schema.stockMovements.refId, orderId)));
  const o = await tx.query.orders.findFirst({ where: and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)), with: { items: true } });
  if (!o || o.status !== "ACTIVE") return;
  const { costs, ingMap } = await loadCosts(tenantId);
  const use = new Map<number, number>();
  for (const it of o.items) {
    const c = costs.get(it.menuItemId);
    if (!c) continue;
    for (const [ing, q] of c.usagePerPlate) use.set(ing, (use.get(ing) ?? 0) + q * Number(it.qty));
  }
  const rows = [...use].filter(([id]) => ingMap.get(id)?.trackStock).map(([ingredientId, q]) => ({
    tenantId, date: o.date, ingredientId, qty: -Math.round(q * 10000) / 10000, type: "SALE", refType: "order", refId: orderId,
  }));
  if (rows.length) await tx.insert(schema.stockMovements).values(rows);
}

/** Packaging pieces used by one order come off packaging stock (given back if the bill is cancelled) */
async function syncOrderPackaging(tx: typeof db, tenantId: number, orderId: number) {
  await tx.delete(schema.packagingMovements).where(and(eq(schema.packagingMovements.tenantId, tenantId), eq(schema.packagingMovements.refType, "order"), eq(schema.packagingMovements.refId, orderId)));
  const o = await tx.query.orders.findFirst({ where: and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)), with: { packaging: true } });
  if (!o || o.status !== "ACTIVE" || !o.packaging.length) return;
  await tx.insert(schema.packagingMovements).values(o.packaging.map((p) => ({
    tenantId, packagingId: p.packagingId, date: o.date, qty: -Math.round(Number(p.qty)), type: "USE", refType: "order", refId: orderId, notes: o.billNo,
  })));
}

/** Pieces in stock per packaging item */
export async function packagingStock(tenantId: number) {
  const rows = await db.select({ id: schema.packagingMovements.packagingId, q: sql<number>`sum(${schema.packagingMovements.qty})`, n: sql<number>`count(*)` })
    .from(schema.packagingMovements).where(eq(schema.packagingMovements.tenantId, tenantId)).groupBy(schema.packagingMovements.packagingId);
  return new Map(rows.map((r) => [r.id, { qty: Number(r.q), tracked: Number(r.n) > 0 }]));
}

export async function saveOrder(tenantId: number, input: OrderInput, userId: number) {
  if (!input.items.length) throw new Error("Add at least one dish.");
  const [setting, { costs }] = await Promise.all([
    db.query.settings.findFirst({ where: eq(schema.settings.tenantId, tenantId) }), loadCosts(tenantId),
  ]);
  if (!setting) throw new Error("Restaurant settings missing.");
  if (input.customerId) {
    const c = await db.query.customers.findFirst({ where: and(eq(schema.customers.id, input.customerId), eq(schema.customers.tenantId, tenantId)) });
    if (!c) throw new Error("Customer not found.");
  }
  const ids = input.items.map((i) => i.menuItemId);
  const menu = await db.query.menuItems.findMany({ where: and(inArray(schema.menuItems.id, ids), eq(schema.menuItems.tenantId, tenantId)) });
  const mm = new Map(menu.map((m) => [m.id, m]));
  // packaging chosen on the order (priced from the Packaging tab)
  const packIn = (input.packaging ?? []).filter((p) => p.packagingId && Number(p.qty) > 0);
  const packRows = packIn.length ? await db.query.packaging.findMany({ where: and(eq(schema.packaging.tenantId, tenantId), inArray(schema.packaging.id, packIn.map((p) => p.packagingId))) }) : [];
  const pm = new Map(packRows.map((p) => [p.id, p]));
  const packLines = packIn.map((p) => {
    const row = pm.get(p.packagingId);
    if (!row) throw new Error("A packaging item was removed. Refresh and try again.");
    const { cost, price } = packPrice(row);
    return { packagingId: row.id, name: row.name, qty: Math.max(1, Math.round(Number(p.qty))), unitPrice: input.chargePackaging ? price : 0, unitCost: cost };
  });
  const charged = !!input.chargePackaging && packLines.length > 0;
  const packagingCharge = round2(packLines.reduce((s, l) => s + l.qty * l.unitPrice, 0));
  const packagingCost = round2(packLines.reduce((s, l) => s + l.qty * l.unitCost, 0));
  // with packaging picked on the order, dish costs are food-only (no recipe packaging counted twice)
  const pack = packLines.length ? false : usesPackaging(input.orderType);
  // editing: keep the price each dish was sold at
  const oldRates = new Map<number, number>();
  if (input.id) {
    const own = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, input.id), eq(schema.orders.tenantId, tenantId)) });
    if (!own) throw new Error("Order not found.");
    const old = await db.query.orderItems.findMany({ where: eq(schema.orderItems.orderId, input.id) });
    for (const it of old) oldRates.set(it.menuItemId, Number(it.rate));
  }
  const lines = input.items.filter((i) => i.qty > 0).map((i) => {
    const m = mm.get(i.menuItemId);
    if (!m) throw new Error("A dish was removed from the menu. Refresh and try again.");
    if (!m.available && !oldRates.has(m.id) && !input.isPreorder) throw new Error(`${m.name} is marked not available right now.`);
    const c = costs.get(m.id);
    const unitCost = c ? (c.hasRecipe ? c.foodPerPlate + (pack ? c.packagingPerPlate : 0) : c.costUsed) : 0;
    const rate = oldRates.get(m.id) ?? Number(m.price), qty = Number(i.qty), discount = round2(Number(i.discount || 0));
    return { menuItemId: m.id, name: m.name, qty, rate, discount, lineTotal: round2(qty * rate - discount), unitCost: round2(unitCost) };
  });
  const gstRate = Number(setting.gstRate ?? 0);
  const extras = {
    orderDiscount: round2(Number(input.orderDiscount || 0)),
    deliveryCharge: round2(Number(input.deliveryCharge || 0)),
    // packaging is internal by default; only when the order says "charge packaging" does it go on the bill
    packingCharge: charged ? packagingCharge : round2(Number(input.packingCharge || 0)),
    gstRate,
  };
  const t = calcTotals(lines, extras);
  const foodCost = round2(lines.reduce((s, l) => s + l.unitCost * l.qty, 0) + packagingCost);
  const base = {
    date: input.date, customerId: input.customerId || null, orderType: input.orderType, tableNo: input.tableNo || "",
    ...extras, ...t, foodCost, packagingCost, notes: input.notes || "",
    packagingCharged: charged,
    isPreorder: !!input.isPreorder,
    mealSlot: input.isPreorder ? (input.mealSlot || "").slice(0, 40) : "",
    slotTime: input.isPreorder && /^\d{2}:\d{2}$/.test(input.slotTime || "") ? input.slotTime! : "",
  };
  if (input.isPreorder && !base.mealSlot) throw new Error("Pick the meal (breakfast / lunch / dinner) for this pre-order.");

  // KOT: a new number per day; an edited order goes back to the kitchen as "updated"
  const kotNext = async (tx: typeof db, date: string) => {
    const [{ mx }] = await tx.select({ mx: sql<number>`coalesce(max(${schema.orders.kotNo}),0)` }).from(schema.orders)
      .where(and(eq(schema.orders.tenantId, tenantId), eq(schema.orders.date, date)));
    return Number(mx) + 1;
  };
  const itemsKey = (xs: { menuItemId: number; qty: number | string }[]) => xs.map((x) => `${x.menuItemId}:${Number(x.qty)}`).sort().join(",");

  return await db.transaction(async (tx) => {
    let orderId = input.id;
    if (orderId) {
      const prev = await tx.query.orders.findFirst({ where: and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)) });
      let kot = {};
      if (prev?.kotNo) {
        const old = await tx.query.orderItems.findMany({ where: eq(schema.orderItems.orderId, orderId) });
        const changed = itemsKey(old) !== itemsKey(lines) || (prev.notes ?? "") !== base.notes;
        const moved = prev.date !== base.date;
        if (changed || moved) {
          if (moved) await tx.execute(sql`select pg_advisory_xact_lock(${tenantId})`);
          kot = { kotStatus: "NEW", kotAt: new Date(), kotUpdated: true, ...(moved ? { kotNo: await kotNext(tx as unknown as typeof db, base.date) } : {}) };
        }
      } else if (input.kot) {
        await tx.execute(sql`select pg_advisory_xact_lock(${tenantId})`);
        kot = { kotNo: await kotNext(tx as unknown as typeof db, base.date), kotStatus: "NEW", kotAt: new Date(), kotUpdated: false };
      }
      await tx.update(schema.orders).set({
        ...base, ...kot,
        bookedOn: base.isPreorder ? (prev?.bookedOn ?? todayIST()) : null,
        fulfilStatus: base.isPreorder ? (prev?.fulfilStatus || "PENDING") : "",
      }).where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)));
      await tx.delete(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
      await tx.delete(schema.orderPackaging).where(eq(schema.orderPackaging.orderId, orderId));
      await tx.update(schema.payments).set({ customerId: base.customerId }).where(and(eq(schema.payments.orderId, orderId), eq(schema.payments.tenantId, tenantId)));
    } else {
      // one bill number at a time per restaurant
      await tx.execute(sql`select pg_advisory_xact_lock(${tenantId})`);
      const fy = setting.billUseFy ? financialYear(input.date) : "";
      const orderNo = await nextFreeNo(tx as unknown as typeof db, tenantId, fy, setting.billStart || 1, setting.reuseCancelledNo);
      const billNo = formatBillNo(setting, orderNo, fy);
      const kot = input.kot ? { kotNo: await kotNext(tx as unknown as typeof db, base.date), kotStatus: "NEW", kotAt: new Date() } : {};
      const [row] = await tx.insert(schema.orders).values({ ...base, ...kot, tenantId, orderNo, fy, billNo, createdById: userId, bookedOn: base.isPreorder ? todayIST() : null, fulfilStatus: base.isPreorder ? "PENDING" : "" }).returning({ id: schema.orders.id });
      orderId = row.id;
    }
    await tx.insert(schema.orderItems).values(lines.map((l) => ({ ...l, orderId: orderId! })));
    if (packLines.length) await tx.insert(schema.orderPackaging).values(packLines.map((l) => ({ ...l, orderId: orderId! })));
    if (input.payNow && input.payNow.amount > 0) {
      await tx.insert(schema.payments).values({
        // money is received today (an advance, for pre-orders)
        tenantId, date: input.isPreorder && input.date > todayIST() ? todayIST() : input.date, orderId, customerId: base.customerId,
        amount: round2(input.payNow.amount), mode: input.payNow.mode, notes: input.isPreorder && input.date > todayIST() ? "Advance for pre-order" : "",
      });
    }
    await syncOrderStock(tx as unknown as typeof db, tenantId, orderId!);
    return orderId!;
  });
}

/** Preview of the next bill number (not reserved) */
export async function nextBillNo(tenantId: number, date: string) {
  const s = await db.query.settings.findFirst({ where: eq(schema.settings.tenantId, tenantId) });
  if (!s) return "";
  const fy = s.billUseFy ? financialYear(date) : "";
  return formatBillNo(s, await nextFreeNo(db, tenantId, fy, s.billStart || 1, s.reuseCancelledNo), fy);
}

/**
 * Next bill number. With "reuse" on, a number freed by a cancelled bill (AP-0002 -> AP-0002-CAN)
 * is given to the next new bill; otherwise it is always last number + 1.
 */
async function nextFreeNo(tx: typeof db, tenantId: number, fy: string, start: number, reuse: boolean) {
  const [{ mx }] = await tx.select({ mx: sql<number>`coalesce(max(${schema.orders.orderNo}),0)` }).from(schema.orders)
    .where(and(eq(schema.orders.tenantId, tenantId), eq(schema.orders.fy, fy)));
  const next = Math.max(Number(mx) + 1, start);
  if (!reuse) return next;
  const r = await tx.execute(sql`select min(n)::int as n from generate_series(${start}::int, ${next}::int) n
    where not exists (select 1 from orders o where o.tenant_id = ${tenantId} and o.fy = ${fy} and o.order_no = n)`);
  const row = (r as unknown as { n: number | null }[])[0];
  return Number(row?.n ?? next);
}

/**
 * Cancel a bill: stock goes back, and the money already received is either
 * refunded (a minus entry in the same mode, dated today) or kept as the customer's advance.
 * If number reuse is on, the bill becomes e.g. AP-0002-CAN and AP-0002 is free for the next bill.
 */
export async function cancelOrder(tenantId: number, orderId: number, money: "REFUND" | "ADVANCE") {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${tenantId})`);
    const o = await tx.query.orders.findFirst({ where: and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)), with: { payments: true } });
    if (!o) throw new Error("Order not found.");
    const s = await tx.query.settings.findFirst({ where: eq(schema.settings.tenantId, tenantId) });
    const paid = round2(o.payments.reduce((a, p) => a + Number(p.amount), 0));
    if (paid > 0 && money === "ADVANCE" && !o.customerId) throw new Error("This bill has no customer, so the money can't be kept as advance. Choose refund.");
    const set: Partial<typeof schema.orders.$inferInsert> = { status: "CANCELLED", cancelMoney: paid > 0 ? (money === "REFUND" ? "REFUNDED" : "ADVANCE") : "" };
    if (s?.reuseCancelledNo && o.orderNo > 0) {
      let name = `${o.billNo}-CAN`, k = 2;
      while (await tx.query.orders.findFirst({ where: and(eq(schema.orders.tenantId, tenantId), eq(schema.orders.billNo, name)) })) name = `${o.billNo}-CAN${k++}`;
      set.billNo = name; set.orderNo = -o.id; // frees the number
    }
    await tx.update(schema.orders).set(set).where(eq(schema.orders.id, o.id));
    await returnMoney(tx as unknown as typeof db, tenantId, o, money);
    await syncOrderStock(tx as unknown as typeof db, tenantId, o.id);
  });
}

type OrderWithPays = typeof schema.orders.$inferSelect & { payments: (typeof schema.payments.$inferSelect)[] };
async function returnMoney(tx: typeof db, tenantId: number, o: OrderWithPays, money: "REFUND" | "ADVANCE") {
    const paid = round2(o.payments.reduce((a, p) => a + Number(p.amount), 0));
    if (paid > 0 && money === "REFUND") {
      const byMode = new Map<string, number>();
      for (const p of o.payments) byMode.set(p.mode, round2((byMode.get(p.mode) ?? 0) + Number(p.amount)));
      const rows = [...byMode].filter(([, a]) => a > 0).map(([mode, a]) => ({
        tenantId, orderId: o.id, customerId: o.customerId, date: todayIST(), amount: -a, mode, ref: "refund", notes: `Refund - bill ${o.billNo} cancelled`,
      }));
      if (rows.length) await tx.insert(schema.payments).values(rows);
    } else if (paid > 0 && money === "ADVANCE") {
      await tx.update(schema.payments).set({ orderId: null, notes: sql`trim(${schema.payments.notes} || ' · advance from cancelled bill ' || ${o.billNo})` })
        .where(and(eq(schema.payments.orderId, o.id), eq(schema.payments.tenantId, tenantId)));
    }
}

/** For a bill cancelled earlier while still holding money: refund it or keep it as advance now */
export async function settleCancelledMoney(tenantId: number, orderId: number, money: "REFUND" | "ADVANCE") {
  await db.transaction(async (tx) => {
    const o = await tx.query.orders.findFirst({ where: and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)), with: { payments: true } });
    if (!o) throw new Error("Order not found.");
    if (o.status !== "CANCELLED") throw new Error("This bill is not cancelled.");
    const paid = round2(o.payments.reduce((a, p) => a + Number(p.amount), 0));
    if (paid <= 0) throw new Error("No money is left on this bill.");
    if (money === "ADVANCE" && !o.customerId) throw new Error("This bill has no customer, so the money can't be kept as advance.");
    await returnMoney(tx as unknown as typeof db, tenantId, o, money);
    await tx.update(schema.orders).set({ cancelMoney: money === "REFUND" ? "REFUNDED" : "ADVANCE" }).where(eq(schema.orders.id, o.id));
  });
}

/** Bring a cancelled bill back. If its number was given away, it gets a new one. */
export async function restoreOrder(tenantId: number, orderId: number) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${tenantId})`);
    const o = await tx.query.orders.findFirst({ where: and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)) });
    if (!o) throw new Error("Order not found.");
    const set: Partial<typeof schema.orders.$inferInsert> = { status: "ACTIVE", cancelMoney: "" };
    if (o.orderNo < 0) {
      const s = await tx.query.settings.findFirst({ where: eq(schema.settings.tenantId, tenantId) });
      if (!s) throw new Error("Restaurant settings missing.");
      const n = await nextFreeNo(tx as unknown as typeof db, tenantId, o.fy, s.billStart || 1, s.reuseCancelledNo);
      set.orderNo = n; set.billNo = formatBillNo(s, n, o.fy);
    }
    await tx.update(schema.orders).set(set).where(eq(schema.orders.id, o.id));
    await syncOrderStock(tx as unknown as typeof db, tenantId, o.id);
  });
}

export async function setOrderStatus(tenantId: number, orderId: number, status: "ACTIVE" | "CANCELLED") {
  await db.transaction(async (tx) => {
    await tx.update(schema.orders).set({ status }).where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)));
    await syncOrderStock(tx as unknown as typeof db, tenantId, orderId);
  });
}

/** Paid amount per order */
export async function paidByOrder(tenantId: number, orderIds: number[]) {
  const m = new Map<number, number>();
  if (!orderIds.length) return m;
  const rows = await db.select({ orderId: schema.payments.orderId, s: sql<number>`sum(${schema.payments.amount})` })
    .from(schema.payments).where(and(eq(schema.payments.tenantId, tenantId), inArray(schema.payments.orderId, orderIds))).groupBy(schema.payments.orderId);
  for (const r of rows) if (r.orderId) m.set(r.orderId, Number(r.s));
  return m;
}

export function payStatus(total: number, paid: number) {
  const due = round2(total - paid);
  if (due <= 0.5) return { label: "Paid", due: 0, tone: "green" as const };
  if (paid > 0) return { label: "Part-paid", due, tone: "amber" as const };
  return { label: "Unpaid", due, tone: "red" as const };
}

/**
 * Receive money from a customer: fills their oldest unpaid orders first (FIFO),
 * anything left is kept as advance (payment without order).
 */
export async function receiveCustomerPayment(tenantId: number, customerId: number, amount: number, mode: string, date: string, notes = "") {
  const c = await db.query.customers.findFirst({ where: and(eq(schema.customers.id, customerId), eq(schema.customers.tenantId, tenantId)) });
  if (!c) throw new Error("Customer not found.");
  let left = round2(amount);
  const ords = await db.query.orders.findMany({
    where: and(eq(schema.orders.tenantId, tenantId), eq(schema.orders.customerId, customerId), eq(schema.orders.status, "ACTIVE")),
    orderBy: (o, { asc }) => [asc(o.date), asc(o.id)],
  });
  const paid = await paidByOrder(tenantId, ords.map((o) => o.id));
  const rows: (typeof schema.payments.$inferInsert)[] = [];
  for (const o of ords) {
    if (left <= 0) break;
    const due = round2(Number(o.total) - (paid.get(o.id) ?? 0));
    if (due <= 0) continue;
    const a = Math.min(due, left);
    rows.push({ tenantId, date, orderId: o.id, customerId, amount: a, mode, notes });
    left = round2(left - a);
  }
  if (left > 0) rows.push({ tenantId, date, orderId: null, customerId, amount: left, mode, notes: notes || "Advance" });
  if (rows.length) await db.insert(schema.payments).values(rows);
}

/** Balance per customer: + = customer owes, - = advance */
export async function customerBalances(tenantId: number) {
  const billed = await db.select({ c: schema.orders.customerId, s: sql<number>`sum(${schema.orders.total})` })
    .from(schema.orders).where(and(eq(schema.orders.tenantId, tenantId), eq(schema.orders.status, "ACTIVE"))).groupBy(schema.orders.customerId);
  const paid = await db.select({ c: schema.payments.customerId, s: sql<number>`sum(${schema.payments.amount})` })
    .from(schema.payments).leftJoin(schema.orders, eq(schema.payments.orderId, schema.orders.id))
    .where(and(eq(schema.payments.tenantId, tenantId), sql`(${schema.orders.id} is null or ${schema.orders.status} = 'ACTIVE')`))
    .groupBy(schema.payments.customerId);
  const m = new Map<number, { billed: number; paid: number; balance: number }>();
  for (const b of billed) if (b.c) m.set(b.c, { billed: Number(b.s), paid: 0, balance: Number(b.s) });
  for (const p of paid) {
    if (!p.c) continue;
    const e = m.get(p.c) ?? { billed: 0, paid: 0, balance: 0 };
    e.paid = Number(p.s); e.balance = round2(e.billed - e.paid);
    m.set(p.c, e);
  }
  return m;
}
