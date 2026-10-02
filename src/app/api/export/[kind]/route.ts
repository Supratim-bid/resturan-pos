import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { customerBalances } from "@/lib/orders";

function csv(rows: (string | number | null | undefined)[][]) {
  return "﻿" + rows.map((r) => r.map((v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\r\n");
}

export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const u = await getUser();
  const { kind } = await params;
  if (!u || !can(u, kind === "menu" ? "menu" : "reports")) return new Response("Not allowed", { status: 403 });
  const url = new URL(req.url);
  const from = url.searchParams.get("from") || "2000-01-01", to = url.searchParams.get("to") || "2100-01-01";
  let rows: (string | number | null)[][] = [];
  const O = schema.orders;
  if (kind === "menu") {
    const head = ["Code", "Name", "Category", "Veg/Non-Veg", "Price", "Est Cost", "Available", "Active"];
    if (url.searchParams.get("template")) {
      rows = [head, ["M001", "Aloo Posto", "Veg Main", "Veg", 180, 60, "Yes", "Yes"], ["M002", "Chicken Kosha", "Non-Veg Main", "Non-Veg", 280, "", "No", "Yes"]];
    } else {
      const items = await db.query.menuItems.findMany({ where: eq(schema.menuItems.tenantId, u.tenantId), with: { category: true } });
      items.sort((a, b) => a.category.sortOrder - b.category.sortOrder || a.category.name.localeCompare(b.category.name) || a.name.localeCompare(b.name));
      rows = [head, ...items.map((m) => [m.code, m.name, m.category.name, m.vegType, m.price, m.manualCost, m.available ? "Yes" : "No", m.active ? "Yes" : "No"])];
    }
    return new Response(csv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="menu${url.searchParams.get("template") ? "-template" : ""}.csv"` } });
  }
  if (kind === "orders" || kind === "order-items") {
    const os = await db.query.orders.findMany({ where: and(eq(O.tenantId, u.tenantId), gte(O.date, from), lte(O.date, to)), with: { customer: true, items: true, payments: { with: { createdBy: true } }, createdBy: true, deliveredBy: true }, orderBy: [asc(O.date), asc(O.id)] });
    const paidBy = (o: typeof os[number]) => { const p = [...o.payments].reverse().find((x) => Number(x.amount) > 0 && x.createdBy); return p?.createdBy?.name ?? ""; };
    if (kind === "orders") {
      rows = [["Order", "Date", "Status", "Type", "Table", "Customer", "Phone", "Taken by", "Delivered by", "Payment taken by", "Items total", "Discount", "Delivery", "Packing", "Taxable", "GST", "Total", "Paid", "Due", "Food cost", "Notes", "Cancellation", "Cancel reason"]];
      for (const o of os) {
        const paid = o.payments.reduce((s, p) => s + Number(p.amount), 0);
        rows.push([o.billNo, o.date, o.status, o.orderType, o.tableNo, o.customer?.name ?? "", o.customer?.phone ?? "", o.createdBy?.name ?? "Online/system", o.fulfilStatus === "DELIVERED" ? (o.deliveredBy?.name ?? "✓") : "", paidBy(o), o.itemsTotal,
          Number(o.itemDiscount) + Number(o.orderDiscount), o.deliveryCharge, o.packingCharge, o.taxable, o.gstAmount, o.total, paid, Number(o.total) - paid, o.foodCost, o.notes, o.cancelStatus, o.cancelReason]);
      }
    } else {
      rows = [["Order", "Date", "Status", "Type", "Customer", "Taken by", "Delivered by", "Dish", "Qty", "Rate", "Discount", "Line total", "Cost / plate"]];
      for (const o of os) for (const i of o.items) rows.push([o.billNo, o.date, o.status, o.orderType, o.customer?.name ?? "", o.createdBy?.name ?? "Online/system", o.fulfilStatus === "DELIVERED" ? (o.deliveredBy?.name ?? "✓") : "", i.name, i.qty, i.rate, i.discount, i.lineTotal, i.unitCost]);
    }
  } else if (kind === "payments") {
    const ps = await db.query.payments.findMany({ where: and(eq(schema.payments.tenantId, u.tenantId), gte(schema.payments.date, from), lte(schema.payments.date, to)), with: { order: true, customer: true, createdBy: true }, orderBy: [asc(schema.payments.date)] });
    rows = [["Date", "Customer", "Order", "Mode", "Amount", "Recorded by", "Notes"], ...ps.map((p) => [p.date, p.customer?.name ?? "", p.order ? p.order.billNo : "advance", p.mode, p.amount, p.createdBy?.name ?? "", p.notes])];
  } else if (kind === "expenses") {
    const es = await db.query.expenses.findMany({ where: and(eq(schema.expenses.tenantId, u.tenantId), gte(schema.expenses.date, from), lte(schema.expenses.date, to)), with: { vendor: true, staff: true, ingredient: true, createdBy: true }, orderBy: [asc(schema.expenses.date)] });
    rows = [["Date", "Category", "Description", "Amount", "How paid", "Whose money", "Paid by name", "Reimbursed?", "Vendor", "Staff", "Entered by", "Stock item", "Qty", "Notes"],
      ...es.map((e) => [e.date, e.category, e.description, e.amount, e.paymentMode, e.paidFrom, e.paidByName, e.reimbursedAt ? "Repaid" : (e.paidFrom === "Company" ? "" : "Owed"), e.vendor?.name ?? "", e.staff?.name ?? "", e.createdBy?.name ?? "", e.ingredient?.name ?? "", e.qty, e.notes])];
  } else if (kind === "customers") {
    const [cs, bal] = await Promise.all([db.query.customers.findMany({ where: eq(schema.customers.tenantId, u.tenantId), orderBy: (t, { asc }) => asc(t.name) }), customerBalances(u.tenantId)]);
    rows = [["Name", "Phone", "Flat", "Area", "Email", "Birthday", "Total billed", "Paid", "Balance due", "Notes"],
      ...cs.map((c) => { const b = bal.get(c.id); return [c.name, c.phone, c.flat, c.area, c.email, c.birthday, b?.billed ?? 0, b?.paid ?? 0, b?.balance ?? 0, c.notes]; })];
  } else if (kind === "stock") {
    const ms = await db.query.stockMovements.findMany({ where: and(eq(schema.stockMovements.tenantId, u.tenantId), gte(schema.stockMovements.date, from), lte(schema.stockMovements.date, to)), orderBy: [asc(schema.stockMovements.date)] });
    const ings = new Map((await db.query.ingredients.findMany({ where: eq(schema.ingredients.tenantId, u.tenantId) })).map((i) => [i.id, i]));
    rows = [["Date", "Ingredient", "Unit", "Qty (+in / -out)", "Type", "Ref", "Notes"], ...ms.map((m) => [m.date, ings.get(m.ingredientId)?.name ?? "", ings.get(m.ingredientId)?.unit ?? "", m.qty, m.type, m.refType ? `${m.refType} ${m.refId}` : "", m.notes])];
  } else return new Response("Unknown export", { status: 404 });
  return new Response(csv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${u.tenantCode}-${kind}-${from}-to-${to}.csv"` } });
}
