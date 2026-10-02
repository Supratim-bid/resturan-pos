"use client";
import { useActionState, useState } from "react";
import { login } from "../actions/auth";
export function LoginForm({ code, known }: { code: string; known: boolean }) {
  const [state, action, pending] = useActionState(login, {});
  const [edit, setEdit] = useState(!known);
  return (
    <form action={action} className="card space-y-4 !p-5">
      {edit ? (
        <div><label className="label">Restaurant code</label><input name="restaurant" defaultValue={code} autoCapitalize="none" className="input" placeholder="e.g. my-restaurant" required /></div>
      ) : (
        <div className="flex items-center justify-between rounded-xl bg-gold-light/60 px-3 py-2 text-sm">
          <span>Restaurant: <b>{code}</b></span>
          <input type="hidden" name="restaurant" value={code} />
          <button type="button" className="text-xs font-semibold text-brand" onClick={() => setEdit(true)}>Change</button>
        </div>
      )}
      <div><label className="label">Username</label><input name="username" autoCapitalize="none" autoComplete="username" className="input" required /></div>
      <div><label className="label">Password</label><input name="password" type="password" autoComplete="current-password" className="input" required /></div>
      {state?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
