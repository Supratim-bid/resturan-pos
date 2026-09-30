"use server";
import bcrypt from "bcryptjs";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, lt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { ADMIN_COOKIE, signAdmin } from "@/lib/session";
import { requireAdmin } from "@/lib/auth";
import { sendMail } from "@/lib/mail";
import { envAdminEmails, syncEnvAdmins } from "@/lib/admin-env";
import { assertNotLocked, clearFailures, clientIp, recordFailure } from "@/lib/throttle";
import { addSampleData, provisionTenant, USERNAME_RE, CODE_RE } from "@/lib/provision";
import { RESERVED_PATHS } from "@/lib/reserved";
import { FEATURE_KEYS, type FeatureKey } from "@/lib/features";

type R = { ok: true; msg?: string } | { ok: false; error: string };
const err = (e: unknown): R => ({ ok: false, error: /unique|duplicate/i.test(String(e) + String((e as { cause?: unknown })?.cause ?? "")) ? "That username or code is already used." : String((e as Error).message).replace(/^Error:\s*/, "") });
const hash = (email: string, code: string) => createHash("sha256").update(`${email}:${code}:${process.env.AUTH_SECRET}`).digest("hex");
const APP = () => process.env.NEXT_PUBLIC_APP_NAME || "Restaurant Manager";

// ---------- OTP login ----------
export async function requestOtpAction(emailRaw: string): Promise<R> {
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Enter a valid email." };
  if (envAdminEmails().includes(email)) await syncEnvAdmins(); // .env emails are always super admins
  const admin = await db.query.superAdmins.findFirst({ where: eq(schema.superAdmins.email, email) });
  const dev = process.env.NODE_ENV !== "production";
  // in production: same answer whether or not the email is an admin, so emails can't be discovered
  const generic: R = { ok: true, msg: `If this email is a super admin, a 6-digit code has been sent. It is valid for 10 minutes.${!process.env.SMTP_HOST ? " (No email server is set up: the code is printed in the terminal where the app runs.)" : ""}` };
  if (!admin || !admin.active) {
    if (dev) return { ok: false, error: `${email} is not a super admin. Put it in SUPERADMIN_EMAILS in .env and restart the app.` };
    await new Promise((r) => setTimeout(r, 700)); return generic;
  }
  const recent = await db.query.adminOtps.findFirst({
    // (ignore rows dated in the future: codes saved before the UTC fix on a Mac in IST)
    where: and(eq(schema.adminOtps.email, email), gt(schema.adminOtps.createdAt, new Date(Date.now() - 60_000)), lt(schema.adminOtps.createdAt, new Date(Date.now() + 60_000))),
  });
  if (recent) return { ok: false, error: "A code was sent less than a minute ago. Please wait and try again." };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.update(schema.adminOtps).set({ used: true }).where(and(eq(schema.adminOtps.email, email), eq(schema.adminOtps.used, false)));
  const [otpRow] = await db.insert(schema.adminOtps).values({ email, codeHash: hash(email, code), expiresAt: new Date(Date.now() + 10 * 60_000) }).returning({ id: schema.adminOtps.id });
  try {
    await sendMail(email, `${code} is your ${APP()} admin login code`,
      `Your ${APP()} super admin login code is ${code}. It expires in 10 minutes. If you didn't ask for it, ignore this email.`,
      `<div style="font-family:sans-serif"><p>Your <b>${APP()}</b> super admin login code:</p><p style="font-size:32px;font-weight:bold;letter-spacing:6px">${code}</p><p>It expires in 10 minutes. If you didn't ask for it, ignore this email.</p></div>`);
  } catch (e) {
    console.error("OTP email failed", e);
    // nothing was delivered: forget this code so "Email me a code" can be pressed again right away
    await db.delete(schema.adminOtps).where(eq(schema.adminOtps.id, otpRow.id));
    const m = String((e as Error)?.message ?? e);
    return { ok: false, error: `Could not send the email${/535|not accepted|BadCredentials/i.test(m) ? " - the email server refused the login (for Gmail, SMTP_PASS must be an App Password)" : ""}. Check the terminal for details${process.env.SUPERADMIN_PASSWORD ? ", or log in with the password" : ""}.` };
  }
  return generic;
}

export async function verifyOtpAction(emailRaw: string, codeRaw: string): Promise<R> {
  const email = emailRaw.trim().toLowerCase(), code = codeRaw.replace(/\D/g, "");
  if (code.length !== 6) return { ok: false, error: "Enter the 6-digit code." };
  const otp = await db.query.adminOtps.findFirst({
    where: and(eq(schema.adminOtps.email, email), eq(schema.adminOtps.used, false)), orderBy: [desc(schema.adminOtps.id)],
  });
  if (!otp || otp.expiresAt < new Date()) return { ok: false, error: "Code expired. Request a new one." };
  if (otp.attempts >= 5) return { ok: false, error: "Too many wrong tries. Request a new code." };
  const a = Buffer.from(hash(email, code)), b = Buffer.from(otp.codeHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await db.update(schema.adminOtps).set({ attempts: sql`${schema.adminOtps.attempts} + 1` }).where(eq(schema.adminOtps.id, otp.id));
    return { ok: false, error: "Wrong code." };
  }
  await db.update(schema.adminOtps).set({ used: true }).where(eq(schema.adminOtps.id, otp.id));
  const admin = await db.query.superAdmins.findFirst({ where: eq(schema.superAdmins.email, email) });
  if (!admin || !admin.active) return { ok: false, error: "Not allowed." };
  (await cookies()).set(ADMIN_COOKIE, await signAdmin({ admin: email, aid: admin.id }), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12,
  });
  redirect("/admin");
}

// ---------- password login (SUPERADMIN_PASSWORD in .env) ----------
export async function passwordLoginAction(emailRaw: string, password: string): Promise<R> {
  const email = emailRaw.trim().toLowerCase();
  const envPw = process.env.SUPERADMIN_PASSWORD || "";
  if (!envPw) return { ok: false, error: "Password login is off. Set SUPERADMIN_PASSWORD in .env and restart." };
  if (envPw.length < 10) return { ok: false, error: "SUPERADMIN_PASSWORD in .env is too short - use at least 10 characters, then restart." };
  // 5 wrong tries for an email, or 20 from one network, lock it for 15 minutes (kept in the database)
  const ip = await clientIp();
  const keys = [`admin:${email}`, `adminip:${ip}`];
  try { await assertNotLocked(keys); } catch (e) { return { ok: false, error: `${(e as Error).message} You can also use the email code.` }; }
  if (envAdminEmails().includes(email)) await syncEnvAdmins();
  const admin = await db.query.superAdmins.findFirst({ where: eq(schema.superAdmins.email, email) });
  const a = createHash("sha256").update(password).digest(), b = createHash("sha256").update(envPw).digest();
  if (!admin || !admin.active || !timingSafeEqual(a, b)) {
    await recordFailure([{ key: keys[0], limit: 5 }, { key: keys[1], limit: 20 }]);
    await new Promise((r) => setTimeout(r, 600));
    return { ok: false, error: "Wrong email or password." };
  }
  await clearFailures([keys[0]]);
  (await cookies()).set(ADMIN_COOKIE, await signAdmin({ admin: email, aid: admin.id }), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12,
  });
  redirect("/admin");
}

export async function adminLogoutAction() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/admin/login");
}

// ---------- restaurants ----------
export async function createTenantAction(v: {
  name: string; code: string; ownerName: string; ownerUsername: string; ownerPassword: string; ownerPhone?: string;
  contactEmail?: string; contactPhone?: string; plan?: string; billPrefix?: string; sample?: boolean;
}): Promise<R & { id?: number }> {
  try {
    await requireAdmin();
    const t = await provisionTenant(db, v);
    if (v.sample) await addSampleData(db, t.id);
    revalidatePath("/admin");
    return { ok: true, id: t.id };
  } catch (e) { return err(e); }
}

export async function updateTenantAction(id: number, v: { name: string; code: string; plan: string; contactName: string; contactEmail: string; contactPhone: string; notes: string }): Promise<R> {
  try {
    await requireAdmin();
    const code = v.code.trim().toLowerCase();
    if (!CODE_RE.test(code)) throw new Error("Restaurant code: 2-31 lowercase letters, numbers or dashes.");
    if (RESERVED_PATHS.includes(code)) throw new Error(`"${code}" is used by the app itself - pick another code.`);
    await db.update(schema.tenants).set({ name: v.name.trim(), code, plan: v.plan, contactName: v.contactName, contactEmail: v.contactEmail, contactPhone: v.contactPhone, notes: v.notes }).where(eq(schema.tenants.id, id));
    revalidatePath(`/admin/restaurants/${id}`);
    return { ok: true, msg: "Saved." };
  } catch (e) { return err(e); }
}

/** Switch an extra feature (e.g. pre-orders) on or off for one restaurant */
export async function setTenantFeatureAction(id: number, feature: FeatureKey, on: boolean): Promise<R> {
  try {
    await requireAdmin();
    if (!FEATURE_KEYS.includes(feature)) throw new Error("Unknown feature.");
    const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, id) });
    if (!t) throw new Error("Restaurant not found.");
    const next = new Set(t.features ?? []);
    if (on) next.add(feature); else next.delete(feature);
    await db.update(schema.tenants).set({ features: [...next] }).where(eq(schema.tenants.id, id));
    revalidatePath(`/admin/restaurants/${id}`); revalidatePath("/admin");
    return { ok: true, msg: on ? "Switched on." : "Switched off." };
  } catch (e) { return err(e); }
}

export async function setTenantActiveAction(id: number, active: boolean): Promise<R> {
  try {
    await requireAdmin();
    await db.update(schema.tenants).set({ active }).where(eq(schema.tenants.id, id));
    revalidatePath(`/admin/restaurants/${id}`); revalidatePath("/admin");
    return { ok: true };
  } catch (e) { return err(e); }
}

export async function addOwnerAction(tenantId: number, v: { name: string; username: string; password: string; phone?: string }): Promise<R> {
  try {
    await requireAdmin();
    const username = v.username.trim().toLowerCase();
    if (!v.name.trim()) throw new Error("Enter the owner's name.");
    if (!USERNAME_RE.test(username)) throw new Error("Username: 3-30 letters/numbers, no spaces.");
    if (v.password.length < 6) throw new Error("Password must be at least 6 characters.");
    await db.insert(schema.users).values({ tenantId, name: v.name.trim(), username, phone: v.phone ?? "", role: "OWNER", passwordHash: await bcrypt.hash(v.password, 10) });
    revalidatePath(`/admin/restaurants/${tenantId}`);
    return { ok: true };
  } catch (e) { return err(e); }
}

export async function resetUserPasswordAction(tenantId: number, userId: number, password: string): Promise<R> {
  try {
    await requireAdmin();
    if (password.length < 6) throw new Error("Password must be at least 6 characters.");
    const u = await db.query.users.findFirst({ where: and(eq(schema.users.id, userId), eq(schema.users.tenantId, tenantId)) });
    if (!u) throw new Error("User not found.");
    await db.update(schema.users).set({ passwordHash: await bcrypt.hash(password, 10), active: true, sessionVersion: u.sessionVersion + 1 }).where(eq(schema.users.id, userId));
    revalidatePath(`/admin/restaurants/${tenantId}`);
    return { ok: true, msg: `Password reset for ${u.name}.` };
  } catch (e) { return err(e); }
}

export async function deleteTenantAction(id: number, confirmCode: string): Promise<R> {
  try {
    await requireAdmin();
    const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, id) });
    if (!t) throw new Error("Not found.");
    if (confirmCode.trim().toLowerCase() !== t.code) throw new Error(`Type the code "${t.code}" to confirm.`);
    await db.delete(schema.tenants).where(eq(schema.tenants.id, id)); // cascades all its data
    revalidatePath("/admin");
  } catch (e) { return err(e); }
  redirect("/admin");
}

// ---------- super admins ----------
export async function addSuperAdminAction(emailRaw: string, name: string): Promise<R> {
  try {
    await requireAdmin();
    const email = emailRaw.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email.");
    await db.insert(schema.superAdmins).values({ email, name: name.trim() || email.split("@")[0] }).onConflictDoUpdate({ target: schema.superAdmins.email, set: { active: true } });
    revalidatePath("/admin/admins");
    return { ok: true };
  } catch (e) { return err(e); }
}

export async function setSuperAdminActiveAction(id: number, active: boolean): Promise<R> {
  try {
    const me = await requireAdmin();
    if (id === me.id && !active) throw new Error("You can't remove yourself.");
    if (!active) {
      const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(schema.superAdmins).where(eq(schema.superAdmins.active, true));
      if (Number(n) <= 1) throw new Error("Keep at least one super admin.");
    }
    await db.update(schema.superAdmins).set({ active }).where(eq(schema.superAdmins.id, id));
    revalidatePath("/admin/admins");
    return { ok: true };
  } catch (e) { return err(e); }
}
