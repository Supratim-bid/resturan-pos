"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CollectQr } from "./order-actions";
import { deliveredAction, deliveryCheckAction, deliveryCollectAction, deliveryLinkAction } from "@/app/actions/delivery";

/** Collect payment (QR / cash) and mark delivered - for the delivery person */
export function DeliveryActions({ orderId, due, done, gateway, upiText, qrImage, today, restaurant, billNo }: {
  orderId: number; due: number; done: boolean; gateway: string; upiText: string; qrImage: string; today: string; restaurant: string; billNo: string;
}) {
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { setErr(""); const r = await fn(); if (!r.ok) setErr(r.error ?? "Failed"); else router.refresh(); });
  return (
    <div className="space-y-2 border-t border-line pt-2">
      <div className="flex flex-wrap gap-2">
        {/* kept mounted after payment so its "Paid ✓" screen stays until closed (it hides its own button when nothing is due) */}
        {(gateway || upiText || qrImage) && (
          <CollectQr orderId={orderId} due={due} gateway={gateway} upiText={upiText} qrImage={qrImage} upiMode="UPI" today={today} restaurant={restaurant} billNo={billNo}
            label="📱 Collect by QR" actions={{ create: deliveryLinkAction, check: deliveryCheckAction, receive: (id, amt) => deliveryCollectAction(id, amt, "UPI") }} />
        )}
        {due > 0 && <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => { if (confirm(`Got ₹${due} in cash?`)) run(() => deliveryCollectAction(orderId, due, "Cash")); }}>💵 Cash collected · ₹{due}</button>}
        {done
          ? <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => deliveredAction(orderId, false))}>Undo delivered</button>
          : <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={() => { if (due > 0 && !confirm(`₹${due} is still due on this bill. Mark delivered anyway?`)) return; run(() => deliveredAction(orderId, true)); }}>✓ Delivered</button>}
      </div>
      {err && <p className="text-xs text-red-700">{err}</p>}
    </div>
  );
}
