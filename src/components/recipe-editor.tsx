"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveRecipeAction, deleteRecipeAction, type RecipeInput } from "@/app/actions/recipes";

type Ing = { id: number; name: string; unit: string; effRate: number; category: string };
type Pack = { id: number; name: string; perPiece: number };
type Comp = { id: number; name: string; foodPerPlate: number };
const UNITS: Record<string, [string, number]> = { kg: ["kg", 1], g: ["kg", 0.001], litre: ["litre", 1], ml: ["litre", 0.001], pcs: ["pcs", 1], dozen: ["pcs", 12], packet: ["packet", 1], bunch: ["bunch", 1] };
const conv = (q: number, u: string, s: string) => { const a = UNITS[u || s], b = UNITS[s]; return a && b && a[0] === b[0] ? (q * a[1]) / b[1] : null; };
const compat = (s: string) => Object.keys(UNITS).filter((u) => UNITS[u][0] === UNITS[s]?.[0]);
const inr = (n: number, d = 2) => (n < 0 ? "−" : "") + "₹" + Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });

export function RecipeEditor({ menuItemId, dish, price, initial, ingredients, packs, comps, multiplier, commission, exists }: {
  menuItemId: number; dish: string; price: number; initial: RecipeInput; ingredients: Ing[]; packs: Pack[]; comps: Comp[];
  multiplier: number; commission: number; exists: boolean;
}) {
  const [r, setR] = useState<RecipeInput>(() => ({
    ...initial,
    lines: initial.lines.length ? initial.lines : [{ ingredientId: 0, qty: 0, unit: "" }],
  }));
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const im = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const pm = useMemo(() => new Map(packs.map((p) => [p.id, p])), [packs]);
  const cm = useMemo(() => new Map(comps.map((c) => [c.id, c])), [comps]);

  const lineCost = (l: RecipeInput["lines"][number]) => {
    const i = im.get(l.ingredientId); if (!i || !l.qty) return null;
    const q = conv(l.qty, l.unit, i.unit); return q == null ? NaN : q * i.effRate;
  };
  const ingTotal = r.lines.reduce((s, l) => s + (Number.isFinite(lineCost(l) ?? 0) ? lineCost(l) ?? 0 : 0), 0);
  const misc = (ingTotal * (r.miscPct || 0)) / 100;
  const batch = ingTotal + misc + (r.gasCost || 0);
  const compPP = r.comps.reduce((s, c) => s + (cm.get(c.menuItemId)?.foodPerPlate ?? 0) * (c.qtyPerPlate || 0), 0);
  const foodPP = (r.platesPerBatch > 0 ? batch / r.platesPerBatch : 0) + compPP;
  const packPP = r.packs.reduce((s, p) => s + (pm.get(p.packagingId)?.perPiece ?? 0) * (p.qtyPerPlate || 0), 0);
  const total = foodPP + packPP;
  const suggested = total > 0 ? Math.ceil((total * multiplier) / 5) * 5 : 0;

  const upd = <K extends keyof RecipeInput>(k: K, v: RecipeInput[K]) => setR((s) => ({ ...s, [k]: v }));
  const updLine = (i: number, patch: Partial<RecipeInput["lines"][number]>) => upd("lines", r.lines.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const nIn = (v: number, on: (n: number) => void, ph = "0") => (
    <input className="input !py-1.5 text-right" type="number" inputMode="decimal" min={0} step="any" value={v || ""} placeholder={ph} onChange={(e) => on(Number(e.target.value) || 0)} />
  );
  const grouped = useMemo(() => {
    const g = new Map<string, Ing[]>();
    for (const i of ingredients) { if (!g.has(i.category)) g.set(i.category, []); g.get(i.category)!.push(i); }
    return [...g];
  }, [ingredients]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <section className="card grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div><label className="label">Plates made *</label>{nIn(r.platesPerBatch, (n) => upd("platesPerBatch", n), "e.g. 8")}</div>
          <div><label className="label">Gas for batch ₹</label>{nIn(r.gasCost, (n) => upd("gasCost", n))}</div>
          <div><label className="label">Misc. items %</label>{nIn(r.miscPct, (n) => upd("miscPct", n))}</div>
          <div><label className="label">Portion / plate</label><input className="input !py-1.5" value={r.portion} placeholder="e.g. 250 g" onChange={(e) => upd("portion", e.target.value)} /></div>
        </section>

        <section className="card">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-brand">Ingredients for one batch</h2>
          <div className="space-y-2">
            {r.lines.map((l, k) => {
              const ing = im.get(l.ingredientId); const c = lineCost(l);
              return (
                <div key={k} className="grid grid-cols-[1fr_76px_74px_32px] items-center gap-1.5 sm:grid-cols-[1fr_90px_80px_90px_32px]">
                  <select className="input !py-1.5 !text-sm" value={l.ingredientId || ""} onChange={(e) => { const i = im.get(Number(e.target.value)); updLine(k, { ingredientId: Number(e.target.value), unit: i ? (i.unit === "kg" ? "g" : i.unit === "litre" ? "ml" : i.unit) : "" }); }}>
                    <option value="">Ingredient…</option>
                    {grouped.map(([g, list]) => <optgroup key={g} label={g}>{list.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</optgroup>)}
                  </select>
                  {nIn(l.qty, (n) => updLine(k, { qty: n }), "qty")}
                  <select className="input !px-1.5 !py-1.5 !text-sm" value={l.unit} onChange={(e) => updLine(k, { unit: e.target.value })}>
                    {(ing ? compat(ing.unit) : Object.keys(UNITS)).map((u) => <option key={u}>{u}</option>)}
                  </select>
                  <div className="col-span-3 -mt-1 text-right text-xs tabular-nums text-muted sm:col-span-1 sm:mt-0 sm:text-sm sm:text-ink">
                    {c == null ? "" : Number.isNaN(c) ? <span className="text-red-600">unit?</span> : inr(c)}
                    {ing && <span className="ml-1 text-[10px] text-muted sm:hidden">@ {inr(ing.effRate)}/{ing.unit}</span>}
                  </div>
                  <button type="button" className="row-start-1 col-start-4 h-8 w-8 rounded-lg text-lg text-muted hover:bg-red-50 hover:text-red-600 sm:col-start-5" onClick={() => upd("lines", r.lines.filter((_, j) => j !== k))}>×</button>
                </div>
              );
            })}
          </div>
          <button type="button" className="btn-ghost btn-sm mt-3" onClick={() => upd("lines", [...r.lines, { ingredientId: 0, qty: 0, unit: "g" }])}>+ Add ingredient</button>
          <div className="mt-3 space-y-0.5 border-t border-line pt-2 text-sm">
            <div className="flex justify-between"><span>Ingredients</span><span className="tabular-nums">{inr(ingTotal)}</span></div>
            {misc > 0 && <div className="flex justify-between"><span>Misc. {r.miscPct}%</span><span className="tabular-nums">{inr(misc)}</span></div>}
            {r.gasCost > 0 && <div className="flex justify-between"><span>Gas</span><span className="tabular-nums">{inr(r.gasCost)}</span></div>}
            <div className="flex justify-between font-bold"><span>Batch cost</span><span className="tabular-nums">{inr(batch)}</span></div>
          </div>
        </section>

        <section className="card">
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-brand">Thali / combo parts (optional)</h2>
          <p className="mb-2 text-xs text-muted">For a thali: add the dishes it contains and how much of a plate each is (1 = full plate, 0.5 = half).</p>
          {r.comps.map((c, k) => (
            <div key={k} className="mb-2 grid grid-cols-[1fr_80px_32px] gap-1.5">
              <select className="input !py-1.5 !text-sm" value={c.menuItemId || ""} onChange={(e) => upd("comps", r.comps.map((x, j) => (j === k ? { ...x, menuItemId: Number(e.target.value) } : x)))}>
                <option value="">Dish…</option>{comps.filter((d) => d.id !== menuItemId).map((d) => <option key={d.id} value={d.id}>{d.name} ({inr(d.foodPerPlate)}/plate)</option>)}
              </select>
              {nIn(c.qtyPerPlate, (n) => upd("comps", r.comps.map((x, j) => (j === k ? { ...x, qtyPerPlate: n } : x))), "1")}
              <button type="button" className="h-8 w-8 rounded-lg text-lg text-muted hover:bg-red-50" onClick={() => upd("comps", r.comps.filter((_, j) => j !== k))}>×</button>
            </div>
          ))}
          <button type="button" className="btn-ghost btn-sm" onClick={() => upd("comps", [...r.comps, { menuItemId: 0, qtyPerPlate: 1 }])}>+ Add dish part</button>
        </section>

        <section className="card">
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-brand">Packaging per plate</h2>
          <p className="mb-2 text-xs text-muted">Counted for delivery / takeaway orders (not dine-in).</p>
          {r.packs.map((p, k) => (
            <div key={k} className="mb-2 grid grid-cols-[1fr_80px_32px] gap-1.5">
              <select className="input !py-1.5 !text-sm" value={p.packagingId || ""} onChange={(e) => upd("packs", r.packs.map((x, j) => (j === k ? { ...x, packagingId: Number(e.target.value) } : x)))}>
                <option value="">Packaging…</option>{packs.map((d) => <option key={d.id} value={d.id}>{d.name} ({inr(d.perPiece)})</option>)}
              </select>
              {nIn(p.qtyPerPlate, (n) => upd("packs", r.packs.map((x, j) => (j === k ? { ...x, qtyPerPlate: n } : x))), "1")}
              <button type="button" className="h-8 w-8 rounded-lg text-lg text-muted hover:bg-red-50" onClick={() => upd("packs", r.packs.filter((_, j) => j !== k))}>×</button>
            </div>
          ))}
          <button type="button" className="btn-ghost btn-sm" onClick={() => upd("packs", [...r.packs, { packagingId: 0, qtyPerPlate: 1 }])}>+ Add packaging</button>
        </section>

        <section className="card space-y-3">
          <div><label className="label">Method / steps</label><textarea className="input min-h-32" value={r.method} onChange={(e) => upd("method", e.target.value)} /></div>
          <div><label className="label">Taste notes / changes</label><textarea className="input min-h-20" value={r.tasteNotes} onChange={(e) => upd("tasteNotes", e.target.value)} /></div>
          <div><label className="label">Made by / chef</label><input className="input" value={r.madeBy} onChange={(e) => upd("madeBy", e.target.value)} /></div>
        </section>
      </div>

      {/* mobile floating summary */}
      <div className="fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-30 px-3 lg:hidden">
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-ink px-4 py-2.5 text-white shadow-xl">
          <div className="text-xs leading-tight"><div>Cost/plate <b className="text-sm">{inr(total)}</b></div><div className="text-white/70">Suggested <b className="text-turmeric">{inr(suggested, 0)}</b> · Menu {inr(price, 0)}</div></div>
          <button className="rounded-xl bg-turmeric px-4 py-2 text-sm font-bold text-ink" disabled={pending} onClick={() => start(async () => {
            setMsg(null);
            const res = await saveRecipeAction(menuItemId, r);
            setMsg(res.ok ? { ok: true, t: "Saved. Menu cost updated." } : { ok: false, t: res.error! });
            if (res.ok) router.refresh(); else alert(res.error);
          })}>{pending ? "…" : "Save"}</button>
        </div>
      </div>
      <aside>
        <div className="card sticky top-20 space-y-1.5 text-sm lg:top-6">
          <h2 className="mb-1 font-bold">{dish}</h2>
          <div className="flex justify-between"><span>Food cost / plate</span><b className="tabular-nums">{inr(foodPP)}</b></div>
          <div className="flex justify-between"><span>Packaging / plate</span><b className="tabular-nums">{inr(packPP)}</b></div>
          <div className="flex justify-between rounded-lg bg-amber-50 px-2 py-1.5 text-base"><span className="font-bold">Total cost / plate</span><b className="tabular-nums text-brand">{inr(total)}</b></div>
          <div className="flex justify-between rounded-lg bg-emerald-50 px-2 py-1.5 text-base"><span className="font-bold">Suggested price ({multiplier}×)</span><b className="tabular-nums text-emerald-700">{inr(suggested, 0)}</b></div>
          <div className="flex justify-between"><span>Menu price</span><b>{inr(price, 0)}</b></div>
          {total > 0 && price > 0 && <>
            <div className="flex justify-between"><span>Profit / plate (dine-in)</span><b className="tabular-nums">{inr(price - foodPP)}</b></div>
            <div className="flex justify-between"><span>Profit / plate (delivery)</span><b className="tabular-nums">{inr(price - total)}</b></div>
            <div className="flex justify-between"><span>On Swiggy/Zomato ({commission}% comm.)</span><b className={`tabular-nums ${price * (1 - commission / 100) - total < 0 ? "text-red-700" : ""}`}>{inr(price * (1 - commission / 100) - total)}</b></div>
            <div className="flex justify-between"><span>Cost % of price</span><b>{((total / price) * 100).toFixed(1)}%</b></div>
            <div className={`rounded-lg px-2 py-1.5 text-center text-sm font-bold ${price >= suggested ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              {price >= suggested ? "✓ Price meets your target" : `⚠ Below target by ${inr(suggested - price, 0)}`}
            </div>
          </>}
          {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.t}</p>}
          <button className="btn-primary mt-2 w-full" disabled={pending} onClick={() => start(async () => {
            setMsg(null);
            const res = await saveRecipeAction(menuItemId, r);
            setMsg(res.ok ? { ok: true, t: "Saved. Menu cost updated." } : { ok: false, t: res.error! });
            if (res.ok) router.refresh();
          })}>{pending ? "Saving…" : "Save recipe"}</button>
          {exists && <button className="btn-danger btn-sm w-full" onClick={() => confirm("Delete this recipe?") && start(async () => { await deleteRecipeAction(menuItemId); router.push("/recipes"); })}>Delete recipe</button>}
        </div>
      </aside>
    </div>
  );
}
