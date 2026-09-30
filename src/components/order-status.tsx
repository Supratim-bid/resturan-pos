"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addUpiRefAction } from "@/app/actions/online";

/** Reloads the page data every few seconds (while an order is waiting) */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}

/** Customer enters the UPI transaction number after paying */
export function UpiRefForm({ code, token, current }: { code: string; token: string; current: string }) {
  const [v, setV] = useState(current);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(current ? { ok: true, t: "Thanks - the restaurant will check your payment." } : null);
  const [pending, start] = useTransition();
  return (
    <form className="space-y-2 text-left" onSubmit={(e) => { e.preventDefault(); start(async () => {
      const r = await addUpiRefAction(code, token, v);
      setMsg(r.ok ? { ok: true, t: "Thanks - the restaurant will check your payment." } : { ok: false, t: r.error });
    }); }}>
      <label className="label" htmlFor="utr">After paying, enter the UPI transaction ID (UTR)</label>
      <div className="flex gap-2">
        <input id="utr" className="input" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} placeholder="e.g. 427812345678" />
        <button className="btn-primary shrink-0" disabled={pending}>{pending ? "…" : "Send"}</button>
      </div>
      {msg && <p className={`text-xs ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.t}</p>}
    </form>
  );
}
