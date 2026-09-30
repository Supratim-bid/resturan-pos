import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { listPlans } from "@/lib/plans";
import { inr } from "@/lib/format";
import { Badge, Card, PageHeader } from "@/components/ui";
import { PlanEditor } from "@/components/admin";

// Super admin: the plans you sell and what each includes
export default async function Plans() {
  await requireAdmin();
  const [plans, used] = await Promise.all([
    listPlans(),
    db.select({ plan: schema.tenants.plan, n: sql<number>`count(*)` }).from(schema.tenants).groupBy(schema.tenants.plan),
  ]);
  const um = new Map(used.map((u) => [u.plan, Number(u.n)]));
  return (
    <div className="space-y-4">
      <PageHeader title="Plans" subtitle="What each plan includes. Changes apply to every restaurant on that plan straight away. For one restaurant, add or remove features on its page." />
      {plans.map((p) => (
        <Card key={p.id} title={<span className="flex flex-wrap items-center gap-2">{p.name} <span className="font-mono text-xs text-muted">{p.key}</span> <Badge tone={p.active ? "green" : "gray"}>{p.active ? "Offered" : "Hidden"}</Badge> <span className="text-sm font-normal text-muted">{inr(Number(p.price))}/month · {um.get(p.key) ?? 0} restaurant(s)</span></span>}>
          <PlanEditor plan={{ id: p.id, key: p.key, name: p.name, description: p.description, price: Number(p.price), maxUsers: p.maxUsers, features: p.features, sortOrder: p.sortOrder, active: p.active, used: um.get(p.key) ?? 0 }} />
        </Card>
      ))}
      <Card title="+ New plan"><PlanEditor /></Card>
    </div>
  );
}
