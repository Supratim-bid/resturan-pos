import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/auth";
import { ENTITIES } from "@/lib/entities";
import { resolveOptions } from "@/lib/options";
import { addDays, fmtDate, todayIST } from "@/lib/format";
import { CrudManager } from "@/components/crud";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ReminderDone } from "@/components/reminder-done";

export default async function Reminders() {
  const u = await requirePage("reminders");
  const today = todayIST();
  const rows = await db.query.reminders.findMany({ where: and(eq(schema.reminders.tenantId, u.tenantId), eq(schema.reminders.done, false)), orderBy: [asc(schema.reminders.dueDate)] });
  const f = ENTITIES.reminders.fields;
  const opts = await resolveOptions(u.tenantId, f);
  const soon = rows.filter((r) => r.dueDate <= addDays(today, 30));
  return (
    <div>
      <PageHeader title="Reminders" subtitle="Licences, GST returns, rent, bills - with repeat" />
      {soon.length > 0 && (
        <Card title="Due in the next 30 days" className="mb-4">
          <ul className="divide-y divide-line">
            {soon.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                <div><div className="font-medium">{r.title}</div><div className="text-xs text-muted">{fmtDate(r.dueDate)} {r.repeat !== "NONE" && `· repeats ${r.repeat.toLowerCase()}`}</div></div>
                <div className="flex items-center gap-2">{r.dueDate < today ? <Badge tone="red">Overdue</Badge> : r.dueDate === today ? <Badge tone="amber">Today</Badge> : null}<ReminderDone id={r.id} repeat={r.repeat} /></div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <CrudManager entity="reminders" title="reminder" fields={f} options={opts} rows={rows} path="/reminders" addLabel="Reminder" defaults={{ repeat: "NONE" }}
        columns={[{ key: "title", label: "What", primary: true }, { key: "dueDate", label: "Due", kind: "date" }, { key: "repeat", label: "Repeats" }, { key: "notes", label: "Notes", hideMobile: true }]} />
    </div>
  );
}
