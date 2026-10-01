import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { FieldDef, Option } from "./entities";

export async function lookupValues(tenantId: number, kind: string) {
  const rows = await db.select().from(schema.lookups).where(and(eq(schema.lookups.tenantId, tenantId), eq(schema.lookups.kind, kind))).orderBy(asc(schema.lookups.sortOrder), asc(schema.lookups.value));
  return rows.map((r) => r.value);
}

/** Names of the people who could pay from their own pocket: logins (owners/staff) + the staff list, deduped. Value = the name. */
export async function peopleNames(tenantId: number): Promise<Option[]> {
  const [logins, staff] = await Promise.all([
    db.query.users.findMany({ where: eq(schema.users.tenantId, tenantId), columns: { name: true, role: true, active: true } }),
    db.query.staff.findMany({ where: eq(schema.staff.tenantId, tenantId), columns: { name: true, active: true } }),
  ]);
  const seen = new Set<string>();
  const out: Option[] = [];
  const add = (name: string, group: string) => {
    const n = name.trim();
    if (!n || seen.has(n.toLowerCase())) return;
    seen.add(n.toLowerCase()); out.push({ value: n, label: n, group });
  };
  for (const u of logins) if (u.active) add(u.name, u.role === "OWNER" ? "Owners" : "Logins");
  for (const s of staff) if (s.active) add(s.name, "Staff");
  return out;
}

/** Resolve dropdown options for a set of fields */
export async function resolveOptions(tenantId: number, fields: FieldDef[]): Promise<Record<string, Option[]>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const T = (col: any) => eq(col, tenantId);
  const out: Record<string, Option[]> = {};
  for (const f of fields) {
    const s = f.source;
    if (!s) continue;
    if ("values" in s) out[f.name] = s.values.map((v) => ({ value: v, label: v }));
    else if ("people" in s) out[f.name] = await peopleNames(tenantId);
    else if ("lookup" in s) out[f.name] = (await lookupValues(tenantId, s.lookup)).map((v) => ({ value: v, label: v }));
    else {
      switch (s.entity) {
        case "vendors": out[f.name] = (await db.query.vendors.findMany({ where: T(schema.vendors.tenantId), orderBy: (t, { asc }) => asc(t.name) })).map((r) => ({ value: String(r.id), label: r.name })); break;
        case "staff": out[f.name] = (await db.query.staff.findMany({ where: T(schema.staff.tenantId), orderBy: (t, { asc }) => asc(t.name) })).map((r) => ({ value: String(r.id), label: r.name + (r.active ? "" : " (inactive)") })); break;
        case "categories": out[f.name] = (await db.query.categories.findMany({ where: T(schema.categories.tenantId), orderBy: (t, { asc }) => [asc(t.sortOrder), asc(t.name)] })).map((r) => ({ value: String(r.id), label: r.name })); break;
        case "ingredients": out[f.name] = (await db.query.ingredients.findMany({ where: T(schema.ingredients.tenantId), orderBy: (t, { asc }) => asc(t.name) })).map((r) => ({ value: String(r.id), label: `${r.name} (${r.unit})`, group: r.category })); break;
        case "customers": out[f.name] = (await db.query.customers.findMany({ where: T(schema.customers.tenantId), orderBy: (t, { asc }) => asc(t.name) })).map((r) => ({ value: String(r.id), label: r.name + (r.phone ? ` · ${r.phone}` : "") })); break;
        case "menuItems": {
          const items = await db.query.menuItems.findMany({ where: T(schema.menuItems.tenantId), with: { category: true } });
          items.sort((a, b) => a.category.sortOrder - b.category.sortOrder || a.category.name.localeCompare(b.category.name) || a.name.localeCompare(b.name));
          out[f.name] = items.map((r) => ({ value: String(r.id), label: r.name + (r.active ? "" : " (inactive)"), group: r.category.name }));
          break;
        }
      }
    }
  }
  return out;
}
