import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { cashFigures } from "@/lib/cash";
import { fmtDate, inr, todayIST } from "@/lib/format";
import { Badge, Card, PageHeader } from "@/components/ui";
import { CashForm } from "@/components/cash-form";
import { DateJump } from "@/components/date-jump";

export default async function Cash({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const u = await requirePage("cash");
  const date = (await searchParams).date || todayIST();
  const [f, existing, history] = await Promise.all([
    cashFigures(u.tenantId, date),
    db.query.cashClosings.findFirst({ where: and(eq(schema.cashClosings.tenantId, u.tenantId), eq(schema.cashClosings.date, date)) }),
    db.query.cashClosings.findMany({ where: eq(schema.cashClosings.tenantId, u.tenantId), orderBy: [desc(schema.cashClosings.date)], limit: 30 }),
  ]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Cash Closing" subtitle="End of day: does the cash in the drawer match the app?" actions={<DateJump value={date} />} />
      <Card title={`${fmtDate(date)}${existing ? " · already closed (you can update)" : ""}`}>
        <CashForm key={date} date={date} cashIn={f.cashIn} cashOut={f.cashOut}
          opening={existing ? Number(existing.openingCash) : f.suggestedOpening} actual={existing ? Number(existing.actual) : null} notes={existing?.notes ?? ""} />
        <p className="mt-2 text-xs text-muted">Only payments marked “Cash” count. Opening cash defaults to the last closing’s counted amount{f.prevDate ? ` (${fmtDate(f.prevDate)})` : ""}.</p>
      </Card>
      <Card title="Money received online today (UPI, card, BharatPe...)" className="mt-4">
        {f.online.length ? (
          <div className="space-y-1 text-sm">
            {f.online.map((o) => <div key={o.mode} className="flex justify-between"><span>{o.mode}</span><span className="tabular-nums">{inr(o.amount)}</span></div>)}
            <div className="flex justify-between border-t border-line pt-1 font-bold"><span>Total online</span><span className="tabular-nums">{inr(f.online.reduce((a, o) => a + o.amount, 0))}</span></div>
          </div>
        ) : <p className="text-sm text-muted">No online payments recorded on this day.</p>}
        <div className="mt-3 rounded-xl bg-cream px-3 py-2 text-sm">
          <div className="flex justify-between"><span>Cash received</span><span className="tabular-nums">{inr(f.cashIn)}</span></div>
          <div className="flex justify-between"><span>Online received</span><span className="tabular-nums">{inr(f.online.reduce((a, o) => a + o.amount, 0))}</span></div>
          <div className="flex justify-between border-t border-line pt-1 font-bold"><span>Total collected today</span><span className="tabular-nums">{inr(f.cashIn + f.online.reduce((a, o) => a + o.amount, 0))}</span></div>
        </div>
        {can(u, "money") && <p className="mt-2 text-xs"><Link className="font-semibold text-brand underline" href={`/money?from=${date}&to=${date}`}>See cash + bank balance for this day →</Link></p>}
      </Card>
      <Card title="Past closings" className="mt-4">
        {history.length ? (
          <div className="overflow-x-auto"><table className="tbl">
            <thead><tr><th>Date</th><th className="!text-right">Expected</th><th className="!text-right">Counted</th><th className="!text-right">Diff</th><th>By</th></tr></thead>
            <tbody>{history.map((h) => (
              <tr key={h.id}><td>{fmtDate(h.date)}</td><td className="num">{inr(Number(h.expected))}</td><td className="num">{inr(Number(h.actual))}</td>
                <td className="num">{Math.abs(Number(h.difference)) < 1 ? <Badge tone="green">OK</Badge> : <Badge tone="red">{inr(Number(h.difference))}</Badge>}</td><td className="text-xs">{h.closedBy}</td></tr>
            ))}</tbody>
          </table></div>
        ) : <p className="text-sm text-muted">No closings yet.</p>}
      </Card>
    </div>
  );
}
