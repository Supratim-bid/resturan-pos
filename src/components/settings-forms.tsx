"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createUserAction, saveSettingsAction, savePaymentSettingsAction, testGatewayAction, savePoliciesAction, setOwnFeatureAction, updateUserAction } from "@/app/actions/settings";
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

export function SettingsForm({ initial }: { initial: Record<string, string> }) {
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (k: string, x: string) => setV((s) => ({ ...s, [k]: x }));
  const preview = useMemo(() => {
    const d = Math.max(1, Math.min(8, Number(v.billDigits) || 4)), n = Math.max(1, Number(v.billStart) || 1);
    return `${v.billPrefix ?? ""}${v.billUseFy === "true" ? fyOf(new Date()) + "/" : ""}${String(n).padStart(d, "0")}`;
  }, [v.billPrefix, v.billDigits, v.billStart, v.billUseFy]);
  const color = (k: "primaryColor" | "accentColor", label: string) => (
    <div>
      <label className="label">{label}</label>
      <div className="flex gap-2">
        <input type="color" className="h-11 w-14 cursor-pointer rounded-xl border border-line bg-white p-1" value={/^#[0-9a-f]{6}$/i.test(v[k] ?? "") ? v[k] : "#000000"} onChange={(e) => set(k, e.target.value)} />
        <input className="input" value={v[k] ?? ""} onChange={(e) => set(k, e.target.value)} />
      </div>
    </div>
  );
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
        <div className="sm:col-span-2"><label className="label">Line under the name</label><input className="input" value={v.billHeaderNote ?? ""} placeholder="e.g. 100% homemade · No MSG · Pure mustard oil" onChange={(e) => set("billHeaderNote", e.target.value)} /></div>
        <div><label className="label">Social / website line</label><input className="input" value={v.billSocial ?? ""} placeholder="e.g. Insta @alooposto · WhatsApp 98xxxxxx" onChange={(e) => set("billSocial", e.target.value)} /></div>
        <div><label className="label">Payment QR on bill</label>
          <select className="input" value={v.billShowQr || "due"} onChange={(e) => set("billShowQr", e.target.value)}>
            <option value="due">Only when money is due</option><option value="always">Always (also on paid bills)</option><option value="never">Never</option>
          </select><p className="mt-1 text-[11px] text-muted">Needs the UPI ID above, or a payment link (Online payments)</p></div>
        <div className="sm:col-span-2"><label className="label">Text under the QR</label><input className="input" value={v.billQrLabel ?? ""} onChange={(e) => set("billQrLabel", e.target.value)} /></div>
        <div className="sm:col-span-2"><label className="label">Small print / terms (bottom of bill)</label><textarea className="input" rows={2} value={v.billTerms ?? ""} placeholder="e.g. Consume within 2 hours. Goods once sold will not be taken back." onChange={(e) => set("billTerms", e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-[var(--color-brand)]" checked={(v.billShowLogo ?? "true") === "true"} onChange={(e) => set("billShowLogo", String(e.target.checked))} /> Show logo on bills</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-[var(--color-brand)]" checked={v.billShowCashier === "true"} onChange={(e) => set("billShowCashier", String(e.target.checked))} /> Print “Billed by” (who made the bill)</label>
      </div>

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

      <h3 className="mb-2 mt-6 text-sm font-bold">Brand colours & receipt</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        {color("primaryColor", "Main colour (buttons, headings)")}
        {color("accentColor", "Accent colour (highlights)")}
        <div><label className="label">Default thermal paper</label>
          <select className="input" value={v.receiptWidth ?? "58"} onChange={(e) => set("receiptWidth", e.target.value)}>
            <option value="58">2 inch (58mm)</option><option value="80">3 inch (80mm)</option>
          </select></div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line p-3">
        <span className="text-xs text-muted">Preview:</span>
        <span className="rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ background: v.primaryColor }}>Save order</span>
        <span className="rounded-full px-3 py-1.5 text-sm font-semibold" style={{ background: v.accentColor }}>★ Today</span>
        <span className="font-display text-lg font-bold" style={{ color: v.primaryColor }}>{v.name}</span>
        <button type="button" className="ml-auto text-xs text-brand underline" onClick={() => { set("primaryColor", "#9a1c1f"); set("accentColor", "#c8962e"); }}>Reset to red &amp; gold</button>
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
          <input className="input" value={v.payLinkUrl} placeholder="e.g. https://razorpay.me/@alooposto" onChange={(e) => set("payLinkUrl", e.target.value)} />
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
      <p className="mt-1 text-[11px] text-muted">Save first, then Test connection. It makes a ₹1 link to check the keys (nothing is charged).</p>
    </form>
  );
}

/** Owner: switch the extra features the platform gave this restaurant on / off */
export function OwnFeatures({ allowed, off: initialOff }: { allowed: string[]; off: string[] }) {
  const [off, setOff] = useState(initialOff);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const keys = allowed.filter((k): k is FeatureKey => k in FEATURES);
  if (!keys.length) return <p className="text-sm text-muted">No extra features in your plan yet. Ask the platform admin to upgrade.</p>;
  return (
    <div className="space-y-2">
      {keys.map((k) => {
        const on = !off.includes(k);
        return (
          <label key={k} className="flex items-start gap-3 rounded-xl border border-line p-3">
            <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--color-brand)]" checked={on} disabled={pending} aria-label={FEATURES[k].label}
              onChange={(e) => { const want = e.target.checked; setOff((o) => (want ? o.filter((x) => x !== k) : [...o, k])); start(async () => {
                const r = await setOwnFeatureAction(k, want); if (!r.ok) { setOff(initialOff); setMsg({ ok: false, t: r.error }); } else { setMsg({ ok: true, t: `${FEATURES[k].label}: ${want ? "on" : "off"}.` }); router.refresh(); }
              }); }} />
            <span><b>{FEATURES[k].label}</b> <span className={`ml-1 rounded-full px-2 text-[11px] font-bold ${on ? "bg-emerald-100 text-emerald-800" : "bg-stone-100 text-stone-600"}`}>{on ? "ON" : "OFF"}</span>
              <span className="block text-xs text-muted">{FEATURES[k].help}</span></span>
          </label>
        );
      })}
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.t}</p>}
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
