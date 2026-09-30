"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addMoneyEntryAction, deleteMoneyEntryAction } from "@/app/actions/money";

const TYPES: { k: string; label: string; help: string; account: boolean }[] = [
  { k: "OPENING", label: "Opening balance", help: "Cash in the drawer or money in the bank on the day you start using this", account: true },
  { k: "IN", label: "Money added", help: "Owner put money in, loan received, other income", account: true },
  { k: "OUT", label: "Money taken out", help: "Owner withdrawal, bank charges, anything not entered in Expenses", account: true },
  { k: "DEPOSIT", label: "Cash deposited in bank", help: "Cash moved from the drawer to the bank", account: false },
  { k: "WITHDRAW", label: "Cash withdrawn from bank", help: "Money taken from the bank / ATM into the drawer", account: false },
];

/** Add an opening balance / owner money / cash deposit ... */
export function MoneyEntryForm({ today, startOpen = false }: { today: string; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [v, setV] = useState({ type: "OPENING", account: "CASH", amount: "", date: today, category: "", notes: "" });
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const t = TYPES.find((x) => x.k === v.type)!;
  if (!open) return <button type="button" className="btn-primary btn-sm" onClick={() => setOpen(true)}>+ Add entry</button>;
  return (
    <form className="card w-full space-y-3" onSubmit={(e) => { e.preventDefault(); start(async () => {
      const r = await addMoneyEntryAction(v);
      if (r.ok) { setMsg({ ok: true, t: "Saved." }); setV({ ...v, amount: "", notes: "", category: "" }); router.refresh(); } else setMsg({ ok: false, t: r.error });
    }); }}>
      <div className="flex items-center justify-between"><b>Add a money entry</b><button type="button" className="text-sm text-muted underline" onClick={() => setOpen(false)}>Close</button></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="label" htmlFor="mtype">What is it?</label>
          <select id="mtype" className="input" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>{TYPES.map((x) => <option key={x.k} value={x.k}>{x.label}</option>)}</select>
          <p className="mt-1 text-[11px] text-muted">{t.help}</p></div>
        {t.account && <div><label className="label" htmlFor="macc">Where</label>
          <select id="macc" className="input" value={v.account} onChange={(e) => setV({ ...v, account: e.target.value })}><option value="CASH">Cash (drawer)</option><option value="BANK">Online / Bank</option></select></div>}
        <div><label className="label" htmlFor="mamt">Amount ₹</label><input id="mamt" className="input" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} /></div>
        <div><label className="label" htmlFor="mdate">Date</label><input id="mdate" type="date" className="input" max={today} value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></div>
        {(v.type === "IN" || v.type === "OUT") && <div><label className="label" htmlFor="mcat">Type (optional)</label><input id="mcat" className="input" list="mcats" placeholder={v.type === "IN" ? "e.g. Owner investment" : "e.g. Owner withdrawal"} value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} />
          <datalist id="mcats">{(v.type === "IN" ? ["Owner investment", "Loan received", "Other income"] : ["Owner withdrawal", "Bank charges", "Loan repayment", "Other"]).map((c) => <option key={c} value={c} />)}</datalist></div>}
        <div className="sm:col-span-2"><label className="label" htmlFor="mnote">Note (optional)</label><input id="mnote" className="input" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></div>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.t}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save entry"}</button>
    </form>
  );
}

export function DeleteEntry({ id }: { id: number }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <button type="button" title="Delete this entry" aria-label="Delete entry" className="text-xs text-red-700 underline" disabled={pending}
    onClick={() => { if (confirm("Delete this entry?")) start(async () => { await deleteMoneyEntryAction(id); router.refresh(); }); }}>delete</button>;
}

/** From / to dates */
export function RangePicker({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const [f, setF] = useState(from), [t, setT] = useState(to);
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); router.push(`/money?from=${f}&to=${t}`); }}>
      <div><label className="label" htmlFor="rfrom">From</label><input id="rfrom" type="date" className="input !w-auto !py-1.5" value={f} onChange={(e) => setF(e.target.value)} /></div>
      <div><label className="label" htmlFor="rto">To</label><input id="rto" type="date" className="input !w-auto !py-1.5" value={t} onChange={(e) => setT(e.target.value)} /></div>
      <button className="btn-ghost btn-sm">Show</button>
    </form>
  );
}
