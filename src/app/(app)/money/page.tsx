import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { addDays, fmtDate, inr, monthStart, todayIST } from "@/lib/format";
import { ACCOUNT_LABEL, moneyReport } from "@/lib/money";
import { Card, PageHeader } from "@/components/ui";
import { DeleteEntry, MoneyEntryForm, RangePicker } from "@/components/money";

export const dynamic = "force-dynamic";
const ok = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
const inr2 = (n: number) => inr(n, 2);
const MAX_ROWS = 400;

// Cash & Bank: how much money we have (drawer cash + online/bank), and a bank-statement style ledger
export default async function Money({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const u = await requirePage("money");
  const sp = await searchParams;
  const today = todayIST();
  let to = ok(sp.to) ? sp.to! : today;
  let from = ok(sp.from) ? sp.from! : monthStart(to);
  if (from > to) [from, to] = [to, from];
  const r = await moneyReport(u.tenantId, from, to);
  const total = r.closing.CASH + r.closing.BANK;
  const lastMonthEnd = addDays(monthStart(today), -1);
  const quick = (label: string, f: string, t: string) => <Link href={`/money?from=${f}&to=${t}`} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${f === from && t === to ? "bg-brand text-white" : "bg-white ring-1 ring-line"}`}>{label}</Link>;
  const shown = r.rows.length > MAX_ROWS ? r.rows.slice(-MAX_ROWS) : r.rows;
  const tile = (label: string, v: number, hint: string, strong = false) => (
    <div className={`rounded-2xl p-4 ${strong ? "bg-brand text-white" : "bg-white ring-1 ring-line"}`}>
      <div className={`text-xs font-semibold uppercase tracking-wide ${strong ? "opacity-90" : "text-muted"}`}>{label}</div>
      <div className={`mt-1 text-2xl font-extrabold tabular-nums ${!strong && v < 0 ? "text-red-700" : ""}`}>{inr(v)}</div>
      <div className={`text-xs ${strong ? "opacity-90" : "text-muted"}`}>{hint}</div>
    </div>
  );
  return (
    <div className="space-y-4">
      <PageHeader title="Cash & Bank" subtitle={to === today ? "Money with you right now - cash in the drawer and money received online" : `Balances at the end of ${fmtDate(to)}`}
        actions={<a className="btn-gold btn-sm" href={`/api/money/xlsx?from=${from}&to=${to}`}>⬇ Download Excel</a>} />

      <div className="grid gap-3 sm:grid-cols-3">
        {tile("Cash in hand", r.closing.CASH, "Drawer cash (payments marked Cash)")}
        {tile("Online / Bank", r.closing.BANK, "UPI, card, BharatPe, Swiggy/Zomato payouts…")}
        {tile("Total money", total, to === today ? "Cash + online, now" : `on ${fmtDate(to)}`, true)}
      </div>

      {!r.hasOpening && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <b>Start here:</b> add an <b>Opening balance</b> for Cash (what is in the drawer) and for Online / Bank (your bank / UPI account balance) on the day you start. Everything after that is added automatically from bills, expenses, vendor payments and payouts.
        </div>
      )}
      <MoneyEntryForm today={today} startOpen={!r.hasOpening} />

      <div className="flex flex-wrap items-end gap-2">
        {quick("Today", today, today)}{quick("This month", monthStart(today), today)}{quick("Last month", monthStart(lastMonthEnd), lastMonthEnd)}
        <RangePicker from={from} to={to} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title={`${fmtDate(from)} – ${fmtDate(to)}`}>
          <table className="tbl">
            <thead><tr><th></th><th className="!text-right">Cash</th><th className="!text-right">Online / Bank</th><th className="!text-right">Total</th></tr></thead>
            <tbody>
              <tr><td>Opening</td><td className="num">{inr(r.opening.CASH)}</td><td className="num">{inr(r.opening.BANK)}</td><td className="num">{inr(r.opening.CASH + r.opening.BANK)}</td></tr>
              <tr className="text-emerald-700"><td>+ Money in (credit)</td><td className="num">{inr(r.totals.cashIn)}</td><td className="num">{inr(r.totals.bankIn)}</td><td className="num">{inr(r.totals.cashIn + r.totals.bankIn)}</td></tr>
              <tr className="text-red-700"><td>− Money out (debit)</td><td className="num">{inr(r.totals.cashOut)}</td><td className="num">{inr(r.totals.bankOut)}</td><td className="num">{inr(r.totals.cashOut + r.totals.bankOut)}</td></tr>
              <tr className="font-bold"><td>Closing</td><td className="num">{inr(r.closing.CASH)}</td><td className="num">{inr(r.closing.BANK)}</td><td className="num">{inr(total)}</td></tr>
            </tbody>
          </table>
        </Card>
        <Card title="Where the money came from / went">
          <div className="grid gap-4 sm:grid-cols-2 text-sm">
            <div><div className="mb-1 font-semibold">Received (by mode, after refunds)</div>
              {r.byMode.length ? r.byMode.map((m) => (
                <div key={m.mode}>
                  <div className="flex justify-between"><span>{m.mode}</span><span className="tabular-nums font-semibold">{inr(m.amount)}</span></div>
                  {m.refunded > 0 && <div className="flex justify-between pl-3 text-xs text-muted"><span>received {inr(m.received)} − refunded {inr(m.refunded)}</span></div>}
                </div>
              )) : <p className="text-muted">Nothing yet.</p>}
              <p className="mt-1 text-[11px] text-muted">Each payment is listed in the ledger below - tap a bill number to open it.</p>
            </div>
            <div><div className="mb-1 font-semibold">Spent (expenses & vendors)</div>
              {r.byCategory.length ? r.byCategory.map((c) => <div key={c.category} className="flex justify-between"><span>{c.category}</span><span className="tabular-nums">{inr(c.amount)}</span></div>) : <p className="text-muted">Nothing yet.</p>}
              <p className="mt-1 text-[11px] text-muted">Expenses on “Credit” are not paid yet, so they are not here.</p>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Ledger (like a bank statement)">
        {r.rows.length > MAX_ROWS && <p className="mb-2 text-xs text-muted">Showing the last {MAX_ROWS} of {r.rows.length} entries. Download Excel for all of them.</p>}
        <div className="overflow-x-auto">
          <table className="tbl min-w-[760px]">
            <thead><tr><th>Date</th><th>Details</th><th>Account</th><th className="!text-right">Credit (in)</th><th className="!text-right">Debit (out)</th><th className="!text-right">Cash bal.</th><th className="!text-right">Bank bal.</th><th className="!text-right">Total</th></tr></thead>
            <tbody>
              <tr className="bg-cream font-semibold"><td>{fmtDate(from)}</td><td>Opening balance</td><td></td><td></td><td></td><td className="num">{inr2(r.opening.CASH)}</td><td className="num">{inr2(r.opening.BANK)}</td><td className="num">{inr2(r.opening.CASH + r.opening.BANK)}</td></tr>
              {shown.map((x, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap">{fmtDate(x.date)}</td>
                  <td>{x.orderId ? <Link className="text-brand underline" href={`/orders/${x.orderId}`}>{x.details}</Link> : x.details}{x.entryId ? <> <DeleteEntry id={x.entryId} /></> : null}</td>
                  <td className="whitespace-nowrap text-xs">{ACCOUNT_LABEL[x.account]}</td>
                  <td className="num text-emerald-700">{x.credit ? inr2(x.credit) : ""}</td>
                  <td className="num text-red-700">{x.debit ? inr2(x.debit) : ""}</td>
                  <td className="num">{inr2(x.cash)}</td><td className="num">{inr2(x.bank)}</td><td className="num font-semibold">{inr2(x.cash + x.bank)}</td>
                </tr>
              ))}
              <tr className="bg-cream font-bold"><td>{fmtDate(to)}</td><td>Closing balance</td><td></td><td className="num">{inr2(r.totals.cashIn + r.totals.bankIn)}</td><td className="num">{inr2(r.totals.cashOut + r.totals.bankOut)}</td><td className="num">{inr2(r.closing.CASH)}</td><td className="num">{inr2(r.closing.BANK)}</td><td className="num">{inr2(total)}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">Added automatically: bill payments & refunds, expenses, vendor payments, Swiggy/Zomato payouts and cash-closing differences. Add opening balances, owner money and bank deposits with “+ Add entry”.</p>
      </Card>
    </div>
  );
}
