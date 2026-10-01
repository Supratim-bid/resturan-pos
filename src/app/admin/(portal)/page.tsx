import Link from "next/link";
import { desc, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { addDays, fmtDate, inr, todayIST } from "@/lib/format";
import { Badge, Empty, PageHeader, Stat } from "@/components/ui";
import { NewTenantButton } from "@/components/admin";
import { listPlans } from "@/lib/plans";

export default async function AdminHome() {
  await requireAdmin();
  const since = addDays(todayIST(), -29);
  // one lookup at a time, each with a time limit: a slow one shows a note instead of leaving the page loading forever
  const problems: string[] = [];
  const step = async <T,>(name: string, q: () => Promise<T>, empty: T): Promise<T> => {
    try {
      return await Promise.race([q(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("took longer than 8 seconds")), 8000))]);
    } catch (e) {
      console.error(`[admin] ${name} failed:`, e);
      problems.push(`${name}: ${String((e as Error)?.message || e).slice(0, 200)}`);
      return empty;
    }
  };
  const tenants = await step("restaurants", () => db.query.tenants.findMany({ orderBy: [desc(schema.tenants.createdAt)] }), [] as (typeof schema.tenants.$inferSelect)[]);
  const plans = await step("plans", () => listPlans(), [] as Awaited<ReturnType<typeof listPlans>>);
  const users = await step("login counts", () => db.select({ t: schema.users.tenantId, n: sql<number>`count(*)` }).from(schema.users).groupBy(schema.users.tenantId), [] as { t: number; n: number }[]);
  const orders = await step("order totals", () => db.select({ t: schema.orders.tenantId, n: sql<number>`count(*)`, s: sql<number>`coalesce(sum(${schema.orders.total}),0)`, last: sql<string>`max(${schema.orders.date})` })
    .from(schema.orders).where(gte(schema.orders.date, since)).groupBy(schema.orders.tenantId), [] as { t: number; n: number; s: number; last: string }[]);
  const owners = await step("owners", () => db.query.users.findMany({ where: (u, { eq }) => eq(u.role, "OWNER") }), [] as (typeof schema.users.$inferSelect)[]);
  const pn = new Map(plans.map((p) => [p.key, p.name]));
  const mrr = tenants.filter((t) => t.active).reduce((a, t) => a + Number(plans.find((p) => p.key === t.plan)?.price ?? 0), 0);
  const um = new Map(users.map((x) => [x.t, Number(x.n)])), om = new Map(orders.map((x) => [x.t, x]));
  const active = tenants.filter((t) => t.active).length;
  const totalOrders = orders.reduce((a, x) => a + Number(x.n), 0);
  return (
    <div>
      <PageHeader title="Restaurants" subtitle="Every restaurant has its own data, logins, logo and bill numbers." actions={<NewTenantButton plans={plans.filter((p) => p.active).map((p) => ({ key: p.key, name: p.name, price: Number(p.price), maxUsers: p.maxUsers }))} />} />
      {problems.length > 0 && <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800"><b>Some information couldn&apos;t load:</b><ul className="mt-1 list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul><p className="mt-1 text-xs">Reload the page. If it keeps happening, send this box to support.</p></div>}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Restaurants" value={tenants.length} />
        <Stat label="Active" value={active} tone="green" />
        <Stat label="Paused" value={tenants.length - active} tone={tenants.length - active ? "amber" : undefined} />
        <Stat label="Orders (30 days)" value={totalOrders} hint={`Plans ≈ ${inr(mrr)}/month (active)`} />
      </div>
      {!tenants.length ? <Empty>No restaurants yet. Create the first one.</Empty> : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="tbl">
            <thead><tr><th>Restaurant</th><th>Code</th><th>Owner(s)</th><th className="!text-right">Logins</th><th className="!text-right">Orders 30d</th><th className="!text-right">Billed 30d</th><th>Last order</th><th>Status</th></tr></thead>
            <tbody>
              {tenants.map((t) => {
                const o = om.get(t.id);
                return (
                  <tr key={t.id} className="hover:bg-cream/60">
                    <td><Link href={`/admin/restaurants/${t.id}`} className="font-semibold text-brand hover:underline">{t.name}</Link><div className="text-[11px] text-muted">since {fmtDate(t.createdAt.toISOString().slice(0, 10))} · <b>{pn.get(t.plan) ?? t.plan}</b></div></td>
                    <td className="font-mono text-xs">{t.code}</td>
                    <td className="text-xs">{owners.filter((u) => u.tenantId === t.id).map((u) => u.name).join(", ")}</td>
                    <td className="num">{um.get(t.id) ?? 0}</td>
                    <td className="num">{Number(o?.n ?? 0)}</td>
                    <td className="num">{inr(Number(o?.s ?? 0))}</td>
                    <td className="text-xs">{o?.last ? fmtDate(o.last) : "—"}</td>
                    <td>{t.active ? <Badge tone="green">Active</Badge> : <Badge tone="amber">Paused</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
