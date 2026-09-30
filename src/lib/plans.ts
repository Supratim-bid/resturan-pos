import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { activeFeatures, allowedFeatures } from "./features";

type TenantRow = typeof schema.tenants.$inferSelect;
type PlanRow = typeof schema.plans.$inferSelect;

/** Tenant + its plan in one query */
export async function tenantWithPlan(where: { id?: number; code?: string }) {
  const cond = where.id != null ? eq(schema.tenants.id, where.id) : eq(schema.tenants.code, (where.code ?? "").toLowerCase());
  const [row] = await db.select({ t: schema.tenants, p: schema.plans }).from(schema.tenants)
    .leftJoin(schema.plans, eq(schema.plans.key, schema.tenants.plan)).where(cond).limit(1);
  return row ? { t: row.t, plan: row.p } : null;
}

/** Everything about what a restaurant can use */
export function featureInfo(t: TenantRow, plan: PlanRow | null) {
  const planF = plan?.features ?? [];
  return {
    plan,
    allowed: allowedFeatures(t, planF),
    active: activeFeatures(t, planF),
    maxUsers: t.maxUsers ?? plan?.maxUsers ?? 0, // 0 = no limit
  };
}

export const listPlans = () => db.query.plans.findMany({ orderBy: [asc(schema.plans.sortOrder), asc(schema.plans.id)] });
