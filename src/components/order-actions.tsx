"use client";
import { useState, useTransition } from "react";
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
  const [pending, start] = useTransition();
  const router = useRouter();
  const p = phone.replace(/\D/g, "");
  const wa = (u: string) => `https://wa.me/${p.length === 10 ? "91" + p : p}?text=${encodeURIComponent(`${restaurant} - Bill ${billNo}\nAmount due: ₹${due}\nPay online (UPI / card / net banking): ${u}`)}`;
  return (
    <div className="space-y-2 rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">💳 Online payment link{via ? ` · ${via}` : ""}</span>
        {linkStatus && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${["paid", "PAID", "Completed"].includes(linkStatus) ? "bg-emerald-100 text-emerald-800" : "bg-gold-light text-ink"}`}>{linkStatus}</span>}
      </div>
      {url && <div className="break-all rounded-lg bg-cream px-2 py-1 font-mono text-xs">{url}</div>}
      <div className="flex flex-wrap gap-2">
        {due > 0 && (
          <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={() => start(async () => {
            setMsg(null);
            const r = await createPayLinkAction(orderId);
            if (!r.ok) return setMsg({ ok: false, t: r.error });
            setUrl(r.data!); setMsg({ ok: true, t: "Link ready - share it with the customer." }); router.refresh();
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
