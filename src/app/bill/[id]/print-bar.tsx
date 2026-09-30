"use client";
import Link from "next/link";
import { useState } from "react";
import { SharePdfButton } from "@/components/share-pdf";

/** Print as A4 / 3" / 2", or get the receipt as a PNG image for Bluetooth thermal printers */
export function PrintBar({ id, size, billNo, defaultWidth, phone = "", message = "" }: { id: number; size: "a4" | "80" | "58"; billNo: string; defaultWidth: "58" | "80"; phone?: string; message?: string }) {
  const [w, setW] = useState<"58" | "80">(size === "80" ? "80" : size === "58" ? "58" : defaultWidth);
  const [busy, setBusy] = useState(false);
  const file = `bill-${billNo.replace(/[^\w-]+/g, "_")}-${w}mm.png`;
  async function sharePng() {
    setBusy(true);
    try {
      const res = await fetch(`/bill/${id}/png?w=${w}`);
      if (!res.ok) throw new Error("Could not create the image");
      const blob = await res.blob();
      const f = new File([blob], file, { type: "image/png" });
      if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], title: billNo });
      else { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file; a.click(); URL.revokeObjectURL(a.href); }
    } catch (e) { if ((e as Error).name !== "AbortError") alert((e as Error).message); }
    finally { setBusy(false); }
  }
  const tab = (s: string, label: string) => (
    <Link href={s === "a4" ? `/bill/${id}` : `/bill/${id}?size=${s}`} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${size === s ? "bg-ink text-white" : "bg-white ring-1 ring-line"}`}>{label}</Link>
  );
  return (
    <div className="no-print mx-auto mb-3 max-w-[640px] space-y-2 px-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/orders/${id}`} className="btn-ghost btn-sm">← Back</Link>
        {tab("a4", "A4")}{tab("80", "3 inch (80mm)")}{tab("58", "2 inch (58mm)")}
        <button onClick={() => window.print()} className="btn-primary btn-sm">Print</button>
      </div>
      <div className="card flex flex-wrap items-center gap-2 !p-2.5">
        <span className="text-sm font-semibold">A4 PDF:</span>
        <SharePdfButton orderId={id} billNo={billNo} phone={phone} message={message} className="btn-gold btn-sm" label="Share on WhatsApp" />
        <a className="btn-ghost btn-sm" href={`/bill/${id}/pdf?download=1`}>Download PDF</a>
        <a className="text-xs font-semibold text-brand underline" href={`/bill/${id}/pdf`} target="_blank">Preview</a>
      </div>
      <div className="card flex flex-wrap items-center gap-2 !p-2.5">
        <span className="text-sm font-semibold">Thermal image (PNG):</span>
        <select className="input !w-auto !py-1.5 text-sm" value={w} onChange={(e) => setW(e.target.value as "58" | "80")}>
          <option value="58">2 inch · 58mm</option><option value="80">3 inch · 80mm</option>
        </select>
        <button className="btn-gold btn-sm" disabled={busy} onClick={sharePng}>{busy ? "Preparing…" : "Share to printer app"}</button>
        <a className="btn-ghost btn-sm" href={`/bill/${id}/png?w=${w}&download=1`}>Download PNG</a>
        <a className="text-xs font-semibold text-brand underline" href={`/bill/${id}/png?w=${w}`} target="_blank">Preview</a>
      </div>
    </div>
  );
}
