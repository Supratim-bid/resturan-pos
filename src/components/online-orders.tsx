"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptOnlineOrderAction, rejectOnlineOrderAction, saveOnlineSettingsAction, setBlockedAction, setOnlineOpenAction } from "@/app/actions/online";

/** Checks for new orders every 15 s and beeps when one arrives (after "Turn on sound" is tapped once) */
export function LiveOrders({ newCount }: { newCount: number }) {
  const router = useRouter();
  const last = useRef(newCount);
  const ctx = useRef<AudioContext | null>(null);
  const [sound, setSound] = useState(false);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 15000);
    return () => clearInterval(t);
  }, [router]);
  useEffect(() => {
    if (newCount > last.current && sound && ctx.current) {
      const c = ctx.current;
      [0, 0.25, 0.5].forEach((d) => {
        const o = c.createOscillator(), g = c.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(c.destination);
        g.gain.setValueAtTime(0.25, c.currentTime + d); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + d + 0.2);
        o.start(c.currentTime + d); o.stop(c.currentTime + d + 0.22);
      });
      if ("vibrate" in navigator) navigator.vibrate?.([200, 100, 200]);
    }
    last.current = newCount;
  }, [newCount, sound]);
  return (
    <button type="button" className={`btn-sm ${sound ? "btn-ghost" : "btn-gold"}`} onClick={() => {
      if (!ctx.current) ctx.current = new AudioContext();
      void ctx.current.resume(); setSound((x) => !x);
    }}>{sound ? "🔔 Sound on" : "🔕 Turn on sound"}</button>
  );
}

export function OpenSwitch({ open }: { open: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button type="button" disabled={pending} onClick={() => start(async () => { await setOnlineOpenAction(!open); router.refresh(); })}
      className={`rounded-full px-3 py-1.5 text-sm font-bold ${open ? "bg-emerald-600 text-white" : "bg-stone-300 text-ink"}`}>
      {open ? "● Taking orders" : "○ Closed - tap to open"}
    </button>
  );
}

export function OnlineOrderActions({ id, payMethod, canBlock = false, paidOnline = 0 }: { id: number; payMethod: string; canBlock?: boolean; paidOnline?: number }) {
  const [mode, setMode] = useState<"" | "reject">("");
  const [block, setBlock] = useState(false);
  const [paid, setPaid] = useState(false);
  const [why, setWhy] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, go?: (d: unknown) => void) => start(async () => {
    setErr(""); const r = await fn();
    if (!r.ok) setErr(r.error ?? "Failed"); else { if (go) go(r.data); router.refresh(); }
  });
  return (
    <div className="space-y-2">
      {paidOnline > 0 && mode === "" && <p className="text-sm text-emerald-700">✓ Paid online - it is recorded on the bill automatically when you accept.</p>}
      {paidOnline > 0 && mode === "reject" && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">This customer already paid online. After rejecting, refund them from your payment gateway dashboard (Cashfree / Instamojo / Razorpay → the payment → Refund).</p>}
      {payMethod === "UPI" && paidOnline <= 0 && mode === "" && (
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
          <span><b>Payment received</b> - I checked our UPI app / bank (records the payment on the bill)</span></label>
      )}
      {mode === "reject" ? (
        <div className="space-y-2">
          <input className="input" autoFocus placeholder="Reason (customer sees it) e.g. sold out, too far" value={why} onChange={(e) => setWhy(e.target.value)} />
          {canBlock && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={block} onChange={(e) => setBlock(e.target.checked)} />Fake order - block this number from ordering online</label>}
          <div className="flex gap-2">
            <button className="btn-danger btn-sm" disabled={pending} onClick={() => run(() => rejectOnlineOrderAction(id, why || (block ? "Could not confirm this order" : ""), block))}>Reject order</button>
            <button className="btn-ghost btn-sm" onClick={() => setMode("")}>Back</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={pending} onClick={() => run(() => acceptOnlineOrderAction(id, paid), (oid) => router.push(`/orders/${oid}?saved=1`))}>{pending ? "Accepting…" : "✓ Accept - make bill"}</button>
          <button className="btn-ghost" disabled={pending} onClick={() => setMode("reject")}>✕ Reject</button>
        </div>
      )}
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
    </div>
  );
}

export function BlockButton({ customerId, blocked }: { customerId: number; blocked: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => {
    if (!blocked && !confirm("Block this number from ordering online?")) return;
    start(async () => { await setBlockedAction(customerId, !blocked); router.refresh(); });
  }}>{blocked ? "Unblock" : "🚫 Block this number"}</button>;
}

export function CopyLink({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" className="btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(url).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); })}>{done ? "Copied ✓" : "Copy link"}</button>;
}

export function OnlineSettings({ initial, orderTypes, preorderFeature, hasUpi, smsReady }: { initial: Record<string, string>; orderTypes: string[]; preorderFeature: boolean; hasUpi: boolean; smsReady: boolean }) {
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const box = (k: string, label: string, disabled = false) => (
    <label className={`flex items-center gap-2 text-sm ${disabled ? "opacity-50" : ""}`}><input type="checkbox" disabled={disabled} className="h-5 w-5 accent-[var(--color-brand)]" checked={v[k] === "true"} onChange={(e) => setV({ ...v, [k]: String(e.target.checked) })} />{label}</label>
  );
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await saveOnlineSettingsAction(v); setMsg(r.ok ? { ok: true, t: "Saved." } : { ok: false, t: r.error }); if (r.ok) router.refresh(); }); }}>
      <div className="flex flex-wrap gap-4">
        {box("onlineDelivery", "Delivery")}{box("onlineTakeaway", "Pickup / takeaway")}{box("onlinePreorder", preorderFeature ? "Pre-orders (date & meal)" : "Pre-orders (needs the Pre-orders feature)", !preorderFeature)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="omin">Minimum order ₹ (0 = none)</label><input id="omin" className="input" inputMode="decimal" value={v.onlineMinOrder} onChange={(e) => setV({ ...v, onlineMinOrder: e.target.value })} /></div>
        <div><label className="label" htmlFor="onote">Note at the top of the menu</label><input id="onote" className="input" placeholder="e.g. Delivery within 5 km · 45 min" value={v.onlineNote} onChange={(e) => setV({ ...v, onlineNote: e.target.value })} /></div>
        <div><label className="label" htmlFor="odt">Order type for online delivery</label>
          <select id="odt" className="input" value={v.onlineDeliveryType} onChange={(e) => setV({ ...v, onlineDeliveryType: e.target.value })}>{orderTypes.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div><label className="label" htmlFor="ott">Order type for online pickup</label>
          <select id="ott" className="input" value={v.onlineTakeawayType} onChange={(e) => setV({ ...v, onlineTakeawayType: e.target.value })}>{orderTypes.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="ocl">Message when closed</label><input id="ocl" className="input" value={v.onlineClosedMsg} onChange={(e) => setV({ ...v, onlineClosedMsg: e.target.value })} /></div>
      </div>
      <div className="space-y-2 rounded-xl bg-cream p-3">
        <div className="text-sm font-bold">How customers can pay</div>
        {box("onlinePayUpi", "Pay now by UPI (your QR / UPI ID) - customer can attach a payment screenshot")}
        {!hasUpi && v.onlinePayUpi === "true" && <p className="text-xs text-red-700">Add your UPI ID or payment QR in Settings, otherwise customers won&apos;t see this option.</p>}
        {box("onlinePayCash", "Cash on delivery / at pickup")}
        <p className="text-xs text-muted">Tick at least one. Tip: UPI only is safest against fake orders.</p>
      </div>
      <div className="space-y-2 rounded-xl bg-cream p-3">
        <div className="text-sm font-bold">Stopping fake orders</div>
        {box("onlineOtp", smsReady ? "Verify customer's mobile number with an SMS OTP before ordering" : "Verify customer's mobile number with an SMS OTP - coming soon", !smsReady)}
        {!smsReady && <p className="text-xs text-muted">Needs an SMS service to be connected (about ₹0.15-0.20 per SMS). It will switch on here once it is set up.</p>}
        <p className="text-xs text-muted">You can also block fake numbers from the Reject button.</p>
        <div className="sm:w-1/2"><label className="label" htmlFor="onmax">Maximum first order from a new number ₹ (0 = no limit)</label><input id="onmax" className="input" inputMode="decimal" value={v.onlineNewMax} onChange={(e) => setV({ ...v, onlineNewMax: e.target.value })} /></div>
      </div>
      <p className="text-xs text-muted">Delivery charge and GST come from Settings. Prices and dishes come from your Menu; dishes marked “not available” are hidden from customers.</p>
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.t}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save online settings"}</button>
    </form>
  );
}
