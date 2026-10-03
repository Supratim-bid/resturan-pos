"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { COOKIE, verifySession, signSession } from "@/lib/session";
import { groupAccessToOutlet } from "@/lib/groups";

/** Switch the group owner/manager into another outlet (or back to their home outlet). */
export async function switchOutletAction(tenantId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const jar = await cookies();
    const s = await verifySession(jar.get(COOKIE)?.value);
    if (!s) return { ok: false, error: "Please log in again." };
    // Home outlet is always allowed; any other outlet needs group access.
    if (tenantId !== s.tid) {
      const role = await groupAccessToOutlet(s.uid, tenantId);
      if (!role) return { ok: false, error: "You don't have access to that outlet." };
    }
    const oid = tenantId === s.tid ? undefined : tenantId;
    const secure = process.env.NODE_ENV === "production";
    jar.set(COOKIE, await signSession({ uid: s.uid, tid: s.tid, role: s.role, name: s.name, v: s.v, imp: s.imp, oid }),
      { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 60 * 60 * 24 * 30 });
    // keep the device's remembered restaurant code in sync with the active outlet
    const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId), columns: { code: true } });
    if (t) jar.set("ap_rest", t.code, { httpOnly: false, sameSite: "lax", secure, path: "/", maxAge: 60 * 60 * 24 * 365 });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) { return { ok: false, error: String((e as Error).message) }; }
}
