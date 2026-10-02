import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { Card, Empty, PageHeader } from "@/components/ui";
import { DocUpload, DeleteDoc, SupportBox } from "@/components/help";

export const dynamic = "force-dynamic";

const fileCols = { id: true, kind: true, title: true, filename: true, size: true, docNumber: true, expiry: true, createdAt: true } as const;
const kb = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`;

export default async function HelpPage() {
  const u = await requirePage("help");
  const isOwner = can(u, "settings");
  const [resources, docs, messages] = await Promise.all([
    db.query.files.findMany({ where: isNull(schema.files.tenantId), columns: fileCols, orderBy: [desc(schema.files.id)] }),
    db.query.files.findMany({ where: and(eq(schema.files.tenantId, u.tenantId)), columns: fileCols, orderBy: [desc(schema.files.id)] }),
    db.query.supportMessages.findMany({ where: eq(schema.supportMessages.tenantId, u.tenantId), orderBy: [desc(schema.supportMessages.id)], limit: 20 }),
  ]);
  const kindLabel: Record<string, string> = { FSSAI: "FSSAI", GST: "GST", DOC: "Document", ADMIN_RESOURCE: "Guide" };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Help & Documents" subtitle="Manuals from the team, your licences, and support" />

      <Card title="📘 Guides & manuals">
        {resources.length ? (
          <ul className="divide-y divide-line">
            {resources.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 py-2">
                <div><div className="font-medium">{f.title || f.filename}</div><div className="text-xs text-muted">{f.filename} · {kb(f.size)}</div></div>
                <div className="flex gap-2">
                  <a href={`/file/${f.id}?inline=1`} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">View</a>
                  <a href={`/file/${f.id}`} className="btn-primary btn-sm">⬇ Download</a>
                </div>
              </li>
            ))}
          </ul>
        ) : <Empty>No guides shared yet. New manuals from the team will appear here.</Empty>}
      </Card>

      <Card title="📄 Your documents (FSSAI, GST…)">
        <p className="mb-3 text-sm text-muted">Keep your licences here. The support team can see these to help you (for example with payment-gateway sign-up).</p>
        {docs.length > 0 && (
          <ul className="mb-4 divide-y divide-line">
            {docs.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 py-2">
                <div>
                  <div className="font-medium">{kindLabel[f.kind] ?? "Document"}: {f.title || f.filename}</div>
                  <div className="text-xs text-muted">{f.docNumber ? `No. ${f.docNumber} · ` : ""}{f.expiry ? `valid till ${fmtDate(f.expiry)} · ` : ""}{kb(f.size)} · uploaded {fmtDateTime(f.createdAt)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <a href={`/file/${f.id}`} className="btn-ghost btn-sm">⬇</a>
                  {isOwner && <DeleteDoc id={f.id} />}
                </div>
              </li>
            ))}
          </ul>
        )}
        {isOwner ? <DocUpload /> : <p className="text-sm text-muted">Only the owner can upload documents.</p>}
      </Card>

      <Card title="💬 Message support">
        <p className="mb-3 text-sm text-muted">Stuck on something? Send us a message - we usually reply within 24 hours. Your reply will show up right here.</p>
        {isOwner || can(u, "help") ? <SupportBox /> : null}
        {messages.length > 0 && (
          <ul className="mt-4 space-y-3">
            {messages.map((msg) => (
              <li key={msg.id} className="rounded-xl border border-line p-3">
                <div className="text-xs text-muted">{msg.fromName || "You"} · {fmtDateTime(msg.createdAt)}</div>
                <div className="mt-1 whitespace-pre-wrap text-sm">{msg.body}</div>
                {msg.reply ? (
                  <div className="mt-2 rounded-lg bg-emerald-50 p-2">
                    <div className="text-xs font-semibold text-emerald-800">Support replied{msg.repliedAt ? ` · ${fmtDateTime(msg.repliedAt)}` : ""}</div>
                    <div className="mt-0.5 whitespace-pre-wrap text-sm text-emerald-900">{msg.reply}</div>
                  </div>
                ) : <div className="mt-2 text-xs font-semibold text-amber-700">⏳ Waiting for a reply (usually within 24 hours)</div>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
