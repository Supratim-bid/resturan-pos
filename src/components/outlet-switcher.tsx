"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { switchOutletAction } from "@/app/actions/outlet";

export type OutletOpt = { id: number; name: string; code: string; isPrimary: boolean };

/** Lets a group owner/manager pick which outlet they're working in, or open the combined view. */
export function OutletSwitcher({ outlets, activeId, groupName, showAll }: { outlets: OutletOpt[]; activeId: number; groupName: string; showAll: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  if (outlets.length < 2) return null;
  return (
    <div className="rounded-xl border border-gold/40 bg-gold-light/30 p-2">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted">🏢 {groupName}</span>
        {showAll && <a href="/group" className="text-[10px] font-semibold text-brand underline">All outlets →</a>}
      </div>
      <select
        className="w-full rounded-lg border border-line bg-white px-2 py-2 text-sm font-semibold text-ink disabled:opacity-60"
        value={activeId} disabled={pending}
        onChange={(e) => { const id = Number(e.target.value); start(async () => { const r = await switchOutletAction(id); if (r.ok) router.refresh(); else alert(r.error); }); }}
        aria-label="Switch outlet"
      >
        {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}{o.isPrimary ? " · main" : ""}</option>)}
      </select>
      {pending && <p className="mt-1 px-1 text-[10px] text-muted">Switching…</p>}
    </div>
  );
}
