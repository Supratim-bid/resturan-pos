import "server-only";
import webpush from "web-push";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { effectivePerms, type PermKey } from "./permissions";

export const pushPublicKey = () => (process.env.VAPID_PUBLIC_KEY ?? "").trim();
export const pushReady = () => !!(pushPublicKey() && (process.env.VAPID_PRIVATE_KEY ?? "").trim());

let configured = false;
function setup() {
  if (configured || !pushReady()) return pushReady();
  webpush.setVapidDetails(process.env.VAPID_SUBJECT?.trim() || "mailto:admin@example.com", pushPublicKey(), process.env.VAPID_PRIVATE_KEY!.trim());
  configured = true;
  return true;
}

export type PushPayload = { title: string; body: string; url: string; tag?: string; icon?: string; sticky?: boolean };

/** Notify every active staff device of a restaurant whose login can open `perm` (never throws) */
export async function notifyTenant(tenantId: number, payload: PushPayload, perm: PermKey | null = "onlineOrders", onlyUserId?: number) {
  try {
    if (!setup()) return 0;
    const subs = (await db.query.pushSubscriptions.findMany({ where: eq(schema.pushSubscriptions.tenantId, tenantId) })).filter((x) => onlyUserId == null || x.userId === onlyUserId);
    if (!subs.length) return 0;
    const users = await db.query.users.findMany({ where: and(eq(schema.users.tenantId, tenantId), inArray(schema.users.id, [...new Set(subs.map((x) => x.userId))])) });
    const ok = new Set(users.filter((u) => u.active && (perm == null || u.role === "OWNER" || effectivePerms(u.role, u.permissions).includes(perm))).map((u) => u.id));
    const dead: number[] = [];
    let sent = 0;
    await Promise.all(subs.filter((x) => ok.has(x.userId)).map(async (x) => {
      try {
        await webpush.sendNotification({ endpoint: x.endpoint, keys: { p256dh: x.p256dh, auth: x.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: "high" });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(x.id); // phone unsubscribed or app removed
      }
    }));
    if (dead.length) await db.delete(schema.pushSubscriptions).where(inArray(schema.pushSubscriptions.id, dead));
    return sent;
  } catch (e) {
    console.error("push failed", e);
    return 0;
  }
}
