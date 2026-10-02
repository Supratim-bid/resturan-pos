"use server";
import bcrypt from "bcryptjs";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, lt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { ADMIN_COOKIE, COOKIE, signAdmin, signSession } from "@/lib/session";
import { requireAdmin } from "@/lib/auth";
import { sendMail } from "@/lib/mail";
import { envAdminEmails, syncEnvAdmins } from "@/lib/admin-env";
import { assertNotLocked, clearFailures, clientIp, recordFailure } from "@/lib/throttle";
import { addSampleData, provisionTenant, replicateTenant, USERNAME_RE, CODE_RE } from "@/lib/provision";
import { RESERVED_PATHS } from "@/lib/reserved";
import { FEATURE_KEYS, isComingSoon, type FeatureKey } from "@/lib/features";

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
  // the browser opens /admin itself with a full page load (a redirect from here could stall on "Checking…")
  return { ok: true };
}

// ---------- password login (SUPERADMIN_PASSWORD in .env) ----------
export async function passwordLoginAction(emailRaw: string, password: string): Promise<R> {
  const email = emailRaw.trim().toLowerCase();
  // tolerate how the value was pasted into the host (Vercel): surrounding quotes or spaces are not part of the password
  const envPw = (process.env.SUPERADMIN_PASSWORD || "").trim().replace(/^(["'])(.*)\1$/, "$2");
  if (!envPw) return { ok: false, error: "Password login is off. Set SUPERADMIN_PASSWORD in .env and restart." };
  if (envPw.length < 10) return { ok: false, error: "SUPERADMIN_PASSWORD in .env is too short - use at least 10 characters, then restart." };
  // 5 wrong tries for an email, or 20 from one network, lock it for 15 minutes (kept in the database)
  const ip = await clientIp();
  const keys = [`admin:${email}`, `adminip:${ip}`];
  try { await assertNotLocked(keys); } catch (e) { return { ok: false, error: `${(e as Error).message} You can also use the email code.` }; }
  if (envAdminEmails().includes(email)) await syncEnvAdmins();
  const admin = await db.query.superAdmins.findFirst({ where: eq(schema.superAdmins.email, email) });
  const a = createHash("sha256").update(password.trim()).digest(), b = createHash("sha256").update(envPw).digest();
  if (!admin || !admin.active || !timingSafeEqual(a, b)) {
    await recordFailure([{ key: keys[0], limit: 5 }, { key: keys[1], limit: 20 }]);
    await new Promise((r) => setTimeout(r, 600));
    return { ok: false, error: "Wrong email or password." };
  }
  await clearFailures([keys[0]]);
  (await cookies()).set(ADMIN_COOKIE, await signAdmin({ admin: email, aid: admin.id }), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12,
  });
  // the browser opens /admin itself with a full page load (a redirect from here could stall on "Checking…")
  return { ok: true };
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
    const plan = v.plan ? await db.query.plans.findFirst({ where: eq(schema.plans.key, v.plan) }) : null;
    const t = await provisionTenant(db, { ...v, plan: plan?.key ?? "starter" });
    if (v.sample) await addSampleData(db, t.id);
    revalidatePath("/admin");
    return { ok: true, id: t.id };
  } catch (e) { return err(e); }
}

export async function updateTenantAction(id: number, v: { name: string; code: string; contactName: string; contactEmail: string; contactPhone: string; notes: string }): Promise<R> {
  try {
    await requireAdmin();
    const code = v.code.trim().toLowerCase();
    if (!CODE_RE.test(code)) throw new Error("Restaurant code: 2-31 lowercase letters, numbers or dashes.");
    if (RESERVED_PATHS.includes(code)) throw new Error(`"${code}" is used by the app itself - pick another code.`);
    await db.update(schema.tenants).set({ name: v.name.trim(), code, contactName: v.contactName, contactEmail: v.contactEmail, contactPhone: v.contactPhone, notes: v.notes }).where(eq(schema.tenants.id, id));
    revalidatePath(`/admin/restaurants/${id}`);
    return { ok: true, msg: "Saved." };
  } catch (e) { return err(e); }
}

/** Allow or stop one feature for one restaurant (on top of / out of its plan) */
export async function setTenantFeatureAction(id: number, feature: FeatureKey, on: boolean): Promise<R> {
  try {
    await requireAdmin();
    if (!FEATURE_KEYS.includes(feature)) throw new Error("Unknown feature.");
    if (isComingSoon(feature)) throw new Error("This feature is not ready yet.");
    const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, id) });
    if (!t) throw new Error("Restaurant not found.");
    const plan = await db.query.plans.findFirst({ where: eq(schema.plans.key, t.plan) });
    const inPlan = (plan?.features ?? []).includes(feature);
    const add = new Set(t.features ?? []), removed = new Set(t.featuresRemoved ?? []);
    if (on) { removed.delete(feature); if (!inPlan) add.add(feature); }
    else { add.delete(feature); if (inPlan) removed.add(feature); }
    // allowing a feature also switches it on for the owner (they can turn it off again in Settings)
    await db.update(schema.tenants).set({ features: [...add], featuresRemoved: [...removed], featuresOff: (t.featuresOff ?? []).filter((f) => !(on && f === feature)) }).where(eq(schema.tenants.id, id));
    revalidatePath(`/admin/restaurants/${id}`); revalidatePath("/admin");
    return { ok: true, msg: on ? (inPlan ? "Allowed (in plan)." : "Added as an add-on.") : (inPlan ? "Removed from this restaurant's plan." : "Add-on removed.") };
  } catch (e) { return err(e); }
}

/** Change a restaurant's plan (and optional login limit). Per-restaurant add-ons/removals are kept. */
export async function setTenantPlanAction(id: number, planKey: string, maxUsers: string): Promise<R> {
  try {
    await requireAdmin();
    const plan = await db.query.plans.findFirst({ where: eq(schema.plans.key, planKey) });
    if (!plan) throw new Error("Pick a plan.");
    const m = maxUsers.trim() === "" ? null : Math.round(Number(maxUsers));
    if (m != null && (!Number.isFinite(m) || m < 0 || m > 999)) throw new Error("Login limit must be 0-999 (blank = plan's limit).");
    await db.update(schema.tenants).set({ plan: plan.key, maxUsers: m }).where(eq(schema.tenants.id, id));
    revalidatePath(`/admin/restaurants/${id}`); revalidatePath("/admin");
    return { ok: true, msg: `Plan: ${plan.name}.` };
  } catch (e) { return err(e); }
}

// ---------- plans ----------
const PLAN_KEY = /^[a-z0-9-]{2,30}$/;
export async function savePlanAction(v: { id?: number; key: string; name: string; description: string; price: string | number; maxUsers: string | number; features: string[]; sortOrder?: string | number; active: boolean }): Promise<R> {
  try {
    await requireAdmin();
    const name = v.name.trim();
    if (!name) throw new Error("Give the plan a name.");
    const price = Number(v.price || 0), maxUsers = Math.round(Number(v.maxUsers || 0));
    if (!Number.isFinite(price) || price < 0) throw new Error("Price must be a number.");
    if (!Number.isFinite(maxUsers) || maxUsers < 0) throw new Error("Logins must be 0 (no limit) or more.");
    const features = [...new Set(v.features)].filter((f) => (FEATURE_KEYS as string[]).includes(f));
    const vals = { name, description: v.description.trim().slice(0, 200), price, maxUsers, features, sortOrder: Math.round(Number(v.sortOrder || 0)), active: !!v.active };
    if (v.id) {
      await db.update(schema.plans).set(vals).where(eq(schema.plans.id, v.id));
    } else {
      const key = v.key.trim().toLowerCase();
      if (!PLAN_KEY.test(key)) throw new Error("Plan code: 2-30 lowercase letters, numbers or dashes (e.g. premium).");
      await db.insert(schema.plans).values({ key, ...vals });
    }
    revalidatePath("/admin/plans"); revalidatePath("/admin");
    return { ok: true, msg: "Plan saved." };
  } catch (e) { return err(e); }
}

export async function deletePlanAction(id: number): Promise<R> {
  try {
    await requireAdmin();
    const p = await db.query.plans.findFirst({ where: eq(schema.plans.id, id) });
    if (!p) throw new Error("Plan not found.");
    const [u] = await db.select({ n: sql<number>`count(*)` }).from(schema.tenants).where(eq(schema.tenants.plan, p.key));
    if (Number(u.n) > 0) throw new Error(`${Number(u.n)} restaurant(s) use this plan. Move them to another plan first, or untick "Offered" instead.`);
    await db.delete(schema.plans).where(eq(schema.plans.id, id));
    revalidatePath("/admin/plans");
    return { ok: true, msg: "Plan deleted." };
  } catch (e) { return err(e); }
}

export async function setTenantActiveAction(id: number, active: boolean): Promise<R> {
  try {
    await requireAdmin();
    await db.update(schema.tenants).set({ active }).where(eq(schema.tenants.id, id));
    revalidatePath(`/admin/restaurants/${id}`); revalidatePath("/admin");
    return { ok: true, msg: active ? "Enabled." : "Disabled." };
  } catch (e) { return err(e); }
}

/** Set (or clear) the paid/trial end date. Past this date the account locks on its own. */
export async function setTenantValidTillAction(id: number, date: string): Promise<R> {
  try {
    await requireAdmin();
    const d = date.trim();
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error("Pick a valid date.");
    await db.update(schema.tenants).set({ validTill: d || null }).where(eq(schema.tenants.id, id));
    revalidatePath(`/admin/restaurants/${id}`); revalidatePath("/admin");
    return { ok: true, msg: d ? `Active until ${d}.` : "Expiry cleared (no end date)." };
  } catch (e) { return err(e); }
}

const rand8 = () => String(Math.floor(10000000 + Math.random() * 90000000));

/** Turn the Settings OTP-lock on or off for a restaurant (e.g. leave it off for trials).
 *  When turning it on, make sure a standing 8-digit code exists for the owner to use. */
export async function setSettingsOtpRequiredAction(id: number, required: boolean): Promise<R> {
  try {
    await requireAdmin();
    if (required) {
      const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, id), columns: { settingsOtp: true } });
      await db.update(schema.tenants).set({ settingsOtpRequired: true, ...(t?.settingsOtp ? {} : { settingsOtp: rand8() }) }).where(eq(schema.tenants.id, id));
    } else {
      await db.update(schema.tenants).set({ settingsOtpRequired: false, settingsUnlockedUntil: null }).where(eq(schema.tenants.id, id));
    }
    revalidatePath(`/admin/restaurants/${id}`);
    return { ok: true, msg: required ? "Settings now need the access code." : "Settings open without a code." };
  } catch (e) { return err(e); }
}

/** Regenerate the restaurant's standing 8-digit code (also cancels any current unlock). Returns the new code. */
export async function genSettingsOtpAction(id: number): Promise<R & { code?: string }> {
  try {
    await requireAdmin();
    const code = rand8();
    await db.update(schema.tenants).set({ settingsOtpRequired: true, settingsOtp: code, settingsUnlockedUntil: null }).where(eq(schema.tenants.id, id));
    revalidatePath(`/admin/restaurants/${id}`);
    return { ok: true, code, msg: "New code generated." };
  } catch (e) { return err(e); }
}

/** Close the owner's current Settings access immediately. The standing code stays (and still works next time). */
export async function closeSettingsAccessAction(id: number): Promise<R> {
  try {
    await requireAdmin();
    await db.update(schema.tenants).set({ settingsUnlockedUntil: null }).where(eq(schema.tenants.id, id));
    revalidatePath(`/admin/restaurants/${id}`);
    return { ok: true, msg: "Settings access closed." };
  } catch (e) { return err(e); }
}

/** Make a full copy of a restaurant (menu, recipes, settings, branding) as a new restaurant, with dummy orders to try it out. */
export async function replicateTenantAction(srcId: number, v: { name: string; code: string; ownerName: string; ownerUsername: string; ownerPassword: string }): Promise<R & { id?: number; code?: string }> {
  try {
    await requireAdmin();
    const t = await replicateTenant(db, srcId, v);
    revalidatePath("/admin");
    return { ok: true, id: t.id, code: t.code, msg: `Copied to “${t.name}”.` };
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

/** Super admin opens a restaurant as its owner. Every entry is written to admin_impersonations. */
export async function openTenantAsOwnerAction(tenantId: number): Promise<R> {
  try {
    const admin = await requireAdmin();
    const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId) });
    if (!t) throw new Error("Restaurant not found.");
    if (!t.active) throw new Error("This restaurant is paused. Make it active first.");
    // prefer an active OWNER login; fall back to any active login
    const owners = await db.query.users.findMany({ where: and(eq(schema.users.tenantId, tenantId), eq(schema.users.active, true)) });
    const u = owners.find((x) => x.role === "OWNER") ?? owners[0];
    if (!u) throw new Error("This restaurant has no active login to enter as.");
    await db.insert(schema.adminImpersonations).values({
      adminId: admin.id, adminEmail: admin.email, tenantId: t.id, tenantName: t.name, tenantCode: t.code,
      userId: u.id, userName: u.name, ip: await clientIp(),
    });
    const jar = await cookies();
    jar.set(COOKIE, await signSession({ uid: u.id, tid: t.id, role: u.role, name: u.name, v: u.sessionVersion, imp: true }),
      { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12 });
  } catch (e) { return err(e); }
  redirect(`/`); // the app reads the new owner session; a banner marks it as a support view
}

/** Leave a support view and go back to the admin panel. */
export async function exitImpersonationAction() {
  (await cookies()).delete(COOKIE);
  redirect("/admin");
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

export async function editUserAction(tenantId: number, userId: number, v: { name: string; username: string; phone?: string }): Promise<R> {
  try {
    await requireAdmin();
    const username = v.username.trim().toLowerCase();
    if (!v.name.trim()) throw new Error("Enter a name.");
    if (!USERNAME_RE.test(username)) throw new Error("Username: 3-30 letters/numbers, no spaces.");
    const u = await db.query.users.findFirst({ where: and(eq(schema.users.id, userId), eq(schema.users.tenantId, tenantId)) });
    if (!u) throw new Error("User not found.");
    await db.update(schema.users).set({ name: v.name.trim(), username, phone: v.phone ?? "" }).where(eq(schema.users.id, userId));
    revalidatePath(`/admin/restaurants/${tenantId}`);
    return { ok: true, msg: "Saved." };
  } catch (e) { return err(e); }
}

export async function deleteUserAction(tenantId: number, userId: number): Promise<R> {
  try {
    await requireAdmin();
    const u = await db.query.users.findFirst({ where: and(eq(schema.users.id, userId), eq(schema.users.tenantId, tenantId)) });
    if (!u) throw new Error("User not found.");
    if (u.role === "OWNER") {
      const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(schema.users)
        .where(and(eq(schema.users.tenantId, tenantId), eq(schema.users.role, "OWNER"), eq(schema.users.active, true)));
      if (Number(n) <= 1 && u.active) throw new Error("This is the restaurant's only active owner. Add another owner before deleting this one.");
    }
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    revalidatePath(`/admin/restaurants/${tenantId}`);
    return { ok: true, msg: `Deleted ${u.name}.` };
  } catch (e) { return err(e); }
}

export async function deleteTenantAction(id: number, confirmCode: string): Promise<R> {
  try {
    await requireAdmin();
    const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, id) });
    if (!t) throw new Error("Not found.");
    // A paused restaurant (login locked - e.g. a non-payer) deletes with one click.
    // An active restaurant still needs its code typed, so a paying one can't be wiped by a misclick.
    if (t.active && confirmCode.trim().toLowerCase() !== t.code) throw new Error(`This restaurant is active. Pause it first for one-click delete, or type the code "${t.code}" to confirm.`);
    await db.delete(schema.tenants).where(eq(schema.tenants.id, id)); // cascades all its data
    revalidatePath("/admin");
  } catch (e) { return err(e); }
  redirect("/admin");
}

// ---------- files (shared resources) & support ----------
const RES_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const RES_MAX = 15_000_000; // 15 MB for manuals

/** Super admin uploads a resource (manual etc.) that every restaurant owner can download. */
export async function uploadResourceAction(fd: FormData): Promise<R> {
  try {
    await requireAdmin();
    const title = String(fd.get("title") || "").trim();
    if (!title) throw new Error("Give the file a title.");
    const f = fd.get("file");
    if (!(f instanceof Blob) || f.size === 0) throw new Error("Choose a file.");
    if (!RES_TYPES.includes(f.type)) throw new Error("Use a PDF, JPG, PNG or WebP file.");
    if (f.size > RES_MAX) throw new Error("File is too large (max 15 MB).");
    const buf = Buffer.from(await f.arrayBuffer());
    const filename = ("name" in f && typeof (f as File).name === "string" ? (f as File).name : title).slice(0, 180);
    await db.insert(schema.files).values({ tenantId: null, kind: "ADMIN_RESOURCE", title: title.slice(0, 140), filename, mime: f.type, size: f.size, data: buf, byAdmin: true });
    revalidatePath("/admin/resources");
    return { ok: true, msg: "Uploaded." };
  } catch (e) { return err(e); }
}

export async function deleteResourceAction(id: number): Promise<R> {
  try {
    await requireAdmin();
    await db.delete(schema.files).where(and(eq(schema.files.id, id), sql`${schema.files.tenantId} is null`));
    revalidatePath("/admin/resources");
    return { ok: true };
  } catch (e) { return err(e); }
}

/** Super admin replies to a restaurant's support message. */
export async function replySupportAction(id: number, reply: string): Promise<R> {
  try {
    const a = await requireAdmin();
    const text = reply.trim();
    if (text.length < 1) throw new Error("Type a reply.");
    await db.update(schema.supportMessages).set({ reply: text.slice(0, 4000), repliedByEmail: a.email, repliedAt: new Date() }).where(eq(schema.supportMessages.id, id));
    revalidatePath("/admin/support");
    return { ok: true, msg: "Reply sent." };
  } catch (e) { return err(e); }
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
