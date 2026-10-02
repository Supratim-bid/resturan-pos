import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { todayIST, inr } from "@/lib/format";
import { buildWorkbook } from "@/lib/workbook";
import { sendMail } from "@/lib/mail";

/** Emails today's sales & expense Excel to the owner mail(s), unless it was already sent today.
 *  Returns what happened so the caller (button or cron) can report it. */
export async function sendDayEndReport(tenantId: number, opts: { force?: boolean } = {}) {
  const [s, tenant] = await Promise.all([
    db.query.settings.findFirst({ where: eq(schema.settings.tenantId, tenantId) }),
    db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId) }),
  ]);
  const today = todayIST();
  const emails = (s?.dayEndEmails ?? "").split(/[\n,;]+/).map((x) => x.trim()).filter((x) => /.+@.+\..+/.test(x));
  if (!emails.length) return { sent: false, reason: "no-emails" as const };
  if (!opts.force && s?.dayEndSentFor === today) return { sent: false, reason: "already-sent" as const };

  const { buffer, filename, totals } = await buildWorkbook(tenantId, today, today, tenant?.code ?? "report");
  const name = s?.billName || s?.name || "Restaurant";
  const subject = `${name} — day-end report ${today}`;
  const lines = [
    `Day-end report for ${name} — ${today}`,
    ``,
    `Orders: ${totals.orderCount}`,
    `Sales (billed): ${inr(totals.sales)}`,
    `Collected: ${inr(totals.collected)}`,
    `Expenses: ${inr(totals.expenseTotal)}`,
    ``,
    `The full sheet (orders, items, payments, expenses, reimbursements, dues) is attached.`,
  ];
  const html = `<div style="font-family:system-ui,Arial,sans-serif">
    <h2 style="color:#9a1c1f;margin:0 0 8px">${name} — day-end report</h2>
    <p style="margin:0 0 12px;color:#555">${today}</p>
    <table style="border-collapse:collapse;font-size:15px">
      <tr><td style="padding:4px 16px 4px 0">Orders</td><td style="text-align:right;font-weight:700">${totals.orderCount}</td></tr>
      <tr><td style="padding:4px 16px 4px 0">Sales (billed)</td><td style="text-align:right;font-weight:700">${inr(totals.sales)}</td></tr>
      <tr><td style="padding:4px 16px 4px 0">Collected</td><td style="text-align:right;font-weight:700">${inr(totals.collected)}</td></tr>
      <tr><td style="padding:4px 16px 4px 0">Expenses</td><td style="text-align:right;font-weight:700">${inr(totals.expenseTotal)}</td></tr>
    </table>
    <p style="margin:14px 0 0;color:#555">The full Excel sheet is attached.</p></div>`;

  const res = await sendMail(emails.join(", "), subject, lines.join("\n"), html, [
    { filename, content: buffer, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  ]);
  await db.update(schema.settings).set({ dayEndSentFor: today }).where(eq(schema.settings.tenantId, tenantId));
  return { sent: true, dev: !!res.dev, to: emails, totals };
}

/** Close the shop for the day: closes dine-in/counter AND online orders, then emails the report. */
export async function closeShop(tenantId: number) {
  await db.update(schema.settings).set({ closedNow: true, onlineOpen: false }).where(eq(schema.settings.tenantId, tenantId));
  return sendDayEndReport(tenantId);
}

/** Re-open the shop. Online orders are only re-opened when the owner chooses to. */
export async function openShop(tenantId: number, openOnline: boolean) {
  await db.update(schema.settings).set(openOnline ? { closedNow: false, onlineOpen: true } : { closedNow: false }).where(eq(schema.settings.tenantId, tenantId));
}
