import { desc, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui";
import { ResourceUpload, DeleteResource } from "@/components/admin";

export const dynamic = "force-dynamic";
const kb = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`;

export default async function AdminResources() {
  await requireAdmin();
  const files = await db.query.files.findMany({ where: isNull(schema.files.tenantId), columns: { id: true, title: true, filename: true, size: true, mime: true, createdAt: true }, orderBy: [desc(schema.files.id)] });
  return (
    <div className="space-y-4">
      <PageHeader title="Resources & manuals" subtitle="Files every restaurant owner can download from their Help & Documents page" />
      <Card title="Upload a resource"><ResourceUpload /></Card>
      <Card title={`Shared files (${files.length})`}>
        {files.length ? (
          <ul className="divide-y divide-line">
            {files.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 py-2">
                <div><div className="font-medium">{f.title || f.filename}</div><div className="text-xs text-muted">{f.filename} · {kb(f.size)} · {fmtDateTime(f.createdAt)}</div></div>
                <div className="flex gap-2"><a href={`/file/${f.id}?inline=1`} target="_blank" className="btn-ghost btn-sm">View</a><DeleteResource id={f.id} /></div>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">No resources uploaded yet.</p>}
      </Card>
    </div>
  );
}
