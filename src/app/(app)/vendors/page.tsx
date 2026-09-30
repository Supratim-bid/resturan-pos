import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/auth";
import { ENTITIES } from "@/lib/entities";
import { resolveOptions } from "@/lib/options";
import { inr } from "@/lib/format";
import { AddRecordButton, CrudManager } from "@/components/crud";
import { Card, PageHeader, Stat } from "@/components/ui";

export default async function Vendors() {
  const u = await requirePage("vendors");
  const T = u.tenantId;
  const [vendors, credit, paid, bought, pays] = await Promise.all([
    db.query.vendors.findMany({ where: eq(schema.vendors.tenantId, T), orderBy: (t, { asc }) => asc(t.name) }),
    db.select({ v: schema.expenses.vendorId, s: sql<number>`sum(${schema.expenses.amount})` }).from(schema.expenses).where(and(eq(schema.expenses.tenantId, T), eq(schema.expenses.paymentMode, "Credit"))).groupBy(schema.expenses.vendorId),
    db.select({ v: schema.vendorPayments.vendorId, s: sql<number>`sum(${schema.vendorPayments.amount})` }).from(schema.vendorPayments).where(eq(schema.vendorPayments.tenantId, T)).groupBy(schema.vendorPayments.vendorId),
    db.select({ v: schema.expenses.vendorId, s: sql<number>`sum(${schema.expenses.amount})` }).from(schema.expenses).where(eq(schema.expenses.tenantId, T)).groupBy(schema.expenses.vendorId),
    db.query.vendorPayments.findMany({ where: eq(schema.vendorPayments.tenantId, T), with: { vendor: true }, orderBy: [desc(schema.vendorPayments.date)], limit: 100 }),
  ]);
  const cm = new Map(credit.map((c) => [c.v, Number(c.s)])), pm = new Map(paid.map((c) => [c.v, Number(c.s)])), bm = new Map(bought.map((c) => [c.v, Number(c.s)]));
  const rows = vendors.map((v) => {
    const due = (cm.get(v.id) ?? 0) - (pm.get(v.id) ?? 0);
    return { ...v, bought: bm.get(v.id) ?? 0, due: due > 0.5 ? due : null };
  });
  const totalDue = rows.reduce((s, r) => s + (r.due ?? 0), 0);
  const [vf, pf] = [ENTITIES.vendors.fields, ENTITIES.vendorPayments.fields];
  const [vo, po] = await Promise.all([resolveOptions(T, vf), resolveOptions(T, pf)]);
  return (
    <div>
      <PageHeader title="Vendors & Dues" subtitle="Log purchases in Expenses with “Paid by: Credit” and the vendor - they appear here as dues."
        actions={<AddRecordButton entity="vendorPayments" fields={pf} options={po} label="Pay a vendor" title="Vendor payment" path="/vendors" />} />
      <div className="mb-4 grid grid-cols-2 gap-2"><Stat label="Total you owe" value={inr(totalDue)} tone={totalDue ? "red" : "green"} /><Stat label="Vendors" value={vendors.length} /></div>
      <CrudManager entity="vendors" title="vendor" fields={vf} options={vo} rows={rows} path="/vendors" addLabel="Vendor"
        columns={[
          { key: "name", label: "Vendor", primary: true },
          { key: "phone", label: "Phone" },
          { key: "supplies", label: "Supplies", hideMobile: true },
          { key: "bought", label: "Total bought", kind: "money" },
          { key: "due", label: "You owe", kind: "money" },
        ]} />
      <Card title="Recent payments to vendors" className="mt-6">
        <CrudManager entity="vendorPayments" title="vendor payment" fields={pf} options={po} path="/vendors" canEdit
          rows={pays.map((p) => ({ ...p, vendorName: p.vendor.name }))} emptyText="No vendor payments yet."
          columns={[{ key: "date", label: "Date", kind: "date" }, { key: "vendorName", label: "Vendor", primary: true }, { key: "amount", label: "Amount", kind: "money" }, { key: "mode", label: "Mode" }, { key: "notes", label: "Notes", hideMobile: true }]} />
      </Card>
    </div>
  );
}
