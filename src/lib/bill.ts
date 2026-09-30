import "server-only";
import { and, asc, eq } from "drizzle-orm";
import QRCode from "qrcode";
import { db, schema } from "@/db";

/** Everything needed to print one bill, for the logged-in restaurant only */
export async function loadBill(tenantId: number, orderId: number) {
  const [o, s] = await Promise.all([
    db.query.orders.findFirst({
      where: and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)),
      with: { items: { orderBy: (t) => asc(t.id) }, packaging: { orderBy: (t) => asc(t.id) }, customer: true, payments: true, createdBy: { columns: { name: true } } },
    }),
    db.query.settings.findFirst({ where: eq(schema.settings.tenantId, tenantId) }),
  ]);
  if (!o || !s) return null;
  const paid = o.payments.reduce((a, p) => a + Number(p.amount), 0);
  const due = Math.max(0, Math.round((Number(o.total) - paid) * 100) / 100);
  const pay = payTarget(o, s, due);
  // packaging is internal unless this order charged it to the customer
  const billPack = o.packagingCharged || o.packaging.some((p) => Number(p.unitPrice) > 0) ? o.packaging : [];
  return { o, s, paid, due, upiText: pay?.text ?? null, pay, billPack };
}

type PayS = { upiId: string; name: string; payLinkUrl: string; billShowQr: string; billQrLabel: string; qrImageId: number | null };
type PayO = { billNo: string; status: string; payLinkShort: string; payLinkStatus: string; payLinkAmount: unknown };
/** What the QR on the bill opens: Razorpay link for this bill > uploaded QR image > UPI with amount > fixed payment page */
export function payTarget(o: PayO, s: PayS, due: number): { text: string; kind: "link" | "upi" | "page" | "image"; label: string; imageId?: number } | null {
  if (s.billShowQr === "never" || o.status !== "ACTIVE") return null;
  if (due <= 0 && s.billShowQr !== "always") return null;
  const label = s.billQrLabel || "Scan & pay";
  if (due > 0 && o.payLinkShort && o.payLinkStatus === "created" && Math.abs(Number(o.payLinkAmount ?? 0) - due) < 0.01)
    return { text: o.payLinkShort, kind: "link", label: "Scan to pay online (UPI / card / net banking)" };
  if (s.qrImageId) return { text: "", kind: "image", label, imageId: s.qrImageId };
  if (s.upiId) {
    const amt = due > 0 ? `&am=${due.toFixed(2)}` : "";
    return { text: `upi://pay?pa=${encodeURIComponent(s.upiId)}&pn=${encodeURIComponent(s.name)}${amt}&cu=INR&tn=${encodeURIComponent(o.billNo)}`, kind: "upi", label };
  }
  if (s.payLinkUrl) return { text: s.payLinkUrl, kind: "page", label };
  return null;
}

export async function qrDataUrl(text: string, width = 220) {
  return QRCode.toDataURL(text, { margin: 1, width, errorCorrectionLevel: "M" });
}

/** Logo as a data URL usable in PNG rendering (JPEG/PNG only) */
export async function logoDataUrl(tenantId: number, logoImageId: number | null) {
  if (!logoImageId) return null;
  const img = await db.query.images.findFirst({ where: and(eq(schema.images.id, logoImageId), eq(schema.images.tenantId, tenantId)) });
  if (!img || !["image/jpeg", "image/png"].includes(img.mime)) return null;
  return `data:${img.mime};base64,${Buffer.from(img.data).toString("base64")}`;
}
