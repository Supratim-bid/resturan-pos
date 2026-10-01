"use server";
import bcrypt from "bcryptjs";
import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireAction } from "@/lib/auth";
import { ALL_PERMS, type PermKey, type Role } from "@/lib/permissions";
import { sealSecret, testGatewayLink } from "@/lib/gateway";
import { headers } from "next/headers";
import { featureInfo, tenantWithPlan } from "@/lib/plans";

type R = { ok: true } | { ok: false; error: string };
const fail = (e: unknown): R => ({ ok: false, error: /unique|duplicate/i.test(String(e) + String((e as { cause?: unknown })?.cause ?? "")) ? "That username is already used in your restaurant." : String((e as Error).message) });
const ROLES: Role[] = ["OWNER", "MANAGER", "CASHIER", "KITCHEN"];
const HEX = /^#[0-9a-f]{6}$/i;

export async function saveSettingsAction(v: Record<string, string>): Promise<R> {
  try {
    const u = await requireAction("settings");
    const n = (k: string, d = 0) => { if (v[k] === "" || v[k] == null) return d; const x = Number(v[k]); if (!isFinite(x) || x < 0) throw new Error(`${k} must be a number`); return x; };
    const prefix = (v.billPrefix ?? "").trim();
    if (prefix.length > 12 || /[^A-Za-z0-9\-\/_ ]/.test(prefix)) throw new Error("Bill prefix: up to 12 letters, numbers, - / _");
    const digits = Math.round(n("billDigits", 4));
    if (digits < 1 || digits > 8) throw new Error("Bill number digits must be 1-8.");
    const start = Math.round(n("billStart", 1));
    if (start < 1) throw new Error("Bill numbers must start at 1 or more.");
    const primary = (v.primaryColor || "#9a1c1f").trim(), accent = (v.accentColor || "#c8962e").trim();
    if (!HEX.test(primary) || !HEX.test(accent)) throw new Error("Colours must look like #9a1c1f");
    await db.update(schema.settings).set({
      name: v.name?.trim() || "My Restaurant", tagline: v.tagline ?? "", address: v.address ?? "", phone: (v.phone ?? "").trim().slice(0, 30), email: v.email ?? "",
      extraPhones: (v.extraPhones ?? "").split(/[\n,;]+/).map((x) => x.trim().slice(0, 30)).filter(Boolean).slice(0, 5).join("\n"),
      whatsapp: (v.whatsapp ?? "").trim().slice(0, 30),
      gstin: (v.gstin ?? "").toUpperCase(), fssai: v.fssai ?? "", upiId: v.upiId ?? "", billFooter: v.billFooter ?? "",
      gstRate: n("gstRate"), priceMultiplier: n("priceMultiplier", 3) || 3, platformCommission: n("platformCommission"),
      defaultDeliveryCharge: n("defaultDeliveryCharge"), defaultPackingCharge: n("defaultPackingCharge"),
      billPrefix: prefix, billDigits: digits, billStart: start, billUseFy: v.billUseFy === "true", reuseCancelledNo: (v.reuseCancelledNo ?? "true") === "true", scannerEnabled: v.scannerEnabled === "true",
      primaryColor: primary, accentColor: accent, receiptWidth: v.receiptWidth === "80" ? "80" : "58",
      billShowLogo: (v.billShowLogo ?? "true") === "true", billShowCashier: v.billShowCashier === "true",
      billHeaderNote: (v.billHeaderNote ?? "").slice(0, 120), billSocial: (v.billSocial ?? "").slice(0, 120), billTerms: (v.billTerms ?? "").slice(0, 400),
      billShowQr: ["due", "always", "never"].includes(v.billShowQr) ? v.billShowQr : "due", billQrLabel: (v.billQrLabel ?? "").slice(0, 80),
    }).where(eq(schema.settings.tenantId, u.tenantId));
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) { return fail(e); }
}

type PayIn = {
  payLinkUrl: string; payGateway?: string;
  razorpayKeyId: string; razorpayKeySecret: string; razorpayWebhookSecret: string;
  instamojoClientId?: string; instamojoClientSecret?: string; instamojoSalt?: string; instamojoTest?: boolean;
  cashfreeAppId?: string; cashfreeSecret?: string; cashfreeTest?: boolean;
};
export async function savePaymentSettingsAction(v: PayIn): Promise<R> {
  try {
    const u = await requireAction("settings");
    const link = (v.payLinkUrl ?? "").trim();
    if (link && !/^https:\/\/\S+$/i.test(link)) throw new Error("Payment page link must start with https://");
    const set: Partial<typeof schema.settings.$inferInsert> = { payLinkUrl: link };
    if (u.features.includes("paymentGateways")) {
      const cur = await db.query.settings.findFirst({ where: eq(schema.settings.tenantId, u.tenantId) });
      const gw = ["razorpay", "instamojo", "cashfree"].includes(v.payGateway ?? "") ? v.payGateway! : "";
      set.payGateway = gw;
      // Razorpay (kept as before; clearing the Key ID deletes its secrets)
      const keyId = (v.razorpayKeyId ?? "").trim();
      if (keyId && !/^rzp_(test|live)_[A-Za-z0-9]{6,}$/.test(keyId)) throw new Error("Razorpay Key ID looks like rzp_live_XXXXXXXX or rzp_test_XXXXXXXX.");
      set.razorpayKeyId = keyId;
      if (!keyId) { set.razorpayKeySecret = ""; set.razorpayWebhookSecret = ""; }
      else {
        if (v.razorpayKeySecret) set.razorpayKeySecret = sealSecret(v.razorpayKeySecret.trim());
        else if (!cur?.razorpayKeySecret && gw === "razorpay") throw new Error("Enter the Razorpay Key secret too.");
        if (v.razorpayWebhookSecret) set.razorpayWebhookSecret = sealSecret(v.razorpayWebhookSecret.trim());
      }
      // Instamojo
      const imId = (v.instamojoClientId ?? "").trim();
      set.instamojoClientId = imId; set.instamojoTest = !!v.instamojoTest;
      if (!imId) { set.instamojoClientSecret = ""; set.instamojoSalt = ""; }
      else {
        if (v.instamojoClientSecret) set.instamojoClientSecret = sealSecret(v.instamojoClientSecret.trim());
        else if (!cur?.instamojoClientSecret && gw === "instamojo") throw new Error("Enter the Instamojo Client secret too.");
        if (v.instamojoSalt) set.instamojoSalt = sealSecret(v.instamojoSalt.trim());
        else if (!cur?.instamojoSalt && gw === "instamojo") throw new Error("Enter the Instamojo Private salt too (it checks the “paid” messages).");
      }
      // Cashfree
      const cfId = (v.cashfreeAppId ?? "").trim();
      set.cashfreeAppId = cfId; set.cashfreeTest = !!v.cashfreeTest;
      if (!cfId) set.cashfreeSecret = "";
      else if (v.cashfreeSecret) set.cashfreeSecret = sealSecret(v.cashfreeSecret.trim());
      else if (!cur?.cashfreeSecret && gw === "cashfree") throw new Error("Enter the Cashfree Secret key too.");
      if (gw === "razorpay" && !keyId) throw new Error("Enter the Razorpay Key ID.");
      if (gw === "instamojo" && !imId) throw new Error("Enter the Instamojo Client ID.");
      if (gw === "cashfree" && !cfId) throw new Error("Enter the Cashfree App ID.");
    }
    await db.update(schema.settings).set(set).where(eq(schema.settings.tenantId, u.tenantId));
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Login limit of the restaurant's plan (0 = no limit) */
async function assertUserLimit(tenantId: number, adding = 1) {
  const tp = await tenantWithPlan({ id: tenantId });
  if (!tp) return;
  const max = featureInfo(tp.t, tp.plan).maxUsers;
  if (!max) return;
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(schema.users).where(and(eq(schema.users.tenantId, tenantId), eq(schema.users.active, true)));
  if (Number(r.n) + adding > max) throw new Error(`Your plan allows ${max} active logins. Deactivate one, or ask the platform admin to upgrade your plan.`);
}

const cleanPerms = (p?: string[] | null) => (p ? p.filter((k): k is PermKey => (ALL_PERMS as string[]).includes(k)) : null);

export async function createUserAction(v: { name: string; username: string; password: string; phone?: string; role: Role; perms?: string[] | null }): Promise<R> {
  try {
    const me = await requireAction("settings");
    const username = v.username.trim().toLowerCase();
    if (!v.name.trim()) throw new Error("Enter the person's name.");
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new Error("Username: 3-30 letters/numbers, no spaces.");
    if ((v.password ?? "").length < 6) throw new Error("Password must be at least 6 characters.");
    if (!ROLES.includes(v.role)) throw new Error("Pick a role.");
    await assertUserLimit(me.tenantId);
    await db.insert(schema.users).values({
      tenantId: me.tenantId, name: v.name.trim(), username, phone: v.phone?.trim() ?? "", passwordHash: await bcrypt.hash(v.password, 10),
      role: v.role, permissions: v.role === "OWNER" ? null : cleanPerms(v.perms),
    });
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) { return fail(e); }
}

async function ownersLeft(tenantId: number, exceptId: number) {
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(schema.users)
    .where(and(eq(schema.users.tenantId, tenantId), eq(schema.users.role, "OWNER"), eq(schema.users.active, true), ne(schema.users.id, exceptId)));
  return Number(r.n);
}

export async function updateUserAction(id: number, v: { name: string; phone?: string; role: Role; active: boolean; password?: string; perms?: string[] | null }): Promise<R> {
  try {
    const me = await requireAction("settings");
    const u = await db.query.users.findFirst({ where: and(eq(schema.users.id, id), eq(schema.users.tenantId, me.tenantId)) });
    if (!u) throw new Error("User not found.");
    if (!ROLES.includes(v.role)) throw new Error("Pick a role.");
    const losingOwner = u.role === "OWNER" && u.active && (v.role !== "OWNER" || !v.active);
    if (losingOwner && (await ownersLeft(me.tenantId, id)) === 0) throw new Error("Keep at least one active owner.");
    if (id === me.id && !v.active) throw new Error("You can't deactivate yourself.");
    if (!u.active && v.active) await assertUserLimit(me.tenantId);
    const perms = v.role === "OWNER" ? null : cleanPerms(v.perms);
    const set: Partial<typeof schema.users.$inferInsert> = { name: v.name.trim() || u.name, phone: v.phone?.trim() ?? u.phone, role: v.role, active: v.active, permissions: perms };
    const permsChanged = JSON.stringify(u.permissions ?? null) !== JSON.stringify(perms);
    const logout = !!v.password || v.role !== u.role || !v.active;
    if (v.password) {
      if (v.password.length < 6) throw new Error("Password must be at least 6 characters.");
      set.passwordHash = await bcrypt.hash(v.password, 10);
    }
    if (logout) set.sessionVersion = u.sessionVersion + 1; // signs them out everywhere
    await db.update(schema.users).set(set).where(and(eq(schema.users.id, id), eq(schema.users.tenantId, me.tenantId)));
    revalidatePath("/settings");
    if (permsChanged) revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Owner switches an extra feature (given by the super admin) on or off for their restaurant */
export async function setOwnFeatureAction(feature: string, on: boolean): Promise<R> {
  try {
    const u = await requireAction("settings");
    const tp = await tenantWithPlan({ id: u.tenantId });
    const t = tp?.t;
    if (!t || !featureInfo(t, tp!.plan).allowed.includes(feature)) throw new Error("This feature is not in your plan. Ask the platform admin.");
    const off = new Set(t.featuresOff ?? []);
    if (on) off.delete(feature); else off.add(feature);
    await db.update(schema.tenants).set({ featuresOff: [...off] }).where(eq(schema.tenants.id, u.tenantId));
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Owner's own text for the public policy pages (blank = ready-made text) */
export async function savePoliciesAction(v: { policyTerms: string; policyRefund: string; policyDelivery: string; policyPrivacy: string; policyContactNote: string }): Promise<R> {
  try {
    const u = await requireAction("settings");
    const t = (x: unknown) => String(x ?? "").replace(/\r/g, "").trim().slice(0, 12000);
    await db.update(schema.settings).set({ policyTerms: t(v.policyTerms), policyRefund: t(v.policyRefund), policyDelivery: t(v.policyDelivery), policyPrivacy: t(v.policyPrivacy), policyContactNote: t(v.policyContactNote) })
      .where(eq(schema.settings.tenantId, u.tenantId));
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Settings → Online payments → Test connection */
export async function testGatewayAction(): Promise<{ ok: true; data: string } | { ok: false; error: string }> {
  try {
    const u = await requireAction("settings");
    if (!u.features.includes("paymentGateways")) throw new Error("Payment gateways are not in your plan.");
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? ""}`;
    return { ok: true, data: await testGatewayLink(u.tenantId, origin) };
  } catch (e) { return { ok: false, error: String((e as Error).message) }; }
}
