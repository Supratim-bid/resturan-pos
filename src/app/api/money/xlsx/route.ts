import ExcelJS from "exceljs";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { monthStart, todayIST } from "@/lib/format";
import { ACCOUNT_LABEL, moneyReport } from "@/lib/money";

export const runtime = "nodejs";
const RS = '"₹"#,##0.00;[Red]-"₹"#,##0.00';
const ok = (d: string | null) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
const toDate = (d: string) => new Date(`${d}T00:00:00Z`);

/** Cash & Bank as an Excel workbook: Summary, Ledger (credit / debit / balance), Daily, Expenses */
export async function GET(req: Request) {
  const u = await getUser();
  if (!u || !can(u, "money")) return new Response("Not allowed", { status: 403 });
  const url = new URL(req.url);
  let to = ok(url.searchParams.get("to")) ? url.searchParams.get("to")! : todayIST();
  let from = ok(url.searchParams.get("from")) ? url.searchParams.get("from")! : monthStart(to);
  if (from > to) [from, to] = [to, from];
  const [r, s, exps] = await Promise.all([
    moneyReport(u.tenantId, from, to),
    db.query.settings.findFirst({ where: eq(schema.settings.tenantId, u.tenantId) }),
    db.query.expenses.findMany({
      where: and(eq(schema.expenses.tenantId, u.tenantId), gte(schema.expenses.date, from), lte(schema.expenses.date, to)),
      with: { vendor: { columns: { name: true } }, staff: { columns: { name: true } } }, orderBy: [asc(schema.expenses.date), asc(schema.expenses.id)],
    }),
  ]);
  const wb = new ExcelJS.Workbook();
  wb.creator = s?.name ?? "Restaurant"; wb.created = new Date();
  const head = (ws: ExcelJS.Worksheet, row: number) => {
    const h = ws.getRow(row); h.font = { bold: true, color: { argb: "FFFFFFFF" } };
    h.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF9A1C1F" } }; c.alignment = { vertical: "middle", wrapText: true }; });
    ws.views = [{ state: "frozen", ySplit: row }];
  };
  const title = (ws: ExcelJS.Worksheet, text: string) => {
    ws.getCell("A1").value = `${s?.name ?? ""} - ${text}`; ws.getCell("A1").font = { bold: true, size: 14 };
    ws.getCell("A2").value = `${from} to ${to}`; ws.getCell("A2").font = { italic: true, color: { argb: "FF666666" } };
  };

  const S = wb.addWorksheet("Summary"); // first tab; filled below
  // ---- Ledger ----
  const L = wb.addWorksheet("Ledger");
  title(L, "Cash & Bank ledger");
  L.columns = [{ width: 12 }, { width: 52 }, { width: 15 }, { width: 14 }, { width: 14 }, { width: 15 }, { width: 15 }, { width: 15 }];
  L.getRow(4).values = ["Date", "Details", "Account", "Credit (in)", "Debit (out)", "Cash balance", "Bank balance", "Total balance"];
  head(L, 4);
  L.addRow([toDate(from), "Opening balance", "", null, null, r.opening.CASH, r.opening.BANK, { formula: "F5+G5", result: r.opening.CASH + r.opening.BANK }]).font = { bold: true };
  let n = 5;
  for (const x of r.rows) {
    n++;
    const acc = ACCOUNT_LABEL[x.account];
    L.addRow([toDate(x.date), x.details, acc, x.credit || null, x.debit || null,
      { formula: `F${n - 1}+IF(C${n}="Cash",N(D${n})-N(E${n}),0)`, result: x.cash },
      { formula: `G${n - 1}+IF(C${n}<>"Cash",N(D${n})-N(E${n}),0)`, result: x.bank },
      { formula: `F${n}+G${n}`, result: x.cash + x.bank }]);
  }
  const last = n;
  const tot = L.addRow([toDate(to), "Closing balance", "",
    { formula: `SUM(D6:D${Math.max(6, last)})`, result: r.totals.cashIn + r.totals.bankIn },
    { formula: `SUM(E6:E${Math.max(6, last)})`, result: r.totals.cashOut + r.totals.bankOut },
    { formula: `F${last}`, result: r.closing.CASH }, { formula: `G${last}`, result: r.closing.BANK }, { formula: `H${last}`, result: r.closing.CASH + r.closing.BANK }]);
  tot.font = { bold: true };
  L.getColumn(1).numFmt = "dd-mmm-yyyy";
  for (const c of [4, 5, 6, 7, 8]) L.getColumn(c).numFmt = RS;
  L.autoFilter = { from: "A4", to: `H${last}` };

  // ---- Summary ----
  title(S, "Money summary");
  S.columns = [{ width: 30 }, { width: 16 }, { width: 18 }, { width: 16 }];
  S.getRow(4).values = ["", "Cash", "Online / Bank", "Total"]; head(S, 4);
  const line = (label: string, c: number, b: number, bold = false) => { const row = S.addRow([label, c, b, { formula: `B${S.rowCount + 1}+C${S.rowCount + 1}`, result: c + b }]); if (bold) row.font = { bold: true }; };
  line("Opening balance", r.opening.CASH, r.opening.BANK);
  line("+ Money in (credit)", r.totals.cashIn, r.totals.bankIn);
  line("- Money out (debit)", r.totals.cashOut, r.totals.bankOut);
  S.addRow(["Closing balance", { formula: "B5+B6-B7", result: r.closing.CASH }, { formula: "C5+C6-C7", result: r.closing.BANK }, { formula: "B8+C8", result: r.closing.CASH + r.closing.BANK }]).font = { bold: true };
  S.addRow([]);
  S.addRow(["Received by mode", "Amount"]).font = { bold: true };
  const m0 = S.rowCount + 1;
  for (const m of r.byMode) S.addRow([m.mode, m.amount]);
  S.addRow(["Total received", { formula: `SUM(B${m0}:B${Math.max(m0, S.rowCount)})`, result: r.totals.sales }]).font = { bold: true };
  S.addRow([]);
  S.addRow(["Spent (expenses & vendors, paid)", "Amount"]).font = { bold: true };
  const c0 = S.rowCount + 1;
  for (const c of r.byCategory) S.addRow([c.category, c.amount]);
  S.addRow(["Total spent", { formula: `SUM(B${c0}:B${Math.max(c0, S.rowCount)})`, result: r.totals.spent }]).font = { bold: true };
  for (const c of [2, 3, 4]) S.getColumn(c).numFmt = RS;

  // ---- Daily ----
  const D = wb.addWorksheet("Daily");
  title(D, "Day by day");
  D.columns = [{ width: 12 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 16 }, { width: 16 }];
  D.getRow(4).values = ["Date", "Cash in", "Online in", "Cash out", "Online out", "Closing cash", "Closing bank", "Total"]; head(D, 4);
  for (const d of r.days) D.addRow([toDate(d.date), d.cashIn, d.bankIn, d.cashOut, d.bankOut, d.cash, d.bank, { formula: `F${D.rowCount + 1}+G${D.rowCount + 1}`, result: d.cash + d.bank }]);
  D.getColumn(1).numFmt = "dd-mmm-yyyy";
  for (const c of [2, 3, 4, 5, 6, 7, 8]) D.getColumn(c).numFmt = RS;

  // ---- Expenses ----
  const E = wb.addWorksheet("Expenses");
  title(E, "Expenses");
  E.columns = [{ width: 12 }, { width: 18 }, { width: 34 }, { width: 18 }, { width: 16 }, { width: 14 }, { width: 24 }];
  E.getRow(4).values = ["Date", "Category", "Description", "Vendor / Staff", "Paid by", "Amount", "Notes"]; head(E, 4);
  for (const e of exps) E.addRow([toDate(e.date), e.category, e.description, e.vendor?.name ?? e.staff?.name ?? "", e.paymentMode === "Credit" ? "Credit (not paid yet)" : e.paymentMode, Number(e.amount), e.notes]);
  const eLast = E.rowCount;
  E.addRow(["", "", "", "", "Total", { formula: `SUM(F5:F${Math.max(5, eLast)})`, result: exps.reduce((a, e) => a + Number(e.amount), 0) }]).font = { bold: true };
  E.getColumn(1).numFmt = "dd-mmm-yyyy"; E.getColumn(6).numFmt = RS;
  if (eLast >= 5) E.autoFilter = { from: "A4", to: `G${eLast}` };

  const buf = await wb.xlsx.writeBuffer();
  const name = `cash-bank-${from}-to-${to}.xlsx`;
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
