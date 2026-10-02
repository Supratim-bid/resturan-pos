import { notFound } from "next/navigation";
import { verifyBill } from "@/lib/session";
import { loadBill, qrDataUrl } from "@/lib/bill";
import { themeCss } from "@/lib/theme";
import { fmtDate, inr, inr2, phoneLine } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public, read-only bill a customer opens from the shared link (/b/<token>) - no login
export default async function SharedBill({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const v = await verifyBill(token);
  if (!v) notFound();
  const b = await loadBill(v.tid, v.oid);
  if (!b) notFound();
  const { o, s, paid, due, pay, billPack } = b;
  const gst = Number(o.gstRate);
  const qr = pay ? (pay.kind === "image" ? `/img/${pay.imageId}` : await qrDataUrl(pay.text, 300)) : null;
  const cancelled = o.status === "CANCELLED";
  const phones = phoneLine(s).join(" · ");
  return (
    <div className="min-h-dvh bg-cream py-5">
      <style dangerouslySetInnerHTML={{ __html: themeCss(s.primaryColor, s.accentColor, s.tone3, s.tone4) }} />
      <div className="mx-auto max-w-md space-y-3 px-3">
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-line">
          {/* header */}
          <div className="bg-brand-gradient px-5 py-4 text-center text-white">
            {s.billShowLogo && <img src="/logo" alt="" className="mx-auto mb-2 h-14 w-14 rounded-full bg-white object-cover ring-2 ring-white/60" />}
            <div className="font-display text-xl font-bold">{s.billName || s.name}</div>
            {s.tagline && <div className="text-xs text-white/80">{s.tagline}</div>}
            {s.address && <div className="mt-1 text-xs text-white/80">{s.address}</div>}
            {phones && <div className="text-xs text-white/80">{phones}</div>}
          </div>

          <div className="space-y-3 p-5">
            {cancelled && <div className="rounded-lg bg-red-50 px-3 py-2 text-center text-sm font-bold text-red-700">This bill was cancelled.</div>}
            <div className="flex items-center justify-between text-sm">
              <div><div className="font-bold">Bill {o.billNo}</div><div className="text-muted">{fmtDate(o.date)} · {o.orderType}</div></div>
              <div className="text-right">
                {due > 0.5 && !cancelled ? <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800">Due {inr(due)}</span>
                  : <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">Paid ✓</span>}
              </div>
            </div>
            {o.customer && <div className="text-sm text-muted">{o.customer.name}{o.customer.phone ? ` · ${o.customer.phone}` : ""}</div>}

            {/* items */}
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="py-1">Item</th><th className="py-1 text-center">Qty</th><th className="py-1 text-right">Rate</th><th className="py-1 text-right">Amount</th></tr></thead>
              <tbody>
                {o.items.map((i) => (
                  <tr key={i.id} className="border-b border-line/60"><td className="py-1.5">{i.name}</td><td className="py-1.5 text-center tabular-nums">{Number(i.qty)}</td><td className="py-1.5 text-right tabular-nums">{inr2(Number(i.rate))}</td><td className="py-1.5 text-right tabular-nums">{inr2(Number(i.lineTotal))}</td></tr>
                ))}
                {billPack.map((p) => (
                  <tr key={`p${p.id}`} className="border-b border-line/60 text-muted"><td className="py-1.5">{p.name}</td><td className="py-1.5 text-center tabular-nums">{Number(p.qty)}</td><td className="py-1.5 text-right tabular-nums">{inr2(Number(p.unitPrice))}</td><td className="py-1.5 text-right tabular-nums">{inr2(Number(p.qty) * Number(p.unitPrice))}</td></tr>
                ))}
              </tbody>
            </table>

            {/* totals */}
            <dl className="space-y-1 border-t border-line pt-2 text-sm">
              <div className="flex justify-between"><dt>Items</dt><dd className="tabular-nums">{inr2(Number(o.itemsTotal))}</dd></div>
              {Number(o.itemDiscount) + Number(o.orderDiscount) > 0 && <div className="flex justify-between text-emerald-700"><dt>Discount</dt><dd>−{inr2(Number(o.itemDiscount) + Number(o.orderDiscount))}</dd></div>}
              {Number(o.deliveryCharge) > 0 && <div className="flex justify-between"><dt>Delivery</dt><dd className="tabular-nums">{inr2(Number(o.deliveryCharge))}</dd></div>}
              {Number(o.packingCharge) > 0 && <div className="flex justify-between"><dt>Packing</dt><dd className="tabular-nums">{inr2(Number(o.packingCharge))}</dd></div>}
              {Number(o.gstAmount) > 0 && <div className="flex justify-between"><dt>GST {gst}%</dt><dd className="tabular-nums">{inr2(Number(o.gstAmount))}</dd></div>}
              <div className="flex justify-between border-t border-line pt-1 text-base font-bold"><dt>Total</dt><dd className="tabular-nums">{inr(Number(o.total))}</dd></div>
              <div className="flex justify-between text-emerald-700"><dt>Paid</dt><dd className="tabular-nums">{inr2(paid)}</dd></div>
              {due > 0.5 && <div className="flex justify-between font-bold text-red-700"><dt>Balance due</dt><dd className="tabular-nums">{inr2(due)}</dd></div>}
            </dl>

            {/* pay */}
            {due > 0.5 && !cancelled && pay && (
              <div className="rounded-xl border border-gold bg-gold-light/40 p-3 text-center">
                <div className="mb-2 text-xs font-semibold text-ink">{pay.label}</div>
                {qr && <img src={qr} alt="Scan to pay" className="mx-auto aspect-square w-40 rounded bg-white object-contain p-1" />}
                {pay.kind === "upi" && s.upiId && <div className="mt-2 text-sm">UPI: <b>{s.upiId}</b></div>}
                {(pay.kind === "link" || pay.kind === "page") && pay.text && <a href={pay.text} target="_blank" rel="noreferrer" className="mt-2 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white">Pay ₹{due} online →</a>}
              </div>
            )}

            <a href={`/b/${token}/pdf?download=1`} className="block rounded-xl bg-ink py-3 text-center text-sm font-bold text-white">⬇ Download bill (PDF)</a>
            {(s.gstin || s.fssai) && <div className="text-center text-[11px] text-muted">{s.gstin ? `GSTIN: ${s.gstin}` : ""}{s.gstin && s.fssai ? " · " : ""}{s.fssai ? `FSSAI: ${s.fssai}` : ""}</div>}
            {s.billFooter && <div className="text-center text-xs text-muted">{s.billFooter}</div>}
          </div>
        </div>
        <p className="text-center text-[11px] text-muted">Powered by {process.env.NEXT_PUBLIC_APP_NAME || "Restaurant Manager"}</p>
      </div>
    </div>
  );
}
