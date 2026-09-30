"use server";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { notifyTenant, pushReady } from "@/lib/push";

type R = { ok: true; sent?: number } | { ok: false; error: string };
const fail = (e: unknown): R => ({ ok: false, error: String((e as Error)?.message ?? e).replace(/^Error:\s*/, "") });

/** This device wants notifications for the logged-in person */
export async function savePushSubscriptionAction(sub: { endpoint?: string; keys?: Record<string, string> }): Promise<R> {
  try {
    const u = await requireUser();
    if (!pushReady()) throw new Error("Notifications are not set up on the server yet.");
    const endpoint = String(sub?.endpoint ?? "");
    if (!/^https:\/\/\S{10,}$/.test(endpoint) || endpoint.length > 1000) throw new Error("This browser gave an invalid subscription.");
    const p256dh = String(sub.keys?.p256dh ?? ""), auth = String(sub.keys?.auth ?? "");
    if (!p256dh || !auth || p256dh.length > 200 || auth.length > 100) throw new Error("This browser gave an invalid subscription.");
    const ua = ((await headers()).get("user-agent") ?? "").slice(0, 200);
    await db.insert(schema.pushSubscriptions).values({ tenantId: u.tenantId, userId: u.id, endpoint, p256dh, auth, userAgent: ua })
      .onConflictDoUpdate({ target: schema.pushSubscriptions.endpoint, set: { tenantId: u.tenantId, userId: u.id, p256dh, auth, userAgent: ua } });
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function removePushSubscriptionAction(endpoint: string): Promise<R> {
  try {
    const u = await requireUser();
    await db.delete(schema.pushSubscriptions).where(and(eq(schema.pushSubscriptions.endpoint, String(endpoint)), eq(schema.pushSubscriptions.userId, u.id)));
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Send a test notification to this person's devices */
export async function testPushAction(): Promise<R> {
  try {
    const u = await requireUser();
    const n = await db.query.pushSubscriptions.findMany({ where: and(eq(schema.pushSubscriptions.tenantId, u.tenantId), eq(schema.pushSubscriptions.userId, u.id)) });
    if (!n.length) throw new Error("This login has no device with notifications on.");
    const sent = await notifyTenant(u.tenantId, { title: "🔔 Notifications work", body: "New online orders will show up like this.", url: "/online-orders", tag: "test" }, null, u.id);
    return { ok: true, sent };
  } catch (e) { return fail(e); }
}
