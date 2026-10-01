import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/auth";
import { canEditAnyOrder } from "@/lib/permissions";
import { loadPosData } from "@/lib/pos-data";
import { todayIST } from "@/lib/format";
import { Pos } from "@/components/pos";

export default async function EditOrder({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePage("newOrder");
  const { id } = await params;
  const o = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, Number(id)), eq(schema.orders.tenantId, u.tenantId)), with: { items: true, packaging: true } });
  if (!o) notFound();
  if (!canEditAnyOrder(u) && o.date !== todayIST() && !(o.isPreorder && o.date >= todayIST())) redirect(`/orders/${o.id}`);
  const d = await loadPosData(u.tenantId, o.date);
  for (const it of o.items) { const x = d.dishes.find((z) => z.id === it.menuItemId); if (x) x.price = Number(it.rate); }
  // keep dishes that are now inactive but on this order
  const missing = o.items.filter((i) => !d.dishes.some((x) => x.id === i.menuItemId));
  for (const m of missing) d.dishes.push({ id: m.menuItemId, name: m.name, price: Number(m.rate), category: "On this order", vegType: "Veg", today: false });
  return (
    <Pos
      {...d}
      packaging={u.features.includes("packaging") ? d.packaging : []}
      scanner={u.features.includes("packaging") && d.scanner}
      today={todayIST()}
      canPickDate={canEditAnyOrder(u)}
      allowPreorder={u.features.includes("preorders")}
      kotScreen={u.features.includes("kot")} kotPrint={u.features.includes("kotPrint")}
      kotNo={o.kotNo}
      orderLabel={o.billNo}
      initial={{
        id: o.id, date: o.date, isPreorder: o.isPreorder, mealSlot: o.mealSlot, slotTime: o.slotTime, customerId: o.customerId, orderType: o.orderType, tableNo: o.tableNo, notes: o.notes,
        items: o.items.map((i) => ({ menuItemId: i.menuItemId, qty: Number(i.qty), discount: Number(i.discount) })),
        orderDiscount: Number(o.orderDiscount), deliveryCharge: Number(o.deliveryCharge), packingCharge: Number(o.packingCharge),
        packaging: o.packaging.map((p) => ({ packagingId: p.packagingId, qty: Number(p.qty) })),
        chargePackaging: o.packagingCharged || o.packaging.some((p) => Number(p.unitPrice) > 0),
      }}
    />
  );
}
