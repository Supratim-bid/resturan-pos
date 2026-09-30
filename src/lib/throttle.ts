import "server-only";
import { eq, inArray, lt } from "drizzle-orm";
import { headers } from "next/headers";
import { db, schema } from "@/db";

const WINDOW_MS = 15 * 60_000; // wrong tries are forgotten after 15 quiet minutes
const LOCK_MS = 15 * 60_000;

/** Client IP as seen through the host's proxy (Vercel etc.) */
export async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "local").trim().slice(0, 64);
}

/** Throws a friendly error when any of these keys is locked */
export async function assertNotLocked(keys: string[]) {
  const rows = await db.select().from(schema.loginThrottle).where(inArray(schema.loginThrottle.key, keys));
  const now = Date.now();
  const locked = rows.find((r) => r.lockedUntil && r.lockedUntil.getTime() > now);
  if (locked) {
    const mins = Math.max(1, Math.ceil((locked.lockedUntil!.getTime() - now) / 60_000));
    throw new Error(`Too many wrong tries. Please wait ${mins} minute${mins > 1 ? "s" : ""} and try again.`);
  }
}

/** Count a wrong try; a key locks when it reaches its limit */
export async function recordFailure(keys: { key: string; limit: number }[]) {
  const now = new Date();
  for (const { key, limit } of keys) {
    const cur = await db.query.loginThrottle.findFirst({ where: eq(schema.loginThrottle.key, key) });
    const fresh = !cur || now.getTime() - cur.updatedAt.getTime() > WINDOW_MS || (cur.lockedUntil && cur.lockedUntil < now);
    const fails = (fresh ? 0 : cur!.fails) + 1;
    const lockedUntil = fails >= limit ? new Date(now.getTime() + LOCK_MS) : null;
    await db.insert(schema.loginThrottle).values({ key, fails, lockedUntil, updatedAt: now })
      .onConflictDoUpdate({ target: schema.loginThrottle.key, set: { fails, lockedUntil, updatedAt: now } });
  }
  // tidy up old rows now and then
  if (Math.random() < 0.05) await db.delete(schema.loginThrottle).where(lt(schema.loginThrottle.updatedAt, new Date(now.getTime() - 24 * 3600_000)));
}

/** Successful login: forget the wrong tries for this account */
export async function clearFailures(keys: string[]) {
  if (keys.length) await db.delete(schema.loginThrottle).where(inArray(schema.loginThrottle.key, keys));
}
