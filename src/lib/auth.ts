import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { COOKIE, ADMIN_COOKIE, verifySession, verifyAdmin } from "./session";
import { can, effectivePerms, type PermKey, type Role } from "./permissions";
import { FEATURE_TABS } from "./features";
import { cache } from "react";
import { featureInfo } from "./plans";

export type CurrentUser = { id: number; tenantId: number; tenantCode: string; name: string; username: string; role: Role; perms: PermKey[]; features: string[]; impersonated?: boolean };

/** Logged-in, active user of an active restaurant - or null */
// cache(): the layout and the page both ask for the user - one database trip per request, not two
export const getUser = cache(async (): Promise<CurrentUser | null> => {
  const s = await verifySession((await cookies()).get(COOKIE)?.value);
  if (!s) return null;
  // user + restaurant + plan in ONE query (each trip to the database costs time)
  const [row] = await db.select({ u: schema.users, t: schema.tenants, p: schema.plans }).from(schema.users)
    .innerJoin(schema.tenants, eq(schema.tenants.id, schema.users.tenantId))
    .leftJoin(schema.plans, eq(schema.plans.key, schema.tenants.plan))
    .where(eq(schema.users.id, s.uid)).limit(1);
  const u = row?.u;
  if (!u || !u.active || u.sessionVersion !== s.v || u.tenantId !== s.tid) return null;
  const t = row.t;
  if (!t.active) return null;
  const features = featureInfo(t, row.p).active;
  // a tab that belongs to a feature is hidden until the super admin switches the feature on (and the owner has not switched it off)
  const perms = effectivePerms(u.role, u.permissions).filter((k) => !FEATURE_TABS[k] || features.includes(FEATURE_TABS[k]));
  return { id: u.id, tenantId: u.tenantId, tenantCode: t.code, name: u.name, username: u.username, role: u.role as Role, perms, features, impersonated: !!s.imp };
});

export async function requireUser(): Promise<CurrentUser> {
  const u = await getUser();
  if (!u) redirect("/login");
  return u;
}

/** For pages: redirect away when this person may not open the tab */
export async function requirePage(k: PermKey): Promise<CurrentUser> {
  const u = await requireUser();
  if (!can(u, k)) redirect("/no-access");
  return u;
}

/** For server actions: throw when not allowed */
export async function requireAction(k: PermKey): Promise<CurrentUser> {
  const u = await getUser();
  if (!u) throw new Error("Please log in again.");
  if (!can(u, k)) throw new Error("You don't have access to do this.");
  return u;
}

// ---------- super admin ----------
export type CurrentAdmin = { id: number; email: string; name: string };
export async function getAdmin(): Promise<CurrentAdmin | null> {
  const s = await verifyAdmin((await cookies()).get(ADMIN_COOKIE)?.value);
  if (!s) return null;
  const a = await db.query.superAdmins.findFirst({ where: eq(schema.superAdmins.id, s.aid) });
  if (!a || !a.active || a.email !== s.admin) return null;
  return { id: a.id, email: a.email, name: a.name };
}
export async function requireAdmin(): Promise<CurrentAdmin> {
  const a = await getAdmin();
  if (!a) redirect("/admin/login");
  return a;
}
