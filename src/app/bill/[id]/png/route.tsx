import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { loadBill, logoDataUrl, qrDataUrl } from "@/lib/bill";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/format";

export const runtime = "nodejs";

let fonts: { regular: Buffer; bold: Buffer } | null = null;
async function loadFonts() {
  if (!fonts) {
    const dir = path.join(process.cwd(), "assets", "fonts");
    fonts = { regular: await readFile(path.join(dir, "Carlito-Regular.ttf")), bold: await readFile(path.join(dir, "Carlito-Bold.ttf")) };
  }
  return fonts;
}
const money = (n: number) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const linesFor = (text: string, perLine: number) => Math.max(1, Math.ceil((text || "").length / perLine));

/**
 * Receipt image for thermal printers: 58 mm (2 inch, 384 px) or 80 mm (3 inch, 576 px) at 203 dpi.
 * Pure black on white so it prints sharp. Share it to your printer app (e.g. RawBT) or print from the gallery.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getUser();
  if (!u || !can(u, "orders")) return new Response("Not allowed", { status: 403 });
  const url = new URL(req.url);
  const w80 = url.searchParams.get("w") === "80";
  const W = w80 ? 576 : 384;
  const b = await loadBill(u.tenantId, Number((await params).id));
  if (!b) return new Response("Not found", { status: 404 });
  const { o, s, paid, due, pay, billPack } = b;
  const [f, logo, qr] = await Promise.all([loadFonts(), s.billShowLogo ? logoDataUrl(u.tenantId, s.logoImageId) : null, !pay ? null : pay.kind === "image" ? logoDataUrl(u.tenantId, pay.imageId ?? null) : qrDataUrl(pay.text, w80 ? 260 : 220)]);
  const qrLabel = pay ? `${pay.label}${due > 0 ? ` · ${money(due)}` : ""}` : "";
  const preLine = o.isPreorder ? `PRE-ORDER · ${fmtDate(o.date)}${o.mealSlot ? ` · ${o.mealSlot}` : ""}${o.slotTime ? ` · ${fmtTime(o.slotTime)}` : ""}` : "";
  const byLine = s.billShowCashier && o.createdBy?.name ? `Billed by: ${o.createdBy.name}` : "";

  const fs = w80 ? 24 : 21, lh = Math.round(fs * 1.3), pad = w80 ? 20 : 10;
  const cpl = Math.floor((W - pad * 2) / (fs * 0.5)); // chars per line (approx)
  const gst = Number(o.gstRate);
  const totals: [string, string, boolean?][] = [["Sub total", money(Number(o.itemsTotal))]];
  const disc = Number(o.itemDiscount) + Number(o.orderDiscount);
  if (disc > 0) totals.push(["Discount", "-" + money(disc)]);
  if (Number(o.deliveryCharge) > 0) totals.push(["Delivery", money(Number(o.deliveryCharge))]);
  if (Number(o.packingCharge) > 0) totals.push(["Packing", money(Number(o.packingCharge))]);
  if (gst > 0) { totals.push([`CGST ${gst / 2}%`, money(Number(o.gstAmount) / 2)]); totals.push([`SGST ${gst / 2}%`, money(Number(o.gstAmount) / 2)]); }
  if (Number(o.roundOff) !== 0) totals.push(["Round off", money(Number(o.roundOff))]);
  const after: [string, string, boolean?][] = [];
  if (paid > 0) after.push(["Paid", money(paid)]);
  if (due > 0) after.push(["BALANCE DUE", money(due), true]);
  const addr = o.customer ? [o.customer.flat, o.customer.area].filter(Boolean).join(", ") : "";
  const headLines = [s.tagline, s.billHeaderNote, s.address, s.phone && `Ph: ${s.phone}`, s.gstin && `GSTIN: ${s.gstin}`, s.fssai && `FSSAI: ${s.fssai}`].filter(Boolean) as string[];

  // height estimate (thermal paper is continuous, a little extra white space is fine)
  let H = pad * 2 + 10;
  if (logo) H += (w80 ? 150 : 120) + 8;
  H += linesFor(s.name, Math.floor(cpl * 0.7)) * Math.round(fs * 1.5) + 4;
  H += headLines.reduce((a, l) => a + linesFor(l, cpl) * lh, 0);
  H += lh + 16; // banner
  H += lh * 3 + (o.customer ? lh + (addr ? linesFor(addr, cpl) * lh : 0) : 0) + (o.customer?.phone ? 0 : 0);
  H += lh + 10; // header row
  for (const i of o.items) H += linesFor(i.name, cpl) * lh + lh + (Number(i.discount) > 0 ? lh : 0) + 4;
  if (billPack.length) H += lh + 8 + billPack.reduce((a, p) => a + linesFor(`${p.name} x ${Number(p.qty)}`, cpl - 10) * lh, 0);
  H += 14 + totals.length * lh + Math.round(fs * 1.6) + 10 + after.length * lh;
  if (qr) H += (w80 ? 260 : 220) + linesFor(qrLabel, cpl) * lh + 10;
  if (preLine) H += linesFor(preLine, cpl) * lh + 8;
  if (byLine) H += lh;
  if (s.billSocial) H += linesFor(s.billSocial, cpl) * lh;
  if (s.billTerms) H += s.billTerms.split("\n").reduce((a, l) => a + linesFor(l, Math.floor(cpl * 1.15)) * Math.round(fs * 0.85 * 1.3), 0) + 8;
  if (o.status === "CANCELLED") H += lh + 12;
  H += lh * 2 + (s.billFooter ? linesFor(s.billFooter, cpl) * lh : 0) + 20;

  const row = (l: string, r: string, bold = false, big = false) => (
    <div key={l} style={{ display: "flex", justifyContent: "space-between", fontWeight: bold ? 700 : 400, fontSize: big ? Math.round(fs * 1.25) : fs, lineHeight: 1.3 }}>
      <span>{l}</span><span>{r}</span>
    </div>
  );
  const rule = (dashed = true) => <div style={{ display: "flex", borderTop: `2px ${dashed ? "dashed" : "solid"} #000`, margin: "6px 0" }} />;

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: "#fff", color: "#000", padding: pad, fontFamily: "Carlito", fontSize: fs, lineHeight: 1.3 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          {logo && <img src={logo} width={w80 ? 150 : 120} height={w80 ? 150 : 120} style={{ borderRadius: 999, marginBottom: 8, objectFit: "cover" }} />}
          <div style={{ display: "flex", fontWeight: 700, fontSize: Math.round(fs * 1.4), textTransform: "uppercase", letterSpacing: 1 }}>{s.name}</div>
          {headLines.map((l) => <div key={l} style={{ display: "flex" }}>{l}</div>)}
          <div style={{ display: "flex", justifyContent: "center", width: "100%", border: "2px solid #000", fontWeight: 700, margin: "8px 0 6px", padding: "2px 0", letterSpacing: 2 }}>{gst > 0 ? "TAX INVOICE" : "BILL"}</div>
        </div>
        {row(`Bill: ${o.billNo}`, fmtDate(o.date), true)}
        {row(`${o.orderType}${o.tableNo ? ` · Table ${o.tableNo}` : ""}`, fmtDateTime(o.createdAt).split(", ")[1] ?? "")}
        {o.customer && <div style={{ display: "flex" }}>{`Cust: ${o.customer.name}${o.customer.phone ? ` · ${o.customer.phone}` : ""}`}</div>}
        {addr && <div style={{ display: "flex" }}>{addr}</div>}
        {preLine && <div style={{ display: "flex", border: "2px solid #000", fontWeight: 700, padding: "1px 4px", margin: "4px 0" }}>{preLine}</div>}
        {byLine && <div style={{ display: "flex" }}>{byLine}</div>}
        {o.status === "CANCELLED" && <div style={{ display: "flex", justifyContent: "center", border: "3px solid #000", fontWeight: 700, margin: "6px 0" }}>CANCELLED</div>}
        {rule(false)}
        {row("Item", "Amount", true)}
        {rule()}
        {o.items.map((i) => (
          <div key={i.id} style={{ display: "flex", flexDirection: "column", marginBottom: 4 }}>
            <div style={{ display: "flex", fontWeight: 700 }}>{i.name}</div>
            {row(`  ${Number(i.qty)} x ${money(Number(i.rate))}`, money(Number(i.qty) * Number(i.rate)))}
            {Number(i.discount) > 0 && row("  discount", "-" + money(Number(i.discount)))}
          </div>
        ))}
        {billPack.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", borderTop: "2px dashed #000", paddingTop: 4, marginTop: 2 }}>
            <div style={{ display: "flex", fontWeight: 700 }}>Packaging</div>
            {billPack.map((p) => <div key={p.id} style={{ display: "flex" }}>{row(`  ${p.name} x ${Number(p.qty)}`, money(Number(p.qty) * Number(p.unitPrice)))}</div>)}
          </div>
        )}
        {rule()}
        {totals.map(([l, r]) => row(l, r))}
        <div style={{ display: "flex", borderTop: "3px solid #000", marginTop: 4, paddingTop: 4 }} />
        {row("TOTAL", "₹" + Number(o.total).toLocaleString("en-IN", { minimumFractionDigits: 2 }), true, true)}
        {after.map(([l, r, bold]) => row(l, r, !!bold))}
        {qr && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 10 }}>
            <img src={qr} width={w80 ? 260 : 220} height={w80 ? 260 : 220} />
            <div style={{ display: "flex", textAlign: "center", fontWeight: 700 }}>{qrLabel}</div>
          </div>
        )}
        {rule()}
        <div style={{ display: "flex", justifyContent: "center", textAlign: "center", fontWeight: 700 }}>{s.billFooter}</div>
        {s.billSocial && <div style={{ display: "flex", justifyContent: "center", textAlign: "center" }}>{s.billSocial}</div>}
        {s.billTerms && <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", fontSize: Math.round(fs * 0.85), marginTop: 6 }}>
          {s.billTerms.split("\n").map((l, k) => <div key={k} style={{ display: "flex" }}>{l}</div>)}</div>}
      </div>
    ),
    {
      width: W, height: H,
      fonts: [{ name: "Carlito", data: f.regular, weight: 400, style: "normal" }, { name: "Carlito", data: f.bold, weight: 700, style: "normal" }],
      headers: {
        "Cache-Control": "private, no-store",
        ...(url.searchParams.get("download") ? { "Content-Disposition": `attachment; filename="bill-${o.billNo.replace(/[^\w-]+/g, "_")}-${w80 ? "80" : "58"}mm.png"` } : {}),
      },
    },
  );
}
