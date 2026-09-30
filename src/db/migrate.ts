// npm run db:migrate  -> applies the versioned SQL files in ./drizzle to the database (use this in production).
// A database made earlier with `npm run db:push` is recognised and marked as up to date with the baseline,
// so nothing is created twice. (Run `npm run db:push` once on such a database before switching, so it matches.)
import "dotenv/config";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const url = (process.env.DIRECT_URL || process.env.DATABASE_URL)!;
if (!url) { console.error("DATABASE_URL / DIRECT_URL is missing in .env"); process.exit(1); }
const pooled = /pgbouncer=true|:6543\//.test(url);
const sqlc = postgres(url, { prepare: false, max: 1, onnotice: () => {}, ...(pooled ? {} : { connection: { TimeZone: "UTC" } }) });
const folder = path.join(process.cwd(), "drizzle");

async function main() {
  const [{ has_app }] = await sqlc`select to_regclass('public.tenants') is not null as has_app`;
  const [{ has_log }] = await sqlc`select to_regclass('drizzle.__drizzle_migrations') is not null as has_log`;
  if (has_app && !has_log) {
    const journal = JSON.parse(readFileSync(path.join(folder, "meta/_journal.json"), "utf8"));
    const base = journal.entries[0];
    const query = readFileSync(path.join(folder, `${base.tag}.sql`), "utf8");
    const hash = crypto.createHash("sha256").update(query).digest("hex");
    await sqlc`create schema if not exists drizzle`;
    await sqlc`create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`;
    await sqlc`insert into drizzle.__drizzle_migrations (hash, created_at) values (${hash}, ${base.when})`;
    console.log(`Existing database found - marked as up to date with "${base.tag}".`);
  }
  await migrate(drizzle(sqlc), { migrationsFolder: folder });
  console.log("Database is up to date.");
}
main().then(() => sqlc.end()).catch(async (e) => { console.error("Migration failed:", e.message ?? e); await sqlc.end(); process.exit(1); });
