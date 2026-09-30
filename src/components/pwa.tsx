"use client";
import { useEffect, useState } from "react";

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
declare global { interface Window { __bip?: BIP | null; __bipListeners?: Set<() => void> } }

/** Registers the service worker once and keeps Android/desktop Chrome's install prompt for our buttons */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    window.__bipListeners ??= new Set();
    const onPrompt = (e: Event) => { e.preventDefault(); window.__bip = e as BIP; window.__bipListeners?.forEach((f) => f()); };
    const onInstalled = () => { window.__bip = null; window.__bipListeners?.forEach((f) => f()); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);
  return null;
}

export type Platform = "ios" | "android" | "desktop";
function detect(): { platform: Platform; installed: boolean; iosBrowser: "safari" | "other" } {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installed = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return { platform: ios ? "ios" : /Android/.test(ua) ? "android" : "desktop", installed, iosBrowser: /CriOS|FxiOS|EdgiOS/.test(ua) ? "other" : "safari" };
}

function useInstall() {
  const [info, setInfo] = useState<ReturnType<typeof detect> | null>(null);
  const [canPrompt, setCanPrompt] = useState(false);
  useEffect(() => {
    setInfo(detect()); setCanPrompt(!!window.__bip);
    window.__bipListeners ??= new Set();
    const f = () => { setCanPrompt(!!window.__bip); setInfo(detect()); };
    window.__bipListeners.add(f);
    return () => { window.__bipListeners?.delete(f); };
  }, []);
  const install = async () => {
    const p = window.__bip; if (!p) return false;
    await p.prompt(); const r = await p.userChoice.catch(() => ({ outcome: "dismissed" }));
    window.__bip = null; setCanPrompt(false);
    if (r.outcome === "accepted") setInfo((i) => (i ? { ...i, installed: true } : i));
    return r.outcome === "accepted";
  };
  return { info, canPrompt, install };
}

const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{n}</span><span className="pt-0.5">{children}</span></li>
);

/** Full install guide with a one-tap button where the browser allows it */
export function InstallGuide({ name, icon }: { name: string; icon: string }) {
  const { info, canPrompt, install } = useInstall();
  const [tab, setTab] = useState<Platform | null>(null);
  const p = tab ?? info?.platform ?? "android";
  if (info?.installed) return <div className="rounded-2xl bg-emerald-50 p-4 text-center text-emerald-800"><b>{name}</b> is installed on this device ✓<br /><span className="text-sm">Open it from your home screen.</span></div>;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={icon} alt="" className="h-16 w-16 rounded-2xl shadow ring-1 ring-line" />
        <div><div className="font-bold">{name}</div><div className="text-sm text-muted">Free · works on Android, iPhone and computers · no app store needed</div></div>
      </div>
      {canPrompt && <button type="button" className="btn-primary w-full !py-3.5 text-base" onClick={install}>📲 Install the app</button>}
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-cream p-1 text-sm font-semibold">
        {(["android", "ios", "desktop"] as Platform[]).map((k) => (
          <button key={k} type="button" className={`rounded-lg py-2 ${p === k ? "bg-white shadow" : ""}`} onClick={() => setTab(k)}>{k === "android" ? "Android" : k === "ios" ? "iPhone / iPad" : "Computer"}</button>
        ))}
      </div>
      {p === "android" && (
        <ol className="space-y-3 text-sm">
          <Step n={1}>Open this page in <b>Chrome</b>.</Step>
          <Step n={2}>{canPrompt ? <>Tap <b>Install the app</b> above.</> : <>Tap the <b>⋮</b> menu (top right) → <b>Install app</b> or <b>Add to Home screen</b>.</>}</Step>
          <Step n={3}>Tap <b>Install</b>. The <b>{name}</b> icon appears on your home screen.</Step>
        </ol>
      )}
      {p === "ios" && (
        <ol className="space-y-3 text-sm">
          {info?.platform === "ios" && info.iosBrowser === "other" && <li className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">Tip: this works best in <b>Safari</b>. Copy this page&apos;s link and open it in Safari.</li>}
          <Step n={1}>Open this page in <b>Safari</b>.</Step>
          <Step n={2}>Tap the <b>Share</b> button <span aria-hidden className="inline-block rounded border border-line px-1">⬆︎</span> (bottom of the screen on iPhone, top on iPad).</Step>
          <Step n={3}>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</Step>
          <li className="text-xs text-muted">On iPhone, notifications work only in the app opened from the home screen (iOS 16.4 or newer).</li>
        </ol>
      )}
      {p === "desktop" && (
        <ol className="space-y-3 text-sm">
          <Step n={1}>Open this page in <b>Chrome</b> or <b>Edge</b>.</Step>
          <Step n={2}>{canPrompt ? <>Click <b>Install the app</b> above,</> : <>Click the <b>install icon</b> at the right end of the address bar (a screen with a down-arrow), or the menu → <b>Install {name}</b>,</>} then <b>Install</b>.</Step>
          <Step n={3}>It opens in its own window and gets a Desktop / Start-menu icon.</Step>
        </ol>
      )}
    </div>
  );
}

/** Small "get the app" bar for customers on the order page */
export function InstallBanner({ name, href }: { name: string; href: string }) {
  const { info, canPrompt, install } = useInstall();
  const [hidden, setHidden] = useState(true);
  const key = `install-banner:${href}`;
  useEffect(() => {
    try { const t = Number(localStorage.getItem(key) || 0); setHidden(Date.now() - t < 14 * 864e5); } catch { setHidden(false); }
  }, [key]);
  if (!info || info.installed || hidden) return null;
  const close = () => { setHidden(true); try { localStorage.setItem(key, String(Date.now())); } catch { /* ignore */ } };
  return (
    <div className="mx-auto mt-3 flex max-w-lg items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm shadow ring-1 ring-line">
      <span className="text-lg">📲</span>
      <span className="flex-1"><b>Get the {name} app</b><span className="block text-xs text-muted">Order again in one tap from your home screen</span></span>
      {canPrompt ? <button type="button" className="btn-primary btn-sm" onClick={install}>Install</button> : <a className="btn-primary btn-sm" href={href}>How</a>}
      <button type="button" aria-label="Close" className="px-1 text-muted" onClick={close}>✕</button>
    </div>
  );
}

/** Button for pages inside the staff app (Settings, More) */
export function InstallLink() {
  const { info } = useInstall();
  if (!info || info.installed) return null;
  return <a href="/install" className="btn-ghost btn-sm">📲 Install this app on this device</a>;
}

// ---------------- push notifications ----------------
function keyBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** "Notify this phone" switch for new online orders */
export function PushToggle({ publicKey, save, remove, test }: {
  publicKey: string;
  save: (s: PushSubscriptionJSON) => Promise<{ ok: boolean; error?: string }>;
  remove: (endpoint: string) => Promise<{ ok: boolean; error?: string }>;
  test: () => Promise<{ ok: boolean; error?: string; sent?: number }>;
}) {
  const [st, setSt] = useState<"loading" | "unsupported" | "ios-install" | "denied" | "off" | "on">("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    (async () => {
      const d = detect();
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { setSt(d.platform === "ios" && !d.installed ? "ios-install" : "unsupported"); return; }
      if (Notification.permission === "denied") { setSt("denied"); return; }
      const reg = await navigator.serviceWorker.ready;
      setSt((await reg.pushManager.getSubscription()) ? "on" : "off");
    })().catch(() => setSt("unsupported"));
  }, []);
  const turnOn = async () => {
    setBusy(true); setMsg("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setSt(perm === "denied" ? "denied" : "off"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      const r = await save(sub.toJSON());
      if (!r.ok) throw new Error(r.error);
      setSt("on"); setMsg("On. This device will ring for new online orders.");
    } catch (e) { setMsg(String((e as Error).message || e)); } finally { setBusy(false); }
  };
  const turnOff = async () => {
    setBusy(true); setMsg("");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await remove(sub.endpoint); await sub.unsubscribe(); }
      setSt("off");
    } finally { setBusy(false); }
  };
  if (st === "loading") return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {st === "on" && <><span className="font-semibold text-emerald-700">🔔 This device gets new-order notifications</span>
        <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={async () => { const r = await test(); setMsg(r.ok ? "Test sent - it should appear in a few seconds." : r.error ?? "Failed"); }}>Send a test</button>
        <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={turnOff}>Turn off</button></>}
      {st === "off" && <button type="button" className="btn-gold btn-sm" disabled={busy} onClick={turnOn}>🔔 Notify this device of new orders</button>}
      {st === "denied" && <span className="text-muted">Notifications are blocked for this site. Allow them in the browser / phone settings, then reload.</span>}
      {st === "ios-install" && <span className="text-muted">On iPhone, first <a className="text-brand underline" href="/install">add the app to the home screen</a>, open it from there, then turn on notifications.</span>}
      {st === "unsupported" && <span className="text-muted">This browser can&apos;t show notifications. Use Chrome (Android / computer) or the installed app on iPhone.</span>}
      {msg && <span className="w-full text-xs text-muted">{msg}</span>}
    </div>
  );
}
