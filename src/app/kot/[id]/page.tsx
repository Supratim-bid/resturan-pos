import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { loadKot } from "@/lib/kot";
import { KotSlip, kotWidth } from "@/components/kot-slip";
import { AutoPrint, PrintNow } from "@/components/kot-screen";

// Print one KOT slip: /kot/<orderId>?size=58|80|half&print=1
export default async function KotPrint({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ size?: string; print?: string; back?: string }> }) {
  const u = await requireUser();
  if (!can(u, "kot") && !(can(u, "orders") && u.features.includes("kot"))) redirect("/no-access");
  const k = await loadKot(u.tenantId, Number((await params).id));
  if (!k) notFound();
  const { o, s } = k;
  const sp = await searchParams;
  const size = sp.size === "80" || sp.size === "58" || sp.size === "half" ? sp.size : s.receiptWidth === "80" ? "80" : "58";
  const back = sp.back === "kot" ? "/kot" : `/orders/${o.id}`;
  const tab = (x: string, label: string) => <Link href={`/kot/${o.id}?size=${x}${sp.back ? `&back=${sp.back}` : ""}`} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${size === x ? "bg-ink text-white" : "bg-white ring-1 ring-line"}`}>{label}</Link>;
  return (
    <div className="min-h-dvh bg-stone-100 py-4 print:bg-white print:py-0">
      <style dangerouslySetInnerHTML={{ __html: size === "half" ? "@page{size:A4 portrait;margin:0}" : `@page{size:${size}mm auto;margin:0}` }} />
      {sp.print === "1" && <AutoPrint />}
      <div className="no-print mx-auto mb-3 flex max-w-[640px] flex-wrap items-center gap-2 px-3">
        <Link href={back} className="btn-ghost btn-sm">← Back</Link>
        {tab("58", "2 inch")}{tab("80", "3 inch")}{tab("half", "Half A4")}
        <PrintNow />
      </div>
      <KotSlip restaurant={s.name} kotNo={o.kotNo!} billNo={o.billNo} date={o.date} at={o.kotAt} orderType={o.orderType} tableNo={o.tableNo}
        customer={o.customer?.name} notes={o.notes} items={o.items} updated={o.kotUpdated} cancelled={o.status === "CANCELLED"}
        isPreorder={o.isPreorder} mealSlot={o.mealSlot} slotTime={o.slotTime} widthClass={kotWidth(size)} />
    </div>
  );
}
