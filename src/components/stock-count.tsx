"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { stockCountAction } from "@/app/actions/stock";
import { Modal } from "./crud";

export function StockCount({ items, today }: { items: { id: number; name: string; unit: string; current: number }[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<number, string>>({});
  const [date, setDate] = useState(today);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}>Enter physical count</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Physical stock count" wide>
        <p className="mb-3 text-sm text-muted">Count what is actually in the kitchen and enter it. Leave blank to skip. The difference is recorded so stock matches your count - big differences mean leakage or wastage.</p>
        <div className="mb-3 w-44"><label className="label">Count date</label><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="divide-y divide-line">
          {items.map((i) => (
            <div key={i.id} className="grid grid-cols-[1fr_90px_110px] items-center gap-2 py-1.5 text-sm">
              <span>{i.name}</span>
              <span className="text-right text-xs text-muted">now {i.current.toLocaleString("en-IN", { maximumFractionDigits: 2 })} {i.unit}</span>
              <input className="input !py-1.5 text-right" type="number" inputMode="decimal" step="any" placeholder={i.unit} value={vals[i.id] ?? ""} onChange={(e) => setVals({ ...vals, [i.id]: e.target.value })} />
            </div>
          ))}
        </div>
        {msg && <p className="mt-2 text-sm text-red-700">{msg}</p>}
        <button className="btn-primary mt-4 w-full" disabled={pending} onClick={() => start(async () => {
          const entries = Object.entries(vals).filter(([, v]) => v !== "").map(([k, v]) => ({ ingredientId: Number(k), actual: Number(v) }));
          const r = await stockCountAction(date, entries);
          if (!r.ok) setMsg(r.error); else { setOpen(false); setVals({}); router.refresh(); }
        })}>{pending ? "Saving…" : "Save count"}</button>
      </Modal>
    </>
  );
}
