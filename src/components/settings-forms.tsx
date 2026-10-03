"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createUserAction, saveSettingsAction, saveThemeAction, revertThemeAction, savePaymentSettingsAction, testGatewayAction, savePoliciesAction, setOwnFeaturesAction, updateUserAction } from "@/app/actions/settings";
import { themeCss, tonePalette } from "@/lib/theme";
import { Modal } from "./crud";
import { MODULES, POWERS, ROLE_DEFAULTS, ROLE_LABEL, type PermKey, type Role } from "@/lib/permissions";
import { FEATURE_TABS, FEATURES, type FeatureKey } from "@/lib/features";

// ---------------- Restaurant, bill & theme settings ----------------
const F: [string, string, string?][] = [
  ["name", "Restaurant name"], ["tagline", "Tagline"], ["address", "Address (prints on bill)"], ["phone", "Main phone"], ["email", "Email"],
  ["gstin", "GSTIN (blank if not registered)"], ["fssai", "FSSAI licence no."], ["upiId", "UPI ID (QR on bill)", "e.g. yourname@okhdfc"],
  ["billFooter", "Bill footer"], ["gstRate", "GST % on bills", "5 for most restaurants; 0 if not registered - confirm with your CA"],
  ["priceMultiplier", "Price multiplier (suggested price = cost ×)", "e.g. 3"], ["platformCommission", "Swiggy/Zomato commission % (estimate)"],
  ["defaultDeliveryCharge", "Default delivery charge ₹"], ["defaultPackingCharge", "Default packing charge ₹ (non dine-in)"],
];
/** Extra phone numbers (stored one per line) */
function PhonesInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const list = value.split("\n");
  const setAt = (i: number, x: string) => onChange(list.map((y, k) => (k === i ? x : y)).join("\n"));
  const rows = value === "" ? [] : list;
  return (
    <div>
      <label className="label">More phone numbers</label>
      <div className="space-y-2">
        {rows.map((p, i) => (
          <div key={i} className="flex gap-2">
            <input className="input" type="tel" value={p} aria-label={`Phone ${i + 2}`} onChange={(e) => setAt(i, e.target.value)} />
            <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => onChange(rows.filter((_, k) => k !== i).join("\n"))}>Remove</button>
          </div>
        ))}
        {rows.length < 5 && <button type="button" className="btn-ghost btn-sm" onClick={() => onChange(value === "" ? " " : value + "\n")}>+ Add phone number</button>}
      </div>
    </div>
  );
}
function fyOf(d: Date) { const y = d.getFullYear(), m = d.getMonth() + 1, s = m >= 4 ? y : y - 1; return `${String(s).slice(2)}-${String(s + 1).slice(2)}`; }

/** Live thermal-receipt preview that updates as the owner edits the settings */
function BillPreview({ v, billNo }: { v: Record<string, string>; billNo: string }) {
  const name = (v.billName?.trim() || v.name?.trim() || "My Restaurant");
  const sample = [{ n: "Paneer Butter Masala", q: 1, p: 240 }, { n: "Butter Naan", q: 2, p: 40 }];
  const sub = sample.reduce((a, x) => a + x.q * x.p, 0);
  const gstRate = Math.max(0, Number(v.gstRate) || 0);
  const gst = Math.round(sub * gstRate) / 100;
  const total = Math.round(sub + gst);
  const wide = v.receiptWidth === "80";
  return (
    <div className="mt-3">
      <div className="mb-1 text-xs text-muted">Live bill preview — updates as you change settings above:</div>
      <div className="mx-auto rounded-xl border border-line bg-stone-50 p-3" style={{ maxWidth: wide ? 320 : 240 }}>
        <div className="bg-white px-3 py-3 font-mono text-[11px] leading-snug text-ink shadow-sm">
          <div className="text-center">
            {(v.billShowLogo ?? "true") === "true" && <div className="mx-auto mb-1 h-6 w-6 rounded-full" style={{ background: v.accentColor || "#c8962e" }} />}
            <div className="text-[13px] font-bold" style={{ color: v.primaryColor || "#9a1c1f" }}>{name}</div>
            {v.billHeaderNote && <div className="text-[10px]">{v.billHeaderNote}</div>}
            {v.address && <div className="text-[10px]">{v.address}</div>}
            {v.phone && <div className="text-[10px]">☎ {v.phone}</div>}
            {v.gstin && <div className="text-[10px]">GSTIN: {v.gstin}</div>}
          </div>
          <div className="my-1 border-t border-dashed border-stone-400" />
          <div className="flex justify-between"><span>Bill: {billNo}</span><span>Dine-in</span></div>
          <div className="my-1 border-t border-dashed border-stone-400" />
          {sample.map((x) => (
            <div key={x.n} className="flex justify-between gap-2"><span className="truncate">{x.q}× {x.n}</span><span>₹{x.q * x.p}</span></div>
          ))}
          <div className="my-1 border-t border-dashed border-stone-400" />
          <div className="flex justify-between"><span>Subtotal</span><span>₹{sub}</span></div>
          {gstRate > 0 && <div className="flex justify-between"><span>GST {gstRate}%</span><span>₹{gst}</span></div>}
          <div className="flex justify-between text-[13px] font-bold" style={{ color: v.primaryColor || "#9a1c1f" }}><span>TOTAL</span><span>₹{total}</span></div>
          {v.billShowCashier === "true" && <div className="mt-1 text-[10px]">Billed by: Ramesh</div>}
          {(v.billShowQr === "always" || (v.billShowQr || "due") === "due") && (v.upiId || v.payLinkUrl) && (
            <div className="mt-2 text-center"><div className="mx-auto h-10 w-10 bg-stone-800" /><div className="text-[9px]">{v.billQrLabel || "Scan to pay"}</div></div>
          )}
          {v.billSocial && <div className="mt-1 text-center text-[10px]">{v.billSocial}</div>}
          {v.billTerms && <div className="mt-1 text-center text-[9px] text-stone-500">{v.billTerms}</div>}
          {v.billFooter && <div className="mt-1 text-center text-[10px] font-semibold">{v.billFooter}</div>}
        </div>
      </div>
    </div>
  );
}

export function SettingsForm({ initial, smsConnected = false }: { initial: Record<string, string>; smsConnected?: boolean }) {
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (k: string, x: string) => setV((s) => ({ ...s, [k]: x }));
  const preview = useMemo(() => {
    const d = Math.max(1, Math.min(8, Number(v.billDigits) || 4)), n = Math.max(1, Number(v.billStart) || 1);
    return `${v.billPrefix ?? ""}${v.billUseFy === "true" ? fyOf(new Date()) + "/" : ""}${String(n).padStart(d, "0")}`;
  }, [v.billPrefix, v.billDigits, v.billStart, v.billUseFy]);
  return (
    <form onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await saveSettingsAction(v); setMsg(r.ok ? { ok: true, t: "Saved." } : { ok: false, t: r.error }); if (r.ok) router.refresh(); }); }}>
      <h3 className="mb-2 text-sm font-bold">Restaurant & bill details</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {F.map(([k, l, h]) => (
          <div key={k} className={k === "address" || k === "billFooter" ? "sm:col-span-2" : ""}>
            <label className="label">{l}</label>
            <input className="input" value={v[k] ?? ""} inputMode={/Rate|Charge|Multiplier|Commission/.test(k) ? "decimal" : undefined} onChange={(e) => set(k, e.target.value)} />
            {h && <p className="mt-1 text-[11px] text-muted">{h}</p>}
          </div>
        ))}
        <PhonesInput value={v.extraPhones ?? ""} onChange={(x) => set("extraPhones", x)} />
        <div>
          <label className="label">WhatsApp number</label>
          <input className="input" type="tel" value={v.whatsapp ?? ""} placeholder="leave blank if none" onChange={(e) => set("whatsapp", e.target.value)} />
          <p className="mt-1 text-[11px] text-muted">Can be different from the phone numbers. Printed on bills and shown on the online menu.</p>
        </div>
      </div>

      <h3 className="mb-2 mt-6 text-sm font-bold">Bill design</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="label">Name shown on the bill</label><input className="input" value={v.billName ?? ""} placeholder={`Same as restaurant name (${v.name || "My Restaurant"})`} onChange={(e) => set("billName", e.target.value)} />
          <p className="mt-1 text-[11px] text-muted">Leave blank to use the restaurant name. Set a different name here if bills go out under another name (e.g. payments taken on one name, bill printed on another).</p></div>
        <div className="sm:col-span-2"><label className="label">Line under the name</label><input className="input" value={v.billHeaderNote ?? ""} placeholder="e.g. 100% homemade · No MSG · Pure mustard oil" onChange={(e) => set("billHeaderNote", e.target.value)} /></div>
        <div><label className="label">Social / website line</label><input className="input" value={v.billSocial ?? ""} placeholder="e.g. Insta @yourhandle · WhatsApp 98xxxxxx" onChange={(e) => set("billSocial", e.target.value)} /></div>
        <div><label className="label">Payment QR on bill</label>
          <select className="input" value={v.billShowQr || "due"} onChange={(e) => set("billShowQr", e.target.value)}>
            <option value="due">Only when money is due</option><option value="always">Always (also on paid bills)</option><option value="never">Never</option>
          </select><p className="mt-1 text-[11px] text-muted">Needs the UPI ID above, or a payment link (Online payments)</p></div>
        <div className="sm:col-span-2"><label className="label">Text under the QR</label><input className="input" value={v.billQrLabel ?? ""} onChange={(e) => set("billQrLabel", e.target.value)} /></div>
        <div className="sm:col-span-2"><label className="label">Small print / terms (bottom of bill)</label><textarea className="input" rows={2} value={v.billTerms ?? ""} placeholder="e.g. Consume within 2 hours. Goods once sold will not be taken back." onChange={(e) => set("billTerms", e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-[var(--color-brand)]" checked={(v.billShowLogo ?? "true") === "true"} onChange={(e) => set("billShowLogo", String(e.target.checked))} /> Show logo on bills</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-[var(--color-brand)]" checked={v.billShowCashier === "true"} onChange={(e) => set("billShowCashier", String(e.target.checked))} /> Print “Billed by” (who made the bill)</label>
      </div>

      <BillPreview v={v} billNo={preview} />

      <h3 className="mb-2 mt-6 text-sm font-bold">Bill / order number format</h3>
      <div className="grid gap-3 sm:grid-cols-4">
        <div><label className="label">Prefix</label><input className="input" value={v.billPrefix ?? ""} placeholder="e.g. AP-" onChange={(e) => set("billPrefix", e.target.value)} /></div>
        <div><label className="label">Digits</label><input className="input" type="number" min={1} max={8} value={v.billDigits ?? "4"} onChange={(e) => set("billDigits", e.target.value)} /></div>
        <div><label className="label">Start from</label><input className="input" type="number" min={1} value={v.billStart ?? "1"} onChange={(e) => set("billStart", e.target.value)} /></div>
        <label className="flex items-end gap-2 pb-2.5 text-sm"><input type="checkbox" className="h-5 w-5 accent-[var(--color-brand)]" checked={v.billUseFy === "true"} onChange={(e) => set("billUseFy", String(e.target.checked))} /> Add financial year &amp; restart every April</label>
      </div>
      <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--color-brand)]" checked={(v.reuseCancelledNo ?? "true") === "true"} onChange={(e) => set("reuseCancelledNo", String(e.target.checked))} />
        <span>Reuse the number of a cancelled bill <span className="block text-xs text-muted">AP-0002 cancelled → becomes AP-0002-CAN and the next new bill gets AP-0002. Untick to never reuse numbers (cancelled bills keep theirs). If you are GST-registered, confirm with your CA which your invoices should follow.</span></span></label>
      <p className="mt-2 rounded-xl bg-gold-light/60 px-3 py-2 text-sm">Next new bill will look like: <b className="font-mono">{preview}</b> <span className="text-xs text-muted">(or the next free number after your existing bills). Old bills keep their numbers.</span></p>

      <h3 className="mb-2 mt-6 text-sm font-bold">Receipt</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className="label">Default thermal paper</label>
          <select className="input" value={v.receiptWidth ?? "58"} onChange={(e) => set("receiptWidth", e.target.value)}>
            <option value="58">2 inch (58mm)</option><option value="80">3 inch (80mm)</option>
          </select></div>
      </div>
      <p className="mt-2 text-[11px] text-muted">Brand colours &amp; theme are now in their own “Theme &amp; colours” section below, with a live preview.</p>

      <h3 className="mb-2 mt-6 text-sm font-bold">Order screen</h3>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--color-brand)]" checked={(v.autoPayLater ?? "true") === "true"} onChange={(e) => set("autoPayLater", String(e.target.checked))} />
        <span>Tick “Pay later (due)” by default on new orders
          <span className="block text-xs text-muted">On the New order screen, “Pay later” starts ticked so staff don’t have to collect payment up front. They can still tap “Pay now” for each order. Untick this to ask for payment up front by default.</span></span></label>

      <h3 className="mb-2 mt-6 text-sm font-bold">Day end & daily report</h3>
      <div>
        <label className="label">Email the daily sales &amp; expense report to</label>
        <textarea className="input" rows={2} value={v.dayEndEmails ?? ""} placeholder="owner@example.com, partner@example.com" onChange={(e) => set("dayEndEmails", e.target.value)} />
        <p className="mt-1 text-[11px] text-muted">One or more emails (comma or new line). When you press the red <b>Day end</b> button — or automatically at 1 AM if you forget — today’s sales and expense Excel sheet is emailed here and the restaurant is closed for the day. Leave blank to not send any email.</p>
      </div>

      <h3 className="mb-2 mt-6 text-sm font-bold">SMS to customers</h3>
      <div className={`mb-2 rounded-xl px-3 py-2 text-xs ${smsConnected ? "bg-emerald-50 text-emerald-800" : "bg-stone-100 text-stone-600"}`}>
        {smsConnected ? "✓ An SMS provider is connected for your app." : "No SMS provider is connected yet. The platform admin sets up the provider & API key (kept on the server). These settings take effect once it is connected."}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label">Sender ID (DLT header)</label><input className="input font-mono uppercase" maxLength={6} value={v.smsSenderId ?? ""} placeholder="e.g. ALOPOS" onChange={(e) => set("smsSenderId", e.target.value.toUpperCase().slice(0, 6))} />
          <p className="mt-1 text-[11px] text-muted">The 6-character approved header shown as the SMS sender.</p></div>
        <label className="flex items-start gap-2 pt-6 text-sm"><input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--color-brand)]" checked={v.smsOrderUpdates === "true"} onChange={(e) => set("smsOrderUpdates", String(e.target.checked))} />
          <span>Send order-status updates to customers by SMS<span className="block text-xs text-muted">Order confirmed / out for delivery / delivered. Needs the provider connected above.</span></span></label>
      </div>

      <h3 className="mb-2 mt-6 text-sm font-bold">Barcode scanner</h3>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--color-brand)]" checked={v.scannerEnabled === "true"} onChange={(e) => set("scannerEnabled", String(e.target.checked))} />
        <span>Use a barcode scanner for packaging on the order screen
          <span className="block text-xs text-muted">For a Bluetooth or USB scanner in “keyboard” mode. Give each packaging item a barcode on the Packaging tab; scanning it adds one piece to the order. Leave off if you just tap the photos.</span></span></label>

      {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.t}</p>}
      <button className="btn-primary mt-4" disabled={pending}>{pending ? "Saving…" : "Save settings"}</button>
    </form>
  );
}

// ---------------- Settings lock (super-admin 8-digit OTP) ----------------
import { unlockSettingsAction } from "@/app/actions/settings-lock";
export function SettingsGate() {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="mx-auto max-w-md">
      <div className="card text-center">
        <div className="mb-2 text-4xl">🔒</div>
        <h3 className="text-lg font-bold">Settings are locked</h3>
        <p className="mt-1 text-sm text-muted">To open Settings, ask the platform admin (support) for the current <b>8-digit access code</b> and enter it below. Each code works once.</p>
        <form className="mt-4" onSubmit={(e) => { e.preventDefault(); setErr(""); start(async () => { const r = await unlockSettingsAction(code); if (r.ok) router.refresh(); else setErr(r.error); }); }}>
          <input className="input text-center font-mono text-2xl tracking-[0.4em]" inputMode="numeric" maxLength={8} autoFocus value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="••••••••" aria-label="8-digit access code" />
          {err && <p className="mt-2 text-sm text-red-700">{err}</p>}
          <button className="btn-primary mt-3 w-full" disabled={pending || code.length !== 8}>{pending ? "Checking…" : "Unlock settings"}</button>
        </form>
      </div>
    </div>
  );
}

// ---------------- Theme & colours (multi-tone, live preview, revert) ----------------
const THEME_PRESETS: { name: string; primary: string; accent: string; tone3: string; tone4: string }[] = [
  { name: "Sindoor & Gold", primary: "#9a1c1f", accent: "#c8962e", tone3: "#6e1012", tone4: "#9c7219" },
  { name: "Royal Bengal", primary: "#7b1e3b", accent: "#d4a017", tone3: "#4a1023", tone4: "#a87b10" },
  { name: "Spice Garden", primary: "#1f6f54", accent: "#e08a1e", tone3: "#124234", tone4: "#b56a12" },
  { name: "Midnight Blue", primary: "#1e3a5f", accent: "#e0a030", tone3: "#0f2238", tone4: "#b07a18" },
  { name: "Charcoal & Amber", primary: "#2b2b2b", accent: "#e6a817", tone3: "#141414", tone4: "#b07f10" },
  { name: "Terracotta", primary: "#b4451f", accent: "#2f8f6b", tone3: "#7f2f12", tone4: "#1f6349" },
];
const isHex = (c: string) => /^#[0-9a-f]{6}$/i.test(c);

export function ThemeStudio({ initial, hasPrev }: { initial: { primaryColor: string; accentColor: string; tone3: string; tone4: string }; hasPrev: boolean }) {
  const [primary, setPrimary] = useState(initial.primaryColor || "#9a1c1f");
  const [accent, setAccent] = useState(initial.accentColor || "#c8962e");
  const [tone3, setTone3] = useState(initial.tone3 || "");
  const [tone4, setTone4] = useState(initial.tone4 || "");
  const [live, setLive] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dirty = primary !== (initial.primaryColor || "#9a1c1f") || accent !== (initial.accentColor || "#c8962e") || tone3 !== (initial.tone3 || "") || tone4 !== (initial.tone4 || "");
  const pal = tonePalette(primary, accent, tone3, tone4);
  const savedPal = tonePalette(initial.primaryColor, initial.accentColor, initial.tone3, initial.tone4);

  const save = () =>
    start(async () => {
      const r = await saveThemeAction({ primaryColor: primary, accentColor: accent, tone3, tone4 });
      setMsg(r.ok ? { ok: true, t: "Theme saved." } : { ok: false, t: r.error });
      if (r.ok) { removeLive(); router.refresh(); }
    });

  // Live preview: inject the theme into the whole page so they can test before saving.
  const css = useMemo(() => themeCss(primary, accent, tone3, tone4), [primary, accent, tone3, tone4]);
  function removeLive() { document.getElementById("theme-live")?.remove(); }
  useEffect(() => {
    if (!live) { removeLive(); return; }
    let el = document.getElementById("theme-live") as HTMLStyleElement | null;
    if (!el) { el = document.createElement("style"); el.id = "theme-live"; document.head.appendChild(el); }
    el.textContent = css;
    return () => { /* keep while live stays on */ };
  }, [css, live]);
  useEffect(() => () => removeLive(), []);

  // Auto-save 15 minutes after the last change (they can also press Save any time).
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!dirty) return;
    timer.current = setTimeout(() => { save(); setMsg({ ok: true, t: "Theme auto-saved (15 min)." }); }, 15 * 60 * 1000);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primary, accent, tone3, tone4]);

  const picker = (label: string, hint: string, value: string, onChange: (v: string) => void, placeholder = "") => (
    <div>
      <label className="label">{label}</label>
      <div className="flex gap-2">
        <input type="color" aria-label={label} className="h-11 w-14 shrink-0 cursor-pointer rounded-xl border border-line bg-white p-1" value={isHex(value) ? value : (placeholder || "#000000")} onChange={(e) => onChange(e.target.value)} />
        <input className="input" value={value} placeholder={placeholder ? `auto (${placeholder})` : ""} onChange={(e) => onChange(e.target.value)} />
      </div>
      <p className="mt-1 text-[11px] text-muted">{hint}</p>
    </div>
  );
  const swatch = (c: string, label: string) => (
    <div className="flex flex-col items-center gap-1">
      <span className="h-9 w-9 rounded-lg border border-black/10" style={{ background: c }} />
      <span className="text-[10px] text-muted">{label}</span>
    </div>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {THEME_PRESETS.map((p) => (
          <button key={p.name} type="button" onClick={() => { setPrimary(p.primary); setAccent(p.accent); setTone3(p.tone3); setTone4(p.tone4); setLive(true); }}
            className="flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold hover:border-brand">
            <span className="flex -space-x-1">
              {[p.primary, p.tone3, p.accent, p.tone4].map((c, i) => <span key={i} className="h-4 w-4 rounded-full border border-white" style={{ background: c }} />)}
            </span>
            {p.name}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {picker("Main colour", "Buttons, menu, headings.", primary, setPrimary)}
        {picker("Accent colour", "Highlights, badges, ‘Today’ chips.", accent, setAccent)}
        {picker("3rd tone (gradient)", "Deepens the header/menu into a gradient. Leave blank to auto-make from the main colour.", tone3, setTone3, pal.tone3)}
        {picker("4th tone (deep accent)", "Darker accent for footers / strong highlights. Blank = auto from the accent.", tone4, setTone4, pal.tone4)}
      </div>

      {/* what changes to what: saved -> new */}
      <div className="mt-4 rounded-xl border border-line p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">What changes</div>
        <div className="flex items-center gap-4">
          <div className="flex gap-3">{swatch(savedPal.primary, "Main")}{swatch(savedPal.tone3, "3rd")}{swatch(savedPal.accent, "Accent")}{swatch(savedPal.tone4, "4th")}</div>
          <span className="text-xl text-muted">→</span>
          <div className="flex gap-3">{swatch(pal.primary, "Main")}{swatch(pal.tone3, "3rd")}{swatch(pal.accent, "Accent")}{swatch(pal.tone4, "4th")}</div>
        </div>
      </div>

      {/* live mock-up of the real UI */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-line">
        <div className="flex items-center gap-2 px-4 py-3 text-white" style={{ background: `linear-gradient(135deg, ${pal.primary}, ${pal.tone3})` }}>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-sm">🍽️</span>
          <span className="font-display text-lg font-bold">Your Restaurant</span>
          <span className="ml-auto rounded-full px-2.5 py-1 text-xs font-bold text-ink" style={{ background: pal.accent }}>★ Today</span>
        </div>
        <div className="space-y-2 bg-white p-4">
          <div className="flex gap-2">
            <span className="rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ background: pal.primary }}>Save order</span>
            <span className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: pal.accent, color: "#341503" }}>UPI</span>
            <span className="rounded-xl border px-4 py-2 text-sm font-semibold" style={{ borderColor: pal.tone4, color: pal.tone4 }}>Pay later</span>
          </div>
          <div className="rounded-xl p-3 text-sm" style={{ background: `${pal.accent}22` }}>Highlighted row / due amount uses the accent tint.</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-[var(--color-brand)]" checked={live} onChange={(e) => setLive(e.target.checked)} /> Test on the whole page (live, not saved)</label>
        <button type="button" className="btn-primary ml-auto" disabled={pending || !dirty} onClick={save}>{pending ? "Saving…" : dirty ? "Save theme" : "Saved"}</button>
        <button type="button" className="btn-ghost" disabled={pending || !hasPrev} onClick={() => start(async () => { const r = await revertThemeAction(); setMsg(r.ok ? { ok: true, t: "Went back to the previous theme." } : { ok: false, t: r.error }); if (r.ok) { removeLive(); router.refresh(); } })}>↩ Revert to previous theme</button>
        <button type="button" className="text-xs text-brand underline" onClick={() => { setPrimary("#9a1c1f"); setAccent("#c8962e"); setTone3(""); setTone4(""); setLive(true); }}>Reset to red &amp; gold</button>
      </div>
      {dirty && <p className="mt-2 text-[11px] text-muted">Unsaved — turn on “Test” to see it live, press Save, or it auto-saves 15 minutes after your last change.</p>}
      {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.t}</p>}
    </div>
  );
}

// ---------------- Logins & per-person access ----------------
type U = { id: number; name: string; username: string; phone: string; role: Role; active: boolean; perms: PermKey[] };
const ROLE_OPTS: [Role, string][] = [
  ["OWNER", "Everything, always (incl. settings & logins)"],
  ["MANAGER", "Starts with everything except reports & settings"],
  ["CASHIER", "Starts with orders, bills, customers, expenses, cash"],
  ["KITCHEN", "Starts with today's menu, recipes, stock, wastage"],
];
const ALL_TAB_KEYS = (Object.keys(MODULES) as PermKey[]).filter((k) => k !== "settings") as PermKey[];
const POWER_KEYS = Object.keys(POWERS) as PermKey[];

export function UsersManager({ users, meId, features = [] }: { users: U[]; meId: number; features?: string[] }) {
  const TAB_KEYS = ALL_TAB_KEYS.filter((k) => !FEATURE_TABS[k] || features.includes(FEATURE_TABS[k]));
  const [edit, setEdit] = useState<U | "new" | null>(null);
  const [v, setV] = useState({ name: "", username: "", phone: "", password: "", role: "CASHIER" as Role, active: true, perms: ROLE_DEFAULTS.CASHIER as PermKey[] });
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const open = (u: U | "new") => {
    setErr(""); setEdit(u);
    setV(u === "new" ? { name: "", username: "", phone: "", password: "", role: "CASHIER", active: true, perms: [...ROLE_DEFAULTS.CASHIER] }
      : { name: u.name, username: u.username, phone: u.phone, password: "", role: u.role, active: u.active, perms: [...u.perms] });
  };
  const toggle = (k: PermKey) => setV((s) => ({ ...s, perms: s.perms.includes(k) ? s.perms.filter((x) => x !== k) : [...s.perms, k] }));
  const isOwner = v.role === "OWNER";
  const box = (k: PermKey, label: string) => (
    <label key={k} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm ${isOwner || v.perms.includes(k) ? "border-gold bg-gold-light/50" : "border-line"}`}>
      <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" disabled={isOwner} checked={isOwner || v.perms.includes(k)} onChange={() => toggle(k)} />{label}
    </label>
  );
  return (
    <div>
      <ul className="divide-y divide-line">
        {users.map((u) => (
          <li key={u.id} className="flex items-center justify-between gap-2 py-2.5">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold-light font-bold">{u.name.slice(0, 1).toUpperCase()}</span>
              <div>
                <div className="font-medium">{u.name} {u.id === meId && <span className="text-xs text-muted">(you)</span>}</div>
                <div className="text-xs text-muted">@{u.username} · {ROLE_LABEL[u.role]} · {u.role === "OWNER" ? "all tabs" : `${u.perms.filter((p) => TAB_KEYS.includes(p)).length} tabs`}{!u.active && " · inactive"}</div>
              </div>
            </div>
            <button className="btn-ghost btn-sm" onClick={() => open(u)}>Edit access</button>
          </li>
        ))}
      </ul>
      <button className="btn-primary mt-3" onClick={() => open("new")}>+ Add login</button>
      <Modal open={edit !== null} onClose={() => setEdit(null)} title={edit === "new" ? "New login" : `Edit ${v.name}`} wide>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Person&apos;s name</label><input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Shown when they are logged in" /></div>
            <div><label className="label">Phone</label><input className="input" type="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></div>
            <div><label className="label">Username</label><input className="input" autoCapitalize="none" disabled={edit !== "new"} value={v.username} onChange={(e) => setV({ ...v, username: e.target.value })} /></div>
            <div><label className="label">{edit === "new" ? "Password" : "New password (blank = keep)"}</label><input className="input" type="text" autoComplete="off" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} /></div>
          </div>
          <div>
            <label className="label">Role</label>
            <div className="grid gap-1.5 sm:grid-cols-2">{ROLE_OPTS.map(([r, d]) => (
              <label key={r} className={`flex cursor-pointer gap-2 rounded-xl border p-2.5 ${v.role === r ? "border-brand bg-brand-light/60" : "border-line"}`}>
                <input type="radio" name="role" className="mt-1 accent-[var(--color-brand)]" checked={v.role === r} onChange={() => setV({ ...v, role: r, perms: [...ROLE_DEFAULTS[r]] })} />
                <span><span className="text-sm font-semibold">{ROLE_LABEL[r]}</span><span className="block text-xs text-muted">{d}</span></span>
              </label>
            ))}</div>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="label !mb-0">Tabs this person can open</label>
              {!isOwner && <div className="flex gap-3 text-xs font-semibold text-brand">
                <button type="button" onClick={() => setV({ ...v, perms: Array.from(new Set([...v.perms, ...TAB_KEYS])) })}>All</button>
                <button type="button" onClick={() => setV({ ...v, perms: v.perms.filter((p) => !TAB_KEYS.includes(p)) })}>None</button>
                <button type="button" onClick={() => setV({ ...v, perms: [...ROLE_DEFAULTS[v.role]] })}>Role default</button>
              </div>}
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">{TAB_KEYS.map((k) => box(k, MODULES[k as keyof typeof MODULES].label))}</div>
            <label className="label mt-3">Extra permissions</label>
            <div className="grid gap-1.5 sm:grid-cols-2">{POWER_KEYS.map((k) => box(k, POWERS[k as keyof typeof POWERS]))}</div>
            <p className="mt-2 text-[11px] text-muted">Settings &amp; logins are always owner-only. Changes apply on their next page load.</p>
          </div>
          {edit !== "new" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-[var(--color-brand)]" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> Active (can log in)</label>}
          {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
          <button className="btn-primary w-full" disabled={pending} onClick={() => start(async () => {
            const r = edit === "new"
              ? await createUserAction({ name: v.name, username: v.username, password: v.password, phone: v.phone, role: v.role, perms: v.perms })
              : await updateUserAction((edit as U).id, { name: v.name, phone: v.phone, role: v.role, active: v.active, password: v.password || undefined, perms: v.perms });
            if (!r.ok) setErr(r.error); else { setEdit(null); router.refresh(); }
          })}>{pending ? "Saving…" : "Save"}</button>
        </div>
      </Modal>
    </div>
  );
}

// ---------------- Online payments (UPI link / Razorpay) ----------------
type PayInit = { payLinkUrl: string; payGateway: string; razorpayKeyId: string; instamojoClientId: string; instamojoTest: boolean; cashfreeAppId: string; cashfreeTest: boolean };
type PaySaved = { razorpaySecret: boolean; razorpayWebhook: boolean; instamojoSecret: boolean; instamojoSalt: boolean; cashfreeSecret: boolean };
export function PaymentSettings({ initial, saved, origin, gatewaysAllowed = true }: { initial: PayInit; saved: PaySaved; origin: string; gatewaysAllowed?: boolean }) {
  const [v, setV] = useState({ ...initial, razorpayKeySecret: "", razorpayWebhookSecret: "", instamojoClientSecret: "", instamojoSalt: "", cashfreeSecret: "" });
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (k: keyof typeof v, x: string | boolean) => setV((o) => ({ ...o, [k]: x }));
  const secret = (k: keyof typeof v, label: string, has: boolean, ph = "") => (
    <div><label className="label">{label}</label><input className="input font-mono" type="password" autoComplete="new-password" value={String(v[k])} placeholder={has ? "saved - leave blank to keep" : ph} onChange={(e) => set(k, e.target.value.trim())} /></div>
  );
  const G = [
    { k: "", label: "None", hint: "UPI QR only" },
    { k: "razorpay", label: "Razorpay", hint: "cards, UPI, net banking" },
    { k: "instamojo", label: "Instamojo", hint: "payment requests" },
    { k: "cashfree", label: "Cashfree", hint: "payment links" },
  ];
  return (
    <form onSubmit={(e) => { e.preventDefault(); start(async () => {
      const r = await savePaymentSettingsAction(v);
      setMsg(r.ok ? { ok: true, t: "Saved." } : { ok: false, t: r.error });
      if (r.ok) { setV((s) => ({ ...s, razorpayKeySecret: "", razorpayWebhookSecret: "", instamojoClientSecret: "", instamojoSalt: "", cashfreeSecret: "" })); router.refresh(); }
    }); }}>
      <div className="space-y-4">
        <div className="rounded-xl bg-cream p-3 text-xs leading-relaxed">
          <b>UPI QR (free):</b> put your UPI ID in <i>Restaurant &amp; bill details</i> below. Every bill gets a QR with the amount filled in.
          Staff mark the payment as UPI after checking your UPI app.
        </div>
        <div>
          <label className="label">Fixed payment page link (optional)</label>
          <input className="input" value={v.payLinkUrl} placeholder="e.g. https://razorpay.me/@yourname" onChange={(e) => set("payLinkUrl", e.target.value)} />
          <p className="mt-1 text-[11px] text-muted">Any “pay us” page (Razorpay.me, PhonePe / Paytm business link, Instamojo…). Printed as a QR when there is no UPI ID.</p>
        </div>
        {!gatewaysAllowed ? (
          <div className="rounded-xl border border-line p-3 text-sm text-muted">Payment gateways (Razorpay, Instamojo, Cashfree links marked paid automatically) are not in your plan. Ask the platform admin to add them.</div>
        ) : (
          <div className="rounded-xl border border-line p-3">
            <h4 className="text-sm font-bold">Payment gateway for payment links</h4>
            <p className="mb-3 mt-1 text-[11px] text-muted">With a gateway set up, every order gets a <b>“Payment link”</b> button for the exact amount due; the bill is marked paid automatically when the customer pays. Each gateway charges its own fee per payment. Try test / sandbox keys first.</p>
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {G.map((g) => (
                <label key={g.k} className={`cursor-pointer rounded-xl border p-2 text-sm ${v.payGateway === g.k ? "border-brand bg-gold-light/40" : "border-line"}`}>
                  <input type="radio" name="gw" className="mr-1 accent-[var(--color-brand)]" checked={v.payGateway === g.k} onChange={() => set("payGateway", g.k)} /><b>{g.label}</b>
                  <span className="block text-[11px] text-muted">{g.hint}</span>
                </label>
              ))}
            </div>
            {v.payGateway === "razorpay" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <p className="text-[11px] text-muted sm:col-span-2">Razorpay Dashboard → Account &amp; Settings → API Keys. Use <b>rzp_test_…</b> keys to try it.</p>
                <div><label className="label">Key ID</label><input className="input font-mono" value={v.razorpayKeyId} placeholder="rzp_live_…" onChange={(e) => set("razorpayKeyId", e.target.value.trim())} /></div>
                {secret("razorpayKeySecret", "Key secret", saved.razorpaySecret)}
                <div className="sm:col-span-2">{secret("razorpayWebhookSecret", "Webhook secret (optional, for instant “paid”)", saved.razorpayWebhook, "any password you choose")}
                  <p className="mt-1 text-[11px] text-muted">Razorpay → Webhooks → Add: URL <span className="break-all font-mono">{origin}/api/pay/razorpay</span>, event <b>payment_link.paid</b>, same secret.</p></div>
              </div>
            )}
            {v.payGateway === "instamojo" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <p className="text-[11px] text-muted sm:col-span-2">Instamojo dashboard → <b>API &amp; Plugins</b> → Generate credentials (Client ID, Client Secret) and copy the <b>Private Salt</b>. For testing, make an account on test.instamojo.com and tick “Test mode”.</p>
                <div><label className="label">Client ID</label><input className="input font-mono" value={v.instamojoClientId} onChange={(e) => set("instamojoClientId", e.target.value.trim())} /></div>
                {secret("instamojoClientSecret", "Client secret", saved.instamojoSecret)}
                {secret("instamojoSalt", "Private salt (checks “paid” messages)", saved.instamojoSalt)}
                <label className="flex items-end gap-2 pb-3 text-sm"><input type="checkbox" className="h-5 w-5 accent-[var(--color-brand)]" checked={v.instamojoTest} onChange={(e) => set("instamojoTest", e.target.checked)} />Test mode (test.instamojo.com)</label>
                <p className="text-[11px] text-muted sm:col-span-2">“Paid” arrives automatically at <span className="break-all font-mono">{origin}/api/pay/instamojo</span> (only once the app is online on https). Otherwise tap “Check payment” on the order.</p>
              </div>
            )}
            {v.payGateway === "cashfree" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <p className="text-[11px] text-muted sm:col-span-2">Cashfree Merchant Dashboard → Developers → <b>API Keys</b> (Payment Gateway). Sandbox keys work with “Test mode”.</p>
                <div><label className="label">App ID (client id)</label><input className="input font-mono" value={v.cashfreeAppId} onChange={(e) => set("cashfreeAppId", e.target.value.trim())} /></div>
                {secret("cashfreeSecret", "Secret key", saved.cashfreeSecret)}
                <label className="flex items-end gap-2 pb-3 text-sm"><input type="checkbox" className="h-5 w-5 accent-[var(--color-brand)]" checked={v.cashfreeTest} onChange={(e) => set("cashfreeTest", e.target.checked)} />Test mode (sandbox)</label>
                <p className="text-[11px] text-muted sm:col-span-2">Cashfree sends “paid” to <span className="break-all font-mono">{origin}/api/pay/cashfree</span> automatically for each link (https only). Otherwise tap “Check payment” on the order.</p>
              </div>
            )}
          </div>
        )}
      </div>
      {msg && <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{msg.t}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save payment settings"}</button>
        {v.payGateway && <button type="button" className="btn-ghost" disabled={pending} onClick={() => start(async () => {
          setMsg(null); const r = await testGatewayAction();
          setMsg(r.ok ? { ok: true, t: r.data } : { ok: false, t: `Test failed - ${r.error}` });
        })}>Test connection</button>}
      </div>
      <p className="mt-1 text-[11px] text-muted">Save first, then Test connection. It makes a small test link (₹1, or ₹10 on Instamojo) to check the keys - nothing is charged unless someone pays it.</p>
    </form>
  );
}

/** Owner: switch the extra features the platform gave this restaurant on / off */
export function OwnFeatures({ allowed, off: initialOff }: { allowed: string[]; off: string[] }) {
  const [off, setOff] = useState(initialOff);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const keys = (Object.keys(FEATURES) as FeatureKey[]).filter((k) => allowed.includes(k)); // same order as the feature list (KOT screen next to KOT print)
  const dirty = JSON.stringify([...off].sort()) !== JSON.stringify([...initialOff].sort());
  const save = () => start(async () => { const r = await setOwnFeaturesAction(off); setMsg(r.ok ? { ok: true, t: "Saved." } : { ok: false, t: r.error }); if (r.ok) router.refresh(); });
  if (!keys.length) return <p className="text-sm text-muted">No extra features in your plan yet. Ask the platform admin to upgrade.</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">Turn features on or off, then press <b>Save</b>.</p>
      {keys.map((k) => {
        const on = !off.includes(k);
        return (
          <label key={k} className="flex items-start gap-3 rounded-xl border border-line p-3">
            <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--color-brand)]" checked={on} aria-label={FEATURES[k].label}
              onChange={(e) => { const want = e.target.checked; setOff((o) => (want ? o.filter((x) => x !== k) : [...o, k])); }} />
            <span><b>{FEATURES[k].label}</b> <span className={`ml-1 rounded-full px-2 text-[11px] font-bold ${on ? "bg-emerald-100 text-emerald-800" : "bg-stone-100 text-stone-600"}`}>{on ? "ON" : "OFF"}</span>
              <span className="block text-xs text-muted">{FEATURES[k].help}</span></span>
          </label>
        );
      })}
      <div className="flex items-center gap-3 pt-1">
        <button className="btn-primary btn-sm" disabled={pending || !dirty} onClick={save}>{pending ? "Saving…" : dirty ? "Save" : "Saved"}</button>
        {dirty && <button type="button" className="btn-ghost btn-sm" onClick={() => { setOff(initialOff); setMsg(null); }}>Undo</button>}
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.t}</span>}
      </div>
    </div>
  );
}

type PolicyRow = { kind: string; title: string; field: string; url: string; value: string; ready: string };
/** Owner: public website / policy pages that payment gateways ask for */
export function PolicyPages({ orderUrl, rows }: { orderUrl: string; rows: PolicyRow[] }) {
  const [v, setV] = useState(Object.fromEntries(rows.map((r) => [r.field, r.value])) as Record<string, string>);
  const [open, setOpen] = useState("");
  const [copied, setCopied] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const copy = (x: string) => navigator.clipboard?.writeText(x).then(() => { setCopied(x); setTimeout(() => setCopied(""), 1500); });
  const url = (k: string) => rows.find((r) => r.kind === k)?.url ?? "";
  const line = (label: string, value: string, isLink = true) => (
    <div className="flex flex-wrap items-center gap-2 border-b border-line py-1.5 text-sm last:border-0">
      <span className="w-52 shrink-0 text-muted">{label}</span>
      {isLink ? <a className="break-all font-mono text-xs text-brand underline" href={value} target="_blank" rel="noreferrer">{value}</a> : <b>{value}</b>}
      {isLink && <button type="button" className="btn-ghost btn-sm !py-0.5" onClick={() => copy(value)}>{copied === value ? "Copied ✓" : "Copy"}</button>}
    </div>
  );
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Payment gateways (Instamojo, Razorpay, Cashfree) ask for a website and these policy pages before they switch on payments. Your restaurant already has them - copy the answers below into their form.</p>
      <div className="rounded-xl bg-cream p-3">
        <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Answers for the gateway form</div>
        {line("Do you have a website?", "Yes", false)}
        {line("Website URL", orderUrl)}
        {line("Public contact details", url("contact"))}
        {line("Terms and conditions", url("terms"))}
        {line("Refund and cancellation policy", url("refund"))}
        {line("Shipping and delivery policy", url("delivery"))}
        {line("Privacy policy (if asked)", url("privacy"))}
        {line("Website shows prices?", "Yes (the menu shows prices)", false)}
        {line("Website has a pay button?", "Yes (customers pay by UPI / payment link)", false)}
        <p className="mt-2 text-[11px] text-muted">For “Shipping and delivery” untick “Not applicable” - you deliver food, so give the delivery link. Business category: Food &amp; beverages / Restaurant.</p>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); start(async () => {
        const r = await savePoliciesAction(v as never);
        setMsg(r.ok ? { ok: true, t: "Saved. The pages show your text now." } : { ok: false, t: r.error }); if (r.ok) router.refresh();
      }); }} className="space-y-2">
        <div className="text-xs font-bold uppercase tracking-wide text-muted">Page text</div>
        {rows.map((r) => (
          <div key={r.kind} className="rounded-xl border border-line">
            <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold" onClick={() => setOpen(open === r.kind ? "" : r.kind)}>
              <span>{r.title} <span className="font-normal text-muted">· {v[r.field]?.trim() ? "your own text" : r.kind === "contact" ? "from your restaurant details" : "ready-made text"}</span></span><span>{open === r.kind ? "▲" : "▼"}</span>
            </button>
            {open === r.kind && (
              <div className="space-y-2 border-t border-line p-3">
                {r.kind === "contact" ? <p className="text-xs text-muted">Name, address, phones, WhatsApp, email, GSTIN and FSSAI come from Restaurant details. Add anything extra (opening hours, a map link):</p>
                  : <p className="text-xs text-muted">Leave empty to use the ready-made text (it updates itself from your settings). To change it, start from the ready-made text and edit. Use “## ” for a heading and “- ” for a point.</p>}
                <textarea className="input min-h-[220px] font-mono text-xs" value={v[r.field] ?? ""} placeholder={r.kind === "contact" ? "e.g. Open 11 am - 11 pm, closed on Mondays" : "(using the ready-made text)"} onChange={(e) => setV({ ...v, [r.field]: e.target.value })} aria-label={`${r.title} text`} />
                <div className="flex flex-wrap gap-2">
                  {r.kind !== "contact" && <button type="button" className="btn-ghost btn-sm" onClick={() => setV({ ...v, [r.field]: r.ready })}>Start from ready-made text</button>}
                  {v[r.field] && <button type="button" className="btn-ghost btn-sm" onClick={() => setV({ ...v, [r.field]: "" })}>Use ready-made text again</button>}
                  <a className="btn-ghost btn-sm" href={r.url} target="_blank" rel="noreferrer">View page</a>
                </div>
              </div>
            )}
          </div>
        ))}
        {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{msg.t}</p>}
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save page text"}</button>
        <p className="text-[11px] text-muted">The ready-made text is a starting point, not legal advice - read it once and change anything that does not match how you work.</p>
      </form>
    </div>
  );
}
