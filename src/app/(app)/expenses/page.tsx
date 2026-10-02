import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/auth";
import { ENTITIES } from "@/lib/entities";
import { resolveOptions } from "@/lib/options";
import { inr, monthEnd, monthLabel, monthStart, todayIST } from "@/lib/format";
import { CrudManager } from "@/components/crud";
import { Card, PageHeader, Stat } from "@/components/ui";
import { DateJump } from "@/components/date-jump";

export default async function Expenses({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const u = await requirePage("expenses");
  const month = (await searchParams).month || todayIST().slice(0, 7);
  const from = monthStart(month + "-01"), to = monthEnd(month + "-01");
  const rows = await db.query.expenses.findMany({
    where: and(eq(schema.expenses.tenantId, u.tenantId), gte(schema.expenses.date, from), lte(schema.expenses.date, to)),
    with: { ingredient: true, vendor: true, staff: true }, orderBy: [desc(schema.expenses.date), desc(schema.expenses.id)],
  });
  const f = ENTITIES.expenses.fields;
  const opts = await resolveOptions(u.tenantId, f);
  // "Company" money shows the restaurant name (so the bill/expense names line up). Owner/Staff keep their own name lists.
  const setting = await db.query.settings.findFirst({ where: eq(schema.settings.tenantId, u.tenantId), columns: { name: true } });
  const companyName = setting?.name || "Company";
  opts.paidByName = [{ value: companyName, label: companyName, group: "Company" }, ...(opts.paidByName ?? [])];
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const credit = rows.filter((r) => r.paymentMode === "Credit").reduce((s, r) => s + Number(r.amount), 0);
  const byCat = new Map<string, number>();
  for (const r of rows) byCat.set(r.category, (byCat.get(r.category) ?? 0) + Number(r.amount));
  // money people paid from their own pocket (not company) and not on credit -> to be reimbursed
  const reimb = new Map<string, number>();
  for (const r of rows) {
    if ((r.paidFrom === "Owner" || r.paidFrom === "Staff") && r.paymentMode !== "Credit" && !r.reimbursedAt) {
      const who = `${r.paidByName || r.paidFrom} (${r.paidFrom})`;
      reimb.set(who, (reimb.get(who) ?? 0) + Number(r.amount));
    }
  }
  const reimbTotal = [...reimb.values()].reduce((a, b) => a + b, 0);
  const paidByLabel = (r: typeof rows[number]) => r.paidFrom === "Company" || !r.paidFrom ? companyName : `${r.paidByName || r.paidFrom} · ${r.paidFrom}`;
  const data = rows.map((r) => ({
    ...r, paidTo: r.vendor?.name ?? r.staff?.name ?? "", stock: r.ingredient ? `${Number(r.qty)} ${r.ingredient.unit} ${r.ingredient.name}` : "",
    paidByWhom: paidByLabel(r),
  }));
  return (
    <div>
      <PageHeader title="Expenses" subtitle={monthLabel(month)} actions={<DateJump value={month} param="month" type="month" />} />
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Spent this month" value={inr(total)} />
        <Stat label="On credit (unpaid)" value={inr(credit)} tone={credit ? "amber" : undefined} />
        <Stat label="Entries" value={rows.length} />
      </div>
      {reimb.size > 0 && (
        <Card title="To reimburse (paid from own pocket)" className="mb-4">
          <ul className="grid gap-x-6 text-sm sm:grid-cols-2">
            {[...reimb].sort((a, b) => b[1] - a[1]).map(([who, v]) => (
              <li key={who} className="flex justify-between border-b border-line/60 py-1.5"><span>{who}</span><b className="tabular-nums text-amber-700">{inr(v)}</b></li>
            ))}
          </ul>
          <p className="mt-2 text-sm">Total to repay: <b className="text-amber-700">{inr(reimbTotal)}</b> · <a href="/reimbursements" className="font-semibold text-brand underline">Open Reimbursements →</a></p>
        </Card>
      )}
      <CrudManager entity="expenses" title="expense" fields={f} options={opts} rows={data} path="/expenses" addLabel="Expense"
        searchKeys={["category", "description", "paidTo", "paidByWhom", "stock", "notes"]}
        columns={[
          { key: "date", label: "Date", kind: "date" },
          { key: "category", label: "Category", primary: true },
          { key: "description", label: "Description" },
          { key: "amount", label: "Amount", kind: "money" },
          { key: "paymentMode", label: "How paid", kind: "badge", tones: { Credit: "amber" } },
          { key: "paidByWhom", label: "Paid by" },
          { key: "paidTo", label: "Vendor / staff", hideMobile: true },
          { key: "stock", label: "Added to stock", hideMobile: true },
        ]} />
      {byCat.size > 0 && (
        <Card title="By category" className="mt-6">
          <ul className="grid gap-x-6 text-sm sm:grid-cols-2">
            {[...byCat].sort((a, b) => b[1] - a[1]).map(([c, v]) => (
              <li key={c} className="flex justify-between border-b border-line/60 py-1.5"><span>{c}</span><span className="tabular-nums"><b>{inr(v)}</b> <span className="text-xs text-muted">{((v / total) * 100).toFixed(0)}%</span></span></li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
