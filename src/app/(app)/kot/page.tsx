import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { kotsForDay } from "@/lib/kot";
import { addDays, fmtDate, todayIST } from "@/lib/format";
import { Empty, PageHeader } from "@/components/ui";
import { DismissButton, KotButtons, KotDatePicker, KotLive } from "@/components/kot-screen";

export const dynamic = "force-dynamic";

const minsAgo = (d: Date | null) => (d ? Math.max(0, Math.round((Date.now() - d.getTime()) / 60000)) : 0);
const TONE: Record<string, string> = { NEW: "border-red-500", PREPARING: "border-amber-500", READY: "border-emerald-600", SERVED: "border-line" };
const LABEL: Record<string, string> = { NEW: "New", PREPARING: "Cooking", READY: "Ready", SERVED: "Served" };

// Kitchen screen: KOTs of a day (today by default, pick any date), live
export default async function KotScreen({ searchParams }: { searchParams: Promise<{ show?: string; date?: string }> }) {
  const u = await requirePage("kot");
  const sp = await searchParams;
  const show = sp.show === "done" ? "done" : "active";
  const now = todayIST();
  const today = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : now;
  const isToday = today === now;
  const qs = (k: Record<string, string>) => { const p = new URLSearchParams({ ...(today !== now ? { date: today } : {}), ...(show === "done" ? { show: "done" } : {}), ...k }); for (const [a, b] of [...p]) if (!b) p.delete(a); const x = p.toString(); return `/kot${x ? `?${x}` : ""}`; };
  const [active, done] = await Promise.all([
    kotsForDay(u.tenantId, today, ["NEW", "PREPARING", "READY"]),
    show === "done" ? kotsForDay(u.tenantId, today, ["SERVED"]) : Promise.resolve([]),
  ]);
  const list = show === "done" ? [...done].reverse() : active;
  const newKey = active.filter((o) => o.kotStatus === "NEW" && o.status === "ACTIVE").map((o) => `${o.id}@${o.kotAt?.getTime() ?? 0}`).join(",");
  const counts = { NEW: 0, PREPARING: 0, READY: 0 } as Record<string, number>;
  for (const o of active) if (o.status === "ACTIVE") counts[o.kotStatus] = (counts[o.kotStatus] ?? 0) + 1;
  const tab = (k: string, label: string) => <Link href={qs({ show: k === "done" ? "done" : "" })} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${show === k ? "bg-brand text-white" : "bg-white ring-1 ring-line"}`}>{label}</Link>;

  return (
    <div className="space-y-4">
      <PageHeader title="Kitchen (KOT)" subtitle={isToday ? "Today's kitchen tickets. New ones appear by themselves every few seconds." : `KOTs for ${fmtDate(today)}`} actions={isToday ? <KotLive newKey={newKey} /> : undefined} />
      <div className="flex flex-wrap items-center gap-2">
        <Link href={qs({ date: addDays(today, -1) === now ? "" : addDays(today, -1) })} className="btn-ghost btn-sm" aria-label="Previous day">‹</Link>
        <KotDatePicker value={today} today={now} show={show} />
        <Link href={qs({ date: addDays(today, 1) === now ? "" : addDays(today, 1) })} className="btn-ghost btn-sm" aria-label="Next day">›</Link>
        {!isToday && <Link href={qs({ date: "" })} className="btn-gold btn-sm">Today</Link>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {tab("active", `To do (${active.length})`)}{tab("done", isToday ? "Served today" : "Served")}
        <span className="text-sm text-muted">New {counts.NEW} · Cooking {counts.PREPARING} · Ready {counts.READY}</span>
      </div>
      {list.length === 0 ? <Empty>{show === "done" ? (isToday ? "Nothing served yet today." : "Nothing served on this day.") : isToday ? "No KOTs right now. New orders show up here." : "No open KOTs for this day."}</Empty> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((o) => {
            const cancelled = o.status === "CANCELLED";
            const m = minsAgo(o.kotAt);
            return (
              <div key={o.id} className={`card space-y-2 border-l-8 ${cancelled ? "border-stone-400 opacity-80" : TONE[o.kotStatus]}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-2xl font-extrabold">KOT #{o.kotNo}</div>
                    <div className="text-sm font-semibold">{o.orderType}{o.tableNo ? ` · Table ${o.tableNo}` : ""}{o.customer?.name ? ` · ${o.customer.name}` : ""}</div>
                    <div className="text-xs text-muted">{o.billNo}{o.mealSlot ? ` · ${o.mealSlot}` : ""}</div>
                  </div>
                  <div className="text-right">
                    <div className={`rounded-full px-2 py-0.5 text-xs font-bold ${cancelled ? "bg-stone-200" : o.kotStatus === "NEW" ? "bg-red-100 text-red-800" : o.kotStatus === "PREPARING" ? "bg-amber-100 text-amber-900" : o.kotStatus === "READY" ? "bg-emerald-100 text-emerald-800" : "bg-stone-100"}`}>{cancelled ? "Cancelled" : LABEL[o.kotStatus]}</div>
                    {show === "active" && isToday && <div className={`mt-1 text-sm font-bold tabular-nums ${m >= 20 && !cancelled ? "text-red-700" : "text-muted"}`}>{m} min</div>}
                  </div>
                </div>
                {o.kotUpdated && !cancelled && <div className="rounded bg-amber-100 px-2 py-1 text-sm font-bold text-amber-900">⚠ Order changed - check the dishes again</div>}
                {cancelled && <div className="rounded bg-red-100 px-2 py-1 text-sm font-bold text-red-800">Bill cancelled - do not cook</div>}
                <ul className={`space-y-0.5 text-lg ${cancelled ? "line-through" : ""}`}>
                  {o.items.map((i) => <li key={i.id} className="flex gap-2"><b className="w-10 shrink-0 text-right tabular-nums">{Number(i.qty)}×</b><span>{i.name}</span></li>)}
                </ul>
                {o.notes && <div className="rounded bg-cream px-2 py-1 text-sm">📝 {o.notes}</div>}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
                  {cancelled ? <DismissButton id={o.id} /> : <KotButtons id={o.id} status={o.kotStatus} />}
                  <Link href={`/kot/${o.id}?back=kot`} className="text-sm font-semibold text-brand underline">Print</Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
