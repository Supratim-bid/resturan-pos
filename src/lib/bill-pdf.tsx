import "server-only";
import path from "node:path";
import React from "react";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { loadBill, logoDataUrl, qrDataUrl } from "./bill";
import { fmtDate, fmtDateTime, fmtTime, inr2, phoneLine } from "./format";

// Carlito has the ₹ sign; bundled in assets/fonts (also used by the thermal receipt image)
let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  const dir = path.join(process.cwd(), "assets", "fonts");
  Font.register({ family: "Carlito", fonts: [{ src: path.join(dir, "Carlito-Regular.ttf") }, { src: path.join(dir, "Carlito-Bold.ttf"), fontWeight: 700 }] });
  Font.registerHyphenationCallback((w) => [w]); // never split words
  fontsReady = true;
}

/** Mix a hex colour with white (t = 0..1 white amount) for light tints */
function tint(hex: string, t: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#f7eed9";
  const n = parseInt(m[1], 16);
  const ch = (s: number) => Math.round(((n >> s) & 255) * (1 - t) + 255 * t).toString(16).padStart(2, "0");
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/** The A4 bill as a PDF (same content as the A4 print layout) - for WhatsApp / email */
export async function renderBillPdf(tenantId: number, orderId: number) {
  const b = await loadBill(tenantId, orderId);
  if (!b) return null;
  registerFonts();
  const { o, s, paid, due, pay, billPack } = b;
  const brand = /^#[0-9a-f]{6}$/i.test(s.primaryColor) ? s.primaryColor : "#9a1c1f";
  const gold = /^#[0-9a-f]{6}$/i.test(s.accentColor) ? s.accentColor : "#c8962e";
  const goldLight = tint(gold, 0.8);
  const [logo, qr] = await Promise.all([
    s.billShowLogo ? logoDataUrl(tenantId, s.logoImageId) : null,
    !pay ? null : pay.kind === "image" ? logoDataUrl(tenantId, pay.imageId ?? null) : qrDataUrl(pay.text, 300),
  ]);
  const gst = Number(o.gstRate);
  const disc = Number(o.itemDiscount) + Number(o.orderDiscount);
  const addr = o.customer ? [o.customer.flat, o.customer.area].filter(Boolean).join(", ") : "";

  const st = StyleSheet.create({
    page: { fontFamily: "Carlito", fontSize: 10.5, color: "#1c1917", paddingTop: 36, paddingBottom: 40, paddingHorizontal: 44 },
    center: { alignItems: "center", textAlign: "center" },
    name: { fontFamily: "Times-Bold", fontSize: 20, color: brand, textTransform: "uppercase", letterSpacing: 1, marginTop: 4 },
    italic: { fontFamily: "Times-Italic" },
    pill: { marginTop: 3, backgroundColor: goldLight, color: brand, fontWeight: 700, paddingVertical: 2, paddingHorizontal: 10, borderRadius: 8 },
    banner: { marginTop: 10, marginBottom: 8, backgroundColor: brand, color: "#ffffff", fontWeight: 700, letterSpacing: 3, textAlign: "center", paddingVertical: 4, borderTopWidth: 2, borderBottomWidth: 2, borderColor: gold },
    row: { flexDirection: "row", justifyContent: "space-between" },
    pre: { marginTop: 4, backgroundColor: goldLight, fontWeight: 700, paddingVertical: 3, paddingHorizontal: 6 },
    thead: { flexDirection: "row", backgroundColor: goldLight, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#000", paddingVertical: 4, marginTop: 10, fontWeight: 700 },
    tr: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#d6d3d1", borderStyle: "dashed", paddingVertical: 4 },
    cNo: { width: "6%" }, cItem: { width: "52%", paddingRight: 6 }, cQty: { width: "10%", textAlign: "right" }, cRate: { width: "16%", textAlign: "right" }, cAmt: { width: "16%", textAlign: "right" },
    small: { fontSize: 8.5, color: "#78716c" },
    totals: { marginLeft: "auto", width: 220, marginTop: 8 },
    grand: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 2, borderColor: "#000", paddingTop: 3, marginTop: 3, fontSize: 13, fontWeight: 700 },
    cancelled: { marginVertical: 8, borderWidth: 2, borderColor: "#dc2626", color: "#dc2626", fontWeight: 700, textAlign: "center", paddingVertical: 3, letterSpacing: 2 },
    rule: { alignSelf: "center", width: 160, height: 1, backgroundColor: gold, marginTop: 14 },
    footer: { marginTop: 6, textAlign: "center", color: brand, fontFamily: "Times-BoldItalic", fontSize: 12 },
  });
  const r = (l: string, v: string, bold = false) => (
    <View style={st.row}><Text style={bold ? { fontWeight: 700 } : {}}>{l}</Text><Text style={bold ? { fontWeight: 700 } : {}}>{v}</Text></View>
  );

  const doc = (
    <Document title={`${s.name} - Bill ${o.billNo}`} author={s.name} creator="Restaurant Manager">
      <Page size="A4" style={st.page}>
        <View style={st.center}>
          {logo ? <Image src={logo} style={{ width: 80, height: 80, borderRadius: 40, objectFit: "cover" }} /> : null}
          <Text style={st.name}>{s.name}</Text>
          {s.tagline ? <Text style={st.italic}>{s.tagline}</Text> : null}
          {s.billHeaderNote ? <Text style={st.pill}>{s.billHeaderNote}</Text> : null}
          {s.address ? <Text>{s.address}</Text> : null}
          {phoneLine(s).map((l) => <Text key={l}>{l}</Text>)}
          {s.email ? <Text>{s.email}</Text> : null}
          {s.gstin ? <Text>GSTIN: {s.gstin}</Text> : null}
          {s.fssai ? <Text>FSSAI: {s.fssai}</Text> : null}
        </View>
        <Text style={st.banner}>{gst > 0 ? "TAX INVOICE" : "BILL"}</Text>

        {r(`Bill No: ${o.billNo}`, fmtDate(o.date))}
        {r(`${o.orderType}${o.tableNo ? ` · Table ${o.tableNo}` : ""}`, fmtDateTime(o.createdAt))}
        {o.customer ? <Text>Customer: <Text style={{ fontWeight: 700 }}>{o.customer.name}</Text>{o.customer.phone ? ` · ${o.customer.phone}` : ""}</Text> : null}
        {addr ? <Text>{addr}</Text> : null}
        {o.isPreorder ? <Text style={st.pre}>PRE-ORDER · {fmtDate(o.date)}{o.mealSlot ? ` · ${o.mealSlot}` : ""}{o.slotTime ? ` · ${fmtTime(o.slotTime)}` : ""}</Text> : null}
        {s.billShowCashier && o.createdBy?.name ? <Text>Billed by: {o.createdBy.name}</Text> : null}
        {o.status === "CANCELLED" ? <Text style={st.cancelled}>CANCELLED</Text> : null}

        <View style={st.thead} fixed>
          <Text style={st.cNo}>#</Text><Text style={st.cItem}>Item</Text><Text style={st.cQty}>Qty</Text><Text style={st.cRate}>Rate</Text><Text style={st.cAmt}>Amt</Text>
        </View>
        {o.items.map((i, k) => (
          <View key={i.id} style={st.tr} wrap={false}>
            <Text style={st.cNo}>{k + 1}</Text>
            <View style={st.cItem}><Text>{i.name}</Text>{Number(i.discount) > 0 ? <Text style={st.small}>disc −{inr2(Number(i.discount))}</Text> : null}</View>
            <Text style={st.cQty}>{Number(i.qty)}</Text><Text style={st.cRate}>{inr2(Number(i.rate))}</Text><Text style={st.cAmt}>{inr2(Number(i.lineTotal))}</Text>
          </View>
        ))}
        {billPack.length > 0 ? <Text style={[st.small, { fontWeight: 700, marginTop: 6 }]}>PACKAGING</Text> : null}
        {billPack.map((p) => (
          <View key={`p${p.id}`} style={st.tr} wrap={false}>
            <Text style={st.cNo}> </Text><Text style={st.cItem}>{p.name}</Text><Text style={st.cQty}>{Number(p.qty)}</Text>
            <Text style={st.cRate}>{inr2(Number(p.unitPrice))}</Text><Text style={st.cAmt}>{inr2(Number(p.qty) * Number(p.unitPrice))}</Text>
          </View>
        ))}

        <View style={st.totals} wrap={false}>
          {r("Sub total", inr2(Number(o.itemsTotal)))}
          {disc > 0 ? r("Less: discount", "−" + inr2(disc)) : null}
          {Number(o.deliveryCharge) > 0 ? r("Delivery charge", inr2(Number(o.deliveryCharge))) : null}
          {Number(o.packingCharge) > 0 ? r(billPack.length ? "Packaging" : "Packing charge", inr2(Number(o.packingCharge))) : null}
          {gst > 0 ? <>
            {r("Taxable amount", inr2(Number(o.taxable)))}
            {r(`CGST @ ${gst / 2}%`, inr2(Number(o.gstAmount) / 2))}
            {r(`SGST @ ${gst / 2}%`, inr2(Number(o.gstAmount) / 2))}
          </> : null}
          {Number(o.roundOff) !== 0 ? r("Round off", inr2(Number(o.roundOff))) : null}
          <View style={st.grand}><Text>GRAND TOTAL</Text><Text>{inr2(Number(o.total))}</Text></View>
          {paid > 0 ? r("Paid", inr2(paid)) : null}
          {due > 0 ? r("Balance due", inr2(due), true) : null}
        </View>
        {gst === 0 ? <Text style={{ textAlign: "center", marginTop: 6 }}>Prices inclusive of all taxes</Text> : null}

        {qr ? (
          <View style={[st.center, { marginTop: 12 }]} wrap={false}>
            <Image src={qr} style={{ width: 120, height: 120, objectFit: "contain" }} />
            <Text style={{ fontWeight: 700 }}>{pay?.label}{due > 0 ? ` · ${inr2(due)}` : ""}</Text>
            {(pay?.kind === "upi" || pay?.kind === "image") && s.upiId ? <Text style={st.small}>UPI: {s.upiId}</Text> : null}
            {pay?.kind === "link" || pay?.kind === "page" ? <Text style={st.small}>{pay.text}</Text> : null}
          </View>
        ) : null}

        <View wrap={false}>
          <View style={st.rule} />
          {s.billFooter ? <Text style={st.footer}>{s.billFooter}</Text> : null}
          {s.billSocial ? <Text style={{ textAlign: "center", marginTop: 3 }}>{s.billSocial}</Text> : null}
          {s.billTerms ? <Text style={[st.small, { textAlign: "center", marginTop: 6 }]}>{s.billTerms}</Text> : null}
        </View>
        <Text style={[st.small, { position: "absolute", bottom: 18, left: 44, right: 44, textAlign: "center" }]} fixed
          render={({ pageNumber, totalPages }) => (totalPages > 1 ? `${o.billNo} · page ${pageNumber} of ${totalPages}` : "")} />
      </Page>
    </Document>
  );
  const buffer = await renderToBuffer(doc);
  const filename = `Bill-${o.billNo.replace(/[^\w-]+/g, "_")}.pdf`;
  return { buffer, filename, billNo: o.billNo, total: Number(o.total), due, customerPhone: o.customer?.phone ?? "", restaurant: s.name };
}
