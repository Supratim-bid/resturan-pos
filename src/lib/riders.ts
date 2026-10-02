import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { effectivePerms, type Role } from "./permissions";

/** Active logins who can deliver (their access includes the Delivery tab). */
export async function listRiders(tenantId: number) {
  const users = await db.query.users.findMany({
    where: and(eq(schema.users.tenantId, tenantId), eq(schema.users.active, true)),
    columns: { id: true, name: true, role: true, permissions: true },
  });
  return users
    .filter((u) => effectivePerms(u.role as Role, u.permissions).includes("delivery"))
    .map((u) => ({ id: u.id, name: u.name }));
}
