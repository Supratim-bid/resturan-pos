"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { placeOnlineOrderAction, sendPhoneOtpAction, verifyPhoneOtpAction, type PlaceOrderInput } from "@/app/actions/online";
import type { StoreConfig, StoreDish } from "@/lib/online";
import { InstallBanner } from "@/components/pwa";

const inr = (n: number, d = 0) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const SAVE_KEY = "rm-customer";
const SLOT_TIME: Record<string, string> = { breakfast: "08:30", lunch: "13:00", "evening snacks": "17:30", snacks: "17:30", dinner: "20:30" };

function addDay(d: string, n: number) { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }

/** The customer-facing menu + cart + checkout (no login) */
export function Storefront({ code, config, dishes, today, verifiedPhone = "" }: { code: string; config: StoreConfig; dishes: StoreDish[]; today: string; verifiedPhone?: string }) {
  const [cart, setCart] = useState<Record<number, number>>({});
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const [step, setStep] = useState<"menu" | "checkout">("menu");
  const [f, setF] = useState({ name: "", phone: "", flat: "", area: "", notes: "", website: "" });
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [pinNote, setPinNote] = useState("");
  const [kind, setKind] = useState<"DELIVERY" | "TAKEAWAY">(config.delivery ? "DELIVERY" : "TAKEAWAY");
  const [pre, setPre] = useState(false);
  const [date, setDate] = useState(addDay(today, 1));
  const [slot, setSlot] = useState("");
  const [time, setTime] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const [pay, setPay] = useState<"UPI" | "COD">(config.payUpi ? "UPI" : "COD");
  // SMS OTP (only when the restaurant turned it on and SMS is connected)
  const [verified, setVerified] = useState(verifiedPhone);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpMsg, setOtpMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [otpBusy, otpStart] = useTransition();
  const phone10 = f.phone.replace(/\D/g, "").slice(-10);
  const phoneOk = !config.otp || (!!verified && verified === phone10);
  const sendOtp = () => otpStart(async () => {
    setOtpMsg(null); const r = await sendPhoneOtpAction(code, f.phone);
    if (r.ok) { setOtpSent(true); setOtpMsg({ ok: true, t: "Code sent by SMS. Enter it below." }); } else setOtpMsg({ ok: false, t: r.error });
  });
  const checkOtp = () => otpStart(async () => {
    setOtpMsg(null); const r = await verifyPhoneOtpAction(code, f.phone, otp);
    if (r.ok) { setVerified(phone10); setOtpSent(false); setOtp(""); } else setOtpMsg({ ok: false, t: r.error });
  });

  // returning customers: remember their details on this phone only
  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); if (s) setF((x) => ({ ...x, name: s.name || "", phone: s.phone || "", flat: s.flat || "", area: s.area || "" })); } catch { /* ignore */ }
  }, []);

  const cats = useMemo(() => ["All", ...new Set(dishes.map((d) => d.category))], [dishes]);
  const shown = dishes.filter((d) => (q ? d.name.toLowerCase().includes(q.toLowerCase()) : cat === "All" || d.category === cat));
  const lines = dishes.filter((d) => cart[d.id]).map((d) => ({ ...d, qty: cart[d.id] }));
  const count = lines.reduce((s, l) => s + l.qty, 0);
  // prices follow the chosen way to pay: "Pay online now" can carry the restaurant's online-payment price (same rounding as the server)
  const priceFor = (price: number, way: "UPI" | "COD") => way === "UPI" && config.payMarkup > 0 ? Math.round(price * (1 + config.payMarkup / 100)) : price;
  const px = (price: number) => priceFor(price, pay);
  const pickOff = (it: number) => kind === "TAKEAWAY" && config.pickupDiscount > 0 ? Math.round((it * config.pickupDiscount) / 100) : 0; // same rounding as the server
  const totalFor = (way: "UPI" | "COD") => { const it = r2(lines.reduce((s, l) => s + l.qty * priceFor(l.price, way), 0)); const dl = kind === "DELIVERY" ? config.deliveryCharge : 0; const tx = Math.max(0, it - pickOff(it) + dl); return Math.round(tx + r2((tx * config.gstRate) / 100)); };
  const itemsTotal = r2(lines.reduce((s, l) => s + l.qty * px(l.price), 0));
  const delivery = kind === "DELIVERY" ? config.deliveryCharge : 0;
  const discount = pickOff(itemsTotal);
  const gst = r2((Math.max(0, itemsTotal - discount + delivery) * config.gstRate) / 100);
  const total = Math.round(Math.max(0, itemsTotal - discount + delivery) + gst);
  const belowMin = config.minOrder > 0 && itemsTotal < config.minOrder;
  const setQty = (id: number, n: number) => setCart((c) => { const x = { ...c }; if (n > 0) x[id] = Math.min(50, n); else delete x[id]; return x; });

  function place() {
    setErr("");
    const input: PlaceOrderInput = {
      name: f.name, phone: f.phone, kind, isPreorder: pre, date, mealSlot: slot, slotTime: time,
      flat: f.flat, area: f.area, notes: f.notes, payMethod: pay, website: f.website,
      lat: pin?.lat, lng: pin?.lng,
      items: lines.map((l) => ({ menuItemId: l.id, qty: l.qty })),
    };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ name: f.name, phone: f.phone, flat: f.flat, area: f.area })); } catch { /* ignore */ }
    start(async () => {
      const r = await placeOnlineOrderAction(code, input);
      if (r && !r.ok) { setErr(r.error); window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); }
    });
  }

  const header = (
    <header className="bg-brand px-4 pb-5 pt-6 text-center text-white">
      {config.hasLogo && <img src={`/logo?r=${code}`} alt="" className="mx-auto mb-2 h-20 w-20 rounded-full bg-white object-cover shadow-[0_0_0_3px_#fff,0_0_0_5px_var(--color-gold)]" />}
      <h1 className="font-display text-2xl font-bold">{config.name}</h1>
      {config.tagline && <p className="text-sm opacity-90">{config.tagline}</p>}
      {config.note && <p className="mx-auto mt-2 max-w-md rounded-xl bg-white/15 px-3 py-1.5 text-sm">{config.note}</p>}
      <a href={`/${code}/order/my`} className="mt-3 inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">🧾 My orders</a>
      <a href={`/${code}/order/app`} className="ml-2 mt-3 inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">📲 Get the app</a>
    </header>
  );

  if (step === "checkout") {
    return (
      <div className="min-h-dvh bg-cream pb-28">
        {header}
        <main className="mx-auto max-w-lg space-y-4 px-4 pt-4">
          <button className="text-sm font-semibold text-brand" onClick={() => setStep("menu")}>← Back to menu</button>
          <section className="card space-y-2">
            <h2 className="font-bold">Your order</h2>
            {lines.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{l.name}</span>
                <div className="flex items-center gap-1">
                  <button className="h-8 w-8 rounded-lg border border-line font-bold" onClick={() => setQty(l.id, l.qty - 1)} aria-label={`One less ${l.name}`}>−</button>
                  <span className="w-6 text-center font-bold tabular-nums">{l.qty}</span>
                  <button className="h-8 w-8 rounded-lg bg-brand font-bold text-white" onClick={() => setQty(l.id, l.qty + 1)} aria-label={`One more ${l.name}`}>+</button>
                </div>
                <span className="w-16 text-right tabular-nums">{inr(l.qty * px(l.price))}</span>
              </div>
            ))}
          </section>

          <section className="card space-y-3">
            <h2 className="font-bold">How do you want it?</h2>
            <div className="grid grid-cols-2 gap-2">
              {config.delivery && <button className={`rounded-xl border-2 py-2.5 text-sm font-bold ${kind === "DELIVERY" ? "border-brand bg-brand text-white" : "border-line bg-white"}`} onClick={() => setKind("DELIVERY")}>🛵 Delivery</button>}
              {config.takeaway && <button className={`rounded-xl border-2 py-2.5 text-sm font-bold ${kind === "TAKEAWAY" ? "border-brand bg-brand text-white" : "border-line bg-white"}`} onClick={() => setKind("TAKEAWAY")}>🥡 Pick up{config.pickupDiscount > 0 && <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] ${kind === "TAKEAWAY" ? "bg-white/25" : "bg-emerald-100 text-emerald-800"}`}>{config.pickupDiscount}% off</span>}</button>}
            </div>
            {config.preorder && (
              <div className="grid grid-cols-2 gap-2">
                <button className={`rounded-xl border py-2 text-sm font-semibold ${!pre ? "border-brand text-brand" : "border-line"}`} onClick={() => setPre(false)}>⚡ Now</button>
                <button className={`rounded-xl border py-2 text-sm font-semibold ${pre ? "border-brand text-brand" : "border-line"}`} onClick={() => setPre(true)}>🗓️ Later (pre-order)</button>
              </div>
            )}
            {pre && (
              <div className="space-y-2 rounded-xl bg-gold-light/40 p-3">
                <label className="label" htmlFor="pdate">Date</label>
                <input id="pdate" type="date" className="input" value={date} min={today} max={addDay(today, 30)} onChange={(e) => setDate(e.target.value)} />
                <div className="flex flex-wrap gap-1.5">
                  {config.mealSlots.map((sl) => (
                    <button key={sl} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${slot === sl ? "border-brand bg-brand text-white" : "border-line bg-white"}`}
                      onClick={() => { setSlot(sl); if (!time) setTime(SLOT_TIME[sl.toLowerCase()] ?? ""); }}>{sl}</button>
                  ))}
                </div>
                <div className="flex items-center gap-2"><label className="text-sm" htmlFor="ptime">Time</label><input id="ptime" type="time" className="input !w-auto" value={time} onChange={(e) => setTime(e.target.value)} /></div>
              </div>
            )}
          </section>

          <section className="card space-y-3">
            <h2 className="font-bold">Your details</h2>
            <div><label className="label" htmlFor="cname">Name</label><input id="cname" className="input" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div><label className="label" htmlFor="cphone">Mobile number</label><input id="cphone" className="input" type="tel" inputMode="numeric" autoComplete="tel" placeholder="10-digit mobile" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
              {config.otp && (phoneOk ? <p className="mt-1 text-xs font-semibold text-emerald-700">✓ Mobile number verified</p> : (
                <div className="mt-2 space-y-2">
                  {otpSent ? (
                    <div className="flex gap-2">
                      <input id="cotp" className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6-digit code" value={otp} onChange={(e) => setOtp(e.target.value)} />
                      <button type="button" className="btn-primary shrink-0" disabled={otpBusy} onClick={checkOtp}>{otpBusy ? "…" : "Verify"}</button>
                    </div>
                  ) : null}
                  <button type="button" className="btn-ghost btn-sm" disabled={otpBusy || phone10.length !== 10} onClick={sendOtp}>{otpSent ? "Send code again" : "Send OTP to verify"}</button>
                  {otpMsg && <p className={`text-xs ${otpMsg.ok ? "text-emerald-700" : "text-red-700"}`}>{otpMsg.t}</p>}
                </div>
              ))}
            </div>
            {kind === "DELIVERY" && <>
              <div><label className="label" htmlFor="cflat">Flat / house no.</label><input id="cflat" className="input" autoComplete="address-line1" value={f.flat} onChange={(e) => setF({ ...f, flat: e.target.value })} /></div>
              <div><label className="label" htmlFor="carea">Society / street / area</label><input id="carea" className="input" autoComplete="address-line2" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} /></div>
              <div className="sm:col-span-2">
                <button type="button" className={pin ? "btn-ghost btn-sm" : "btn-gold btn-sm"} onClick={() => {
                  if (!navigator.geolocation) { setPinNote("Location isn't available on this phone."); return; }
                  setPinNote("Getting your location…");
                  navigator.geolocation.getCurrentPosition(
                    (p) => { setPin({ lat: p.coords.latitude, lng: p.coords.longitude }); setPinNote("✓ Location shared - the rider can track to you for a live ETA."); },
                    () => setPinNote("Couldn't get location. You can still order; the address is enough."),
                    { enableHighAccuracy: true, timeout: 15000 });
                }}>📍 {pin ? "Location shared ✓ (tap to redo)" : "Share my location for live ETA"}</button>
                {pinNote && <p className="mt-1 text-xs text-muted">{pinNote}</p>}
              </div>
            </>}
            <div><label className="label" htmlFor="cnotes">Note for the kitchen (optional)</label><input id="cnotes" className="input" placeholder="e.g. less spicy" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
            <input tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />
          </section>

          <section className="card space-y-2">
            <h2 className="font-bold">Payment</h2>
            {config.payUpi && <label className="flex items-start gap-2 text-sm"><input type="radio" name="pay" className="mt-1 accent-[var(--color-brand)]" checked={pay === "UPI"} onChange={() => setPay("UPI")} />
              {config.payGateway
                ? <span><b>Pay online now{config.payMarkup > 0 && config.payCash && lines.length ? ` · ${inr(totalFor("UPI"))}` : ""}</b><span className="block text-xs text-muted">UPI, card, net banking or wallet. After placing the order you go straight to the secure payment page.</span></span>
                : <span><b>Pay now by UPI</b><span className="block text-xs text-muted">After placing the order you&apos;ll see the UPI QR / button. You can attach a payment screenshot (optional). The restaurant confirms after checking the payment.</span></span>}</label>}
            {config.payCash && <label className="flex items-start gap-2 text-sm"><input type="radio" name="pay" className="mt-1 accent-[var(--color-brand)]" checked={pay === "COD"} onChange={() => setPay("COD")} />
              <span><b>Cash {kind === "DELIVERY" ? "on delivery" : "at pickup"}{config.payMarkup > 0 && config.payUpi && lines.length ? ` · ${inr(totalFor("COD"))}` : ""}</b><span className="block text-xs text-muted">Pay when you get your food</span></span></label>}
            {config.newMax > 0 && <p className="text-xs text-muted">First orders from a new number can be up to ₹{config.newMax}.</p>}

          </section>

          <section className="card space-y-1 text-sm">
            <div className="flex justify-between"><span>Items</span><span className="tabular-nums">{inr(itemsTotal, 2)}</span></div>
            {discount > 0 && <div className="flex justify-between text-emerald-700"><span>Pickup discount {config.pickupDiscount}%</span><span className="tabular-nums">−{inr(discount, 2)}</span></div>}
            {delivery > 0 && <div className="flex justify-between"><span>Delivery</span><span className="tabular-nums">{inr(delivery, 2)}</span></div>}
            {gst > 0 && <div className="flex justify-between"><span>GST {config.gstRate}%</span><span className="tabular-nums">{inr(gst, 2)}</span></div>}
            <div className="flex justify-between border-t border-line pt-1 text-base font-bold"><span>Total</span><span className="tabular-nums">{inr(total)}</span></div>
            <p className="text-xs text-muted">The restaurant confirms your order and the final bill.</p>
          </section>
          {belowMin && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Minimum order is {inr(config.minOrder)} (before delivery & tax).</p>}
          {err && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        </main>
        <div className="fixed inset-x-0 bottom-0 border-t border-line bg-white/95 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <button className="btn-primary mx-auto block w-full max-w-lg !py-3.5 text-base" disabled={pending || !count || belowMin || !phoneOk} onClick={place}>
            {pending ? "Placing order…" : !phoneOk ? "Verify your mobile number to order" : `Place order · ${inr(total)}`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-cream pb-28">
      {header}
      {!config.open && <div className="bg-amber-100 px-4 py-3 text-center text-sm font-semibold text-amber-900">{config.closedMsg}</div>}
      <div className="px-4"><InstallBanner name={config.name} href={`/${code}/order/app`} /></div>
      <main className="mx-auto max-w-3xl px-4 pt-4">
        <input className="input mb-3" placeholder="Search dishes…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search dishes" />
        {!q && (
          <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
            {cats.map((c) => <button key={c} onClick={() => setCat(c)} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${cat === c ? "bg-brand text-white" : "bg-white ring-1 ring-line"}`}>{c}</button>)}
          </div>
        )}
        {!dishes.length && <p className="py-10 text-center text-muted">The menu is being updated. Please check back soon.</p>}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {shown.map((d) => {
            const n = cart[d.id] ?? 0;
            return (
              <div key={d.id} className="card flex items-center gap-3 !p-2.5">
                {d.imageId ? <img src={`/img/${d.imageId}`} alt="" loading="lazy" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
                  : <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-gold-light/60 text-3xl">🍛</div>}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-block h-3 w-3 shrink-0 rounded-sm border-2 ${d.vegType === "Veg" ? "border-emerald-600" : "border-red-600"}`} aria-label={d.vegType} />
                    <span className="font-semibold leading-tight">{d.name}</span>
                  </div>
                  <div className="mt-0.5 text-sm text-muted">{inr(px(d.price))}</div>
                </div>
                {config.open && (n ? (
                  <div className="flex items-center gap-1">
                    <button className="h-9 w-9 rounded-lg border border-line text-lg font-bold" onClick={() => setQty(d.id, n - 1)} aria-label={`One less ${d.name}`}>−</button>
                    <span className="w-6 text-center font-bold tabular-nums">{n}</span>
                    <button className="h-9 w-9 rounded-lg bg-brand text-lg font-bold text-white" onClick={() => setQty(d.id, n + 1)} aria-label={`One more ${d.name}`}>+</button>
                  </div>
                ) : <button className="rounded-lg border-2 border-brand px-4 py-1.5 text-sm font-bold text-brand" onClick={() => setQty(d.id, 1)}>ADD</button>)}
              </div>
            );
          })}
        </div>
        {(config.phone || config.address || config.whatsapp) && <p className="mt-6 text-center text-xs text-muted">{[config.address, config.phone && `Ph: ${config.phone}`, config.whatsapp && `WhatsApp: ${config.whatsapp}`].filter(Boolean).join(" · ")}</p>}
        <nav className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-muted">
          <a className="underline" href={`/${code}/info/contact`}>Contact us</a><a className="underline" href={`/${code}/info/terms`}>Terms</a>
          <a className="underline" href={`/${code}/info/refund`}>Refund &amp; cancellation</a><a className="underline" href={`/${code}/info/delivery`}>Delivery</a><a className="underline" href={`/${code}/info/privacy`}>Privacy</a>
        </nav>
      </main>
      {count > 0 && config.open && (
        <div className="fixed inset-x-0 bottom-0 px-4 pb-[calc(12px+env(safe-area-inset-bottom))]">
          <button onClick={() => { setStep("checkout"); window.scrollTo({ top: 0 }); }} className="mx-auto flex w-full max-w-lg items-center justify-between rounded-2xl bg-brand px-4 py-3.5 text-white shadow-xl">
            <span className="font-semibold">{count} item{count > 1 ? "s" : ""} · {inr(itemsTotal)}</span><span className="font-bold">Checkout →</span>
          </button>
        </div>
      )}
    </div>
  );
}
