import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/auth";
import { ENTITIES } from "@/lib/entities";
import { resolveOptions } from "@/lib/options";
import { fmtDate, inr, monthEnd, monthStart, todayIST } from "@/lib/format";
import { CrudManager } from "@/components/crud";
import { Card, PageHeader } from "@/components/ui";
import { AttendanceRow } from "@/components/attendance";
import { DateJump } from "@/components/date-jump";

export default async function Staff({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const u = await requirePage("staff");
  const date = (await searchParams).date || todayIST();
  const ms = monthStart(date), me = monthEnd(date);
  const staff = await db.query.staff.findMany({ where: eq(schema.staff.tenantId, u.tenantId), orderBy: (t, { asc, desc }) => [desc(t.active), asc(t.name)] });
  const ids = staff.length ? staff.map((s) => s.id) : [-1];
  const [att, monthAtt, pay] = await Promise.all([
    db.query.attendance.findMany({ where: and(inArray(schema.attendance.staffId, ids), eq(schema.attendance.date, date)) }),
    db.query.attendance.findMany({ where: and(inArray(schema.attendance.staffId, ids), gte(schema.attendance.date, ms), lte(schema.attendance.date, me)) }),
    db.query.expenses.findMany({ where: and(eq(schema.expenses.tenantId, u.tenantId), gte(schema.expenses.date, ms), lte(schema.expenses.date, me), inArray(schema.expenses.category, ["Staff Salary", "Salary Advance"])) }),
  ]);
  const am = new Map(att.map((a) => [a.staffId, a.status]));
  const rows = staff.map((s) => {
    const mine = monthAtt.filter((a) => a.staffId === s.id);
    const days = mine.filter((a) => a.status === "P").length + mine.filter((a) => a.status === "H").length * 0.5;
    const paid = pay.filter((p) => p.staffId === s.id).reduce((t, p) => t + Number(p.amount), 0);
    return { ...s, days, absent: mine.filter((a) => a.status === "A").length, paid, balance: Math.max(0, Number(s.monthlySalary) - paid), status: s.active ? "Active" : "Left" };
  });
  const f = ENTITIES.staff.fields;
  const opts = await resolveOptions(u.tenantId, f);
  return (
    <div>
      <PageHeader title="Staff & Attendance" subtitle="Pay salaries/advances in Expenses (category Staff Salary or Salary Advance, pick the staff)." />
      <Card title={`Attendance · ${fmtDate(date)}`} actions={<DateJump value={date} />}>
        <p className="mb-2 text-xs text-muted">P = present · H = half day · A = absent · L = leave. Tap again to clear.</p>
        <ul className="divide-y divide-line">
          {staff.filter((s) => s.active).map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 py-2">
              <div><div className="font-medium">{s.name}</div><div className="text-xs text-muted">{s.role}</div></div>
              <AttendanceRow staffId={s.id} date={date} status={am.get(s.id) ?? ""} />
            </li>
          ))}
          {!staff.some((s) => s.active) && <li className="py-3 text-sm text-muted">Add staff below first.</li>}
        </ul>
      </Card>
      <h2 className="mb-2 mt-6 text-sm font-bold uppercase tracking-wide text-brand">Team · this month</h2>
      <CrudManager entity="staff" title="staff member" fields={f} options={opts} rows={rows} path="/staff" addLabel="Staff" defaults={{ active: true }}
        columns={[
          { key: "name", label: "Name", primary: true },
          { key: "role", label: "Role" },
          { key: "phone", label: "Phone", hideMobile: true },
          { key: "monthlySalary", label: "Salary", kind: "money" },
          { key: "days", label: "Days worked", kind: "num" },
          { key: "absent", label: "Absent", kind: "num", hideMobile: true },
          { key: "paid", label: "Paid this month", kind: "money" },
          { key: "balance", label: "Balance", kind: "money" },
          { key: "status", label: "Status", kind: "badge", tones: { Active: "green" } },
        ]} />
    </div>
  );
}
