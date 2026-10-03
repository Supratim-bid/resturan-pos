import Link from "next/link";
import { redirect } from "next/navigation";
import { and, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getUserGroupAccess } from "@/lib/groups";
import { switchOutletAction } from "@/app/actions/outlet";
import { inr, todayIST, monthStart, monthLabel } from "@/lib/format";
import { PageHeader, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function GroupDashboard() {
  const user = await requireUser();
  const access = user.features.includes("multiOutlet") ? await getUserGroupAccess(user.id) : null;
  if (!access || !access.outlets.length) redirect("/");
  const ids = access.outlets.map((o) => o.id);
  const today = todayIST();
  const mStart = monthStart(today);

  const O = schema.orders;
  const [ordAgg, payAgg, expAgg] = await Promise.all([
    db.select({
      tid: O.tenantId,
      billed: sql<number>`coalesce(sum(${O.total}) filter (where ${O.status} <> 'CANCELLED'),0)`,
      todaySales: sql<number>`coalesce(sum(${O.total}) filter (where ${O.status} <> 'CANCELLED' and ${O.date} = ${today}),0)`,
      todayN: sql<number>`count(*) filter (where ${O.status} <> 'CANCELLED' and ${O.date} = ${today})`,
      monthSales: sql<number>`coalesce(sum(${O.total}) filter (where ${O.status} <> 'CANCELLED' and ${O.date} >= ${mStart}),0)`,
    }).from(O).where(inArray(O.tenantId, ids)).groupBy(O.tenantId),
    db.select({
      tid: schema.payments.tenantId,
      paid: sql<number>`coalesce(sum(${schema.payments.amount}),0)`,
      todayCollected: sql<number>`coalesce(sum(${schema.payments.amount}) filter (where ${schema.payments.date} = ${today}),0)`,
    }).from(schema.payments).where(inArray(schema.payments.tenantId, ids)).groupBy(schema.payments.tenantId),
    db.select({
      tid: schema.expenses.tenantId,
      monthExp: sql<number>`coalesce(sum(${schema.expenses.amount}) filter (where ${schema.expenses.date} >= ${mStart}),0)`,
    }).from(schema.expenses).where(inArray(schema.expenses.tenantId, ids)).groupBy(schema.expenses.tenantId),
  ]);

  const om = new Map(ordAgg.map((r) => [r.tid, r]));
  const pm = new Map(payAgg.map((r) => [r.tid, r]));
  const em = new Map(expAgg.map((r) => [r.tid, r]));
  const rows = access.outlets.map((o) => {
    const ord = om.get(o.id), pay = pm.get(o.id), exp = em.get(o.id);
    const dues = Math.max(0, Number(ord?.billed ?? 0) - Number(pay?.paid ?? 0));
    return {
      ...o,
      todaySales: Number(ord?.todaySales ?? 0), todayN: Number(ord?.todayN ?? 0), todayCollected: Number(pay?.todayCollected ?? 0),
      monthSales: Number(ord?.monthSales ?? 0), monthExp: Number(exp?.monthExp ?? 0), dues,
    };
  });
  const tot = rows.reduce((a, r) => ({
    todaySales: a.todaySales + r.todaySales, todayN: a.todayN + r.todayN, todayCollected: a.todayCollected + r.todayCollected,
    monthSales: a.monthSales + r.monthSales, monthExp: a.monthExp + r.monthExp, dues: a.dues + r.dues,
  }), { todaySales: 0, todayN: 0, todayCollected: 0, monthSales: 0, monthExp: 0, dues: 0 });

  return (
    <div className="space-y-4">
      <PageHeader title={`${access.group.name} — All outlets`} subtitle={<>{rows.length} outlet{rows.length > 1 ? "s" : ""} · {monthLabel(today.slice(0, 7))}</>} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Today's sales (all)" value={inr(tot.todaySales)} hint={`${tot.todayN} orders`} />
        <Stat label="Collected today (all)" value={inr(tot.todayCollected)} tone="green" />
        <Stat label="This month sales (all)" value={inr(tot.monthSales)} />
        <Stat label="Outstanding dues (all)" value={inr(tot.dues)} tone={tot.dues ? "amber" : undefined} />
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="tbl">
          <thead><tr><th>Outlet</th><th className="!text-right">Today</th><th className="!text-right">Orders</th><th className="!text-right">Collected</th><th className="!text-right">Month sales</th><th className="!text-right">Month exp.</th><th className="!text-right">Dues</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-cream/60">
                <td><b>{r.name}</b>{r.isPrimary && <span className="ml-1 rounded-full bg-gold-light px-1.5 text-[10px] font-bold">main</span>}<div className="font-mono text-[11px] text-muted">{r.code}</div></td>
                <td className="num">{inr(r.todaySales)}</td>
                <td className="num">{r.todayN}</td>
                <td className="num">{inr(r.todayCollected)}</td>
                <td className="num">{inr(r.monthSales)}</td>
                <td className="num">{inr(r.monthExp)}</td>
                <td className="num">{r.dues ? <span className="font-semibold text-amber-700">{inr(r.dues)}</span> : "—"}</td>
                <td className="!text-right">
                  <form action={async () => { "use server"; await switchOutletAction(r.id); redirect("/"); }}>
                    <button className="btn-ghost btn-sm">Open →</button>
                  </form>
                </td>
              </tr>
            ))}
            <tr className="bg-cream font-bold">
              <td>Total</td><td className="num">{inr(tot.todaySales)}</td><td className="num">{tot.todayN}</td><td className="num">{inr(tot.todayCollected)}</td><td className="num">{inr(tot.monthSales)}</td><td className="num">{inr(tot.monthExp)}</td><td className="num">{inr(tot.dues)}</td><td></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Tap <b>Open →</b> to switch into an outlet and work in it. Use the outlet switcher in the menu to come back here.</p>
      <Link href="/" className="text-sm text-brand">← Back to the current outlet</Link>
    </div>
  );
}
