"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCashClosingAction } from "@/app/actions/ops";

const inr = (n: number) => (n < 0 ? "−" : "") + "₹" + Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
export function CashForm({ date, cashIn, cashOut, opening, actual, notes }: { date: string; cashIn: number; cashOut: number; opening: number; actual: number | null; notes: string }) {
  const [op, setOp] = useState(String(opening));
  const [ac, setAc] = useState(actual == null ? "" : String(actual));
  const [nt, setNt] = useState(notes);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const expected = (Number(op) || 0) + cashIn - cashOut;
  const diff = ac === "" ? null : Number(ac) - expected;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Opening cash in drawer</label><input className="input" type="number" inputMode="decimal" value={op} onChange={(e) => setOp(e.target.value)} /></div>
        <div><label className="label">Actual cash counted now</label><input className="input" type="number" inputMode="decimal" value={ac} onChange={(e) => setAc(e.target.value)} placeholder="count the drawer" /></div>
      </div>
      <dl className="space-y-1 rounded-xl bg-cream p-3 text-sm">
        <div className="flex justify-between"><dt>+ Cash received (orders & dues)</dt><dd className="tabular-nums">{inr(cashIn)}</dd></div>
        <div className="flex justify-between"><dt>− Cash paid out (expenses & vendors)</dt><dd className="tabular-nums">{inr(cashOut)}</dd></div>
        <div className="flex justify-between border-t border-line pt-1 font-bold"><dt>Should be in drawer</dt><dd className="tabular-nums">{inr(expected)}</dd></div>
        {diff != null && <div className={`flex justify-between font-bold ${Math.abs(diff) < 1 ? "text-emerald-700" : "text-red-700"}`}><dt>{Math.abs(diff) < 1 ? "✓ Matches" : diff > 0 ? "Extra cash" : "Cash short"}</dt><dd className="tabular-nums">{inr(diff)}</dd></div>}
      </dl>
      <div><label className="label">Notes</label><input className="input" value={nt} onChange={(e) => setNt(e.target.value)} placeholder="e.g. ₹500 taken for gas" /></div>
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.t}</p>}
      <button className="btn-primary w-full" disabled={pending || ac === ""} onClick={() => start(async () => {
        const r = await saveCashClosingAction(date, Number(op) || 0, Number(ac), nt);
        setMsg(r.ok ? { ok: true, t: "Day closed and saved." } : { ok: false, t: r.error });
        if (r.ok) router.refresh();
      })}>{pending ? "Saving…" : "Close the day"}</button>
    </div>
  );
}
