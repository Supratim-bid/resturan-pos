"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadImage } from "./image-input";
import { setLogoAction, setQrImageAction } from "@/app/actions/images";

export function LogoSettings({ custom }: { custom: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState("");
  const [v, setV] = useState(0);
  const [pending, start] = useTransition();
  const router = useRouter();
  const done = () => { setV((x) => x + 1); router.refresh(); };
  return (
    <div className="flex flex-wrap items-center gap-5">
      <img key={v} src={`/logo?v=${v}`} alt="Logo" className="h-32 w-32 rounded-full bg-white object-cover shadow-[0_0_0_3px_#fff,0_0_0_5px_var(--color-gold)]" />
      <div className="space-y-2">
        <p className="text-sm text-muted">Shown on the login screen, the app header and every bill. A square image works best.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={pending} onClick={() => ref.current?.click()}>{pending ? "Uploading…" : "Upload new logo"}</button>
          {custom && <button className="btn-ghost" disabled={pending} onClick={() => start(async () => { await setLogoAction(null); done(); })}>Remove logo</button>}
        </div>
        {err && <p className="text-sm text-red-700">{err}</p>}
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => {
        const f = e.target.files?.[0]; e.target.value = "";
        if (!f) return;
        setErr("");
        start(async () => {
          try { const id = await uploadImage(f, 640, "image/jpeg"); const r = await setLogoAction(id); if (!r.ok) setErr(r.error ?? "Failed"); else done(); }
          catch (x) { setErr(String((x as Error).message)); }
        });
      }} />
    </div>
  );
}

/** Upload the shop's payment QR (from PhonePe / Google Pay / Paytm / bank) to print on bills */
export function QrSettings({ imageId, upiId }: { imageId: number | null; upiId: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-start gap-5">
      <div className="flex h-40 w-40 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-gold/60 bg-white">
        {imageId ? <img src={`/img/${imageId}`} alt="Payment QR" className="h-full w-full object-contain" />
          : <span className="px-3 text-center text-xs text-muted">{upiId ? "Using a QR made from your UPI ID (amount filled in)" : "No QR yet"}</span>}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm">Upload your shop&apos;s UPI QR (screenshot or photo from PhonePe / Google Pay / Paytm / your bank). It prints on every bill.</p>
        <p className="text-xs text-muted">
          Tip: a photo of the QR works, but crop it close to the QR so it prints sharp. Your own QR image can&apos;t carry the bill amount, so the customer types it.
          {" "}If you enter a <b>UPI ID</b> instead (Restaurant, bills &amp; theme) and don&apos;t upload an image, the app makes a QR with the amount already filled in.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={pending} onClick={() => ref.current?.click()}>{pending ? "Uploading…" : imageId ? "Change QR image" : "Upload QR image"}</button>
          {imageId && <button className="btn-ghost" disabled={pending} onClick={() => start(async () => { await setQrImageAction(null); router.refresh(); })}>Remove QR image</button>}
        </div>
        {err && <p className="text-sm text-red-700">{err}</p>}
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => {
        const f = e.target.files?.[0]; e.target.value = "";
        if (!f) return;
        setErr("");
        start(async () => {
          try { const id = await uploadImage(f, 800, "image/png"); const r = await setQrImageAction(id); if (!r.ok) setErr(r.error ?? "Failed"); else router.refresh(); }
          catch (x) { setErr(String((x as Error).message)); }
        });
      }} />
    </div>
  );
}
