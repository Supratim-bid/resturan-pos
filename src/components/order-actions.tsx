"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import { addPaymentAction, deletePaymentAction, setStatusAction, requestCancelAction, decideCancelAction, createPayLinkAction, checkPayLinkAction, setFulfilAction, settleCancelledMoneyAction } from "@/app/actions/orders";

export function PaymentForm({ orderId, due, modes, today }: { orderId: number; due: number; modes: string[]; today: string }) {
  const [amt, setAmt] = useState(due > 0 ? String(due) : "");
  const [mode, setMode] = useState(modes[0] ?? "Cash");
  const [date, setDate] = useState(today);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form className="grid grid-cols-2 gap-2 sm:grid-cols-4" onSubmit={(e) => {
      e.preventDefault(); setErr("");
      start(async () => { const r = await addPaymentAction(orderId, Number(amt), mode, date); if (!r.ok) setErr(r.error); else { setAmt(""); router.refresh(); } });
    }}>
      <input className="input" type="number" inputMode="decimal" placeholder="Amount" value={amt} onChange={(e) => setAmt(e.target.value)} />
      <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>{modes.map((m) => <option key={m}>{m}</option>)}</select>
      <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <button className="btn-primary" disabled={pending}>{pending ? "…" : "Add payment"}</button>
      {err && <p className="col-span-full text-sm text-red-700">{err}</p>}
    </form>
  );
}

export function DeletePaymentBtn({ id }: { id: number }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button className="text-xs text-red-600 hover:underline" disabled={pending}
      onClick={() => confirm("Remove this payment?") && start(async () => { const r = await deletePaymentAction(id); if (!r.ok) alert(r.error); router.refresh(); })}>
      remove
    </button>
  );
}

function MoneyChoice({ paid, modes, hasCustomer, value, onChange }: {
  paid: number; modes: string[]; hasCustomer: boolean; value: "REFUND" | "ADVANCE"; onChange: (v: "REFUND" | "ADVANCE") => void;
}) {
  if (paid <= 0) return <p className="text-xs text-muted">No money was received on this bill.</p>;
  const nonCash = modes.filter((m) => m !== "Cash");
  return (
    <div className="space-y-1.5 rounded-xl bg-cream p-3 text-sm">
      <div className="font-semibold">₹{paid.toLocaleString("en-IN")} was received ({modes.join(", ")}). What happens to it?</div>
      <label className="flex items-start gap-2"><input type="radio" className="mt-1 accent-[var(--color-brand)]" checked={value === "REFUND"} onChange={() => onChange("REFUND")} />
        <span>Give it back to the customer <span className="text-xs text-muted">(recorded as a refund in the same mode, today)</span></span></label>
      <label className={`flex items-start gap-2 ${hasCustomer ? "" : "opacity-50"}`}><input type="radio" disabled={!hasCustomer} className="mt-1 accent-[var(--color-brand)]" checked={value === "ADVANCE"} onChange={() => onChange("ADVANCE")} />
        <span>Keep it as the customer&apos;s advance <span className="text-xs text-muted">{hasCustomer ? "(used for their next bill)" : "(needs a customer on the bill)"}</span></span></label>
      {value === "REFUND" && nonCash.length > 0 && (
        <p className="text-xs text-amber-800">⚠️ {nonCash.join(" / ")} money must be sent back from your UPI / bank / Razorpay app. This app only records the refund.</p>
      )}
    </div>
  );
}

export function CancelPanel({ orderId, status, cancelStatus, canApprove, paid = 0, payModes = [], hasCustomer = false }: {
  orderId: number; status: string; cancelStatus: string; canApprove: boolean; paid?: number; payModes?: string[]; hasCustomer?: boolean;
}) {
  const [mode, setMode] = useState<"" | "request" | "decide">("");
  const [money, setMoney] = useState<"REFUND" | "ADVANCE">("REFUND");
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => {
    setErr(""); const r = await fn();
    if (!r.ok) setErr(r.error ?? "Failed"); else { setMode(""); setText(""); router.refresh(); }
  });
  if (status === "CANCELLED") {
    if (canApprove && paid > 0) return (
      <div className="space-y-2">
        <p className="text-sm font-semibold text-red-700">This bill is cancelled but ₹{paid.toLocaleString("en-IN")} received on it is still counted.</p>
        <MoneyChoice paid={paid} modes={payModes} hasCustomer={hasCustomer} value={money} onChange={setMoney} />
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={pending} onClick={() => run(() => settleCancelledMoneyAction(orderId, money))}>{money === "REFUND" ? "Record refund" : "Move to customer's advance"}</button>
          <button className="btn-ghost" disabled={pending} onClick={() => confirm("Restore this bill? It will count in sales and stock again.") && run(() => setStatusAction(orderId, "ACTIVE"))}>Restore bill instead</button>
        </div>
        {err && <p className="text-sm text-red-700">{err}</p>}
      </div>
    );
    return canApprove ? <button className="btn-ghost" disabled={pending} onClick={() => confirm("Restore this bill? It will count in sales and stock again. If its number was given to another bill, it gets a new number. Money refunded earlier is not added back - take payment again.") && run(() => setStatusAction(orderId, "ACTIVE"))}>Restore bill</button> : null;
  }
  if (cancelStatus === "REQUESTED") {
    if (!canApprove) return <p className="text-sm text-amber-800">Waiting for the owner to approve the cancellation.</p>;
    return (
      <div className="space-y-2">
        <MoneyChoice paid={paid} modes={payModes} hasCustomer={hasCustomer} value={money} onChange={setMoney} />
        <textarea className="input min-h-16" placeholder="Note (optional)" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <button className="btn-danger" disabled={pending} onClick={() => run(() => decideCancelAction(orderId, true, text, money))}>✓ Approve cancellation</button>
          <button className="btn-ghost" disabled={pending} onClick={() => run(() => decideCancelAction(orderId, false, text))}>✕ Reject - keep the bill</button>
        </div>
        {err && <p className="text-sm text-red-700">{err}</p>}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {mode === "" ? (
        <button className={canApprove ? "btn-danger" : "btn-ghost"} onClick={() => setMode("request")}>{canApprove ? "Cancel bill" : "Request cancellation"}</button>
      ) : (
        <div className="space-y-2 rounded-xl border border-line p-3">
          <label className="label">Reason for cancelling *</label>
          <textarea className="input min-h-20" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. customer cancelled, wrong order entered, duplicate bill" />
          {!canApprove && <p className="text-xs text-muted">The bill stays active until the owner approves. The owner decides whether money received is refunded or kept as advance.</p>}
          {canApprove && <MoneyChoice paid={paid} modes={payModes} hasCustomer={hasCustomer} value={money} onChange={setMoney} />}
          <div className="flex gap-2">
            <button className="btn-primary" disabled={pending} onClick={() => run(() => canApprove ? setStatusAction(orderId, "CANCELLED", text, money) : requestCancelAction(orderId, text))}>
              {pending ? "…" : canApprove ? "Cancel bill now" : "Send request"}
            </button>
            <button className="btn-ghost" onClick={() => { setMode(""); setErr(""); }}>Back</button>
          </div>
        </div>
      )}
      {err && <p className="text-sm text-red-700">{err}</p>}
    </div>
  );
}

/** Razorpay payment link for the amount due */
export function PayLinkPanel({ orderId, link, linkStatus, due, phone, restaurant, billNo, via = "" }: {
  orderId: number; link: string; linkStatus: string; due: number; phone: string; restaurant: string; billNo: string; via?: string;
}) {
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [url, setUrl] = useState(link);
  const [mob, setMob] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const typed = mob.replace(/\D/g, "").slice(-10);
  const p = typed.length === 10 ? typed : phone.replace(/\D/g, "");
  const wa = (u: string) => `https://wa.me/${p.length === 10 ? "91" + p : p}?text=${encodeURIComponent(`${restaurant} - Bill ${billNo}\nAmount due: ₹${due}\nPay online (UPI / card / net banking): ${u}`)}`;
  return (
    <div className="space-y-2 rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">💳 Online payment link{via ? ` · ${via}` : ""}</span>
        {linkStatus && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${["paid", "PAID", "Completed"].includes(linkStatus) ? "bg-emerald-100 text-emerald-800" : "bg-gold-light text-ink"}`}>{linkStatus}</span>}
      </div>
      {url && <div className="break-all rounded-lg bg-cream px-2 py-1 font-mono text-xs">{url}</div>}
      {due > 0 && (
        <label className="block text-xs text-muted">Customer mobile <span className="font-normal">(optional - pre-fills the payment page; leave empty and the customer types it there)</span>
          <input className="input mt-1 max-w-56" inputMode="numeric" maxLength={14} placeholder="10-digit mobile" value={mob} onChange={(e) => setMob(e.target.value)} />
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {due > 0 && (
          <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={() => start(async () => {
            setMsg(null);
            const r = await createPayLinkAction(orderId, mob);
            if (!r.ok) return setMsg({ ok: false, t: r.error });
            setUrl(r.data!); setMsg(r.warning ? { ok: false, t: `Link ready. ⚠ ${r.warning}` } : { ok: true, t: "Link ready - share it with the customer." }); router.refresh();
          })}>{url ? "New link for ₹" + due : `Create link for ₹${due}`}</button>
        )}
        {url && due > 0 && <a className="btn-ghost btn-sm" href={wa(url)} target="_blank" rel="noreferrer">Send on WhatsApp</a>}
        {url && <button type="button" className="btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(url).then(() => setMsg({ ok: true, t: "Copied." }))}>Copy</button>}
        {url && (
          <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => {
            const r = await checkPayLinkAction(orderId);
            setMsg(r.ok ? { ok: true, t: r.data === "paid" ? "Paid ✓ - payment recorded." : `Status: ${r.data}` } : { ok: false, t: r.error });
            router.refresh();
          })}>Check payment</button>
        )}
      </div>
      {msg && <p className={`text-xs ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.t}</p>}
    </div>
  );
}

/** Staff shows a QR on their phone / counter screen for the customer to scan and pay.
 *  - "Card / UPI link" (when a gateway is set up): the gateway's payment page; paid is detected automatically.
 *  - "Our UPI QR": any UPI app pays straight to the restaurant; staff tap "Received" after checking. */
const upiId = (t: string) => { try { return new URL(t.replace("upi://", "https://x/")).searchParams.get("pa") ?? ""; } catch { return ""; } };
type QrActions = {
  create: (orderId: number) => Promise<{ ok: true; data?: string } | { ok: false; error: string }>;
  check: (orderId: number) => Promise<{ ok: true; data?: string } | { ok: false; error: string }>;
  receive: (orderId: number, amount: number, mode: string, date: string) => Promise<{ ok: true } | { ok: false; error: string }>;
};
export function CollectQr({ orderId, due: dueNow, gateway, upiText, qrImage, upiMode, today, restaurant, billNo, actions, label, staticQr = "" }: {
  orderId: number; due: number; gateway: string; upiText: string; qrImage: string; upiMode: string; today: string; restaurant: string; billNo: string;
  /** the Delivery tab passes its own actions (delivery staff may not have the Orders tab) */
  actions?: QrActions; label?: string;
  /** an uploaded "static" QR picture to offer as its own tab next to the gateway QR (Delivery tab) */
  staticQr?: string;
}) {
  const act: QrActions = actions ?? { create: (id) => createPayLinkAction(id), check: checkPayLinkAction, receive: addPaymentAction };
  const [open, setOpen] = useState(false);
  // amount + UPI QR frozen while the QR is showing (the bill page updates underneath when it's paid)
  const [due, setDue] = useState(dueNow);
  const [snap, setSnap] = useState({ upiText, qrImage });
  // with a gateway only its QR is shown (paid is detected by itself); our own UPI QR only when there's no gateway
  const [tab, setTab] = useState<"link" | "upi">(gateway ? "link" : "upi");
  const both = !!gateway && !!staticQr; // gateway QR + the restaurant's own QR picture
  const [img, setImg] = useState("");
  const [url, setUrl] = useState("");
  const [state, setState] = useState<"" | "loading" | "waiting" | "paid" | "error">("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const alive = useRef(false);

  // make (or reuse) the gateway link and draw its QR
  useEffect(() => {
    if (!open) return;
    alive.current = true;
    setErr(""); setImg("");
    if (tab === "upi") {
      if (both) setImg(staticQr);
      else if (snap.upiText) QRCode.toDataURL(snap.upiText, { width: 520, margin: 1 }).then(setImg);
      else if (snap.qrImage) setImg(snap.qrImage);
      setState("");
      return () => { alive.current = false; };
    }
    setState("loading");
    act.create(orderId).then(async (r) => {
      if (!alive.current) return;
      if (!r.ok) { setState("error"); setErr(r.error); return; }
      setUrl(r.data!); setImg(await QRCode.toDataURL(r.data!, { width: 520, margin: 1 })); setState("waiting");
    });
    return () => { alive.current = false; };
  }, [open, tab, orderId, snap, both, staticQr]);

  // watch for the payment every 4 seconds
  useEffect(() => {
    if (!open || tab !== "link" || state !== "waiting") return;
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const r = await act.check(orderId);
      if (r.ok && r.data === "paid" && alive.current) setState("paid"); // page refreshes when the modal is closed
    }, 4000);
    return () => clearInterval(t);
  }, [open, tab, state, orderId]);

  if (dueNow <= 0 && !open) return null;
  const waText = `${restaurant} - Bill ${billNo}\nAmount due: ₹${due}\nPay here: ${url}`;
  return (
    <>
      <button type="button" className="btn-primary btn-sm" onClick={() => { setDue(dueNow); setSnap({ upiText, qrImage }); setState(""); setOpen(true); }}>{label ?? "📱 Show QR to scan"} · ₹{dueNow}</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" role="dialog" aria-label="Scan to pay">
          <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-4 text-center">
            <div className="flex items-center justify-between">
              <b>Bill {billNo}</b>
              <button type="button" className="btn-ghost btn-sm" onClick={() => { setOpen(false); setState(""); router.refresh(); }}>Close</button>
            </div>
            {both && (
              <div className="inline-flex overflow-hidden rounded-full border border-line text-xs font-semibold">
                <button type="button" className={`px-3 py-1.5 ${tab === "link" ? "bg-brand text-white" : ""}`} onClick={() => { setState(""); setTab("link"); }}>{gateway} QR</button>
                <button type="button" className={`px-3 py-1.5 ${tab === "upi" ? "bg-brand text-white" : ""}`} onClick={() => { setState(""); setTab("upi"); }}>Our QR (static)</button>
              </div>
            )}
            {/* which QR this is, so staff know whether to check their UPI app */}
            {both && tab === "upi" ? <div className="inline-block rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">Static QR (your uploaded QR) · customer types the amount</div>
              : gateway ? <div className="inline-block rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">{gateway} QR · payment checked automatically</div>
              : snap.qrImage && !snap.upiText ? <div className="inline-block rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">Static QR (your uploaded QR) · customer types the amount</div>
              : <div className="inline-block rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">UPI QR{upiId(snap.upiText) ? ` · ${upiId(snap.upiText)}` : ""} · amount filled in</div>}
            <div className="text-3xl font-bold tabular-nums">₹{due}</div>
            {state === "paid" ? (
              <div className="rounded-xl bg-emerald-50 py-10 text-emerald-800"><div className="text-5xl">✓</div><div className="mt-2 text-lg font-bold">Paid - recorded on the bill</div></div>
            ) : state === "loading" ? <p className="py-24 text-sm text-muted">Getting the payment QR…</p>
              : state === "error" ? <p className="rounded-lg bg-red-50 px-3 py-6 text-sm text-red-700">{err}</p>
              : img ? <img src={img} alt="Scan to pay" className="mx-auto aspect-square w-full max-w-[300px] object-contain" /> : <p className="py-10 text-sm text-muted">No UPI ID or QR saved in Settings.</p>}
            {tab === "link" && state === "waiting" && (
              <>
                <p className="text-xs text-muted">Customer scans with the <b>phone camera</b> (or Google Lens) and pays by UPI, card or net banking. <span className="text-emerald-700">This screen turns green by itself when paid.</span></p>
                <div className="flex justify-center gap-2">
                  <a className="btn-ghost btn-sm" href={`https://wa.me/?text=${encodeURIComponent(waText)}`} target="_blank" rel="noreferrer">Send on WhatsApp</a>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(url)}>Copy link</button>
                </div>
              </>
            )}
            {tab === "upi" && img && state !== "paid" && (
              <>
                <p className="text-xs text-muted">Customer scans with <b>any UPI app</b> (GPay, PhonePe, Paytm, BHIM){snap.upiText && !both ? " - the amount is filled in" : " and types the amount"}. Check your UPI app, then:</p>
                <button type="button" className="btn-primary w-full" disabled={pending} onClick={() => start(async () => {
                  setErr(""); const r = await act.receive(orderId, due, upiMode, today);
                  if (!r.ok) setErr(r.error); else setState("paid");
                })}>{pending ? "Saving…" : `✓ Received ₹${due} by UPI`}</button>
                {err && <p className="text-xs text-red-700">{err}</p>}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const FLOW: { k: "PENDING" | "READY" | "DELIVERED"; label: string }[] = [
  { k: "PENDING", label: "Pending" }, { k: "READY", label: "Ready" }, { k: "DELIVERED", label: "Delivered" },
];
/** Pre-order progress buttons */
export function FulfilButtons({ orderId, status, compact = false }: { orderId: number; status: string; compact?: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const router = useRouter();
  return (
    <div>
      <div className="inline-flex overflow-hidden rounded-full border border-line text-xs font-semibold">
        {FLOW.map((f) => (
          <button type="button" key={f.k} disabled={pending} aria-pressed={status === f.k}
            className={`${compact ? "px-2 py-1" : "px-3 py-1.5"} ${status === f.k ? (f.k === "DELIVERED" ? "bg-emerald-600 text-white" : f.k === "READY" ? "bg-gold text-ink" : "bg-brand text-white") : "bg-white"}`}
            onClick={() => start(async () => { setErr(""); const r = await setFulfilAction(orderId, f.k); if (!r.ok) setErr(r.error); else router.refresh(); })}>{f.label}</button>
        ))}
      </div>
      {err && <p className="mt-1 text-xs text-red-700">{err}</p>}
    </div>
  );
}
