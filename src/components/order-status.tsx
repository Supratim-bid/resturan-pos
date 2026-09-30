"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addPaymentProofAction } from "@/app/actions/online";
import { resize } from "@/components/image-input";

/** Reloads the page data every few seconds (while an order is waiting) */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}

/** Optional: customer attaches a screenshot of the UPI payment */
export function PaymentProof({ code, token, has }: { code: string; token: string; has: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [done, setDone] = useState(has);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <div className="space-y-2 border-t border-line pt-3">
      {done ? <p className="text-sm font-semibold text-emerald-700">✓ Payment screenshot sent to the restaurant</p>
        : <p className="text-sm">After paying, you can attach a screenshot of the payment <span className="text-muted">(optional - it helps the restaurant confirm faster)</span>.</p>}
      <button type="button" className="btn-ghost" disabled={busy} onClick={() => ref.current?.click()}>{busy ? "Sending…" : done ? "Change screenshot" : "📸 Attach payment screenshot"}</button>
      {err && <p className="text-xs text-red-700">{err}</p>}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0]; e.target.value = "";
        if (!f) return;
        setErr(""); setBusy(true);
        try {
          if (!f.type.startsWith("image/")) throw new Error("Please choose a photo.");
          const { blob, w, h } = await resize(f, 1400, "image/jpeg");
          const fd = new FormData(); fd.append("file", blob, "payment.jpg"); fd.append("w", String(w)); fd.append("h", String(h));
          const r = await addPaymentProofAction(code, token, fd);
          if (!r.ok) throw new Error(r.error);
          setDone(true); router.refresh();
        } catch (x) { setErr(String((x as Error).message)); } finally { setBusy(false); }
      }} />
    </div>
  );
}
