"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setKotStatusAction } from "@/app/actions/kot";

/** Refreshes the kitchen screen every 10 s and beeps when a new KOT arrives (after "Turn on sound") */
export function KotLive({ newKey }: { newKey: string }) {
  const router = useRouter();
  const last = useRef(newKey);
  const ctx = useRef<AudioContext | null>(null);
  const [sound, setSound] = useState(false);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 10000);
    return () => clearInterval(t);
  }, [router]);
  useEffect(() => {
    const added = newKey.split(",").filter((k) => k && !last.current.split(",").includes(k));
    if (added.length && sound && ctx.current) {
      const c = ctx.current;
      [0, 0.25, 0.5].forEach((d) => {
        const o = c.createOscillator(), g = c.createGain();
        o.frequency.value = 660; o.connect(g); g.connect(c.destination);
        g.gain.setValueAtTime(0.3, c.currentTime + d); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + d + 0.2);
        o.start(c.currentTime + d); o.stop(c.currentTime + d + 0.22);
      });
    }
    last.current = newKey;
  }, [newKey, sound]);
  return (
    <button type="button" className={`btn-sm ${sound ? "btn-ghost" : "btn-gold"}`} onClick={() => {
      if (!ctx.current) ctx.current = new AudioContext();
      void ctx.current.resume(); setSound((x) => !x);
    }}>{sound ? "🔔 Sound on" : "🔕 Turn on sound"}</button>
  );
}

const NEXT: Record<string, { to: string; label: string; cls: string }> = {
  NEW: { to: "PREPARING", label: "Start cooking", cls: "btn-gold" },
  PREPARING: { to: "READY", label: "✓ Ready", cls: "btn-primary" },
  READY: { to: "SERVED", label: "Served / picked up", cls: "btn-ghost" },
};
const BACK: Record<string, string> = { PREPARING: "NEW", READY: "PREPARING", SERVED: "READY" };

export function KotButtons({ id, status }: { id: number; status: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const router = useRouter();
  const go = (to: string) => start(async () => { setErr(""); const r = await setKotStatusAction(id, to); if (!r.ok) setErr(r.error); router.refresh(); });
  const n = NEXT[status];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {n && <button type="button" className={`${n.cls} !py-2.5`} disabled={pending} onClick={() => go(n.to)}>{n.label}</button>}
      {BACK[status] && <button type="button" className="text-xs text-muted underline" disabled={pending} onClick={() => go(BACK[status])}>undo</button>}
      {err && <span className="text-xs text-red-700">{err}</span>}
    </div>
  );
}

/** Kitchen can clear a cancelled KOT from the screen */
export function DismissButton({ id }: { id: number }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => { await setKotStatusAction(id, "SERVED"); router.refresh(); })}>OK, remove</button>;
}

export function AutoPrint() {
  useEffect(() => { const t = setTimeout(() => window.print(), 400); return () => clearTimeout(t); }, []);
  return null;
}
export function PrintNow({ label = "Print KOT" }: { label?: string }) {
  return <button type="button" className="btn-primary btn-sm" onClick={() => window.print()}>{label}</button>;
}

/** Pick the day to show on the kitchen screen */
export function KotDatePicker({ value, today, show }: { value: string; today: string; show: string }) {
  const router = useRouter();
  return <input type="date" className="input !w-auto !py-1.5" value={value} aria-label="KOT date" onChange={(e) => {
    const d = e.target.value; if (!d) return;
    const p = new URLSearchParams({ ...(d !== today ? { date: d } : {}), ...(show === "done" ? { show: "done" } : {}) }).toString();
    router.push(`/kot${p ? `?${p}` : ""}`);
  }} />;
}
