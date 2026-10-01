import { and, desc, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/auth";
import { fmtDate, fmtDateTime, inr } from "@/lib/format";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { SettleButton, UndoSettle } from "@/components/reimburse";

export const dynamic = "force-dynamic";

// Money the business owes its owners / staff who paid for things from their own pocket.
export default async function Reimbursements() {
  const u = await requirePage("reimbursements");
  const rows = await db.query.expenses.findMany({
    where: and(eq(schema.expenses.tenantId, u.tenantId), ne(schema.expenses.paymentMode, "Credit")),
    orderBy: [desc(schema.expenses.date), desc(schema.expenses.id)],
  });
  const own = rows.filter((r) => (r.paidFrom === "Owner" || r.paidFrom === "Staff"));
  const owed = own.filter((r) => !r.reimbursedAt);
  const settled = own.filter((r) => r.reimbursedAt).slice(0, 40);

  // group outstanding by person
  const groups = new Map<string, { key: string; name: string; paidFrom: string; total: number; items: typeof owed }>();
  for (const e of owed) {
    const name = e.paidByName || e.paidFrom;
    const key = `${e.paidFrom}|${name}`;
    const g = groups.get(key) ?? { key, name, paidFrom: e.paidFrom, total: 0, items: [] };
    g.total += Number(e.amount); g.items.push(e); groups.set(key, g);
  }
  const people = [...groups.values()].sort((a, b) => b.total - a.total);
  const totalOwed = people.reduce((a, p) => a + p.total, 0);

  return (
    <div className="space-y-4">
      <PageHeader title="Reimbursements" subtitle="Money the business owes owners / staff who paid from their own pocket" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Total to repay" value={inr(totalOwed)} tone={totalOwed ? "red" : undefined} />
        <Stat label="People owed" value={people.length} />
        <Stat label="Entries pending" value={owed.length} />
      </div>

      {people.length === 0 ? <Empty>Nobody is owed anything right now. 🎉 When someone pays for something from their own pocket (Expenses → Whose money = Owner / Staff), it shows here.</Empty> : (
        <div className="space-y-3">
          {people.map((p) => (
            <Card key={p.key} title={`${p.name} · ${p.paidFrom}`} actions={<SettleButton paidFrom={p.paidFrom} name={p.name} amount={p.total} />}>
              <div className="mb-2 text-lg font-extrabold text-red-700">{inr(p.total)} <span className="text-xs font-normal text-muted">owed · {p.items.length} expense{p.items.length === 1 ? "" : "s"}</span></div>
              <ul className="divide-y divide-line text-sm">
                {p.items.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span>{fmtDate(e.date)} · {e.category}{e.description ? ` · ${e.description}` : ""} <span className="text-xs text-muted">({e.paymentMode})</span></span>
                    <b className="tabular-nums">{inr(Number(e.amount))}</b>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {settled.length > 0 && (
        <Card title="Recently repaid">
          <ul className="divide-y divide-line text-sm">
            {settled.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span>{e.paidByName || e.paidFrom} <span className="text-xs text-muted">· {e.paidFrom}</span> · {e.category} · {fmtDate(e.date)}</span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-emerald-700">repaid {e.reimbursedMode ? `(${e.reimbursedMode})` : ""} {e.reimbursedAt ? fmtDateTime(e.reimbursedAt) : ""}</span>
                  <b className="tabular-nums">{inr(Number(e.amount))}</b>
                  <UndoSettle id={e.id} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="text-xs text-muted">Note: the original expense already counts as a business cost. Marking it repaid here just clears the amount you owe that person - it does not add a second expense.</p>
    </div>
  );
}
