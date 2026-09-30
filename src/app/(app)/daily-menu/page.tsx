import Link from "next/link";
import { and, eq, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/auth";
import { ENTITIES } from "@/lib/entities";
import { resolveOptions } from "@/lib/options";
import { addDays, fmtDate, todayIST } from "@/lib/format";
import { CrudManager } from "@/components/crud";
import { PageHeader, Stat } from "@/components/ui";
import { CopyMenuButton } from "./copy";
import { DateJump } from "@/components/date-jump";

export default async function DailyMenu({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const u = await requirePage("dailyMenu");
  const date = (await searchParams).date || todayIST();
  const [plans, sold] = await Promise.all([
    db.query.dailyMenus.findMany({ where: and(eq(schema.dailyMenus.tenantId, u.tenantId), eq(schema.dailyMenus.date, date)), with: { menuItem: true } }),
    db.select({ id: schema.orderItems.menuItemId, q: sql<number>`sum(${schema.orderItems.qty})` })
      .from(schema.orderItems).innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
      .where(and(eq(schema.orders.tenantId, u.tenantId), eq(schema.orders.date, date), ne(schema.orders.status, "CANCELLED"))).groupBy(schema.orderItems.menuItemId),
  ]);
  const sm = new Map(sold.map((s) => [s.id, Number(s.q)]));
  const f = ENTITIES.dailyMenus.fields;
  const opts = await resolveOptions(u.tenantId, f);
  const rows = plans.map((p) => {
    const s = sm.get(p.menuItemId) ?? 0, left = p.plannedPlates - s;
    return { ...p, dish: p.menuItem.name, available: p.menuItem.available, sold: s, left, status: left <= 0 ? "Sold out" : left <= 2 ? "Almost out" : "Available" };
  }).sort((a, b) => a.dish.localeCompare(b.dish));
  const planned = rows.reduce((a, r) => a + r.plannedPlates, 0), soldT = rows.reduce((a, r) => a + r.sold, 0);
  const offMenu = [...sm].filter(([id]) => !plans.some((p) => p.menuItemId === id)).length;
  return (
    <div>
      <PageHeader title="Today's Menu" subtitle={fmtDate(date)}
        actions={<>
          <Link href={`/daily-menu?date=${addDays(date, -1)}`} className="btn-ghost">←</Link>
          <DateJump value={date} />
          <Link href={`/daily-menu?date=${addDays(date, 1)}`} className="btn-ghost">→</Link>
        </>} />
      <div className="mb-4 grid grid-cols-3 gap-2">
        <Stat label="Planned plates" value={planned} />
        <Stat label="Sold" value={soldT} tone="green" />
        <Stat label="Left" value={planned - soldT} tone={planned - soldT < 0 ? "red" : undefined} />
      </div>
      {!rows.length && <div className="mb-3"><CopyMenuButton from={addDays(date, -1)} to={date} /></div>}
      <CrudManager entity="dailyMenus" title="menu plan" fields={f} options={opts} rows={rows} path="/daily-menu" addLabel="Dish for the day"
        defaults={{ date }} emptyText="Nothing planned for this day yet. Add dishes - they show first in New Order under ★ Today."
        columns={[
          { key: "dish", label: "Dish", primary: true },
          { key: "available", label: "Available", kind: "available" },
          { key: "plannedPlates", label: "Planned", kind: "num" },
          { key: "sold", label: "Sold", kind: "num" },
          { key: "left", label: "Left", kind: "num" },
          { key: "status", label: "Status", kind: "badge", tones: { "Sold out": "red", "Almost out": "amber", Available: "green" } },
          { key: "notes", label: "Notes", hideMobile: true },
        ]} />
      {offMenu > 0 && <p className="mt-2 text-xs text-muted">{offMenu} dish(es) were sold that weren't on this day's plan.</p>}
    </div>
  );
}
