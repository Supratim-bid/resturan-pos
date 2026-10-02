import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/permissions";
import { fmtDate, fmtDateTime, inr } from "@/lib/format";
import { Badge, Card, PageHeader, Stat } from "@/components/ui";
import { AddOwner, DeleteTenant, OpenAsOwner, TenantEditor, TenantFeatures, TenantPlan, UserRow } from "@/components/admin";
import { listPlans } from "@/lib/plans";

export default async function TenantPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, id) });
  if (!t) notFound();
  const [users, [stats], [menu], s, plans, visits] = await Promise.all([
    db.query.users.findMany({ where: eq(schema.users.tenantId, id), orderBy: [asc(schema.users.role), asc(schema.users.name)] }),
    db.select({ n: sql<number>`count(*)`, sum: sql<number>`coalesce(sum(${schema.orders.total}),0)`, last: sql<string>`max(${schema.orders.date})` }).from(schema.orders).where(eq(schema.orders.tenantId, id)),
    db.select({ n: sql<number>`count(*)` }).from(schema.menuItems).where(eq(schema.menuItems.tenantId, id)),
    db.query.settings.findFirst({ where: eq(schema.settings.tenantId, id) }),
    listPlans(),
    db.query.adminImpersonations.findMany({ where: eq(schema.adminImpersonations.tenantId, id), orderBy: [desc(schema.adminImpersonations.id)], limit: 20 }),
  ]);
  const docs = await db.query.files.findMany({ where: eq(schema.files.tenantId, id), columns: { id: true, kind: true, title: true, filename: true, size: true, docNumber: true, expiry: true }, orderBy: [desc(schema.files.id)] });
  const plan = plans.find((p) => p.key === t.plan);
  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm text-brand">← All restaurants</Link>
      <PageHeader title={t.name} subtitle={<>Login code <b className="font-mono">{t.code}</b> · staff login link: <a className="font-mono underline" href={`/${t.code}`} target="_blank">/{t.code}</a></>}
        actions={<div className="flex items-center gap-2">{t.active ? <Badge tone="green">Active</Badge> : <Badge tone="amber">Paused</Badge>}{t.active && <OpenAsOwner tenantId={id} name={t.name} />}</div>} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Orders (all time)" value={Number(stats.n)} />
        <Stat label="Billed (all time)" value={inr(Number(stats.sum))} />
        <Stat label="Menu items" value={Number(menu.n)} />
        <Stat label="Last order" value={stats.last ? fmtDate(stats.last) : "—"} />
      </div>
      <Card title="Account"><TenantEditor t={t} /></Card>
      <Card title="Plan & logins"><TenantPlan id={id} plan={t.plan} maxUsers={t.maxUsers} usersActive={users.filter((u) => u.active).length} plans={plans.filter((p) => p.active || p.key === t.plan).map((p) => ({ key: p.key, name: p.name, price: Number(p.price), maxUsers: p.maxUsers }))} /></Card>
      <Card title="Features for this restaurant"><TenantFeatures key={t.plan} id={id} planName={plan?.name ?? t.plan} planFeatures={plan?.features ?? []} addons={t.features ?? []} removed={t.featuresRemoved ?? []} off={t.featuresOff ?? []} /></Card>
      <Card title="Logins" actions={<AddOwner tenantId={id} />}>
        <ul className="divide-y divide-line">
          {users.map((u) => (
            <UserRow key={u.id} tenantId={id} user={{ id: u.id, name: u.name, username: u.username, phone: u.phone, role: u.role, roleLabel: ROLE_LABEL[u.role], active: u.active }} />
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">Edit, reset password or delete any login here. Owners also manage their own staff logins and tab access inside the app (Settings &amp; Users).</p>
      </Card>
      <Card title="Documents (FSSAI, GST…)">
        {docs.length ? (
          <ul className="divide-y divide-line text-sm">
            {docs.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 py-2">
                <div><div className="font-medium">{f.kind}: {f.title || f.filename}</div><div className="text-xs text-muted">{f.docNumber ? `No. ${f.docNumber} · ` : ""}{f.expiry ? `valid till ${fmtDate(f.expiry)} · ` : ""}{Math.max(1, Math.round(f.size / 1000))} KB</div></div>
                <a href={`/file/${f.id}`} className="btn-ghost btn-sm">⬇ Download</a>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">The owner hasn&apos;t uploaded any documents yet (they add these in Help &amp; Documents).</p>}
      </Card>
      <Card title="Support access log">
        <p className="mb-2 text-sm text-muted">Every time a super admin opened this restaurant as its owner. Kept for your records (and partner revenue checks).</p>
        {visits.length ? (
          <ul className="divide-y divide-line text-sm">
            {visits.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-x-3 py-1.5">
                <span><b>{v.adminEmail}</b> entered as {v.userName || "owner"}</span>
                <span className="text-xs text-muted">{fmtDateTime(v.createdAt)}{v.ip ? ` · ${v.ip}` : ""}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">No support visits yet.</p>}
      </Card>
      <Card title="Website & policy pages">
        <p className="mb-2 text-sm text-muted">Ready for payment-gateway sign-up once Online ordering or Payment gateways is on. The owner can edit the text in Settings.</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <a className="text-brand underline" href={`/${t.code}/order`} target="_blank">Order page</a>
          {["contact", "terms", "refund", "delivery", "privacy"].map((k) => <a key={k} className="text-brand underline" href={`/${t.code}/info/${k}`} target="_blank">/{t.code}/info/{k}</a>)}
        </div>
      </Card>
      <Card title="Bill setup">
        <p className="text-sm">Bill numbers: <b className="font-mono">{s?.billPrefix}{s?.billUseFy ? "YY-YY/" : ""}{"0".repeat(Math.max(0, (s?.billDigits ?? 4) - 1))}1</b> · GST {Number(s?.gstRate ?? 0)}% · receipt {s?.receiptWidth}mm</p>
      </Card>
      <Card title="Danger zone">
        <p className="mb-2 text-sm text-muted">
          {t.active
            ? <>This restaurant is <b>active</b>, so deleting it asks you to type its code first. To delete a non-payer in one click, <b>pause</b> it at the top of this page — a paused restaurant deletes with no confirmation.</>
            : <>This restaurant is <b>paused</b> (its logins are locked). Deleting it is <b>one click and permanent</b> — it wipes all orders, menu, customers and settings, and cannot be undone.</>}
        </p>
        <DeleteTenant id={id} code={t.code} active={t.active} />
      </Card>
    </div>
  );
}
