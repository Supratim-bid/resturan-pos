import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/permissions";
import { fmtDate, inr } from "@/lib/format";
import { Badge, Card, PageHeader, Stat } from "@/components/ui";
import { AddOwner, DeleteTenant, ResetPassword, TenantEditor, TenantFeatures } from "@/components/admin";

export default async function TenantPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, id) });
  if (!t) notFound();
  const [users, [stats], [menu], s] = await Promise.all([
    db.query.users.findMany({ where: eq(schema.users.tenantId, id), orderBy: [asc(schema.users.role), asc(schema.users.name)] }),
    db.select({ n: sql<number>`count(*)`, sum: sql<number>`coalesce(sum(${schema.orders.total}),0)`, last: sql<string>`max(${schema.orders.date})` }).from(schema.orders).where(eq(schema.orders.tenantId, id)),
    db.select({ n: sql<number>`count(*)` }).from(schema.menuItems).where(eq(schema.menuItems.tenantId, id)),
    db.query.settings.findFirst({ where: eq(schema.settings.tenantId, id) }),
  ]);
  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm text-brand">← All restaurants</Link>
      <PageHeader title={t.name} subtitle={<>Login code <b className="font-mono">{t.code}</b> · staff login link: <a className="font-mono underline" href={`/${t.code}`} target="_blank">/{t.code}</a></>}
        actions={t.active ? <Badge tone="green">Active</Badge> : <Badge tone="amber">Paused</Badge>} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Orders (all time)" value={Number(stats.n)} />
        <Stat label="Billed (all time)" value={inr(Number(stats.sum))} />
        <Stat label="Menu items" value={Number(menu.n)} />
        <Stat label="Last order" value={stats.last ? fmtDate(stats.last) : "—"} />
      </div>
      <Card title="Account"><TenantEditor t={t} /></Card>
      <Card title="Features (switch on when the restaurant asks)"><TenantFeatures id={id} features={t.features ?? []} /></Card>
      <Card title="Logins" actions={<AddOwner tenantId={id} />}>
        <ul className="divide-y divide-line">
          {users.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-2 py-2">
              <div><div className="font-medium">{u.name}</div><div className="text-xs text-muted">@{u.username} · {ROLE_LABEL[u.role]}{!u.active && " · inactive"}</div></div>
              <ResetPassword tenantId={id} userId={u.id} name={u.name} />
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">Owners manage their own staff logins and tab access inside the app (Settings &amp; Users).</p>
      </Card>
      <Card title="Bill setup">
        <p className="text-sm">Bill numbers: <b className="font-mono">{s?.billPrefix}{s?.billUseFy ? "YY-YY/" : ""}{"0".repeat(Math.max(0, (s?.billDigits ?? 4) - 1))}1</b> · GST {Number(s?.gstRate ?? 0)}% · receipt {s?.receiptWidth}mm</p>
      </Card>
      <Card title="Danger zone"><DeleteTenant id={id} code={t.code} /></Card>
    </div>
  );
}
