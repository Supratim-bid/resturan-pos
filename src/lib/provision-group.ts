// Create a multi-outlet brand (group) with outlets, menu and dummy data - used by the super-admin "demo group" button.
import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import { provisionTenant, replicateTenant, addSampleData, addDummyOrders } from "./provision";
import { DEFAULT_PLANS } from "./features";

type DB = PostgresJsDatabase<typeof schema>;

const PROMAX_FEATURES = [...(DEFAULT_PLANS.find((p) => p.key === "promax")?.features ?? [])];

/** Marks a tenant as an outlet of a group and gives it the Pro Max feature set. */
async function attachOutlet(db: DB, tenantId: number, groupId: number, primary: boolean) {
  await db.update(schema.tenants).set({ groupId, isPrimaryOutlet: primary, plan: "promax", features: PROMAX_FEATURES }).where(eq(schema.tenants.id, tenantId));
}

export type DemoGroupResult = { groupId: number; groupName: string; ownerUsername: string; ownerPassword: string; primaryCode: string; outlets: { name: string; code: string }[] };

/** Builds "My Restaurant Group" with 3 outlets, each with a sample menu and a week of dummy orders. */
export async function provisionDemoGroup(db: DB): Promise<DemoGroupResult> {
  const stamp = Math.random().toString(36).slice(2, 6);
  const ownerUsername = `mrgowner${stamp}`;
  const ownerPassword = "Owner@1234";
  const [group] = await db.insert(schema.groups).values({
    name: "My Restaurant Group", maxOutlets: 5, menuMode: "independent",
    groupManagers: true, combinedOrdering: false, ownerCanAddOutlets: true,
  }).returning();

  // Primary outlet (carries the group owner login).
  const primary = await provisionTenant(db, {
    name: "My Restaurant — Central", code: `mrg-central-${stamp}`,
    ownerName: "Group Owner", ownerUsername, ownerPassword, plan: "promax", billPrefix: "MRC-",
  });
  await addSampleData(db, primary.id);
  const items = await db.query.menuItems.findMany({ where: eq(schema.menuItems.tenantId, primary.id), columns: { id: true } });
  await addDummyOrders(db, primary.id, items.map((i) => i.id));
  await attachOutlet(db, primary.id, group.id, true);

  // Group owner membership (access to every outlet in the group).
  const owner = await db.query.users.findFirst({ where: and(eq(schema.users.tenantId, primary.id), eq(schema.users.role, "OWNER")) });
  if (owner) await db.insert(schema.groupMembers).values({ groupId: group.id, userId: owner.id, role: "OWNER", outletIds: [] });

  // Two more outlets by copying the primary (brings the menu + its own dummy orders).
  const outlets: { name: string; code: string }[] = [{ name: primary.name, code: primary.code }];
  const extra: [string, string, string][] = [
    ["My Restaurant — North", `mrg-north-${stamp}`, "MRN-"],
    ["My Restaurant — South", `mrg-south-${stamp}`, "MRS-"],
  ];
  for (const [name, code, prefix] of extra) {
    const o = await replicateTenant(db, primary.id, {
      name, code, ownerName: `${name} Manager`, ownerUsername: code.replace(/-/g, ""), ownerPassword: "Outlet@1234", billPrefix: prefix,
    });
    await attachOutlet(db, o.id, group.id, false);
    outlets.push({ name, code });
  }

  return { groupId: group.id, groupName: group.name, ownerUsername, ownerPassword, primaryCode: primary.code, outlets };
}
