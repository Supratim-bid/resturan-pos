"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { receivePaymentAction } from "@/app/actions/orders";

export function ReceivePayment({ customerId, due, modes, today }: { customerId: number; due: number; modes: string[]; today: string }) {
  const [amt, setAmt] = useState(due > 0 ? String(due) : "");
  const [mode, setMode] = useState(modes[0] ?? "Cash");
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form className="grid grid-cols-2 gap-2" onSubmit={(e) => {
      e.preventDefault(); setMsg(null);
      start(async () => {
        const r = await receivePaymentAction(customerId, Number(amt), mode, date, notes);
        if (!r.ok) setMsg({ ok: false, t: r.error }); else { setMsg({ ok: true, t: "Payment saved and adjusted against oldest bills." }); setAmt(""); setNotes(""); router.refresh(); }
      });
    }}>
      <div><label className="label">Amount ₹</label><input className="input" type="number" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} /></div>
      <div><label className="label">Mode</label><select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>{modes.map((m) => <option key={m}>{m}</option>)}</select></div>
      <div><label className="label">Date</label><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <div><label className="label">Note</label><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. weekly settle" /></div>
      <button className="btn-primary col-span-2" disabled={pending}>{pending ? "Saving…" : "Receive payment"}</button>
      {msg && <p className={`col-span-2 text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.t}</p>}
      <p className="col-span-2 text-[11px] text-muted">The amount is applied to the oldest unpaid bills first; any extra is kept as advance.</p>
    </form>
  );
}
