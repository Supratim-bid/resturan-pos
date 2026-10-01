"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { settleReimbursementAction, unsettleReimbursementAction } from "@/app/actions/reimburse";

/** "Mark repaid" for one person: pick how you repaid them, then settle all they're owed. */
export function SettleButton({ paidFrom, name, amount }: { paidFrom: string; name: string; amount: number }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("Cash");
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!open) return <button className="btn-primary btn-sm" onClick={() => setOpen(true)}>Mark repaid</button>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <select className="input !w-auto !py-1 text-sm" value={mode} onChange={(e) => setMode(e.target.value)}>
        <option>Cash</option><option>UPI</option><option>Bank transfer</option>
      </select>
      <button className="btn-primary btn-sm" disabled={pending} onClick={() => start(async () => {
        const r = await settleReimbursementAction(paidFrom, name, mode);
        if (!r.ok) { alert(r.error); return; }
        setOpen(false); router.refresh();
      })}>{pending ? "Saving…" : `Repaid ₹${amount.toLocaleString("en-IN")}`}</button>
      <button className="btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
    </span>
  );
}

export function UndoSettle({ id }: { id: number }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <button className="text-xs text-brand underline" disabled={pending} onClick={() => start(async () => { await unsettleReimbursementAction(id); router.refresh(); })}>Undo</button>;
}
