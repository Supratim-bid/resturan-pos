"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  requestOtpAction, verifyOtpAction, passwordLoginAction, createTenantAction, updateTenantAction, setTenantActiveAction, addOwnerAction,
  resetUserPasswordAction, deleteTenantAction, addSuperAdminAction, setSuperAdminActiveAction, setTenantFeatureAction,
  setTenantPlanAction, savePlanAction, deletePlanAction, openTenantAsOwnerAction, editUserAction, deleteUserAction,
  uploadResourceAction, deleteResourceAction, replySupportAction,
  setTenantValidTillAction, replicateTenantAction,
} from "@/app/actions/admin";
import { useRef } from "react";
import { FEATURES, FEATURE_GROUPS, FEATURE_KEYS, type FeatureKey, type FeatureGroup } from "@/lib/features";
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
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); start(async () => { setM(null); const r = await passwordLoginAction(email, pw); if (r?.ok) { setM({ ok: true, t: "Logged in - opening…" }); location.assign("/admin"); } else if (r) setM({ ok: false, t: r.error }); }); }}>
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
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); start(async () => { setM(null); const r = await verifyOtpAction(email, code); if (r?.ok) { setM({ ok: true, t: "Logged in - opening…" }); location.assign("/admin"); } else if (r) setM({ ok: false, t: r.error }); }); }}>
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

export type PlanOpt = { key: string; name: string; price: number; maxUsers: number };
export function NewTenantButton({ plans = [] }: { plans?: PlanOpt[] }) {
  const [open, setOpen] = useState(false);
  const blank = { name: "", code: "", ownerName: "", ownerUsername: "", ownerPassword: "", ownerPhone: "", contactEmail: "", contactPhone: "", plan: plans[0]?.key ?? "starter", billPrefix: "", sample: false };
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
          {field("Restaurant code (for login)", v.code, (x) => s("code")(x.toLowerCase().replace(/[^a-z0-9-]/g, "")), { half: true, ph: "e.g. my-restaurant", help: "Staff type this on the login screen. Lowercase letters, numbers, dashes." })}
          {field("Owner's full name", v.ownerName, s("ownerName"), { half: true, help: "Shown in the app when they are logged in" })}
          {field("Owner phone", v.ownerPhone, s("ownerPhone"), { half: true, type: "tel" })}
          {field("Owner username", v.ownerUsername, (x) => s("ownerUsername")(x.toLowerCase()), { half: true })}
          {field("Owner password", v.ownerPassword, s("ownerPassword"), { half: true, help: "Min 6 characters - share it with the owner" })}
          {field("Contact email", v.contactEmail, s("contactEmail"), { half: true, type: "email" })}
          {field("Contact phone", v.contactPhone, s("contactPhone"), { half: true, type: "tel" })}
          <div><label className="label">Plan</label>
            <select className="input" value={v.plan} onChange={(e) => s("plan")(e.target.value)}>{plans.map((p) => <option key={p.key} value={p.key}>{p.name} · ₹{p.price}/month · {p.maxUsers || "unlimited"} logins</option>)}</select></div>
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

type T = { id: number; name: string; code: string; contactName: string; contactEmail: string; contactPhone: string; notes: string; active: boolean };
export function TenantEditor({ t }: { t: T }) {
  const [v, setV] = useState({ name: t.name, code: t.code, contactName: t.contactName, contactEmail: t.contactEmail, contactPhone: t.contactPhone, notes: t.notes });
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
        {field("Contact email", v.contactEmail, s("contactEmail"), { half: true })}
        {field("Contact phone", v.contactPhone, s("contactPhone"), { half: true })}
        {field("Notes", v.notes, s("notes"))}
      </div>
      <Msg m={m} />
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={pending} onClick={() => start(async () => { const r = await updateTenantAction(t.id, v); setM(r.ok ? { ok: true, t: r.msg ?? "Saved" } : { ok: false, t: r.error }); router.refresh(); })}>Save</button>
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

/** Super admin: upload a resource file (manual) that all restaurant owners can download */
export function ResourceUpload() {
  const [title, setTitle] = useState("");
  const [m, setM] = useState<{ ok: boolean; t: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
      <input className="input" placeholder="Title (e.g. Owner Manual v2)" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input ref={fileRef} type="file" accept="application/pdf,image/*" className="input !py-2" />
      <div className="sm:col-span-2">
        <button className="btn-primary" disabled={pending} onClick={() => {
          const file = fileRef.current?.files?.[0];
          if (!file) { setM({ ok: false, t: "Choose a file." }); return; }
          const fd = new FormData(); fd.set("title", title); fd.set("file", file);
          start(async () => { const r = await uploadResourceAction(fd); setM(r.ok ? { ok: true, t: r.msg ?? "Uploaded." } : { ok: false, t: r.error }); if (r.ok) { setTitle(""); if (fileRef.current) fileRef.current.value = ""; router.refresh(); } });
        }}>{pending ? "Uploading…" : "Upload resource"}</button>
        <Msg m={m} />
      </div>
    </div>
  );
}

export function DeleteResource({ id }: { id: number }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <button className="btn-ghost btn-sm" disabled={pending} onClick={() => { if (!confirm("Delete this resource for everyone?")) return; start(async () => { const r = await deleteResourceAction(id); if (!r.ok) alert(r.error); router.refresh(); }); }}>Delete</button>;
}

export function SupportReply({ id, existing = "" }: { id: number; existing?: string }) {
  const [reply, setReply] = useState(existing);
  const [m, setM] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="mt-2">
      <textarea className="input min-h-20" placeholder="Type your reply to the restaurant…" value={reply} onChange={(e) => setReply(e.target.value)} />
      <div className="mt-1"><button className="btn-primary btn-sm" disabled={pending} onClick={() => start(async () => { const r = await replySupportAction(id, reply); setM(r.ok ? { ok: true, t: r.msg ?? "Sent." } : { ok: false, t: r.error }); if (r.ok) router.refresh(); })}>{pending ? "Sending…" : existing ? "Update reply" : "Send reply"}</button></div>
      <Msg m={m} />
    </div>
  );
}

/** Enable/disable a restaurant and set a paid/trial end date (past the date it auto-locks). */
export function SubscriptionCard({ id, active, validTill, expired }: { id: number; active: boolean; validTill: string; expired: boolean }) {
  const [till, setTill] = useState(validTill);
  const [m, setM] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold">{active && !expired ? <span className="text-emerald-700">● Enabled</span> : <span className="text-red-700">● Disabled</span>}</div>
          <div className="text-xs text-muted">{active ? (expired ? "Subscription date has passed - the restaurant is locked." : "Staff can log in and take orders.") : "Switched off - nobody can log in."}</div>
        </div>
        <button className={active ? "btn-danger" : "btn-primary"} disabled={pending} onClick={() => {
          if (active && !confirm("Disable this restaurant? Nobody from it can log in or take online orders until you enable it again.")) return;
          start(async () => { const r = await setTenantActiveAction(id, !active); if (!r.ok) alert(r.error); router.refresh(); });
        }}>{active ? "Disable now" : "Enable"}</button>
      </div>
      <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
        <label className="grid gap-0.5 text-sm"><span className="text-xs font-semibold text-muted">Paid / trial valid till</span>
          <input type="date" className="input !w-auto !py-1.5" value={till} onChange={(e) => setTill(e.target.value)} /></label>
        <button className="btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => { const r = await setTenantValidTillAction(id, till); setM(r.ok ? { ok: true, t: r.msg ?? "Saved." } : { ok: false, t: r.error }); router.refresh(); })}>Save date</button>
        {till && <button className="btn-ghost btn-sm" disabled={pending} onClick={() => { setTill(""); start(async () => { await setTenantValidTillAction(id, ""); router.refresh(); }); }}>Clear</button>}
        <p className="w-full text-xs text-muted">Leave blank for no end date. On the day after this date, the restaurant locks on its own (good for trials / unpaid months).</p>
      </div>
      <Msg m={m} />
    </div>
  );
}

/** Make a full copy of this restaurant (menu, recipes, settings) as a new restaurant with dummy orders. */
export function ReplicateButton({ srcId, srcName, srcCode }: { srcId: number; srcName: string; srcCode: string }) {
  const [open, setOpen] = useState(false);
  const rand = Math.random().toString(36).slice(2, 8);
  const [v, setV] = useState({ name: `${srcName} (Copy)`, code: `${srcCode}-copy`.slice(0, 30), ownerName: "Owner", ownerUsername: `${srcCode}copy`.replace(/[^a-z0-9]/g, "").slice(0, 28), ownerPassword: `Try-${rand}` });
  const [m, setM] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <button className="btn-ghost btn-sm" onClick={() => { setOpen(true); setM(null); }}>⧉ Replicate</button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Copy “${srcName}” to a new restaurant`}>
        <p className="mb-3 text-sm text-muted">Copies the menu, recipes, ingredients, packaging, branding and settings into a brand-new restaurant, and adds a week of dummy orders so you can try it. Payment-gateway keys are not copied.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("New restaurant name", v.name, (x) => setV({ ...v, name: x }))}
          {field("New login code", v.code, (x) => setV({ ...v, code: x.toLowerCase().replace(/[^a-z0-9-]/g, "") }), { half: true, help: "lowercase, unique" })}
          {field("Owner name", v.ownerName, (x) => setV({ ...v, ownerName: x }), { half: true })}
          {field("Owner username", v.ownerUsername, (x) => setV({ ...v, ownerUsername: x.toLowerCase() }), { half: true })}
          {field("Owner password", v.ownerPassword, (x) => setV({ ...v, ownerPassword: x }), { half: true })}
        </div>
        {m && <div className="mt-3"><Msg m={m} /></div>}
        <button className="btn-primary mt-3 w-full" disabled={pending} onClick={() => start(async () => {
          const r = await replicateTenantAction(srcId, v);
          if (!r.ok) { setM({ ok: false, t: r.error }); return; }
          setM({ ok: true, t: `Done — new code “${r.code}”. Owner: ${v.ownerUsername} / ${v.ownerPassword}` });
          router.refresh();
        })}>{pending ? "Copying…" : "Create the copy"}</button>
      </Modal>
    </>
  );
}

export function OpenAsOwner({ tenantId, name }: { tenantId: number; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button className="btn-primary btn-sm" disabled={pending} onClick={() => {
      if (!confirm(`Open ${name} as its owner?\n\nYou will be inside their live app and anything you change is real. This entry is logged.`)) return;
      start(async () => { const r = await openTenantAsOwnerAction(tenantId); if (r && !r.ok) alert(r.error); });
    }}>{pending ? "Opening…" : "↪ Open as owner"}</button>
  );
}

/** Edit / delete one login, plus reset password */
export function UserRow({ tenantId, user }: { tenantId: number; user: { id: number; name: string; username: string; phone: string; role: string; roleLabel: string; active: boolean } }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState({ name: user.name, username: user.username, phone: user.phone });
  const [m, setM] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div><div className="font-medium">{user.name} <span className="text-xs text-muted">({user.roleLabel})</span></div><div className="text-xs text-muted">@{user.username}{user.phone ? ` · ${user.phone}` : ""}{!user.active && " · inactive"}</div></div>
      <div className="flex flex-wrap gap-1.5">
        <button className="btn-ghost btn-sm" onClick={() => { setEdit(true); setM(null); setV({ name: user.name, username: user.username, phone: user.phone }); }}>Edit</button>
        <ResetPassword tenantId={tenantId} userId={user.id} name={user.name} />
        <button className="btn-danger btn-sm" disabled={pending} onClick={() => {
          if (!confirm(`Delete the login "${user.name}" (@${user.username})? This cannot be undone.`)) return;
          start(async () => { const r = await deleteUserAction(tenantId, user.id); if (!r.ok) alert(r.error); router.refresh(); });
        }}>Delete</button>
      </div>
      <Modal open={edit} onClose={() => setEdit(false)} title={`Edit ${user.name}`}>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("Full name", v.name, (x) => setV({ ...v, name: x }), { half: true })}
          {field("Phone", v.phone, (x) => setV({ ...v, phone: x }), { half: true })}
          {field("Username", v.username, (x) => setV({ ...v, username: x.toLowerCase() }), { half: true })}
        </div>
        <div className="mt-3"><Msg m={m} /></div>
        <button className="btn-primary mt-3 w-full" disabled={pending} onClick={() => start(async () => { const r = await editUserAction(tenantId, user.id, v); if (!r.ok) setM({ ok: false, t: r.error }); else { setEdit(false); router.refresh(); } })}>Save changes</button>
      </Modal>
    </li>
  );
}

export function DeleteTenant({ id, code, active }: { id: number; code: string; active: boolean }) {
  const [pending, start] = useTransition();
  if (!active) {
    // paused (login locked) - one click, no confirmation, as set for non-payers
    return (
      <button className="btn-danger btn-sm" disabled={pending} onClick={() => start(async () => { const r = await deleteTenantAction(id, ""); if (r && !r.ok) alert(r.error); })}>
        {pending ? "Deleting…" : "Delete now (paused)"}
      </button>
    );
  }
  return (
    <button className="btn-danger btn-sm" disabled={pending} onClick={() => {
      const c = prompt(`This restaurant is ACTIVE. This permanently deletes it and ALL its data (orders, menu, customers…).\nType the code "${code}" to confirm (or pause it first for one-click delete):`);
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

/** Plan + login limit for one restaurant */
export function TenantPlan({ id, plan, maxUsers, plans, usersActive }: { id: number; plan: string; maxUsers: number | null; plans: PlanOpt[]; usersActive: number }) {
  const [v, setV] = useState({ plan, maxUsers: maxUsers == null ? "" : String(maxUsers) });
  const [m, setM] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const cur = plans.find((p) => p.key === v.plan);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="tplan">Plan</label>
          <select id="tplan" className="input" value={v.plan} onChange={(e) => setV({ ...v, plan: e.target.value })}>
            {!cur && <option value={v.plan}>{v.plan} (not a plan)</option>}
            {plans.map((p) => <option key={p.key} value={p.key}>{p.name} · ₹{p.price}/month</option>)}
          </select></div>
        <div><label className="label" htmlFor="tmax">Login limit (blank = plan&apos;s {cur ? cur.maxUsers || "unlimited" : "limit"})</label>
          <input id="tmax" className="input" inputMode="numeric" value={v.maxUsers} placeholder="use plan's limit" onChange={(e) => setV({ ...v, maxUsers: e.target.value.replace(/\D/g, "") })} />
          <p className="mt-1 text-[11px] text-muted">{usersActive} active login{usersActive === 1 ? "" : "s"} now. 0 = no limit.</p></div>
      </div>
      <Msg m={m} />
      <button className="btn-primary" disabled={pending} onClick={() => start(async () => { const r = await setTenantPlanAction(id, v.plan, v.maxUsers); setM(r.ok ? { ok: true, t: r.msg ?? "Saved" } : { ok: false, t: r.error }); router.refresh(); })}>Save plan</button>
    </div>
  );
}

const grouped = () => (Object.keys(FEATURE_GROUPS) as FeatureGroup[]).map((g) => ({ g, keys: FEATURE_KEYS.filter((k) => FEATURES[k].group === g) }));
const soon = (k: FeatureKey) => "comingSoon" in FEATURES[k] && !!(FEATURES[k] as { comingSoon?: boolean }).comingSoon;

/** Features of one restaurant: from its plan, plus add-ons, minus removals */
export function TenantFeatures({ id, planName, planFeatures, addons, removed, off = [] }: { id: number; planName: string; planFeatures: string[]; addons: string[]; removed: string[]; off?: string[] }) {
  const allowedNow = (k: string, a: string[], r: string[]) => (planFeatures.includes(k) || a.includes(k)) && !r.includes(k);
  const [st, setSt] = useState({ addons, removed });
  const [m, setM] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">Ticked = this restaurant can use it. Untick a plan feature to remove it for this restaurant only; tick one outside the plan to sell it as an add-on. Basics (billing, orders, customers, menu, expenses, cash closing) are always included.</p>
      {grouped().map(({ g, keys }) => (
        <div key={g}>
          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">{FEATURE_GROUPS[g]}</div>
          <div className="space-y-2">
            {keys.map((k) => {
              const on = allowedNow(k, st.addons, st.removed), inPlan = planFeatures.includes(k), cs = soon(k);
              return (
                <label key={k} className={`flex items-start gap-3 rounded-xl border border-line p-3 ${cs ? "opacity-60" : ""}`}>
                  <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--color-brand)]" checked={on && !cs} disabled={pending || cs} aria-label={FEATURES[k].label}
                    onChange={(e) => { const want = e.target.checked, before = st;
                      setSt((x) => ({ addons: want ? (inPlan ? x.addons : [...x.addons, k]) : x.addons.filter((y) => y !== k), removed: want ? x.removed.filter((y) => y !== k) : inPlan ? [...x.removed, k] : x.removed }));
                      start(async () => {
                        const r = await setTenantFeatureAction(id, k, want);
                        if (!r.ok) setSt(before);
                        setM(r.ok ? { ok: true, t: `${FEATURES[k].label}: ${r.msg}` } : { ok: false, t: r.error }); router.refresh();
                      }); }} />
                  <span><b>{FEATURES[k].label}</b>{" "}
                    {cs ? <span className="rounded-full bg-stone-100 px-2 text-[11px] font-bold text-stone-600">COMING SOON</span>
                      : inPlan && on ? <span className="rounded-full bg-emerald-100 px-2 text-[11px] font-bold text-emerald-800">IN {planName.toUpperCase()}</span>
                      : inPlan ? <span className="rounded-full bg-red-100 px-2 text-[11px] font-bold text-red-800">REMOVED FROM PLAN</span>
                      : on ? <span className="rounded-full bg-gold-light px-2 text-[11px] font-bold text-ink">ADD-ON</span>
                      : <span className="rounded-full bg-stone-100 px-2 text-[11px] font-bold text-stone-600">NOT IN PLAN</span>}
                    {on && !cs && off.includes(k) && <span className="ml-1 rounded-full bg-amber-100 px-2 text-[11px] font-bold text-amber-900">owner switched it off</span>}
                    <span className="block text-xs text-muted">{FEATURES[k].help}</span></span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
      <Msg m={m} />
    </div>
  );
}

/** Super admin: edit plans (features, price, login limit) */
type PlanRow = { id: number; key: string; name: string; description: string; price: number; maxUsers: number; features: string[]; sortOrder: number; active: boolean; used: number };
export function PlanEditor({ plan }: { plan?: PlanRow }) {
  const blank = { key: "", name: "", description: "", price: "0", maxUsers: "5", features: [] as string[], sortOrder: "10", active: true };
  const [v, setV] = useState(plan ? { key: plan.key, name: plan.name, description: plan.description, price: String(plan.price), maxUsers: String(plan.maxUsers), features: plan.features, sortOrder: String(plan.sortOrder), active: plan.active } : blank);
  const [m, setM] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toggle = (k: string) => setV((x) => ({ ...x, features: x.features.includes(k) ? x.features.filter((y) => y !== k) : [...x.features, k] }));
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2"><label className="label">Plan name</label><input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
        {!plan && <div className="sm:col-span-2"><label className="label">Plan code</label><input className="input font-mono" placeholder="e.g. premium" value={v.key} onChange={(e) => setV({ ...v, key: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} /></div>}
        <div><label className="label">Price ₹ / month</label><input className="input" inputMode="decimal" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} /></div>
        <div><label className="label">Logins (0 = no limit)</label><input className="input" inputMode="numeric" value={v.maxUsers} onChange={(e) => setV({ ...v, maxUsers: e.target.value.replace(/\D/g, "") })} /></div>
        <div><label className="label">Order in list</label><input className="input" inputMode="numeric" value={v.sortOrder} onChange={(e) => setV({ ...v, sortOrder: e.target.value.replace(/\D/g, "") })} /></div>
        <label className="flex items-end gap-2 pb-3 text-sm"><input type="checkbox" className="h-5 w-5 accent-[var(--color-brand)]" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />Offered</label>
        <div className="sm:col-span-4"><label className="label">Short description</label><input className="input" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {grouped().map(({ g, keys }) => (
          <div key={g} className="rounded-xl bg-cream p-3">
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">{FEATURE_GROUPS[g]}</div>
            {keys.map((k) => (
              <label key={k} className="flex items-center gap-2 py-0.5 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={v.features.includes(k)} onChange={() => toggle(k)} aria-label={`${v.name || "plan"}: ${FEATURES[k].label}`} />
                {FEATURES[k].label}{soon(k) && <span className="text-[10px] text-muted">(coming soon)</span>}</label>
            ))}
          </div>
        ))}
      </div>
      <Msg m={m} />
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={pending} onClick={() => start(async () => {
          const r = await savePlanAction({ id: plan?.id, ...v });
          setM(r.ok ? { ok: true, t: r.msg ?? "Saved" } : { ok: false, t: r.error });
          if (r.ok) { if (!plan) setV(blank); router.refresh(); }
        })}>{plan ? "Save plan" : "Create plan"}</button>
        {plan && <button className="btn-ghost" disabled={pending} onClick={() => { if (confirm(`Delete plan ${plan.name}?`)) start(async () => { const r = await deletePlanAction(plan.id); setM(r.ok ? { ok: true, t: r.msg ?? "" } : { ok: false, t: r.error }); router.refresh(); }); }}>Delete</button>}
      </div>
    </div>
  );
}
