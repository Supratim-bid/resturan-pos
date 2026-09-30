import "server-only";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { COOKIE, TENANT_COOKIE, verifySession } from "./session";
import { isRestaurantPath } from "./reserved";

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Restaurant Manager";

/** Restaurant code for this browser: logged-in restaurant, else the one last used here ("" = none) */
export async function currentCode() {
  const jar = await cookies();
  const s = await verifySession(jar.get(COOKIE)?.value);
  if (s) {
    const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, s.tid), columns: { code: true } });
    if (t) return t.code;
  }
  const r = (jar.get(TENANT_COOKIE)?.value ?? "").toLowerCase();
  return isRestaurantPath(r) ? r : "";
}

/** Home-screen icons for a restaurant (its logo) or the platform ("_") */
export const pwaIcons = (code: string) => {
  const c = code || "_";
  return [
    { src: `/pwa/${c}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
    { src: `/pwa/${c}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
    { src: `/pwa/${c}/maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
  ];
};

export async function brandOf(code: string) {
  if (!code || !isRestaurantPath(code)) return null;
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.code, code) });
  if (!t || !t.active) return null;
  const s = await db.query.settings.findFirst({ where: eq(schema.settings.tenantId, t.id) });
  if (!s) return null;
  return { t, s, color: /^#[0-9a-f]{6}$/i.test(s.primaryColor) ? s.primaryColor : "#9a1c1f", bg: "#fdf8f2" };
}
