"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadDocAction, deleteDocAction, sendSupportMessageAction } from "@/app/actions/files";

const Msg = ({ m }: { m: { ok: boolean; t: string } | null }) => (m ? <p className={`mt-2 rounded-lg px-3 py-2 text-sm ${m.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{m.t}</p> : null);

/** Owner uploads a restaurant document (FSSAI, GST, other) */
export function DocUpload() {
  const [kind, setKind] = useState("FSSAI");
  const [title, setTitle] = useState("");
  const [num, setNum] = useState("");
  const [expiry, setExpiry] = useState("");
  const [m, setM] = useState<{ ok: boolean; t: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const submit = () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { setM({ ok: false, t: "Choose a file to upload." }); return; }
    const fd = new FormData();
    fd.set("kind", kind); fd.set("title", title); fd.set("docNumber", num); fd.set("expiry", expiry); fd.set("file", file);
    start(async () => {
      const r = await uploadDocAction(fd);
      setM(r.ok ? { ok: true, t: r.msg ?? "Uploaded." } : { ok: false, t: r.error });
      if (r.ok) { setTitle(""); setNum(""); setExpiry(""); if (fileRef.current) fileRef.current.value = ""; router.refresh(); }
    });
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div><label className="label">Document type</label>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="FSSAI">FSSAI licence</option><option value="GST">GST certificate</option><option value="DOC">Other document</option>
        </select>
      </div>
      <div><label className="label">Title (optional)</label><input className="input" value={title} placeholder={kind === "FSSAI" ? "FSSAI licence" : kind === "GST" ? "GST certificate" : "Document name"} onChange={(e) => setTitle(e.target.value)} /></div>
      <div><label className="label">{kind === "GST" ? "GSTIN" : kind === "FSSAI" ? "FSSAI number" : "Number"} (optional)</label><input className="input" value={num} onChange={(e) => setNum(e.target.value)} /></div>
      <div><label className="label">Valid till / expiry (optional)</label><input type="date" className="input" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></div>
      <div className="sm:col-span-2"><label className="label">File (PDF / photo, max 5 MB)</label><input ref={fileRef} type="file" accept="application/pdf,image/*" className="input !py-2" /></div>
      <div className="sm:col-span-2"><button className="btn-primary" disabled={pending} onClick={submit}>{pending ? "Uploading…" : "Upload document"}</button><Msg m={m} /></div>
    </div>
  );
}

export function DeleteDoc({ id }: { id: number }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <button className="text-xs text-red-700 underline" disabled={pending} onClick={() => { if (!confirm("Delete this document?")) return; start(async () => { const r = await deleteDocAction(id); if (!r.ok) alert(r.error); router.refresh(); }); }}>Delete</button>;
}

/** Owner sends a message to support */
export function SupportBox() {
  const [body, setBody] = useState("");
  const [m, setM] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div>
      <textarea className="input min-h-28" placeholder="Describe your problem or question…" value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="mt-2 flex items-center gap-3">
        <button className="btn-primary" disabled={pending} onClick={() => start(async () => {
          const r = await sendSupportMessageAction(body);
          setM(r.ok ? { ok: true, t: r.msg ?? "Sent." } : { ok: false, t: r.error });
          if (r.ok) { setBody(""); router.refresh(); }
        })}>{pending ? "Sending…" : "Send to support"}</button>
        <span className="text-xs text-muted">We usually reply within 24 hours.</span>
      </div>
      <Msg m={m} />
    </div>
  );
}
