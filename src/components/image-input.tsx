"use client";
import { useRef, useState } from "react";
import { uploadImageAction } from "@/app/actions/images";

/** Resize in the browser (keeps uploads small on mobile data), then upload. */
export async function resize(file: File, max: number, format: "image/webp" | "image/jpeg" | "image/png" = "image/webp"): Promise<{ blob: Blob; w: number; h: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), format, 0.88));
    return { blob: blob.type === format ? blob : await new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.88)), w, h };
  } finally { URL.revokeObjectURL(url); }
}

/** Logos are stored as JPEG so they also print on thermal-bill images */
export async function uploadImage(file: File, max = 900, format: "image/webp" | "image/jpeg" | "image/png" = "image/webp"): Promise<number> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose a photo.");
  const { blob, w, h } = await resize(file, max, format);
  const fd = new FormData();
  fd.append("file", blob, "photo"); fd.append("w", String(w)); fd.append("h", String(h));
  const r = await uploadImageAction(fd);
  if (!r.ok) throw new Error(r.error);
  return r.id;
}

export function ImageInput({ value, onChange, max = 900, round = false }: { value: unknown; onChange: (v: number | null) => void; max?: number; round?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const id = value ? Number(value) : null;
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => ref.current?.click()}
        className={`flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden border-2 border-dashed border-gold/60 bg-gold-light/40 text-2xl ${round ? "rounded-full" : "rounded-2xl"}`}>
        {id ? <img src={`/img/${id}`} alt="" className="h-full w-full object-cover" /> : busy ? "…" : "📷"}
      </button>
      <div className="space-y-1">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => ref.current?.click()}>{busy ? "Uploading…" : id ? "Change photo" : "Add photo"}</button>
          {id && <button type="button" className="btn-ghost btn-sm" onClick={() => onChange(null)}>Remove</button>}
        </div>
        <p className="text-[11px] text-muted">Take a photo or pick from gallery. It is resized automatically.</p>
        {err && <p className="text-xs text-red-700">{err}</p>}
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0]; e.target.value = "";
        if (!f) return;
        setErr(""); setBusy(true);
        try { onChange(await uploadImage(f, max)); } catch (x) { setErr(String((x as Error).message)); } finally { setBusy(false); }
      }} />
    </div>
  );
}
