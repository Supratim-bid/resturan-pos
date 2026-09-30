"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveOrderAction, quickCustomerAction } from "@/app/actions/orders";
import { Modal } from "./crud";

export type PosDish = { id: number; name: string; price: number; category: string; vegType: string; today: boolean; imageId?: number | null; available?: boolean };
export type PosPack = { id: number; name: string; type: string; price: number; imageId?: number | null; barcode?: string };
export type PosCustomer = { id: number; name: string; phone: string; area: string };
export type PosInitial = {
  id?: number; date: string; customerId: number | null; orderType: string; tableNo: string; notes: string;
  items: { menuItemId: number; qty: number; discount: number }[];
  orderDiscount: number; deliveryCharge: number; packingCharge: number;
  packaging?: { packagingId: number; qty: number }[];
  chargePackaging?: boolean;
  isPreorder?: boolean; mealSlot?: string; slotTime?: string;
};

const SLOT_TIME: Record<string, string> = { breakfast: "08:30", lunch: "13:00", "evening snacks": "17:30", snacks: "17:30", dinner: "20:30" };
const addDay = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const inr = (n: number, d = 0) => (n < 0 ? "−" : "") + "₹" + Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });

function CustomerPicker({ customers, value, onChange, onAdded }: {
  customers: PosCustomer[]; value: number | null; onChange: (id: number | null) => void; onAdded: (c: PosCustomer) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [nc, setNc] = useState({ name: "", phone: "", flat: "", area: "" });
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const cur = customers.find((c) => c.id === value);
  const list = useMemo(() => {
    const s = q.toLowerCase().trim();
    return (s ? customers.filter((c) => (c.name + " " + c.phone + " " + c.area).toLowerCase().includes(s)) : customers).slice(0, 30);
  }, [q, customers]);
  return (
    <div className="relative">
      <label className="label">Customer</label>
      <div className="flex gap-2">
        <input
          className="input"
          placeholder={cur ? cur.name : "Search name / phone / flat…"}
          value={open ? q : cur?.name ?? ""}
          onFocus={() => { setOpen(true); setQ(""); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="button" className="btn-ghost shrink-0" onClick={() => { setAdding(true); setNc({ name: q, phone: "", flat: "", area: "" }); }}>+ New</button>
      </div>
      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-line bg-white shadow-lg">
          <button type="button" className="block w-full px-3 py-2 text-left text-sm text-muted hover:bg-cream" onMouseDown={() => onChange(null)}>No customer (walk-in)</button>
          {list.map((c) => (
            <button type="button" key={c.id} className="block w-full px-3 py-2 text-left text-sm hover:bg-cream" onMouseDown={() => onChange(c.id)}>
              <span className="font-medium">{c.name}</span> <span className="text-xs text-muted">{c.phone} {c.area}</span>
            </button>
          ))}
          {!list.length && <div className="px-3 py-2 text-sm text-muted">No match - tap “+ New”</div>}
        </div>
      )}
      <Modal open={adding} onClose={() => setAdding(false)} title="New customer">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className="label">Name *</label><input className="input" value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} /></div>
          <div className="col-span-2"><label className="label">Phone</label><input className="input" type="tel" value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} /></div>
          <div><label className="label">Flat / House</label><input className="input" value={nc.flat} onChange={(e) => setNc({ ...nc, flat: e.target.value })} /></div>
          <div><label className="label">Society / Area</label><input className="input" value={nc.area} onChange={(e) => setNc({ ...nc, area: e.target.value })} /></div>
        </div>
        {err && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        <button className="btn-primary mt-4 w-full" disabled={pending} onClick={() => start(async () => {
          setErr("");
          const r = await quickCustomerAction(nc);
          if (!r.ok) return setErr(r.error);
          const c = { id: r.data!.id, name: r.data!.label, phone: nc.phone, area: nc.area };
          onAdded(c); onChange(c.id); setAdding(false);
        })}>{pending ? "Saving…" : "Save customer"}</button>
      </Modal>
    </div>
  );
}

export function Pos({
  dishes, customers: initialCustomers, orderTypes, payModes, gstRate, defaults, initial, today, canPickDate, orderLabel, packaging = [], mealSlots = [], allowPreorder = false, scanner = false,
}: {
  dishes: PosDish[]; customers: PosCustomer[]; orderTypes: string[]; payModes: string[]; gstRate: number; packaging?: PosPack[]; mealSlots?: string[]; allowPreorder?: boolean; scanner?: boolean;
  defaults: { deliveryCharge: number; packingCharge: number }; initial: PosInitial; today: string; canPickDate: boolean; orderLabel: string;
}) {
  const router = useRouter();
  const [customers, setCustomers] = useState(initialCustomers);
  const [o, setO] = useState<PosInitial>(initial);
  const [cat, setCat] = useState<string>(dishes.some((d) => d.today) ? "★ Today" : "All");
  const [search, setSearch] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [payMode, setPayMode] = useState(initial.id ? "" : "Cash");
  const [payAmt, setPayAmt] = useState<string>("");
  const [payLater, setPayLater] = useState(false);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

  const cats = useMemo(() => {
    const s = [...new Set(dishes.map((d) => d.category))];
    return [...(dishes.some((d) => d.today) ? ["★ Today"] : []), "All", ...s];
  }, [dishes]);
  const dmap = useMemo(() => new Map(dishes.map((d) => [d.id, d])), [dishes]);
  const anyPhoto = useMemo(() => dishes.some((d) => d.imageId), [dishes]);
  const shown = dishes.filter((d) =>
    (search ? d.name.toLowerCase().includes(search.toLowerCase()) : cat === "All" || (cat === "★ Today" ? d.today : d.category === cat)));

  const qtyOf = (id: number) => o.items.find((i) => i.menuItemId === id)?.qty ?? 0;
  const setQty = (id: number, q: number) =>
    setO((s) => {
      const has = s.items.some((i) => i.menuItemId === id);
      const items = has ? s.items.map((i) => (i.menuItemId === id ? { ...i, qty: q } : i)) : [...s.items, { menuItemId: id, qty: q, discount: 0 }];
      return { ...s, items: items.filter((i) => i.qty > 0) };
    });
  const setLineDisc = (id: number, d: number) => setO((s) => ({ ...s, items: s.items.map((i) => (i.menuItemId === id ? { ...i, discount: d } : i)) }));

  const lines = o.items.map((i) => ({ ...i, rate: dmap.get(i.menuItemId)?.price ?? 0, name: dmap.get(i.menuItemId)?.name ?? "?" }));
  const itemsTotal = r2(lines.reduce((s, l) => s + l.qty * l.rate, 0));
  const itemDisc = r2(lines.reduce((s, l) => s + (l.discount || 0), 0));
  const pk = o.packaging ?? [];
  const pmap = new Map(packaging.map((p) => [p.id, p]));
  const packLines = pk.filter((p) => p.qty > 0).map((p) => ({ ...p, name: pmap.get(p.packagingId)?.name ?? "?", price: pmap.get(p.packagingId)?.price ?? 0, imageId: pmap.get(p.packagingId)?.imageId }));
  const chargePack = !!o.chargePackaging && packLines.length > 0;
  // packaging is internal (stock + cost) unless "add to bill" is ticked for this order
  const packing = chargePack ? r2(packLines.reduce((s, l) => s + l.qty * l.price, 0)) : o.packingCharge || 0;
  const packPhotos = packaging.some((p) => p.imageId);
  const [scanMsg, setScanMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const addByCode = (raw: string) => {
    const code = raw.trim().toLowerCase();
    if (!code) return;
    const hit = packaging.find((p) => p.barcode && p.barcode.trim().toLowerCase() === code);
    if (!hit) { setScanMsg({ ok: false, t: `No packaging with barcode “${raw.trim()}”. Add it on the Packaging tab.` }); return; }
    setO((s) => {
      const cur = s.packaging ?? [];
      const has = cur.find((p) => p.packagingId === hit.id);
      return { ...s, packaging: has ? cur.map((p) => (p.packagingId === hit.id ? { ...p, qty: p.qty + 1 } : p)) : [...cur, { packagingId: hit.id, qty: 1 }] };
    });
    setScanMsg({ ok: true, t: `+1 ${hit.name}` });
  };
  // Bluetooth / USB barcode scanners type the code very fast and press Enter.
  // When nothing else is focused, catch that burst anywhere on the screen.
  useEffect(() => {
    if (!scanner) return;
    let buf = "", last = 0;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      const now = Date.now();
      if (now - last > 80) buf = "";
      last = now;
      if (e.key === "Enter") { if (buf.length >= 3) { e.preventDefault(); addByCode(buf); } buf = ""; return; }
      if (e.key.length === 1) buf += e.key;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanner, packaging]);
  const showPackingCharge = defaults.packingCharge > 0 || (initial.packingCharge || 0) > 0;
  const setPack = (id: number, q: number) => setO((s) => {
    const cur = s.packaging ?? [];
    const has = cur.some((p) => p.packagingId === id);
    const next = has ? cur.map((p) => (p.packagingId === id ? { ...p, qty: q } : p)) : [...cur, { packagingId: id, qty: q }];
    return { ...s, packaging: next.filter((p) => p.qty > 0) };
  });
  const taxable = r2(Math.max(0, itemsTotal - itemDisc - (o.orderDiscount || 0) + (o.deliveryCharge || 0) + packing));
  const gst = r2((taxable * gstRate) / 100);
  const total = Math.round(taxable + gst);
  const count = o.items.reduce((s, i) => s + i.qty, 0);
  const isDelivery = /deliver|society|swiggy|zomato/i.test(o.orderType);
  const isDine = /dine/i.test(o.orderType);

  function pickType(t: string) {
    setO((s) => ({
      ...s, orderType: t,
      deliveryCharge: s.id ? s.deliveryCharge : /deliver|society/i.test(t) ? defaults.deliveryCharge : 0,
      packingCharge: s.id ? s.packingCharge : /dine/i.test(t) ? 0 : defaults.packingCharge,
    }));
    if (/swiggy|zomato/i.test(t) && payModes.includes("Swiggy/Zomato Payout")) setPayMode("Swiggy/Zomato Payout");
  }

  const pre = !!o.isPreorder;
  function togglePre(on: boolean) {
    setO((s) => ({
      ...s, isPreorder: on,
      date: on ? (s.date <= today ? addDay(today, 1) : s.date) : (canPickDate || s.id ? s.date : today),
      mealSlot: on ? s.mealSlot || "" : "", slotTime: on ? s.slotTime || "" : "",
    }));
  }
  function pickSlot(sl: string) {
    setO((s) => ({ ...s, mealSlot: sl, slotTime: s.slotTime || SLOT_TIME[sl.toLowerCase()] || "" }));
  }

  function save() {
    setErr("");
    const amount = payLater || !payMode ? 0 : payAmt === "" ? total : Number(payAmt);
    start(async () => {
      const r = await saveOrderAction({
        ...o, items: o.items.map((i) => ({ menuItemId: i.menuItemId, qty: i.qty, discount: i.discount })),
        packaging: packLines.map((p) => ({ packagingId: p.packagingId, qty: p.qty })), chargePackaging: chargePack,
        payNow: amount > 0 ? { amount, mode: payMode } : null,
      });
      if (!r.ok) { setErr(r.error); setCartOpen(true); return; }
      router.push(`/orders/${r.data}?saved=1`);
      router.refresh();
    });
  }

  const numIn = (v: number, set: (n: number) => void) => (
    <input className="input !py-1.5 text-right" inputMode="decimal" type="number" min={0} value={v || ""} placeholder="0" onChange={(e) => set(Number(e.target.value) || 0)} />
  );

  const cart = (
    <div className="space-y-3">
      {lines.length === 0 && <p className="py-4 text-center text-sm text-muted">Tap dishes to add them.</p>}
      {lines.map((l) => (
        <div key={l.menuItemId} className="rounded-xl border border-line p-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0"><div className="truncate text-sm font-semibold">{l.name}</div><div className="text-xs text-muted">{inr(l.rate)} × {l.qty} = {inr(l.qty * l.rate - (l.discount || 0))}</div></div>
            <div className="flex items-center gap-1">
              <button type="button" className="h-9 w-9 rounded-lg border border-line text-lg font-bold" onClick={() => setQty(l.menuItemId, l.qty - 1)}>−</button>
              <span className="w-7 text-center font-bold tabular-nums">{l.qty}</span>
              <button type="button" className="h-9 w-9 rounded-lg bg-brand text-lg font-bold text-white" onClick={() => setQty(l.menuItemId, l.qty + 1)}>+</button>
            </div>
          </div>
          <details className="mt-1 text-xs">
            <summary className="cursor-pointer text-muted">Discount on this dish {l.discount ? `(${inr(l.discount)})` : ""}</summary>
            <div className="mt-1 w-32">{numIn(l.discount, (n) => setLineDisc(l.menuItemId, n))}</div>
          </details>
        </div>
      ))}
      <div className={`grid gap-2 text-xs ${showPackingCharge ? "grid-cols-3" : "grid-cols-2"}`}>
        <div><label className="label !text-[10px]">Discount ₹</label>{numIn(o.orderDiscount, (n) => setO({ ...o, orderDiscount: n }))}</div>
        <div><label className="label !text-[10px]">Delivery ₹</label>{numIn(o.deliveryCharge, (n) => setO({ ...o, deliveryCharge: n }))}</div>
        {showPackingCharge && !chargePack && <div><label className="label !text-[10px]">Packing charge ₹</label>{numIn(o.packingCharge, (n) => setO({ ...o, packingCharge: n }))}</div>}
      </div>
      {packaging.length > 0 && (
        <div className="rounded-xl border border-line p-2.5">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <span className="shrink-0 text-sm font-semibold">📦 Packaging used</span>
            <span className="text-right text-[11px] leading-tight text-muted">{chargePack ? "Added to this bill" : "Not on the bill · for packaging stock & cost"}</span>
          </div>
          {scanner && (
            <div className="mb-2">
              <input ref={scanRef} className="input !py-1.5 text-sm" placeholder="🔍 Scan barcode (or type it + Enter)" aria-label="Scan packaging barcode"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addByCode((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = ""; } }} />
              {scanMsg && <p className={`mt-1 text-xs ${scanMsg.ok ? "text-emerald-700" : "text-red-700"}`}>{scanMsg.t}</p>}
            </div>
          )}
          {packLines.map((l) => (
            <div key={l.packagingId} className="flex items-center justify-between gap-2 py-1 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                {l.imageId ? <img src={`/img/${l.imageId}`} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" /> : null}
                <div className="min-w-0"><div className="truncate">{l.name}</div>
                  {chargePack && <div className="text-[11px] text-muted">{inr(l.price, 2)} × {l.qty} = {inr(l.price * l.qty, 2)}</div>}</div>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" className="h-8 w-8 rounded-lg border border-line font-bold" onClick={() => setPack(l.packagingId, l.qty - 1)}>−</button>
                <span className="w-6 text-center font-bold tabular-nums">{l.qty}</span>
                <button type="button" className="h-8 w-8 rounded-lg bg-gold font-bold text-ink" onClick={() => setPack(l.packagingId, l.qty + 1)}>+</button>
              </div>
            </div>
          ))}
          {packPhotos && (
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {packaging.filter((p) => p.imageId && !packLines.some((l) => l.packagingId === p.id)).map((p) => (
                <button type="button" key={p.id} onClick={() => setPack(p.id, 1)} title={p.name}
                  className="overflow-hidden rounded-xl border border-dashed border-gold bg-white text-left hover:bg-gold-light">
                  <img src={`/img/${p.imageId}`} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                  <div className="truncate px-1.5 py-1 text-[11px] font-medium">+ {p.name}</div>
                </button>
              ))}
            </div>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {packaging.filter((p) => !p.imageId && !packLines.some((l) => l.packagingId === p.id)).map((p) => (
              <button type="button" key={p.id} onClick={() => setPack(p.id, 1)} title={p.name}
                className="rounded-full border border-dashed border-gold px-2.5 py-1 text-[12px] font-medium hover:bg-gold-light">+ {p.name}</button>
            ))}
          </div>
          {packLines.length > 0 && (
            <label className="mt-2 flex items-center gap-2 border-t border-line pt-2 text-xs">
              <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={!!o.chargePackaging} onChange={(e) => setO({ ...o, chargePackaging: e.target.checked })} />
              Add packaging to the customer&apos;s bill{chargePack ? ` (${inr(packing, 2)})` : ""}
            </label>
          )}
        </div>
      )}
      <div className="space-y-1 rounded-xl bg-cream p-3 text-sm">
        <div className="flex justify-between"><span>Items</span><span className="tabular-nums">{inr(itemsTotal, 2)}</span></div>
        {itemDisc + o.orderDiscount > 0 && <div className="flex justify-between text-emerald-700"><span>Discount</span><span className="tabular-nums">−{inr(itemDisc + o.orderDiscount, 2)}</span></div>}
        {o.deliveryCharge > 0 && <div className="flex justify-between"><span>Delivery</span><span className="tabular-nums">{inr(o.deliveryCharge, 2)}</span></div>}
        {packing > 0 && <div className="flex justify-between"><span>{chargePack ? "Packaging" : "Packing charge"}</span><span className="tabular-nums">{inr(packing, 2)}</span></div>}
        {gstRate > 0 && <div className="flex justify-between"><span>GST {gstRate}%</span><span className="tabular-nums">{inr(gst, 2)}</span></div>}
        <div className="flex justify-between border-t border-line pt-1 text-base font-bold"><span>Total</span><span className="tabular-nums">{inr(total)}</span></div>
      </div>
      <div className="rounded-xl border border-line p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold">{o.id ? "Add a payment now" : pre ? "Advance payment" : "Payment"}</span>
          <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={payLater} onChange={(e) => setPayLater(e.target.checked)} /> Pay later (due)</label>
        </div>
        {!payLater && (
          <div className="grid grid-cols-2 gap-2">
            <select className="input" value={payMode} onChange={(e) => setPayMode(e.target.value)}>
              <option value="">{o.id ? "No new payment" : "Select…"}</option>
              {payModes.map((m) => <option key={m}>{m}</option>)}
            </select>
            <input className="input text-right" type="number" inputMode="decimal" placeholder={`${total} (full)`} value={payAmt} onChange={(e) => setPayAmt(e.target.value)} />
          </div>
        )}
      </div>
      <div><label className="label">Notes (kitchen / delivery)</label><input className="input" value={o.notes} onChange={(e) => setO({ ...o, notes: e.target.value })} /></div>
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <button className="btn-primary w-full !py-3.5 text-base" disabled={pending || !lines.length} onClick={save}>
        {pending ? "Saving…" : o.id ? `Update ${orderLabel} · ${inr(total)}` : pre ? `Save pre-order · ${inr(total)}` : `Save order · ${inr(total)}`}
      </button>
    </div>
  );

  return (
    <div className="lg:grid lg:grid-cols-[1fr_380px] lg:gap-5">
      <div>
        <div className="card mb-3 space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold">{o.id ? `Edit ${orderLabel}` : `New ${pre ? "pre-order" : "order"} · ${orderLabel}`}</h1>
            <input type="date" aria-label={pre ? "Delivery date" : "Order date"} className="input !w-auto !py-1.5 text-sm" value={o.date}
              disabled={!canPickDate && !pre} min={pre && !canPickDate ? today : undefined} max={canPickDate || pre ? undefined : today}
              onChange={(e) => setO({ ...o, date: e.target.value })} />
          </div>
          {(allowPreorder || pre) && <div className={`rounded-xl border p-2.5 ${pre ? "border-gold bg-gold-light/40" : "border-line"}`}>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-cream p-1" role="radiogroup" aria-label="Order or pre-order">
              <button type="button" role="radio" aria-checked={!pre} onClick={() => togglePre(false)}
                className={`rounded-lg py-2 text-sm font-bold ${!pre ? "bg-brand text-white shadow" : "text-ink"}`}>⚡ Order now</button>
              <button type="button" role="radio" aria-checked={pre} onClick={() => togglePre(true)}
                className={`rounded-lg py-2 text-sm font-bold ${pre ? "bg-brand text-white shadow" : "text-ink"}`}>🗓️ Pre-order (later)</button>
            </div>
            {pre && (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-muted">Date above = the day the food is served / delivered.</p>
                <div className="flex flex-wrap gap-1.5">
                  {mealSlots.map((sl) => (
                    <button type="button" key={sl} onClick={() => pickSlot(sl)}
                      className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${o.mealSlot === sl ? "border-brand bg-brand text-white" : "border-line bg-white"}`}>{sl}</button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted" htmlFor="slotTime">Time</label>
                  <input id="slotTime" type="time" className="input !w-auto !py-1.5 text-sm" value={o.slotTime ?? ""} onChange={(e) => setO({ ...o, slotTime: e.target.value })} />
                </div>
              </div>
            )}
          </div>}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {orderTypes.map((t) => (
              <button type="button" key={t} onClick={() => pickType(t)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold ${o.orderType === t ? "border-brand bg-brand text-white" : "border-line bg-white"}`}>{t}</button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <CustomerPicker customers={customers} value={o.customerId} onChange={(id) => setO({ ...o, customerId: id })} onAdded={(c) => setCustomers((s) => [...s, c])} />
            {isDine && <div><label className="label">Table</label><input className="input" value={o.tableNo} onChange={(e) => setO({ ...o, tableNo: e.target.value })} /></div>}
          </div>
          {isDelivery && !o.customerId && <p className="text-xs text-amber-700">Tip: pick the customer so the bill shows their address and dues are tracked.</p>}
        </div>

        <input className="input mb-2" placeholder="Search dish…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {!search && (
          <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
            {cats.map((c) => (
              <button type="button" key={c} onClick={() => setCat(c)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${cat === c ? "bg-gold text-ink" : "bg-white text-ink ring-1 ring-line"}`}>{c}</button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {shown.map((d) => {
            const q = qtyOf(d.id);
            return (
              <button type="button" key={d.id} disabled={d.available === false && !q && !pre} onClick={() => d.available === false && !q && !pre ? undefined : setQty(d.id, q + 1)}
                className={`relative flex flex-col justify-start overflow-hidden rounded-2xl border bg-white text-left transition active:scale-[.97] ${q ? "border-brand ring-2 ring-brand/25" : "border-line"} ${d.available === false && !pre ? "opacity-50 grayscale" : ""}`}>
                {d.available === false && !pre && <span className="absolute left-2 top-2 z-10 rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold text-white">Not available</span>}
                {d.imageId ? <img src={`/img/${d.imageId}`} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
                  : anyPhoto ? <div className="flex aspect-[4/3] w-full items-center justify-center bg-gradient-to-br from-gold-light to-cream text-4xl opacity-80">🍛</div>
                  : <div className="h-1 w-full bg-gradient-to-r from-gold/70 via-gold-light to-gold/70" />}
                <div className="w-full p-3">
                <span className={`absolute right-2 ${anyPhoto ? "top-2 bg-white" : "top-3"} h-3 w-3 rounded-sm border-2 ${d.vegType === "Veg" ? "border-emerald-600" : "border-red-600"}`}>
                  <span className={`m-auto mt-[1px] block h-1.5 w-1.5 rounded-full ${d.vegType === "Veg" ? "bg-emerald-600" : "bg-red-600"}`} />
                </span>
                <div className="pr-4 text-sm font-semibold leading-tight">{d.name}</div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-sm text-muted">{inr(d.price)}</span>
                  {q > 0 && <span className="rounded-full bg-brand px-2 text-xs font-bold text-white">{q}</span>}
                </div>
                </div>
              </button>
            );
          })}
          {!shown.length && <p className="col-span-full py-6 text-center text-sm text-muted">No dishes here.</p>}
        </div>
      </div>

      {/* desktop cart */}
      <aside className="hidden lg:block"><div className="card sticky top-6">{cart}</div></aside>

      {/* mobile cart bar */}
      <div className="fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-30 px-3 lg:hidden">
        <button type="button" onClick={() => setCartOpen(true)} disabled={!count}
          className="flex w-full items-center justify-between rounded-2xl bg-brand px-4 py-3.5 text-white shadow-xl disabled:opacity-60">
          <span className="font-semibold">{count ? `${count} item${count > 1 ? "s" : ""}` : "No items yet"}</span>
          <span className="font-bold">{inr(total)} · View order →</span>
        </button>
      </div>
      <Modal open={cartOpen} onClose={() => setCartOpen(false)} title="Order summary">{cart}</Modal>
    </div>
  );
}
