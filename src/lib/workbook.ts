import ExcelJS from "exceljs";
import { and, asc, eq, gte, lte, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { customerBalances } from "@/lib/orders";

/** Builds one Excel workbook (Orders, Items, Payments, Expenses, Reimbursements, Customers) for a date range.
 *  Reused by the manual export route and the automatic day-end / daily report email. */
export async function buildWorkbook(tenantId: number, from: string, to: string, tenantCode: string) {
  const O = schema.orders;
  const [os, ps, es, cs, bal] = await Promise.all([
    db.query.orders.findMany({ where: and(eq(O.tenantId, tenantId), gte(O.date, from), lte(O.date, to)), with: { customer: true, items: true, payments: { with: { createdBy: true } }, createdBy: true, deliveredBy: true }, orderBy: [asc(O.date), asc(O.id)] }),
    db.query.payments.findMany({ where: and(eq(schema.payments.tenantId, tenantId), gte(schema.payments.date, from), lte(schema.payments.date, to)), with: { order: true, customer: true, createdBy: true }, orderBy: [asc(schema.payments.date)] }),
    db.query.expenses.findMany({ where: and(eq(schema.expenses.tenantId, tenantId), gte(schema.expenses.date, from), lte(schema.expenses.date, to)), with: { vendor: true, staff: true, ingredient: true, createdBy: true }, orderBy: [asc(schema.expenses.date)] }),
    db.query.customers.findMany({ where: eq(schema.customers.tenantId, tenantId), orderBy: (t, { asc }) => asc(t.name) }),
    customerBalances(tenantId),
  ]);
  const owedRows = await db.query.expenses.findMany({ where: and(eq(schema.expenses.tenantId, tenantId), ne(schema.expenses.paymentMode, "Credit")), orderBy: [asc(schema.expenses.date)] });

  const wb = new ExcelJS.Workbook();
  wb.creator = process.env.NEXT_PUBLIC_APP_NAME || "Restaurant Manager";
  const n2 = "#,##0.00";
  const sheet = (name: string, cols: Partial<ExcelJS.Column>[], rows: (string | number | null | undefined)[][]) => {
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = cols;
    ws.addRows(rows);
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF9A1C1F" } };
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  };

  const paidByName = (o: typeof os[number]) => { const p = [...o.payments].reverse().find((x) => Number(x.amount) > 0 && x.createdBy); return p?.createdBy?.name ?? ""; };

  sheet("Orders", [
    { header: "Order", width: 12 }, { header: "Date", width: 12 }, { header: "Status", width: 10 }, { header: "Type", width: 14 }, { header: "Table", width: 8 },
    { header: "Customer", width: 20 }, { header: "Phone", width: 14 }, { header: "Taken by", width: 16 }, { header: "Delivered by", width: 16 }, { header: "Payment taken by", width: 16 },
    { header: "Total", width: 10, style: { numFmt: n2 } }, { header: "Paid", width: 10, style: { numFmt: n2 } }, { header: "Due", width: 10, style: { numFmt: n2 } }, { header: "Notes", width: 24 },
  ], os.map((o) => { const paid = o.payments.reduce((s, p) => s + Number(p.amount), 0);
    return [o.billNo, o.date, o.status, o.orderType, o.tableNo, o.customer?.name ?? "", o.customer?.phone ?? "", o.createdBy?.name ?? "Online/system",
      o.fulfilStatus === "DELIVERED" ? (o.deliveredBy?.name ?? "✓") : "", paidByName(o), Number(o.total), paid, Number(o.total) - paid, o.notes]; }));

  const items: (string | number)[][] = [];
  for (const o of os) for (const i of o.items) items.push([o.billNo, o.date, o.orderType, o.customer?.name ?? "", o.createdBy?.name ?? "Online/system", o.fulfilStatus === "DELIVERED" ? (o.deliveredBy?.name ?? "✓") : "", i.name, Number(i.qty), Number(i.rate), Number(i.lineTotal)]);
  sheet("Items", [
    { header: "Order", width: 12 }, { header: "Date", width: 12 }, { header: "Type", width: 14 }, { header: "Customer", width: 20 }, { header: "Taken by", width: 16 }, { header: "Delivered by", width: 16 },
    { header: "Dish", width: 24 }, { header: "Qty", width: 7 }, { header: "Rate", width: 9, style: { numFmt: n2 } }, { header: "Line total", width: 11, style: { numFmt: n2 } },
  ], items);

  sheet("Payments", [
    { header: "Date", width: 12 }, { header: "Customer", width: 20 }, { header: "Order", width: 12 }, { header: "Mode", width: 14 }, { header: "Amount", width: 11, style: { numFmt: n2 } }, { header: "Recorded by", width: 16 }, { header: "Notes", width: 24 },
  ], ps.map((p) => [p.date, p.customer?.name ?? "", p.order ? p.order.billNo : "advance", p.mode, Number(p.amount), p.createdBy?.name ?? "", p.notes]));

  sheet("Expenses", [
    { header: "Date", width: 12 }, { header: "Category", width: 16 }, { header: "Description", width: 22 }, { header: "Amount", width: 11, style: { numFmt: n2 } },
    { header: "How paid", width: 12 }, { header: "Whose money", width: 12 }, { header: "Paid by", width: 16 }, { header: "Reimbursed?", width: 12 }, { header: "Vendor", width: 16 }, { header: "Entered by", width: 16 }, { header: "Notes", width: 22 },
  ], es.map((e) => [e.date, e.category, e.description, Number(e.amount), e.paymentMode, e.paidFrom, e.paidByName, e.reimbursedAt ? "Repaid" : (e.paidFrom === "Company" ? "" : "Owed"), e.vendor?.name ?? "", e.createdBy?.name ?? "", e.notes]));

  const owe = new Map<string, number>();
  for (const e of owedRows) if ((e.paidFrom === "Owner" || e.paidFrom === "Staff") && !e.reimbursedAt) {
    const k = `${e.paidByName || e.paidFrom}|${e.paidFrom}`; owe.set(k, (owe.get(k) ?? 0) + Number(e.amount));
  }
  sheet("Reimbursements", [{ header: "Person", width: 22 }, { header: "Type", width: 10 }, { header: "Amount owed", width: 14, style: { numFmt: n2 } }],
    [...owe].sort((a, b) => b[1] - a[1]).map(([k, v]) => { const [name, type] = k.split("|"); return [name, type, v]; }));

  sheet("Customers & Dues", [
    { header: "Name", width: 22 }, { header: "Phone", width: 14 }, { header: "Area", width: 18 }, { header: "Total billed", width: 12, style: { numFmt: n2 } }, { header: "Paid", width: 11, style: { numFmt: n2 } }, { header: "Balance due", width: 12, style: { numFmt: n2 } },
  ], cs.map((c) => { const b = bal.get(c.id); return [c.name, c.phone, c.area, Number(b?.billed ?? 0), Number(b?.paid ?? 0), Number(b?.balance ?? 0)]; }));

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const filename = from === to ? `${tenantCode}-report-${from}.xlsx` : `${tenantCode}-report-${from}-to-${to}.xlsx`;

  // quick totals for the email body
  const sales = os.filter((o) => o.status !== "CANCELLED").reduce((s, o) => s + Number(o.total), 0);
  const collected = ps.reduce((s, p) => s + Number(p.amount), 0);
  const expenseTotal = es.reduce((s, e) => s + Number(e.amount), 0);
  const orderCount = os.filter((o) => o.status !== "CANCELLED").length;
  return { buffer, filename, totals: { sales, collected, expenseTotal, orderCount } };
}
