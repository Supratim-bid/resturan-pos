"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  requestOtpAction, verifyOtpAction, passwordLoginAction, createTenantAction, updateTenantAction, setTenantActiveAction, addOwnerAction,
  resetUserPasswordAction, deleteTenantAction, addSuperAdminAction, setSuperAdminActiveAction, setTenantFeatureAction,
} from "@/app/actions/admin";
import { FEATURES, FEATURE_KEYS } from "@/lib/features";
import { Modal } from "./crud";

const Msg = ({ m }: { m: { ok: boolean; t: string } | null }) => (m ? <p className={`rounded-lg px-3 py-2 text-sm ${m.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{m.t}</p> : null);

export function OtpLogin({ passwordOn = false }: { passwordOn?: boolean }) {
  const [way, setWay] = useState<"code" | "password">("code");
  const [pw, setPw] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [m, setM] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const send = () => start(async () => { setM(null); const r = await requestOtpAction(email); if (r.ok) { setStep("code"); setM({ ok: true, t: r.msg ?? "Code sent." }); } else setM({ ok: false, t: r.error }); });
  return (
    <div className="card space-y-4 !p-5">
      {passwordOn && (
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-cream p-1 text-sm font-bold">
          <button type="button" className={`rounded-lg py-2 ${way === "code" ? "bg-brand text-white" : ""}`} onClick={() => { setWay("code"); setM(null); }}>Email code</button>
          <button type="button" className={`rounded-lg py-2 ${way === "password" ? "bg-brand text-white" : ""}`} onClick={() => { setWay("password"); setM(null); }}>Password</button>
        </div>
      )}
      {way === "password" ? (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); start(async () => { setM(null); const r = await passwordLoginAction(email, pw); if (r && !r.ok) setM({ ok: false, t: r.error }); }); }}>
          <div><label className="label">Super admin email</label><input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div><label className="label">Password</label><input className="input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></div>
          <button className="btn-primary w-full" disabled={pending}>{pending ? "Checking…" : "Log in"}</button>
        </form>
      ) : step === "email" ? (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <div><label className="label">Super admin email</label><input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <button className="btn-primary w-full" disabled={pending}>{pending ? "Sending…" : "Email me a login code"}</button>
        </form>
      ) : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); start(async () => { setM(null); const r = await verifyOtpAction(email, code); if (r && !r.ok) setM({ ok: false, t: r.error }); }); }}>
          <p className="text-sm">Code sent to <b>{email}</b></p>
          <div><label className="label">6-digit code</label><input className="input text-center font-mono text-2xl tracking-[0.5em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus /></div>
          <button className="btn-primary w-full" disabled={pending || code.length !== 6}>{pending ? "Checking…" : "Log in"}</button>
          <div className="flex justify-between text-xs">
            <button type="button" className="text-brand" onClick={() => { setStep("email"); setCode(""); setM(null); }}>← Change email</button>
            <button type="button" className="text-brand" disabled={pending} onClick={send}>Resend code</button>
          </div>
        </form>
      )}
      <Msg m={m} />
    </div>
  );
}

const field = (label: string, v: string, set: (x: string) => void, o: { type?: string; ph?: string; help?: string; half?: boolean } = {}) => (
  <div className={o.half ? "" : "sm:col-span-2"}>
    <label className="label">{label}</label>
    <input className="input" type={o.type ?? "text"} value={v} placeholder={o.ph} autoCapitalize="none" onChange={(e) => set(e.target.value)} />
    {o.help && <p className="mt-1 text-[11px] text-muted">{o.help}</p>}
  </div>
);

export function NewTenantButton() {
  const [open, setOpen] = useState(false);
  const blank = { name: "", code: "", ownerName: "", ownerUsername: "", ownerPassword: "", ownerPhone: "", contactEmail: "", contactPhone: "", plan: "Standard", billPrefix: "", sample: false };
  const [v, setV] = useState(blank);
  const [m, setM] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const s = (k: keyof typeof blank) => (x: string) => setV((o) => ({ ...o, [k]: x }));
  return (
    <>
      <button className="btn-primary" onClick={() => { setV(blank); setM(null); setOpen(true); }}>+ New restaurant</button>
      <Modal open={open} onClose={() => setOpen(false)} title="New restaurant" wide>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("Restaurant name", v.name, (x) => setV((o) => ({ ...o, name: x, code: o.code || "" })), { half: true })}
          {field("Restaurant code (for login)", v.code, (x) => s("code")(x.toLowerCase().replace(/[^a-z0-9-]/g, "")), { half: true, ph: "e.g. alooposto", help: "Staff type this on the login screen. Lowercase letters, numbers, dashes." })}
          {field("Owner's full name", v.ownerName, s("ownerName"), { half: true, help: "Shown in the app when they are logged in" })}
          {field("Owner phone", v.ownerPhone, s("ownerPhone"), { half: true, type: "tel" })}
          {field("Owner username", v.ownerUsername, (x) => s("ownerUsername")(x.toLowerCase()), { half: true })}
          {field("Owner password", v.ownerPassword, s("ownerPassword"), { half: true, help: "Min 6 characters - share it with the owner" })}
          {field("Contact email", v.contactEmail, s("contactEmail"), { half: true, type: "email" })}
          {field("Contact phone", v.contactPhone, s("contactPhone"), { half: true, type: "tel" })}
          {field("Plan", v.plan, s("plan"), { half: true })}
          {field("Bill number prefix", v.billPrefix, s("billPrefix"), { half: true, ph: "e.g. AP-", help: "Owner can change it later" })}
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="h-5 w-5 accent-[var(--color-brand)]" checked={v.sample} onChange={(e) => setV((o) => ({ ...o, sample: e.target.checked }))} /> Add sample Bengali menu, recipes &amp; ingredients (for demos)</label>
        </div>
        <div className="mt-3"><Msg m={m} /></div>
        <button className="btn-primary mt-3 w-full" disabled={pending} onClick={() => start(async () => {
          const r = await createTenantAction(v);
          if (!r.ok) setM({ ok: false, t: r.error }); else { setOpen(false); router.push(`/admin/restaurants/${r.id}`); router.refresh(); }
        })}>{pending ? "Creating…" : "Create restaurant & owner login"}</button>
      </Modal>
    </>
  );
}

type T = { id: number; name: string; code: string; plan: string; contactName: string; contactEmail: string; contactPhone: string; notes: string; active: boolean };
export function TenantEditor({ t }: { t: T }) {
  const [v, setV] = useState({ name: t.name, code: t.code, plan: t.plan, contactName: t.contactName, contactEmail: t.contactEmail, contactPhone: t.contactPhone, notes: t.notes });
  const [m, setM] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const s = (k: keyof typeof v) => (x: string) => setV((o) => ({ ...o, [k]: x }));
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {field("Name", v.name, s("name"), { half: true })}
        {field("Login code", v.code, (x) => s("code")(x.toLowerCase()), { half: true, help: "Changing it changes what staff type at login" })}
        {field("Contact person", v.contactName, s("contactName"), { half: true })}
        {field("Plan", v.plan, s("plan"), { half: true })}
        {field("Contact email", v.contactEmail, s("contactEmail"), { half: true })}
        {field("Contact phone", v.contactPhone, s("contactPhone"), { half: true })}
        {field("Notes", v.notes, s("notes"))}
      </div>
      <Msg m={m} />
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={pending} onClick={() => start(async () => { const r = await updateTenantAction(t.id, v); setM(r.ok ? { ok: true, t: r.msg ?? "Saved" } : { ok: false, t: r.error }); router.refresh(); })}>Save</button>
        <button className={t.active ? "btn-danger" : "btn-gold"} disabled={pending} onClick={() => {
          if (t.active && !confirm("Pause this restaurant? Nobody from it can log in until you reactivate it.")) return;
          start(async () => { await setTenantActiveAction(t.id, !t.active); router.refresh(); });
        }}>{t.active ? "Pause account" : "Reactivate account"}</button>
      </div>
    </div>
  );
}

export function AddOwner({ tenantId }: { tenantId: number }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: "", username: "", password: "", phone: "" });
  const [m, setM] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <button className="btn-ghost btn-sm" onClick={() => { setOpen(true); setM(null); }}>+ Add owner</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add an owner login">
        <div className="grid gap-3 sm:grid-cols-2">
          {field("Full name", v.name, (x) => setV({ ...v, name: x }), { half: true })}
          {field("Phone", v.phone, (x) => setV({ ...v, phone: x }), { half: true })}
          {field("Username", v.username, (x) => setV({ ...v, username: x.toLowerCase() }), { half: true })}
          {field("Password", v.password, (x) => setV({ ...v, password: x }), { half: true })}
        </div>
        <div className="mt-3"><Msg m={m} /></div>
        <button className="btn-primary mt-3 w-full" disabled={pending} onClick={() => start(async () => { const r = await addOwnerAction(tenantId, v); if (!r.ok) setM({ ok: false, t: r.error }); else { setOpen(false); router.refresh(); } })}>Create owner</button>
      </Modal>
    </>
  );
}

export function ResetPassword({ tenantId, userId, name }: { tenantId: number; userId: number; name: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button className="btn-ghost btn-sm" disabled={pending} onClick={() => {
      const pw = prompt(`New password for ${name} (min 6 characters):`);
      if (!pw) return;
      start(async () => { const r = await resetUserPasswordAction(tenantId, userId, pw); alert(r.ok ? r.msg ?? "Done" : r.error); router.refresh(); });
    }}>Reset password</button>
  );
}

export function DeleteTenant({ id, code }: { id: number; code: string }) {
  const [pending, start] = useTransition();
  return (
    <button className="btn-danger btn-sm" disabled={pending} onClick={() => {
      const c = prompt(`This permanently deletes the restaurant and ALL its data (orders, menu, customers…).\nType the code "${code}" to confirm:`);
      if (!c) return;
      start(async () => { const r = await deleteTenantAction(id, c); if (r && !r.ok) alert(r.error); });
    }}>Delete restaurant permanently</button>
  );
}

export function SuperAdmins({ list, meId }: { list: { id: number; email: string; name: string; active: boolean }[]; meId: number }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [m, setM] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-4">
      <ul className="divide-y divide-line">
        {list.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-2 py-2">
            <div><div className="font-medium">{a.name} {a.id === meId && <span className="text-xs text-muted">(you)</span>}</div><div className="text-xs text-muted">{a.email}{!a.active && " · removed"}</div></div>
            {a.id !== meId && <button className="btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => { const r = await setSuperAdminActiveAction(a.id, !a.active); if (!r.ok) alert(r.error); router.refresh(); })}>{a.active ? "Remove" : "Restore"}</button>}
          </li>
        ))}
      </ul>
      <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await addSuperAdminAction(email, name); setM(r.ok ? { ok: true, t: "Added. They can log in with an email code." } : { ok: false, t: r.error }); if (r.ok) { setEmail(""); setName(""); router.refresh(); } }); }}>
        <input className="input" type="email" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="input" placeholder="name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary" disabled={pending}>Add super admin</button>
      </form>
      <Msg m={m} />
    </div>
  );
}

/** Extra features for one restaurant (switched on by the super admin on request) */
export function TenantFeatures({ id, features: initial }: { id: number; features: string[] }) {
  const [features, setFeatures] = useState(initial);
  const [m, setM] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-2">
      {FEATURE_KEYS.map((k) => {
        const on = features.includes(k);
        return (
          <label key={k} className="flex items-start gap-3 rounded-xl border border-line p-3">
            <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--color-brand)]" checked={on} disabled={pending}
              onChange={(e) => { const want = e.target.checked; setFeatures((f) => want ? [...f, k] : f.filter((x) => x !== k)); start(async () => { const r = await setTenantFeatureAction(id, k, want); if (!r.ok) setFeatures(initial); setM(r.ok ? { ok: true, t: `${FEATURES[k].label}: ${r.msg}` } : { ok: false, t: r.error }); router.refresh(); }); }} />
            <span><b>{FEATURES[k].label}</b> {on ? <span className="ml-1 rounded-full bg-emerald-100 px-2 text-[11px] font-bold text-emerald-800">ON</span> : <span className="ml-1 rounded-full bg-stone-100 px-2 text-[11px] font-bold text-stone-600">OFF</span>}
              <span className="block text-xs text-muted">{FEATURES[k].help}</span></span>
          </label>
        );
      })}
      <Msg m={m} />
    </div>
  );
}
