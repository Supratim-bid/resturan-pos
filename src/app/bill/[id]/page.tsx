import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { loadBill, qrDataUrl } from "@/lib/bill";
import { themeCss } from "@/lib/theme";
import { fmtDate, fmtDateTime, fmtTime, inr2 } from "@/lib/format";
import { PrintBar } from "./print-bar";

type Size = "a4" | "80" | "58";

export default async function Bill({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ size?: string }> }) {
  const u = await requirePage("orders");
  const { id } = await params;
  const b = await loadBill(u.tenantId, Number(id));
  if (!b) notFound();
  const { o, s, paid, due, pay, billPack } = b;
  const q = (await searchParams).size;
  const size: Size = q === "80" || q === "58" || q === "a4" ? q : "a4";
  const thermal = size !== "a4";
  const upi = !pay ? null : pay.kind === "image" ? `/img/${pay.imageId}` : await qrDataUrl(pay.text);
  const gst = Number(o.gstRate);
  const width = size === "58" ? "w-[58mm] p-1.5 text-[10.5px]" : size === "80" ? "w-[80mm] p-2 text-[11.5px]" : "max-w-[640px] p-5 text-[13px]";
  const row = (l: string, v: string, bold = false) => (
    <div className={`flex justify-between gap-2 ${bold ? "text-[1.15em] font-bold" : ""}`}><span>{l}</span><span className="tabular-nums">{v}</span></div>
  );
  return (
    <div className="min-h-dvh bg-stone-100 py-4 print:bg-white print:py-0">
      <style dangerouslySetInnerHTML={{ __html: themeCss(s.primaryColor, s.accentColor) + (thermal ? `@page{size:${size}mm auto;margin:0}` : "") }} />
      <PrintBar id={o.id} size={size} billNo={o.billNo} defaultWidth={s.receiptWidth === "80" ? "80" : "58"} />
      <div className={`mx-auto bg-white text-black shadow print:shadow-none ${width}`}>
        <div className="text-center">
          {s.billShowLogo && <img src="/logo" alt={s.name} className={`mx-auto mb-1 rounded-full object-cover ${thermal ? "h-16 w-16 grayscale" : "h-28 w-28"}`} />}
          <div className={`font-bold uppercase tracking-wide ${thermal ? "text-[1.3em] text-black" : "text-xl text-brand"}`} style={{ fontFamily: "Georgia, serif" }}>{s.name}</div>
          {s.tagline && <div className="italic">{s.tagline}</div>}
          {s.billHeaderNote && <div className={thermal ? "font-semibold" : "mx-auto mt-0.5 inline-block rounded-full bg-gold-light px-3 py-0.5 text-[0.9em] font-semibold text-brand print:bg-white"}>{s.billHeaderNote}</div>}
          {s.address && <div>{s.address}</div>}
          {s.phone && <div>Ph: {s.phone}{s.email && !thermal ? ` · ${s.email}` : ""}</div>}
          {s.gstin && <div>GSTIN: {s.gstin}</div>}
          {s.fssai && <div>FSSAI: {s.fssai}</div>}
          <div className={`my-2 py-0.5 font-bold tracking-widest ${thermal ? "border-2 border-black" : "border-y-2 border-gold bg-brand text-white print:border print:border-black print:bg-white print:text-black"}`}>{gst > 0 ? "TAX INVOICE" : "BILL"}</div>
        </div>
        <div className="space-y-0.5">
          {row(`Bill No: ${o.billNo}`, fmtDate(o.date))}
          {row(`${o.orderType}${o.tableNo ? ` · Table ${o.tableNo}` : ""}`, fmtDateTime(o.createdAt))}
          {o.customer && <div>Customer: <b>{o.customer.name}</b>{o.customer.phone ? ` · ${o.customer.phone}` : ""}</div>}
          {o.customer && (o.customer.flat || o.customer.area) && <div>{[o.customer.flat, o.customer.area].filter(Boolean).join(", ")}</div>}
          {o.isPreorder && (
            <div className={`mt-1 px-1 py-0.5 font-bold ${thermal ? "border border-black" : "rounded bg-gold-light print:bg-white print:border print:border-black"}`}>
              PRE-ORDER · {fmtDate(o.date)}{o.mealSlot ? ` · ${o.mealSlot}` : ""}{o.slotTime ? ` · ${fmtTime(o.slotTime)}` : ""}
            </div>
          )}
          {s.billShowCashier && o.createdBy?.name && <div>Billed by: {o.createdBy.name}</div>}
        </div>
        {o.status === "CANCELLED" && <div className="my-2 border-2 border-red-600 py-1 text-center font-bold text-red-600">CANCELLED</div>}
        {thermal ? (
          <div className="mt-2 border-y border-dashed border-black py-1">
            {o.items.map((i) => (
              <div key={i.id} className="py-0.5">
                <div className="font-semibold">{i.name}</div>
                {row(`  ${Number(i.qty)} × ${inr2(Number(i.rate))}`, inr2(Number(i.qty) * Number(i.rate)))}
                {Number(i.discount) > 0 && row("  discount", "−" + inr2(Number(i.discount)))}
              </div>
            ))}
            {billPack.length > 0 && (
              <div className="mt-1 border-t border-dotted border-black pt-1">
                <div className="font-semibold">Packaging</div>
                {billPack.map((p) => <div key={p.id}>{row(`  ${p.name} × ${Number(p.qty)}`, inr2(Number(p.qty) * Number(p.unitPrice)))}</div>)}
              </div>
            )}
          </div>
        ) : (
          <table className="mt-3 w-full">
            <thead><tr className="border-y border-black bg-gold-light text-left print:bg-white"><th className="py-1">#</th><th>Item</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">Amt</th></tr></thead>
            <tbody>{o.items.map((i, k) => (
              <tr key={i.id} className="border-b border-dotted border-stone-300 align-top">
                <td className="py-1">{k + 1}</td>
                <td>{i.name}{Number(i.discount) > 0 && <div className="text-[11px] text-stone-500">disc −{inr2(Number(i.discount))}</div>}</td>
                <td className="text-right">{Number(i.qty)}</td><td className="text-right">{inr2(Number(i.rate))}</td><td className="text-right">{inr2(Number(i.lineTotal))}</td>
              </tr>
            ))}
            {billPack.length > 0 && <tr><td colSpan={5} className="pt-2 text-[11px] font-bold uppercase tracking-wide text-stone-500">Packaging</td></tr>}
            {billPack.map((p) => (
              <tr key={`p${p.id}`} className="border-b border-dotted border-stone-300 align-top text-stone-700">
                <td className="py-1">📦</td><td>{p.name}</td><td className="text-right">{Number(p.qty)}</td>
                <td className="text-right">{inr2(Number(p.unitPrice))}</td><td className="text-right">{inr2(Number(p.qty) * Number(p.unitPrice))}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        <div className={`mt-2 space-y-0.5 ${thermal ? "" : "ml-auto w-full max-w-[280px]"}`}>
          {row("Sub total", inr2(Number(o.itemsTotal)))}
          {Number(o.itemDiscount) + Number(o.orderDiscount) > 0 && row("Less: discount", "−" + inr2(Number(o.itemDiscount) + Number(o.orderDiscount)))}
          {Number(o.deliveryCharge) > 0 && row("Delivery charge", inr2(Number(o.deliveryCharge)))}
          {Number(o.packingCharge) > 0 && row(billPack.length ? "Packaging" : "Packing charge", inr2(Number(o.packingCharge)))}
          {gst > 0 && <>
            {!thermal && row("Taxable amount", inr2(Number(o.taxable)))}
            {row(`CGST @ ${gst / 2}%`, inr2(Number(o.gstAmount) / 2))}
            {row(`SGST @ ${gst / 2}%`, inr2(Number(o.gstAmount) / 2))}
          </>}
          {Number(o.roundOff) !== 0 && row("Round off", inr2(Number(o.roundOff)))}
          <div className="border-t-2 border-black pt-1">{row("GRAND TOTAL", inr2(Number(o.total)), true)}</div>
          {paid > 0 && row("Paid", inr2(paid))}
          {due > 0 && row("Balance due", inr2(due), true)}
        </div>
        {gst === 0 && <p className="mt-2 text-center text-[0.9em]">Prices inclusive of all taxes</p>}
        {upi && (
          <div className="mt-3 flex flex-col items-center">
            <img src={upi} alt="UPI QR" className={`object-contain ${thermal ? "h-32 w-32 grayscale" : "h-40 w-40"}`} />
            <div className="text-center text-[0.9em] font-semibold">{pay?.label}{due > 0 ? ` · ${inr2(due)}` : ""}</div>
            {(pay?.kind === "upi" || pay?.kind === "image") && s.upiId && <div className="text-[0.85em]">UPI: {s.upiId}</div>}
            {(pay?.kind === "link" || pay?.kind === "page") && <div className="break-all text-[0.8em]">{pay?.text}</div>}
          </div>
        )}
        {!thermal && <div className="mx-auto mt-4 h-px w-40 bg-gradient-to-r from-transparent via-gold to-transparent" />}
        <p className={`mt-2 text-center font-semibold ${thermal ? "" : "italic text-brand"}`} style={{ fontFamily: thermal ? undefined : "Georgia, serif" }}>{s.billFooter}</p>
        {s.billSocial && <p className="mt-1 text-center text-[0.9em]">{s.billSocial}</p>}
        {s.billTerms && <p className={`mt-2 whitespace-pre-line text-center text-[0.8em] ${thermal ? "" : "text-stone-500"}`}>{s.billTerms}</p>}
      </div>
    </div>
  );
}
