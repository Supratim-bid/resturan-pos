import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { Card, PageHeader, Empty } from "@/components/ui";
import { DemoGroupButton, GroupToggles } from "@/components/admin";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  await requireAdmin();
  const groups = await db.query.groups.findMany({ orderBy: [desc(schema.groups.id)] });
  const outlets = await db.query.tenants.findMany({ columns: { id: true, name: true, code: true, groupId: true, isPrimaryOutlet: true, active: true } });
  const byGroup = new Map<number, typeof outlets>();
  for (const o of outlets) if (o.groupId) { if (!byGroup.has(o.groupId)) byGroup.set(o.groupId, []); byGroup.get(o.groupId)!.push(o); }

  return (
    <div className="space-y-4">
      <PageHeader title="Multi-outlet groups" subtitle="Pro Max. A brand/group runs several outlets under one owner, with a combined view." />
      <Card title="Try it">
        <p className="mb-3 text-sm text-muted">Create a ready-made demo group with 3 outlets, sample menus and a week of dummy orders — to see multi-outlet end to end.</p>
        <DemoGroupButton />
      </Card>

      {!groups.length ? <Empty>No groups yet. Create the demo above, or enable the <b>Multi-outlet</b> feature on a restaurant and group its outlets.</Empty> : groups.map((g) => {
        const os = (byGroup.get(g.id) ?? []).sort((a, b) => (b.isPrimaryOutlet ? 1 : 0) - (a.isPrimaryOutlet ? 1 : 0));
        return (
          <Card key={g.id} title={`${g.name} · ${os.length}/${g.maxOutlets} outlets`}>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Outlets</div>
                {os.length ? (
                  <ul className="divide-y divide-line text-sm">
                    {os.map((o) => (
                      <li key={o.id} className="flex items-center justify-between py-1.5">
                        <span><Link href={`/admin/restaurants/${o.id}`} className="font-semibold text-brand hover:underline">{o.name}</Link>{o.isPrimaryOutlet && <span className="ml-1 rounded-full bg-gold-light px-1.5 text-[10px] font-bold">main</span>} <span className="font-mono text-[11px] text-muted">/{o.code}</span></span>
                        {!o.active && <span className="text-xs text-red-700">paused</span>}
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-muted">No outlets linked yet.</p>}
              </div>
              <div>
                <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Controls</div>
                <GroupToggles g={{ id: g.id, name: g.name, maxOutlets: g.maxOutlets, menuMode: g.menuMode, groupManagers: g.groupManagers, combinedOrdering: g.combinedOrdering, ownerCanAddOutlets: g.ownerCanAddOutlets }} />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
