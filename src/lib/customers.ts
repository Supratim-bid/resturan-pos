import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/** Last 10 digits of an Indian mobile (handles +91 / 0 / spaces) */
export const phone10 = (p: string | null | undefined) => String(p ?? "").replace(/\D/g, "").slice(-10);

/** The customer already saved with this mobile number (ignores spaces, +91 etc.) */
export async function customerByPhone(tenantId: number, phone: string, exceptId?: number | null) {
  const p = phone10(phone);
  if (p.length !== 10) return null;
  return db.query.customers.findFirst({
    where: and(eq(schema.customers.tenantId, tenantId), sql`right(regexp_replace(${schema.customers.phone}, '\\D', '', 'g'), 10) = ${p}`,
      ...(exceptId ? [ne(schema.customers.id, exceptId)] : [])),
  });
}
