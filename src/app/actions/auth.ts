"use server";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { COOKIE, TENANT_COOKIE, signSession } from "@/lib/session";
import { MODULES, can, effectivePerms, type ModuleKey } from "@/lib/permissions";
import { assertNotLocked, clearFailures, clientIp, recordFailure } from "@/lib/throttle";
import { isLive, notLiveReason } from "@/lib/tenant-status";

const fail = async (msg: string) => { await new Promise((r) => setTimeout(r, 600)); return { error: msg }; };

export async function login(_: unknown, fd: FormData): Promise<{ error?: string }> {
  const code = String(fd.get("restaurant") || "").trim().toLowerCase();
  const username = String(fd.get("username") || "").trim().toLowerCase();
  const password = String(fd.get("password") || "");
  if (!code) return { error: "Enter your restaurant code." };
  if (!username || !password) return { error: "Enter username and password." };
  // 5 wrong passwords for one login, or 30 from one network, lock it for 15 minutes
  const ip = await clientIp();
  const userKey = `user:${code}:${username}`, ipKey = `ip:${ip}`;
  try { await assertNotLocked([userKey, ipKey]); } catch (e) { return { error: (e as Error).message }; }
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.code, code) });
  if (!t) { await recordFailure([{ key: ipKey, limit: 30 }]); return fail("Restaurant code not found."); }
  if (!isLive(t)) return fail(notLiveReason(t));
  const u = await db.query.users.findFirst({ where: and(eq(schema.users.tenantId, t.id), eq(schema.users.username, username)) });
  if (!u || !u.active || !(await bcrypt.compare(password, u.passwordHash))) {
    await recordFailure([{ key: userKey, limit: 5 }, { key: ipKey, limit: 30 }]);
    return fail("Wrong username or password.");
  }
  await clearFailures([userKey]);
  const jar = await cookies();
  const secure = process.env.NODE_ENV === "production";
  jar.set(COOKIE, await signSession({ uid: u.id, tid: t.id, role: u.role, name: u.name, v: u.sessionVersion }), { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 60 * 60 * 24 * 30 });
  jar.set(TENANT_COOKIE, t.code, { httpOnly: false, sameSite: "lax", secure, path: "/", maxAge: 60 * 60 * 24 * 365 });
  const me = { role: u.role, perms: effectivePerms(u.role, u.permissions) };
  const first = (Object.keys(MODULES) as ModuleKey[]).filter((k) => k !== "preorders").find((k) => can(me, k)) ?? (can(me, "preorders") ? "preorders" : undefined);
  redirect(first ? MODULES[first].href : "/no-access");
}

export async function logout() {
  (await cookies()).delete(COOKIE);
  redirect("/login");
}
