"use client";
import { useState } from "react";

/**
 * Sends the A4 bill PDF on WhatsApp.
 * Phone (Android/iPhone): opens the share menu with the PDF attached - pick WhatsApp, then the customer.
 * Computer: downloads the PDF and opens the customer's WhatsApp chat - attach the PDF with 📎.
 */
export function SharePdfButton({ orderId, billNo, phone, message, className = "btn-ghost", label = "WhatsApp PDF" }: {
  orderId: number; billNo: string; phone: string; message: string; className?: string; label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const digits = phone.replace(/\D/g, "");
  const waNumber = digits.length === 10 ? "91" + digits : digits;
  async function go() {
    setBusy(true); setNote("");
    try {
      const res = await fetch(`/bill/${orderId}/pdf`);
      if (!res.ok) throw new Error("Could not create the PDF. Please try again.");
      const blob = await res.blob();
      const name = `Bill-${billNo.replace(/[^\w-]+/g, "_")}.pdf`;
      const file = new File([blob], name, { type: "application/pdf" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: message, title: `Bill ${billNo}` });
        return;
      }
      // computer: save the PDF, then open the chat to attach it
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`, "_blank");
      setNote(`${name} is downloaded. In WhatsApp, tap 📎 and attach it.`);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setNote((e as Error).message);
    } finally { setBusy(false); }
  }
  return (
    <span className="inline-flex flex-col">
      <button type="button" className={className} disabled={busy} onClick={go}>{busy ? "Preparing PDF…" : label}</button>
      {note && <span className="mt-1 max-w-[260px] text-[11px] text-muted">{note}</span>}
    </span>
  );
}
