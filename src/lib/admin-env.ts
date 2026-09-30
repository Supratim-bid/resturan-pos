import nodemailer from "nodemailer";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";

/** Super admin emails listed in .env (SUPERADMIN_EMAILS, comma separated) */
export function envAdminEmails() {
  return (process.env.SUPERADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
}

/** Make sure every .env super admin exists and is active. Runs when the server starts (and before each login). */
export async function syncEnvAdmins() {
  const emails = envAdminEmails();
  for (const email of emails) {
    await db.insert(schema.superAdmins).values({ email, name: email.split("@")[0] })
      .onConflictDoUpdate({ target: schema.superAdmins.email, set: { active: true } });
  }
  return emails;
}

/** Checks the email settings and says clearly what will happen with OTP codes */
export async function checkMail() {
  const host = process.env.SMTP_HOST;
  if (!host) return { ok: true, msg: "SMTP_HOST is empty - OTP codes will be PRINTED IN THIS TERMINAL (not emailed)." };
  const port = Number(process.env.SMTP_PORT || 587);
  try {
    const t = nodemailer.createTransport({ host, port, secure: port === 465, auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined, connectionTimeout: 10_000 });
    await t.verify();
    return { ok: true, msg: `email server OK (${host}:${port} as ${process.env.SMTP_USER ?? "-"}) - OTP codes will be emailed.` };
  } catch (e) {
    const m = String((e as Error).message || e);
    const hint = /535|Username and Password not accepted|BadCredentials/i.test(m)
      ? " -> Gmail refused the login: SMTP_PASS must be a 16-letter App Password (Google Account > Security > 2-Step Verification > App passwords), not your normal password."
      : /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|timeout/i.test(m) ? " -> check SMTP_HOST / SMTP_PORT (Gmail: smtp.gmail.com, 465) and your internet." : "";
    return { ok: false, msg: `email server NOT working: ${m}${hint}` };
  }
}

export async function startupAdminCheck() {
  try {
    await db.execute(sql`select 1`);
    const emails = await syncEnvAdmins();
    const pw = !!process.env.SUPERADMIN_PASSWORD;
    console.log(`\n[admin] Super admins from .env: ${emails.length ? emails.join(", ") : "(none - set SUPERADMIN_EMAILS in .env)"}`);
    console.log(`[admin] Login at /admin/login with: email code${pw ? " or password (SUPERADMIN_PASSWORD)" : ""}`);
    const m = await checkMail();
    console.log(`[admin] ${m.ok ? "✓" : "✗"} ${m.msg}\n`);
  } catch (e) {
    console.error("[admin] startup check failed (is the database running and DATABASE_URL right?):", String((e as Error).message || e));
  }
}
