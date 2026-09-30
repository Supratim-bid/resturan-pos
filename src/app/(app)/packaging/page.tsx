import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/auth";
import { ENTITIES } from "@/lib/entities";
import { resolveOptions, lookupValues } from "@/lib/options";
import { packagingStock } from "@/lib/orders";
import { addDays, todayIST } from "@/lib/format";
import { CrudManager } from "@/components/crud";
import { Card, PageHeader } from "@/components/ui";
import { PackagingStock } from "@/components/packaging-stock";

export default async function Packaging() {
  const u = await requirePage("packaging");
  const today = todayIST();
  const [rows, stock, used, modes] = await Promise.all([
    db.query.packaging.findMany({ where: eq(schema.packaging.tenantId, u.tenantId), orderBy: (t, { asc }) => [asc(t.type), asc(t.name)] }),
    packagingStock(u.tenantId),
    db.select({ id: schema.packagingMovements.packagingId, q: sql<number>`-sum(${schema.packagingMovements.qty})` }).from(schema.packagingMovements)
      .where(and(eq(schema.packagingMovements.tenantId, u.tenantId), eq(schema.packagingMovements.type, "USE"), gte(schema.packagingMovements.date, addDays(today, -29))))
      .groupBy(schema.packagingMovements.packagingId),
    lookupValues(u.tenantId, "PAYMENT_MODE"),
  ]);
  const usedMap = new Map(used.map((r) => [r.id, Number(r.q)]));
  const f = ENTITIES.packaging.fields;
  const opts = await resolveOptions(u.tenantId, f);
  const data = rows.map((p) => {
    const perPiece = Math.round((Number(p.packPrice) / Math.max(1, p.piecesPerPack)) * 100) / 100;
    const st = stock.get(p.id);
    return { ...p, perPiece, inStock: st?.tracked ? st.qty : null, charged: p.billPrice == null ? perPiece : Number(p.billPrice) };
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Packaging" subtitle="Containers, bags, cutlery… Pick them on each order: they come off stock and count in your cost. They are not on the customer's bill unless you tick “Add packaging to the bill” on that order." />
      <CrudManager entity="packaging" title="packaging" fields={f} options={opts} rows={data} path="/packaging" addLabel="Packaging"
        defaults={{ type: "Container", piecesPerPack: 50 }}
        columns={[
          { key: "imageId", label: "", kind: "image", icon: "📦" },
          { key: "name", label: "Item", primary: true },
          { key: "type", label: "Type" },
          { key: "packPrice", label: "Pack price", kind: "money" },
          { key: "piecesPerPack", label: "Pcs / pack", kind: "num" },
          { key: "perPiece", label: "Cost / piece", kind: "money" },
          { key: "inStock", label: "In stock", kind: "num" },
          { key: "barcode", label: "Barcode", hideMobile: true },
          { key: "notes", label: "Used for", hideMobile: true },
        ]} />
      <Card title="Packaging stock">
        <p className="mb-3 text-xs text-muted">Add what you buy, and count the shelf now and then. Pieces picked on orders are taken off automatically (and put back if a bill is cancelled). Start with a <b>Count</b> for each item.</p>
        <PackagingStock today={today} modes={modes.length ? modes : ["Cash", "UPI", "Credit"]} rows={rows.map((p) => {
          const st = stock.get(p.id);
          return { id: p.id, name: p.name, imageId: p.imageId, piecesPerPack: p.piecesPerPack, packPrice: Number(p.packPrice), stock: st?.qty ?? 0, tracked: !!st?.tracked, reorderLevel: p.reorderLevel, usedLast30: usedMap.get(p.id) ?? 0 };
        })} />
      </Card>
    </div>
  );
}
