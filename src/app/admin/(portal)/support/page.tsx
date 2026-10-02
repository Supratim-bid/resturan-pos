import Link from "next/link";
import { desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { SupportReply } from "@/components/admin";

export const dynamic = "force-dynamic";

export default async function AdminSupport({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireAdmin();
  const show = (await searchParams).show === "all" ? "all" : "open";
  const rows = await db.query.supportMessages.findMany({
    where: show === "open" ? isNull(schema.supportMessages.repliedAt) : undefined,
    orderBy: [desc(schema.supportMessages.id)], limit: 100,
  });
  const tenants = new Map((await db.query.tenants.findMany({ columns: { id: true, name: true, code: true } })).map((t) => [t.id, t]));
  const openCount = Number((await db.select({ n: schema.supportMessages.id }).from(schema.supportMessages).where(isNull(schema.supportMessages.repliedAt))).length);
  const tab = (k: string, label: string) => <Link href={`/admin/support?show=${k}`} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${show === k ? "bg-brand text-white" : "bg-white ring-1 ring-line"}`}>{label}</Link>;

  return (
    <div className="space-y-4">
      <PageHeader title="Support inbox" subtitle="Messages from restaurant owners - reply within 24 hours" />
      <div className="flex gap-2">{tab("open", `Needs reply (${openCount})`)}{tab("all", "All")}</div>
      {rows.length === 0 ? <Empty>{show === "open" ? "Nothing waiting. 🎉" : "No messages yet."}</Empty> : (
        <div className="space-y-3">
          {rows.map((m) => {
            const t = tenants.get(m.tenantId);
            return (
              <Card key={m.id} title={t ? t.name : `Restaurant #${m.tenantId}`}
                actions={m.repliedAt ? <Badge tone="green">Answered</Badge> : <Badge tone="amber">Open</Badge>}>
                <div className="text-xs text-muted">From {m.fromName || "owner"}{t ? ` · /${t.code}` : ""} · {fmtDateTime(m.createdAt)} · <Link href={`/admin/restaurants/${m.tenantId}`} className="text-brand underline">open restaurant</Link></div>
                <div className="mt-1 whitespace-pre-wrap text-sm">{m.body}</div>
                {m.repliedAt && <div className="mt-2 rounded-lg bg-emerald-50 p-2 text-sm"><div className="text-xs font-semibold text-emerald-800">Replied by {m.repliedByEmail} · {fmtDateTime(m.repliedAt)}</div><div className="mt-0.5 whitespace-pre-wrap">{m.reply}</div></div>}
                <SupportReply id={m.id} existing={m.reply} />
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
