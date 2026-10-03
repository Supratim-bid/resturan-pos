import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";

export type GroupRole = "OWNER" | "MANAGER";
export type OutletLite = { id: number; name: string; code: string; isPrimary: boolean };

/** The group membership of a user, if any, plus the outlets they may open. OWNER = every outlet in the group. */
export async function getUserGroupAccess(userId: number): Promise<{
  group: typeof schema.groups.$inferSelect; role: GroupRole; outlets: OutletLite[];
} | null> {
  const m = await db.query.groupMembers.findFirst({ where: eq(schema.groupMembers.userId, userId) });
  if (!m) return null;
  const group = await db.query.groups.findFirst({ where: eq(schema.groups.id, m.groupId) });
  if (!group) return null;
  const all = await db.query.tenants.findMany({
    where: eq(schema.tenants.groupId, group.id),
    columns: { id: true, name: true, code: true, isPrimaryOutlet: true },
  });
  const role = m.role === "OWNER" ? "OWNER" : "MANAGER";
  const allowed = role === "OWNER" ? all : all.filter((t) => (m.outletIds ?? []).includes(t.id));
  const outlets = allowed
    .map((t) => ({ id: t.id, name: t.name, code: t.code, isPrimary: t.isPrimaryOutlet }))
    .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0) || a.name.localeCompare(b.name));
  return { group, role, outlets };
}

/** Can this user open this outlet (via a group)? Returns the group role, or null. Does NOT cover the user's own home outlet. */
export async function groupAccessToOutlet(userId: number, tenantId: number): Promise<GroupRole | null> {
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId), columns: { groupId: true } });
  if (!t?.groupId) return null;
  const m = await db.query.groupMembers.findFirst({ where: and(eq(schema.groupMembers.userId, userId), eq(schema.groupMembers.groupId, t.groupId)) });
  if (!m) return null;
  if (m.role === "OWNER") return "OWNER";
  return (m.outletIds ?? []).includes(tenantId) ? "MANAGER" : null;
}

/** All outlet tenant ids of a group (for combined reports). */
export async function groupOutletIds(groupId: number): Promise<number[]> {
  const rows = await db.query.tenants.findMany({ where: eq(schema.tenants.groupId, groupId), columns: { id: true } });
  return rows.map((r) => r.id);
}

export async function tenantGroup(tenantId: number) {
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId), columns: { groupId: true } });
  if (!t?.groupId) return null;
  return db.query.groups.findFirst({ where: eq(schema.groups.id, t.groupId) });
}

export { inArray };
