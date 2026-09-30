// Server errors: always logged; also emailed to ALERT_EMAIL (at most one email per kind of error every 30 minutes).
import nodemailer from "nodemailer";

const lastSent = new Map<string, number>();
const QUIET_MS = 30 * 60_000;

export async function reportServerError(err: unknown, where: { path?: string; method?: string; kind?: string }) {
  const e = err as { message?: string; stack?: string; digest?: string };
  const msg = String(e?.message ?? err).slice(0, 500);
  console.error(`[error] ${where.method ?? ""} ${where.path ?? ""} (${where.kind ?? "request"}) ${msg}${e?.digest ? ` [digest ${e.digest}]` : ""}`);
  const to = process.env.ALERT_EMAIL, host = process.env.SMTP_HOST;
  if (!to || !host) return;
  const key = `${where.path ?? ""}|${msg.slice(0, 120)}`;
  const now = Date.now();
  if ((lastSent.get(key) ?? 0) > now - QUIET_MS) return;
  lastSent.set(key, now);
  try {
    const port = Number(process.env.SMTP_PORT || 587);
    const t = nodemailer.createTransport({ host, port, secure: port === 465, auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined });
    const app = process.env.NEXT_PUBLIC_APP_NAME || "Restaurant Manager";
    await t.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER, to,
      subject: `[${app}] Error on ${where.path ?? "the server"}`,
      text: `Time: ${new Date().toISOString()}\nPage: ${where.method ?? ""} ${where.path ?? ""}\nType: ${where.kind ?? ""}\nError: ${msg}\n${e?.digest ? `Digest: ${e.digest}\n` : ""}\n${(e?.stack ?? "").split("\n").slice(0, 12).join("\n")}\n\n(Same error again within 30 minutes is not emailed.)`,
    });
  } catch (x) { console.error("[error] could not email the alert:", (x as Error).message); }
}
