"use client";
import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CollectQr } from "./order-actions";
import { assignRiderAction, deliveredAction, deliveryCheckAction, deliveryCollectAction, deliveryLinkAction, setOutForDeliveryAction, shareLocationAction } from "@/app/actions/delivery";

/** Collect payment (QR / cash) and mark delivered - for the delivery person */
export function DeliveryActions({ orderId, due, done, out = false, gateway, upiText, qrImage, today, restaurant, billNo }: {
  orderId: number; due: number; done: boolean; out?: boolean; gateway: string; upiText: string; qrImage: string; today: string; restaurant: string; billNo: string;
}) {
  const [err, setErr] = useState("");
  const [showQr, setShowQr] = useState(false);
  const [paid, setPaid] = useState(false);
  const [shownDue, setShownDue] = useState(due);
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { setErr(""); const r = await fn(); if (!r.ok) setErr(r.error ?? "Failed"); else router.refresh(); });
  return (
    <div className="space-y-2 border-t border-line pt-2">
      <div className="flex flex-wrap gap-2">
        {/* kept mounted after payment so its "Paid ✓" screen stays until closed (it hides its own button when nothing is due) */}
        {(gateway || upiText || qrImage) && (
          <CollectQr orderId={orderId} due={due} gateway={gateway} upiText={upiText} qrImage={qrImage} staticQr={qrImage} upiMode="UPI" today={today} restaurant={restaurant} billNo={billNo}
            label="📱 Collect by QR" actions={{ create: deliveryLinkAction, check: deliveryCheckAction, receive: (id, amt) => deliveryCollectAction(id, amt, "UPI") }} />
        )}
        {due > 0 && qrImage && <button type="button" title="Show our QR" onClick={() => { setPaid(false); setShownDue(due); setShowQr(true); }} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-1.5 py-1 text-xs ring-1 ring-line"><img src={qrImage} alt="Our payment QR" className="h-10 w-10 rounded object-cover" />Our QR</button>}
        {due > 0 && <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => { if (confirm(`Got ₹${due} in cash?`)) run(() => deliveryCollectAction(orderId, due, "Cash")); }}>💵 Cash collected · ₹{due}</button>}
        {!done && (out
          ? <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => setOutForDeliveryAction(orderId, false))}>↩ Not out yet</button>
          : <button type="button" className="btn-gold btn-sm" disabled={pending} onClick={() => run(() => setOutForDeliveryAction(orderId, true))}>🛵 Out for delivery</button>)}
        {done
          ? <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => deliveredAction(orderId, false))}>Undo delivered</button>
          : <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={() => { if (due > 0 && !confirm(`₹${due} is still due on this bill. Mark delivered anyway?`)) return; run(() => deliveredAction(orderId, true)); }}>✓ Delivered</button>}
      </div>
      {!done && out && <ShareLocation orderId={orderId} />}
      {err && <p className="text-xs text-red-700">{err}</p>}
      {/* our uploaded QR as a popup on the same page */}
      {showQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" role="dialog" aria-label="Our payment QR" onClick={() => setShowQr(false)}>
          <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-4 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><b>Bill {billNo}</b><button type="button" className="btn-ghost btn-sm" onClick={() => { setShowQr(false); if (paid) router.refresh(); }}>Close</button></div>
            <div className="inline-block rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">Static QR (your uploaded QR) · customer types the amount</div>
            <div className="text-3xl font-bold tabular-nums">₹{shownDue}</div>
            {paid ? <div className="rounded-xl bg-emerald-50 py-10 text-emerald-800"><div className="text-5xl">✓</div><div className="mt-2 text-lg font-bold">Paid - recorded on the bill</div></div> : (
              <>
                <img src={qrImage} alt="Scan to pay" className="mx-auto aspect-square w-full max-w-[300px] object-contain" />
                <p className="text-xs text-muted">Customer scans with any UPI app and types <b>₹{shownDue}</b>. Check your UPI app, then:</p>
                <button type="button" className="btn-primary w-full" disabled={pending} onClick={() => start(async () => {
                  setErr(""); const r = await deliveryCollectAction(orderId, shownDue, "UPI");
                  if (!r.ok) setErr(r.error ?? "Failed"); else setPaid(true);
                })}>{pending ? "Saving…" : `✓ Received ₹${shownDue} by UPI`}</button>
                {err && <p className="text-xs text-red-700">{err}</p>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Share the rider's live GPS while out for delivery, so the customer can track it on the map. */
export function ShareLocation({ orderId }: { orderId: number }) {
  const [on, setOn] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const watchRef = useRef<number | null>(null);
  const lastSent = useRef(0);
  useEffect(() => () => { if (watchRef.current != null) navigator.geolocation?.clearWatch(watchRef.current); }, []);
  function toggle() {
    if (on) {
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null; setOn(false); setNote("Sharing stopped."); return;
    }
    if (!navigator.geolocation) { setErr("This phone can't share location."); return; }
    setErr(""); setNote("Getting your location…");
    const send = (lat: number, lng: number) => { lastSent.current = Date.now(); shareLocationAction(orderId, lat, lng).then((r) => setNote(r.ok ? `Live · updated ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : (r as { error: string }).error)); };
    // send one fix straight away, then keep updating as the rider moves
    navigator.geolocation.getCurrentPosition((pos) => send(pos.coords.latitude, pos.coords.longitude), () => {}, { enableHighAccuracy: true, timeout: 20000 });
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (Date.now() - lastSent.current < 10000) return; // send at most every ~10s
        send(pos.coords.latitude, pos.coords.longitude);
      },
      (e) => setErr(e.code === e.PERMISSION_DENIED ? "Allow location access to share your position." : "Couldn't get location."),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    setOn(true);
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <button type="button" className={on ? "btn-primary btn-sm" : "btn-ghost btn-sm"} onClick={toggle}>{on ? "📍 Stop sharing location" : "📍 Share live location"}</button>
      {note && <span className={on ? "text-emerald-700" : "text-muted"}>{note}</span>}
      {err && <span className="text-red-700">{err}</span>}
    </div>
  );
}

/** Assign a delivery person to an order (owner/manager or the rider themselves). */
export function AssignRider({ orderId, riders, value }: { orderId: number; riders: { id: number; name: string }[]; value: number | null }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <label className="flex items-center gap-1.5 text-xs">
      <span className="text-muted">Rider</span>
      <select className="input !w-auto !py-1 text-xs" disabled={pending} value={value ?? ""} onChange={(e) => {
        const v = e.target.value ? Number(e.target.value) : null;
        start(async () => { const r = await assignRiderAction(orderId, v); if (!r.ok) alert(r.error); router.refresh(); });
      }}>
        <option value="">— unassigned —</option>
        {riders.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
    </label>
  );
}
