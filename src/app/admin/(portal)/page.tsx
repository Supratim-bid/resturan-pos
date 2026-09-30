import Link from "next/link";
import { desc, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { addDays, fmtDate, inr, todayIST } from "@/lib/format";
import { Badge, Empty, PageHeader, Stat } from "@/components/ui";
import { NewTenantButton } from "@/components/admin";

export default async function AdminHome() {
  await requireAdmin();
  const since = addDays(todayIST(), -29);
  const [tenants, users, orders, owners] = await Promise.all([
    db.query.tenants.findMany({ orderBy: [desc(schema.tenants.createdAt)] }),
    db.select({ t: schema.users.tenantId, n: sql<number>`count(*)` }).from(schema.users).groupBy(schema.users.tenantId),
    db.select({ t: schema.orders.tenantId, n: sql<number>`count(*)`, s: sql<number>`coalesce(sum(${schema.orders.total}),0)`, last: sql<string>`max(${schema.orders.date})` })
      .from(schema.orders).where(gte(schema.orders.date, since)).groupBy(schema.orders.tenantId),
    db.query.users.findMany({ where: (u, { eq }) => eq(u.role, "OWNER") }),
  ]);
  const um = new Map(users.map((x) => [x.t, Number(x.n)])), om = new Map(orders.map((x) => [x.t, x]));
  const active = tenants.filter((t) => t.active).length;
  const totalOrders = orders.reduce((a, x) => a + Number(x.n), 0);
  return (
    <div>
      <PageHeader title="Restaurants" subtitle="Every restaurant has its own data, logins, logo and bill numbers." actions={<NewTenantButton />} />
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Restaurants" value={tenants.length} />
        <Stat label="Active" value={active} tone="green" />
        <Stat label="Paused" value={tenants.length - active} tone={tenants.length - active ? "amber" : undefined} />
        <Stat label="Orders (30 days)" value={totalOrders} />
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
                    <td><Link href={`/admin/restaurants/${t.id}`} className="font-semibold text-brand hover:underline">{t.name}</Link><div className="text-[11px] text-muted">since {fmtDate(t.createdAt.toISOString().slice(0, 10))} · {t.plan}</div></td>
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
