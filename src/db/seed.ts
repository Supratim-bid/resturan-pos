// npm run db:seed              -> creates the super admin(s) from SUPERADMIN_EMAILS
// npm run db:seed -- --demo    -> also creates a demo restaurant "my-restaurant" with sample menu, recipes & logo
import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "./schema";
import { addSampleData, provisionTenant } from "../lib/provision";

const seedUrl = (process.env.DIRECT_URL || process.env.DATABASE_URL)!;
const client = postgres(seedUrl, { prepare: false, max: 1, ...(/pgbouncer=true|:6543\//.test(seedUrl) ? {} : { connection: { TimeZone: "UTC" } }) });
const db = drizzle(client, { schema });

async function main() {
  const emails = (process.env.SUPERADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!emails.length) console.warn("! SUPERADMIN_EMAILS is empty - no super admin created");
  for (const email of emails) {
    await db.insert(schema.superAdmins).values({ email, name: email.split("@")[0] }).onConflictDoNothing();
    console.log(`Super admin: ${email} (log in at /admin/login with an email OTP)`);
  }

  if (!process.argv.includes("--demo")) return;
  const code = "my-restaurant";
  if (await db.query.tenants.findFirst({ where: eq(schema.tenants.code, code) })) { console.log("Demo restaurant already exists"); return; }
  const t = await provisionTenant(db, {
    name: "My Restaurant", code, billPrefix: "MR-",
    ownerName: process.env.OWNER_NAME || "Owner", ownerUsername: process.env.OWNER_USERNAME || "owner",
    ownerPassword: process.env.OWNER_PASSWORD || "", contactEmail: emails[0] ?? "",
  });
  await db.update(schema.settings).set({ tagline: "Fresh & Homemade", address: "Your City" }).where(eq(schema.settings.tenantId, t.id));
  try {
    const data = await readFile(path.join(process.cwd(), "public", "demo-logo.jpg"));
    const [img] = await db.insert(schema.images).values({ tenantId: t.id, mime: "image/jpeg", data, width: 640, height: 640 }).returning();
    await db.update(schema.settings).set({ logoImageId: img.id }).where(eq(schema.settings.tenantId, t.id));
  } catch { /* logo optional */ }
  await addSampleData(db, t.id);
  console.log(`Demo restaurant "${code}" created - owner login: ${process.env.OWNER_USERNAME || "owner"}`);
}

main().then(() => client.end()).catch(async (e) => { console.error(e); await client.end(); process.exit(1); });
