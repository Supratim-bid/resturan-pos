import { requirePage } from "@/lib/auth";
import { canEditAnyOrder } from "@/lib/permissions";
import { loadPosData } from "@/lib/pos-data";
import { addDays, todayIST } from "@/lib/format";
import { Pos } from "@/components/pos";

export default async function NewOrder({ searchParams }: { searchParams: Promise<{ preorder?: string; date?: string; slot?: string }> }) {
  const u = await requirePage("newOrder");
  const today = todayIST();
  const sp = await searchParams;
  const pre = sp.preorder === "1" && u.features.includes("preorders");
  const preDate = pre ? (/^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") && sp.date! >= today ? sp.date! : addDays(today, 1)) : today;
  const d = await loadPosData(u.tenantId, today);
  return (
    <Pos
      {...d}
      packaging={u.features.includes("packaging") ? d.packaging : []}
      scanner={u.features.includes("packaging") && d.scanner}
      today={today}
      canPickDate={canEditAnyOrder(u)}
      allowPreorder={u.features.includes("preorders")}
      kotScreen={u.features.includes("kot")} kotPrint={u.features.includes("kotPrint")}
      orderLabel={d.nextBill}
      initial={{ date: preDate, isPreorder: pre, mealSlot: pre ? sp.slot ?? "" : "", slotTime: "", customerId: null, orderType: d.orderTypes[0] ?? "Dine-in", tableNo: "", notes: "", items: [], orderDiscount: 0, deliveryCharge: 0, packingCharge: 0, packaging: [] }}
    />
  );
}
