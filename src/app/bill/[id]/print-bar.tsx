"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SharePdfButton } from "@/components/share-pdf";

const PREF = "bill-print-size";
const KOT_PREF = "bill-print-kot";
type Size = "a4" | "half" | "80" | "58";

/** Print as A4 / half A4 / 3" / 2", or get the receipt as a PNG image for Bluetooth thermal printers */
export function PrintBar({ id, size, explicit = false, hasKot = false, withKot = false, kotExplicit = false, billNo, defaultWidth, phone = "", message = "" }: { id: number; size: Size; explicit?: boolean; hasKot?: boolean; withKot?: boolean; kotExplicit?: boolean; billNo: string; defaultWidth: "58" | "80"; phone?: string; message?: string }) {
  const router = useRouter();
  const [kotOn, setKotOn] = useState(withKot);
  useEffect(() => setKotOn(withKot), [withKot]);
  const url = (sz: string, k: boolean) => `/bill/${id}?size=${sz}${hasKot ? `&kot=${k ? 1 : 0}` : ""}`;
  // remember on this device: the size chosen last time (e.g. always half A4) and whether the KOT prints with the bill
  useEffect(() => {
    try {
      if (explicit) localStorage.setItem(PREF, size);
      if (hasKot && kotExplicit) localStorage.setItem(KOT_PREF, withKot ? "1" : "0");
      const p = explicit ? size : localStorage.getItem(PREF);
      const wantSize = p && ["a4", "half", "80", "58"].includes(p) ? p : size;
      const wantKot = hasKot ? (kotExplicit ? withKot : (localStorage.getItem(KOT_PREF) ?? "1") === "1") : false;
      if (wantSize !== size || (hasKot && wantKot !== withKot)) router.replace(url(wantSize, wantKot));
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explicit, size, id, hasKot, withKot, kotExplicit]);
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
    <Link href={url(s, withKot)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${size === s ? "bg-ink text-white" : "bg-white ring-1 ring-line"}`}>{label}</Link>
  );
  return (
    <div className="no-print mx-auto mb-3 max-w-[640px] space-y-2 px-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/orders/${id}`} className="btn-ghost btn-sm">← Back</Link>
        {tab("a4", "A4")}{tab("half", "Half A4")}{tab("80", "3 inch (80mm)")}{tab("58", "2 inch (58mm)")}
        <button onClick={() => window.print()} className="btn-primary btn-sm">{withKot ? "Print bill + KOT" : "Print"}</button>
      </div>
      {hasKot && (
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={kotOn} onChange={(e) => { setKotOn(e.target.checked); router.replace(url(size, e.target.checked)); }} />
          Also print the KOT slip (kitchen copy, no prices) after the bill</label>
      )}
      {size === "half" && (
        <div className="rounded-xl bg-gold-light/60 px-3 py-2 text-sm">
          <b>Half A4 - 2 bills per sheet:</b> the bill prints on the left half. For the next bill, <b>rotate the printed sheet half a turn (same side up, top becomes bottom)</b> and put it back in the tray - it prints on the empty half. Cut along the dotted line.
          <span className="block text-xs text-muted">In the print window keep Paper: A4, Scale: 100% / Actual size (not &quot;Fit&quot;), Margins: None.</span>
        </div>
      )}
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
