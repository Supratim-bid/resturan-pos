"use client";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { FieldDef, Option, EntityKey } from "@/lib/entities";
import { saveRecord, deleteRecord } from "@/app/actions/crud";
import { ImageInput } from "./image-input";
import { AvailabilityToggle } from "./menu-tools";

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label={title}
        className={`max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="rounded-full p-2 text-2xl leading-none text-muted hover:bg-stone-100" aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export function FieldInput({ f, value, onChange, options }: { f: FieldDef; value: unknown; onChange: (v: unknown) => void; options?: Option[] }) {
  const v = value == null ? "" : String(value);
  if (f.type === "image") return <ImageInput value={value} onChange={onChange} />;
  if (f.type === "checkbox")
    return (
      <label className="flex items-center gap-2 py-2 text-sm font-medium">
        <input type="checkbox" className="h-5 w-5 accent-[var(--color-brand)]" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        {f.label}
      </label>
    );
  if (f.type === "textarea") return <textarea className="input min-h-24" value={v} onChange={(e) => onChange(e.target.value)} />;
  if (f.type === "select") {
    const groups = new Map<string, Option[]>();
    for (const o of options ?? []) {
      const g = o.group ?? "";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(o);
    }
    return (
      <select className="input" value={v} onChange={(e) => onChange(e.target.value)}>
        <option value="">{f.required ? "Select…" : "—"}</option>
        {[...groups].map(([g, opts]) =>
          g ? (
            <optgroup key={g} label={g}>{opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
          ) : (
            opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)
          ),
        )}
      </select>
    );
  }
  const type = f.type === "money" || f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "tel" ? "tel" : "text";
  return (
    <input
      className="input"
      type={type}
      inputMode={type === "number" ? "decimal" : undefined}
      step={f.step ?? (type === "number" ? "any" : undefined)}
      value={v}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function RecordForm({
  entity, fields, options, initial, id, onDone, path, submitLabel = "Save",
}: {
  entity: EntityKey; fields: FieldDef[]; options: Record<string, Option[]>; initial?: Record<string, unknown>;
  id?: number | null; onDone: () => void; path?: string; submitLabel?: string;
}) {
  const [vals, setVals] = useState<Record<string, unknown>>(() => {
    const o: Record<string, unknown> = {};
    for (const f of fields) o[f.name] = initial?.[f.name] ?? (f.defaultToday ? today() : f.type === "checkbox" ? true : "");
    return o;
  });
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErr("");
        start(async () => {
          const r = await saveRecord(entity, id ?? null, vals, path);
          if (!r.ok) setErr(r.error);
          else { router.refresh(); onDone(); }
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        {fields.map((f) => (
          <div key={f.name} className={f.half ? "col-span-2 sm:col-span-1" : "col-span-2"}>
            {f.type !== "checkbox" && <label className="label">{f.label}{f.required && <span className="text-red-600"> *</span>}</label>}
            <FieldInput f={f} value={vals[f.name]} options={options[f.name]} onChange={(v) => setVals((s) => ({ ...s, [f.name]: v }))} />
            {f.help && <p className="mt-1 text-[11px] text-muted">{f.help}</p>}
          </div>
        ))}
      </div>
      {err && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="sticky bottom-0 mt-5 flex gap-2 bg-white pt-2">
        <button className="btn-primary flex-1" disabled={pending}>{pending ? "Saving…" : submitLabel}</button>
        <button type="button" className="btn-ghost" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

export type Column = {
  key: string;
  label: string;
  kind?: "text" | "money" | "date" | "num" | "bool" | "badge" | "image" | "available";
  primary?: boolean; // title line on mobile cards
  hideMobile?: boolean;
  /** badge colour per cell value (must be plain data - passed from server) */
  tones?: Record<string, "red" | "green" | "amber" | "gray">;
  icon?: string; // placeholder for an image column with no photo
};
export type Row = { id: number; [k: string]: unknown };

const inr = (n: unknown) => { const v = Number(n ?? 0); return (v < 0 ? "−" : "") + "₹" + Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: 2 }); };
const fdate = (d: unknown) => (d ? new Date(String(d).slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "");

function cell(c: Column, r: Row) {
  const v = r[c.key];
  if (c.kind === "available") return <AvailabilityToggle id={Number(r.menuItemId ?? r.id)} available={!!v} />;
  if (c.kind === "image") return v ? <img src={`/img/${v}`} alt="" className="h-11 w-11 rounded-lg object-cover" /> : <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-gold-light/60 text-lg">{c.icon ?? "🍛"}</span>;
  if (v == null || v === "") return <span className="text-stone-300">—</span>;
  switch (c.kind) {
    case "money": return inr(v);
    case "date": return fdate(v);
    case "num": return Number(v).toLocaleString("en-IN", { maximumFractionDigits: 3 });
    case "bool": return v ? "Yes" : "No";
    case "badge": {
      const t = c.tones?.[String(v)] ?? "gray";
      const cls = { red: "bg-red-50 text-red-700", green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-800", gray: "bg-stone-100 text-stone-600" }[t];
      return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{String(v)}</span>;
    }
    default: return String(v);
  }
}

/** List + add/edit/delete for a simple record type. Mobile shows cards, desktop a table. */
export function CrudManager({
  entity, fields, options, rows, columns, title, path, canEdit = true, canDelete = true, rowHref, addLabel, searchKeys, emptyText, defaults,
}: {
  entity: EntityKey; fields: FieldDef[]; options: Record<string, Option[]>; rows: Row[]; columns: Column[]; title: string;
  path?: string; canEdit?: boolean; canDelete?: boolean; rowHref?: string; addLabel?: string; searchKeys?: string[]; emptyText?: string;
  defaults?: Record<string, unknown>;
}) {
  const [editing, setEditing] = useState<Row | null | "new">(null);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const shown = useMemo(() => {
    if (!q.trim()) return rows;
    const s = q.toLowerCase();
    const keys = searchKeys ?? columns.map((c) => c.key);
    return rows.filter((r) => keys.some((k) => String(r[k] ?? "").toLowerCase().includes(s)));
  }, [q, rows, columns, searchKeys]);
  const primary = columns.find((c) => c.primary) ?? columns[0];
  const imgCol = columns.find((c) => c.kind === "image");

  return (
    <div>
      <div className="mb-3 flex gap-2">
        {rows.length > 6 && <input className="input" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />}
        {canEdit && <button className="btn-primary shrink-0" onClick={() => setEditing("new")}>+ {addLabel ?? "Add"}</button>}
      </div>
      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">{emptyText ?? "Nothing here yet."}</div>
      ) : (
        <>
          {/* mobile cards */}
          <div className="space-y-2 md:hidden">
            {shown.map((r) => {
              const body = (
                <div className="card !p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">{imgCol && cell(imgCol, r)}<div className="font-semibold">{cell(primary, r)}</div></div>
                    {canEdit && (
                      <button className="btn-ghost btn-sm" onClick={(e) => { e.preventDefault(); setEditing(r); }}>✏️ Edit</button>
                    )}
                  </div>
                  <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                    {columns.filter((c) => c !== primary && c !== imgCol && !c.hideMobile).map((c) => (
                      <div key={c.key} className="contents">
                        <dt className="text-muted">{c.label}</dt>
                        <dd className="text-right font-medium">{cell(c, r)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
              return rowHref ? <Link key={r.id} href={`${rowHref}/${r.id}`}>{body}</Link> : <div key={r.id}>{body}</div>;
            })}
          </div>
          {/* desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border border-line bg-white md:block">
            <table className="tbl">
              <thead>
                <tr>
                  {canEdit && <th className="w-px" />}
                  {columns.map((c) => <th key={c.key} className={c.kind === "money" || c.kind === "num" ? "!text-right" : ""}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="hover:bg-cream/60">
                    {canEdit && (
                      <td className="whitespace-nowrap">
                        <button className="btn-ghost btn-sm" onClick={() => setEditing(r)}>✏️ Edit</button>
                      </td>
                    )}
                    {columns.map((c) => (
                      <td key={c.key} className={c.kind === "money" || c.kind === "num" ? "num" : ""}>
                        {c === primary && rowHref ? <Link className="font-semibold text-brand hover:underline" href={`${rowHref}/${r.id}`}>{cell(c, r)}</Link>
                          : c === primary && canEdit ? <button className="text-left font-semibold text-brand hover:underline" onClick={() => setEditing(r)}>{cell(c, r)}</button>
                          : cell(c, r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={`${editing === "new" ? "Add" : "Edit"} ${title}`}>
        {editing !== null && (
          <>
            <RecordForm
              entity={entity}
              fields={fields}
              options={options}
              id={editing === "new" ? null : editing.id}
              initial={editing === "new" ? defaults : editing}
              onDone={() => setEditing(null)}
              path={path}
            />
            {editing !== "new" && canDelete && (
              <button
                className="btn-danger mt-3 w-full"
                disabled={pending}
                onClick={() => {
                  if (!confirm("Delete this permanently?")) return;
                  start(async () => {
                    const r = await deleteRecord(entity, editing.id, path);
                    if (!r.ok) alert(r.error);
                    else { setEditing(null); router.refresh(); }
                  });
                }}
              >
                Delete
              </button>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}

/** Button that opens a record form (e.g. "Record payment") */
export function AddRecordButton({ entity, fields, options, label, title, defaults, path, className = "btn-primary" }: {
  entity: EntityKey; fields: FieldDef[]; options: Record<string, Option[]>; label: string; title: string; defaults?: Record<string, unknown>; path?: string; className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={title}>
        {open && <RecordForm entity={entity} fields={fields} options={options} initial={defaults} onDone={() => setOpen(false)} path={path} />}
      </Modal>
    </>
  );
}
