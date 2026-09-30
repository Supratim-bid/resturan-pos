import "server-only";
import { and, asc, eq, gte, lt, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { round2 } from "./format";

// Cash & Bank ledger. Two "accounts":
//   CASH = money in the drawer (payment mode "Cash")
//   BANK = everything received / paid online (UPI, card, BharatPe, Razorpay... and Swiggy/Zomato payouts)
// "Credit" means not paid yet, so it never moves money.
export type Account = "CASH" | "BANK";
export const ACCOUNT_LABEL: Record<Account, string> = { CASH: "Cash", BANK: "Online / Bank" };
export const accountOf = (mode: string | null | undefined): Account | null =>
  !mode || mode === "Credit" ? null : mode === "Cash" ? "CASH" : "BANK";

// SQL version of accountOf for totals
const acctSql = (col: unknown) => sql<string>`case when ${col} = 'Cash' then 'CASH' when ${col} = 'Credit' then null else 'BANK' end`;

export type LedgerRow = {
  date: string; seq: number; account: Account; credit: number; debit: number;
  details: string; source: "BILL" | "REFUND" | "EXPENSE" | "VENDOR" | "PAYOUT" | "CASHCOUNT" | "ENTRY"; mode?: string; entryId?: number; category?: string;
};

export const ENTRY_TYPES = {
  OPENING: { label: "Opening balance", help: "Cash in the drawer / money in the bank on the day you start" },
  IN: { label: "Money added", help: "Owner put money in, loan received, other income" },
  OUT: { label: "Money taken out", help: "Owner withdrawal, bank charges, other payments not in Expenses" },
  DEPOSIT: { label: "Cash deposited in bank", help: "Cash moved from the drawer to the bank" },
  WITHDRAW: { label: "Cash withdrawn from bank", help: "Money taken from the bank / ATM into the drawer" },
} as const;
export type EntryType = keyof typeof ENTRY_TYPES;

/** Balances of both accounts at the end of `before` (exclusive) - i.e. the opening for a period */
export async function balancesBefore(tenantId: number, before: string) {
  const T = tenantId;
  const P = schema.payments, E = schema.expenses, V = schema.vendorPayments, S = schema.settlements, C = schema.cashClosings, M = schema.moneyEntries;
  const [pay, exp, ven, pout, cc, me] = await Promise.all([
    db.select({ a: acctSql(P.mode), s: sql<string>`coalesce(sum(${P.amount}),0)` }).from(P).where(and(eq(P.tenantId, T), lt(P.date, before))).groupBy(acctSql(P.mode)),
    db.select({ a: acctSql(E.paymentMode), s: sql<string>`coalesce(sum(${E.amount}),0)` }).from(E).where(and(eq(E.tenantId, T), lt(E.date, before))).groupBy(acctSql(E.paymentMode)),
    db.select({ a: acctSql(V.mode), s: sql<string>`coalesce(sum(${V.amount}),0)` }).from(V).where(and(eq(V.tenantId, T), lt(V.date, before))).groupBy(acctSql(V.mode)),
    db.select({ s: sql<string>`coalesce(sum(${S.payout}),0)` }).from(S).where(and(eq(S.tenantId, T), lt(S.payoutDate, before))),
    db.select({ s: sql<string>`coalesce(sum(${C.actual} - ${C.expected}),0)` }).from(C).where(and(eq(C.tenantId, T), lt(C.date, before))),
    db.select({ kind: M.kind, a: M.account, to: M.toAccount, s: sql<string>`coalesce(sum(${M.amount}),0)` }).from(M).where(and(eq(M.tenantId, T), lt(M.date, before))).groupBy(M.kind, M.account, M.toAccount),
  ]);
  const b: Record<Account, number> = { CASH: 0, BANK: 0 };
  const add = (a: string | null, n: number) => { if (a === "CASH" || a === "BANK") b[a] += n; };
  for (const r of pay) add(r.a, Number(r.s));
  for (const r of exp) add(r.a, -Number(r.s));
  for (const r of ven) add(r.a, -Number(r.s));
  b.BANK += Number(pout[0]?.s ?? 0);
  b.CASH += Number(cc[0]?.s ?? 0);
  for (const r of me) {
    const n = Number(r.s);
    if (r.kind === "OPENING" || r.kind === "IN") add(r.a, n);
    else if (r.kind === "OUT") add(r.a, -n);
    else if (r.kind === "TRANSFER") { add(r.a, -n); add(r.to, n); }
  }
  return { CASH: round2(b.CASH), BANK: round2(b.BANK) };
}

/** Every money movement between from and to (inclusive), oldest first */
export async function ledgerRows(tenantId: number, from: string, to: string): Promise<LedgerRow[]> {
  const T = tenantId;
  const P = schema.payments, E = schema.expenses, V = schema.vendorPayments, S = schema.settlements, C = schema.cashClosings, M = schema.moneyEntries;
  const [pays, exps, vens, pouts, ccs, mes] = await Promise.all([
    db.query.payments.findMany({ where: and(eq(P.tenantId, T), gte(P.date, from), lte(P.date, to)), with: { order: { columns: { billNo: true } }, customer: { columns: { name: true } } }, orderBy: [asc(P.date), asc(P.id)] }),
    db.query.expenses.findMany({ where: and(eq(E.tenantId, T), gte(E.date, from), lte(E.date, to)), with: { vendor: { columns: { name: true } }, staff: { columns: { name: true } } }, orderBy: [asc(E.date), asc(E.id)] }),
    db.query.vendorPayments.findMany({ where: and(eq(V.tenantId, T), gte(V.date, from), lte(V.date, to)), with: { vendor: { columns: { name: true } } }, orderBy: [asc(V.date), asc(V.id)] }),
    db.query.settlements.findMany({ where: and(eq(S.tenantId, T), gte(S.payoutDate, from), lte(S.payoutDate, to)), orderBy: [asc(S.payoutDate), asc(S.id)] }),
    db.query.cashClosings.findMany({ where: and(eq(C.tenantId, T), gte(C.date, from), lte(C.date, to)), orderBy: [asc(C.date)] }),
    db.query.moneyEntries.findMany({ where: and(eq(M.tenantId, T), gte(M.date, from), lte(M.date, to)), orderBy: [asc(M.date), asc(M.id)] }),
  ]);
  const rows: LedgerRow[] = [];
  // order inside a day: opening entries, money in, money out, cash count last
  for (const m of mes) {
    const n = Number(m.amount), a = m.account as Account, what = m.category || ENTRY_TYPES[(m.kind === "TRANSFER" ? (m.account === "CASH" ? "DEPOSIT" : "WITHDRAW") : m.kind) as EntryType]?.label || m.kind;
    const details = m.notes ? `${what} · ${m.notes}` : what;
    if (m.kind === "OPENING") rows.push({ date: m.date, seq: 0, account: a, credit: n, debit: 0, details, source: "ENTRY", entryId: m.id, category: what });
    else if (m.kind === "IN") rows.push({ date: m.date, seq: 1, account: a, credit: n, debit: 0, details, source: "ENTRY", entryId: m.id, category: what });
    else if (m.kind === "OUT") rows.push({ date: m.date, seq: 3, account: a, credit: 0, debit: n, details, source: "ENTRY", entryId: m.id, category: what });
    else if (m.kind === "TRANSFER") {
      rows.push({ date: m.date, seq: 3, account: a, credit: 0, debit: n, details, source: "ENTRY", entryId: m.id, category: what });
      rows.push({ date: m.date, seq: 3, account: m.toAccount as Account, credit: n, debit: 0, details, source: "ENTRY", entryId: m.id, category: what });
    }
  }
  for (const p of pays) {
    const a = accountOf(p.mode); if (!a) continue;
    const n = Number(p.amount);
    const who = [p.order ? `Bill ${p.order.billNo}` : "Advance", p.customer?.name].filter(Boolean).join(" · ");
    if (n >= 0) rows.push({ date: p.date, seq: 1, account: a, credit: n, debit: 0, details: `${who} (${p.mode})`, source: "BILL", mode: p.mode });
    else rows.push({ date: p.date, seq: 2, account: a, credit: 0, debit: -n, details: `Refund · ${who} (${p.mode})`, source: "REFUND", mode: p.mode });
  }
  for (const s of pouts) rows.push({ date: s.payoutDate, seq: 1, account: "BANK", credit: Number(s.payout), debit: 0, details: `${s.platform} payout${s.notes ? ` · ${s.notes}` : ""}`, source: "PAYOUT", mode: s.platform });
  for (const e of exps) {
    const a = accountOf(e.paymentMode); if (!a) continue;
    const bits = [e.category, e.description, e.vendor?.name, e.staff?.name].filter(Boolean).join(" · ");
    rows.push({ date: e.date, seq: 2, account: a, credit: 0, debit: Number(e.amount), details: `${bits} (${e.paymentMode})`, source: "EXPENSE", mode: e.paymentMode, category: e.category });
  }
  for (const v of vens) {
    const a = accountOf(v.mode); if (!a) continue;
    rows.push({ date: v.date, seq: 2, account: a, credit: 0, debit: Number(v.amount), details: `Paid vendor · ${v.vendor?.name ?? ""} (${v.mode})`, source: "VENDOR", mode: v.mode, category: "Vendor payment" });
  }
  for (const c of ccs) {
    const d = round2(Number(c.actual) - Number(c.expected));
    if (Math.abs(d) < 0.005) continue;
    rows.push({ date: c.date, seq: 4, account: "CASH", credit: d > 0 ? d : 0, debit: d < 0 ? -d : 0, details: `Cash count ${d > 0 ? "extra" : "short"} (cash closing${c.closedBy ? ` by ${c.closedBy}` : ""})`, source: "CASHCOUNT" });
  }
  rows.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.seq - y.seq));
  return rows;
}

/** Everything the Cash & Bank page and the Excel file need */
export async function moneyReport(tenantId: number, from: string, to: string) {
  const [opening, rows, entryCount] = await Promise.all([
    balancesBefore(tenantId, from),
    ledgerRows(tenantId, from, to),
    db.select({ n: sql<number>`count(*)` }).from(schema.moneyEntries).where(and(eq(schema.moneyEntries.tenantId, tenantId), eq(schema.moneyEntries.kind, "OPENING"))),
  ]);
  const bal = { ...opening };
  const withBal = rows.map((r) => {
    bal[r.account] = round2(bal[r.account] + r.credit - r.debit);
    return { ...r, cash: bal.CASH, bank: bal.BANK };
  });
  const sum = (f: (r: LedgerRow) => boolean, k: "credit" | "debit") => round2(rows.filter(f).reduce((s, r) => s + r[k], 0));
  const byMode = new Map<string, number>();
  for (const r of rows) if (r.source === "BILL" || r.source === "PAYOUT") byMode.set(r.mode ?? "", round2((byMode.get(r.mode ?? "") ?? 0) + r.credit));
  const byCat = new Map<string, number>();
  for (const r of rows) if (r.source === "EXPENSE" || r.source === "VENDOR") byCat.set(r.category ?? "Other", round2((byCat.get(r.category ?? "Other") ?? 0) + r.debit));
  // day by day: money in / out and closing balances
  const days = new Map<string, { date: string; cashIn: number; bankIn: number; cashOut: number; bankOut: number; cash: number; bank: number }>();
  for (const r of withBal) {
    const d = days.get(r.date) ?? { date: r.date, cashIn: 0, bankIn: 0, cashOut: 0, bankOut: 0, cash: 0, bank: 0 };
    if (r.account === "CASH") { d.cashIn = round2(d.cashIn + r.credit); d.cashOut = round2(d.cashOut + r.debit); }
    else { d.bankIn = round2(d.bankIn + r.credit); d.bankOut = round2(d.bankOut + r.debit); }
    d.cash = r.cash; d.bank = r.bank;
    days.set(r.date, d);
  }
  return {
    from, to, opening, closing: { CASH: bal.CASH, BANK: bal.BANK }, rows: withBal,
    totals: {
      cashIn: sum((r) => r.account === "CASH", "credit"), cashOut: sum((r) => r.account === "CASH", "debit"),
      bankIn: sum((r) => r.account === "BANK", "credit"), bankOut: sum((r) => r.account === "BANK", "debit"),
      sales: sum((r) => r.source === "BILL" || r.source === "PAYOUT", "credit"),
      spent: sum((r) => r.source === "EXPENSE" || r.source === "VENDOR", "debit"),
    },
    byMode: [...byMode].map(([mode, amount]) => ({ mode, amount })).sort((a, b) => b.amount - a.amount),
    byCategory: [...byCat].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
    days: [...days.values()],
    hasOpening: Number(entryCount[0]?.n ?? 0) > 0,
  };
}
export type MoneyReport = Awaited<ReturnType<typeof moneyReport>>;
