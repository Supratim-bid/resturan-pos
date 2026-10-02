import "server-only";
import nodemailer from "nodemailer";

export type MailAttachment = { filename: string; content: Buffer; contentType?: string };

/** Sends email through SMTP (any provider). Without SMTP_HOST, prints to the server log (local dev). */
export async function sendMail(to: string, subject: string, text: string, html?: string, attachments?: MailAttachment[]) {
  const host = process.env.SMTP_HOST;
  if (!host) {
    const att = attachments?.length ? ` (+${attachments.length} attachment${attachments.length > 1 ? "s" : ""}: ${attachments.map((a) => a.filename).join(", ")})` : "";
    console.log(`\n[mail:dev] To: ${to}\n[mail:dev] Subject: ${subject}${att}\n[mail:dev] ${text}\n`);
    return { dev: true };
  }
  const port = Number(process.env.SMTP_PORT || 587);
  const t = nodemailer.createTransport({
    host, port, secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  await t.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text, html, attachments });
  return { dev: false };
}
