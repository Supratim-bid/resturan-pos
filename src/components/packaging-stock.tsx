"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPackagingStockAction, countPackagingAction } from "@/app/actions/stock";
import { Modal } from "./crud";

export type PackStockRow = { id: number; name: string; imageId: number | null; piecesPerPack: number; packPrice: number; stock: number; tracked: boolean; reorderLevel: number | null; usedLast30: number };

const fmt = (n: number) => n.toLocaleString("en-IN");

export function PackagingStock({ rows, modes, today }: { rows: PackStockRow[]; modes: string[]; today: string }) {
  const [add, setAdd] = useState<PackStockRow | null>(null);
  const [count, setCount] = useState<PackStockRow | null>(null);
  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="tbl">
          <thead><tr><th>Item</th><th className="!text-right">In stock (pcs)</th><th className="!text-right">Used · 30 days</th><th className="!text-right">Alert at</th><th /></tr></thead>
          <tbody>{rows.map((r) => {
            const low = r.tracked && r.reorderLevel != null && r.stock <= r.reorderLevel;
            return (
              <tr key={r.id}>
                <td><div className="flex items-center gap-2">
                  {r.imageId ? <img src={`/img/${r.imageId}`} alt="" className="h-9 w-9 rounded-lg object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-light/60">📦</span>}
                  <span className="font-medium">{r.name}</span></div></td>
                <td className="num">{r.tracked ? <b className={low || r.stock < 0 ? "text-red-700" : ""}>{fmt(r.stock)}</b> : <span className="text-xs text-muted">not counted yet</span>}
                  {low && <span className="ml-1 rounded-full bg-red-100 px-1.5 text-[10px] font-bold text-red-700">LOW</span>}</td>
                <td className="num">{fmt(r.usedLast30)}</td>
                <td className="num">{r.reorderLevel ?? "—"}</td>
                <td className="whitespace-nowrap text-right">
                  <button className="btn-ghost btn-sm" onClick={() => setAdd(r)}>+ Add stock</button>{" "}
                  <button className="btn-ghost btn-sm" onClick={() => setCount(r)}>Count</button>
                </td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <Modal open={!!add} onClose={() => setAdd(null)} title={`Add stock · ${add?.name ?? ""}`}>{add && <AddForm r={add} modes={modes} today={today} done={() => setAdd(null)} />}</Modal>
      <Modal open={!!count} onClose={() => setCount(null)} title={`Count · ${count?.name ?? ""}`}>{count && <CountForm r={count} today={today} done={() => setCount(null)} />}</Modal>
    </div>
  );
}

function AddForm({ r, modes, today, done }: { r: PackStockRow; modes: string[]; today: string; done: () => void }) {
  const [unit, setUnit] = useState<"packs" | "pieces">("packs");
  const [qty, setQty] = useState("1");
  const [date, setDate] = useState(today);
  const [exp, setExp] = useState(true);
  const [amount, setAmount] = useState(String(r.packPrice));
  const [mode, setMode] = useState(modes[0] ?? "Cash");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const pieces = Math.round((Number(qty) || 0) * (unit === "packs" ? Math.max(1, r.piecesPerPack) : 1));
  const setQ = (v: string, u = unit) => { setQty(v); const n = Number(v) || 0; setAmount(String(Math.round((u === "packs" ? n * r.packPrice : n * (r.packPrice / Math.max(1, r.piecesPerPack))) * 100) / 100)); };
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); setErr(""); start(async () => {
      const res = await addPackagingStockAction({ packagingId: r.id, unit, qty: Number(qty), date, addExpense: exp, amount: Number(amount), mode, notes });
      if (!res.ok) setErr(res.error); else { done(); router.refresh(); }
    }); }}>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Bought</label><input className="input" type="number" min={0} step="any" inputMode="decimal" value={qty} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
        <div><label className="label">In</label>
          <select className="input" value={unit} onChange={(e) => { const u = e.target.value as "packs" | "pieces"; setUnit(u); setQ(qty, u); }}>
            <option value="packs">Packs ({r.piecesPerPack} pcs each)</option><option value="pieces">Pieces</option>
          </select></div>
      </div>
      <p className="rounded-lg bg-cream px-3 py-2 text-sm">Adds <b>{fmt(pieces)}</b> pieces · stock becomes <b>{fmt((r.tracked ? r.stock : 0) + pieces)}</b></p>
      <div><label className="label">Date</label><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={exp} onChange={(e) => setExp(e.target.checked)} /> Also add as an expense (category “Packaging”)</label>
      {exp && (
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Amount paid ₹</label><input className="input" type="number" min={0} step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div><label className="label">Paid by</label><select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>{modes.map((m) => <option key={m}>{m}</option>)}</select></div>
        </div>
      )}
      <div><label className="label">Notes</label><input className="input" value={notes} placeholder="e.g. vendor, bill no." onChange={(e) => setNotes(e.target.value)} /></div>
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Saving…" : "Add to stock"}</button>
    </form>
  );
}

function CountForm({ r, today, done }: { r: PackStockRow; today: string; done: () => void }) {
  const [actual, setActual] = useState(r.tracked ? String(Math.max(0, r.stock)) : "");
  const [date, setDate] = useState(today);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); setErr(""); start(async () => {
      const res = await countPackagingAction(r.id, Number(actual), date);
      if (!res.ok) setErr(res.error); else { done(); router.refresh(); }
    }); }}>
      <p className="text-sm text-muted">Count the pieces on the shelf. The app sets stock to exactly this {r.tracked ? `(it now shows ${fmt(r.stock)})` : "and starts tracking from today"}.</p>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Pieces counted</label><input className="input" type="number" min={0} inputMode="numeric" value={actual} onChange={(e) => setActual(e.target.value)} autoFocus /></div>
        <div><label className="label">Date</label><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      </div>
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Saving…" : "Save count"}</button>
    </form>
  );
}
