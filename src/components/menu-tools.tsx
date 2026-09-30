"use client";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importMenuAction, setAvailabilityAction, type ImportResult, type MenuCsvRow } from "@/app/actions/menu";

/** Available / not available switch */
export function AvailabilityToggle({ id, available }: { id: number; available: boolean }) {
  const [on, setOn] = useOptimistic(available);
  const [, start] = useTransition();
  const router = useRouter();
  return (
    <button type="button" role="switch" aria-checked={on} title={on ? "Available - tap to mark not available" : "Not available - tap to make available"}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); start(async () => { setOn(!on); const r = await setAvailabilityAction([id], !on); if (!r.ok) alert(r.error); router.refresh(); }); }}
      className={`inline-flex items-center gap-1.5 rounded-full px-1 py-0.5 text-[11px] font-bold ${on ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-600"}`}>
      <span className={`relative h-5 w-9 rounded-full transition ${on ? "bg-emerald-600" : "bg-stone-400"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
      </span>
      <span className="pr-1.5">{on ? "Available" : "Not available"}</span>
    </button>
  );
}

export function BulkAvailability({ ids }: { ids: number[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button className="btn-ghost btn-sm" disabled={pending || !ids.length} onClick={() => start(async () => { await setAvailabilityAction(ids, true); router.refresh(); })}>
      Make all available ({ids.length})
    </button>
  );
}

// ---------- CSV ----------
function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, "");
  const first = text.split(/\r?\n/)[0] ?? "";
  const delim = [",", ";", "\t"].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
const ALIASES: Record<keyof MenuCsvRow, string[]> = {
  code: ["code", "item code", "sku"],
  name: ["name", "dish", "dish name", "item", "item name"],
  category: ["category", "menu category", "section"],
  vegType: ["veg/non-veg", "veg / non-veg", "veg", "type", "veg type", "food type"],
  price: ["price", "selling price", "rate", "mrp", "selling price (₹)", "price (₹)"],
  estCost: ["est cost", "est. cost", "cost", "estimated cost", "food cost", "est cost (₹)"],
  available: ["available", "availability", "available now", "in stock"],
  active: ["active", "on menu", "status", "show"],
};
function toRows(grid: string[][]): { rows: MenuCsvRow[]; missing: string[] } {
  const head = (grid[0] ?? []).map((h) => h.trim().toLowerCase());
  const idx = Object.fromEntries(Object.entries(ALIASES).map(([k, al]) => [k, head.findIndex((h) => al.includes(h))])) as Record<keyof MenuCsvRow, number>;
  const missing = (["name", "price"] as const).filter((k) => idx[k] < 0);
  const rows = grid.slice(1).map((r) => {
    const g = (k: keyof MenuCsvRow) => (idx[k] >= 0 ? (r[idx[k]] ?? "").trim() : "");
    return { code: g("code"), name: g("name"), category: g("category"), vegType: g("vegType"), price: g("price"), estCost: g("estCost"), available: g("available"), active: g("active") };
  });
  return { rows, missing };
}

export function MenuCsv() {
  const ref = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<MenuCsvRow[] | null>(null);
  const [file, setFile] = useState("");
  const [hideMissing, setHideMissing] = useState(false);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const check = (r: MenuCsvRow[], hm: boolean) => start(async () => setPreview(await importMenuAction(r, { hideMissing: hm, dryRun: true })));
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Edit your whole menu in Excel or Google Sheets: download the file, change prices, add dishes or mark them not available, then upload it back. Dishes are matched by name; new categories are created automatically; nothing is deleted.</p>
      <div className="flex flex-wrap gap-2">
        <a className="btn-ghost btn-sm" href="/api/export/menu">⬇ Download current menu (CSV)</a>
        <a className="btn-ghost btn-sm" href="/api/export/menu?template=1">⬇ Blank template</a>
        <button className="btn-primary btn-sm" onClick={() => ref.current?.click()}>⬆ Upload CSV</button>
      </div>
      <input ref={ref} type="file" accept=".csv,text/csv" className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0]; e.target.value = "";
        if (!f) return;
        setErr(""); setDone(null); setPreview(null); setRows(null);
        const { rows: r, missing } = toRows(parseCsv(await f.text()));
        if (missing.length) { setErr(`The file needs these columns: ${missing.join(", ")}. Download the template to see the format.`); return; }
        setFile(f.name); setRows(r); check(r, hideMissing);
      }} />
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {rows && preview && !done && (
        <div className="rounded-xl border border-line p-3 text-sm">
          <div className="mb-2 font-semibold">{file} · {rows.length} rows</div>
          {preview.errors.length ? (
            <div className="space-y-1">
              <p className="font-semibold text-red-700">Please fix these in the file and upload again (nothing was changed):</p>
              <ul className="max-h-48 list-disc overflow-y-auto pl-5 text-red-700">{preview.errors.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          ) : (
            <>
              <ul className="mb-2 space-y-0.5">
                <li>➕ New dishes: <b>{preview.created}</b></li>
                <li>✏️ Dishes updated: <b>{preview.updated}</b></li>
                {preview.newCategories.length > 0 && <li>🗂 New categories: <b>{preview.newCategories.join(", ")}</b></li>}
                {hideMissing && <li>🙈 Dishes not in the file that will be hidden: <b>{preview.hidden}</b></li>}
              </ul>
              <label className="mb-3 flex items-center gap-2 text-xs"><input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={hideMissing} onChange={(e) => { setHideMissing(e.target.checked); check(rows, e.target.checked); }} /> Hide dishes that are not in this file (they are not deleted)</label>
              <div className="flex gap-2">
                <button className="btn-primary btn-sm" disabled={pending} onClick={() => start(async () => { const r = await importMenuAction(rows, { hideMissing }); setDone(r); if (r.ok) router.refresh(); })}>{pending ? "Importing…" : "Import now"}</button>
                <button className="btn-ghost btn-sm" onClick={() => { setRows(null); setPreview(null); }}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}
      {done && (done.ok
        ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">✓ Menu updated: {done.created} added, {done.updated} updated{done.hidden ? `, ${done.hidden} hidden` : ""}.</p>
        : <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{done.errors.join(" ")}</p>)}
      <details className="text-xs text-muted">
        <summary className="cursor-pointer font-semibold">CSV format</summary>
        <p className="mt-1">Columns (first row): <b>Code, Name, Category, Veg/Non-Veg, Price, Est Cost, Available, Active</b>. Only Name and Price are required (Category for new dishes). Veg/Non-Veg: Veg, Non-Veg or Egg. Available / Active: Yes or No (blank = Yes). Commas or semicolons both work.</p>
      </details>
    </div>
  );
}
