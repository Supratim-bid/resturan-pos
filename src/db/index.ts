import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };
// prepare:false is required for Supabase's transaction pooler (pgbouncer)
const url = process.env.DATABASE_URL!;
// Times are stored without a time zone, so every connection must use UTC (a Mac's local Postgres
// defaults to the Mac's zone, e.g. IST). Poolers (pgbouncer / Supabase :6543) reject startup
// parameters, but those servers already run in UTC.
const pooled = /pgbouncer=true|:6543\//.test(url);
// fetch_types:false - skips a type lookup on every new connection (we only use text arrays); that lookup can stall behind Supabase's pooler.
// idle_timeout: close idle connections (each running copy of the app used to keep 5 open forever and use up Supabase's limit -> pages hang).
// max 3 per copy, connect_timeout 10s: a page waits at most that long for the database instead of forever.
const client = globalForDb.pg ?? postgres(url, {
  prepare: false, max: 3, fetch_types: false, connect_timeout: 10, idle_timeout: 20, max_lifetime: 60 * 10,
  ...(pooled ? {} : { connection: { TimeZone: "UTC" } }),
});
// Cache the pool on globalThis in EVERY environment (not just dev). On Vercel the server
// components, server actions and route handlers are separate bundles that each import this
// module - without this each one opens its own pool, multiplying connections until Supabase
// refuses new ones and queries hang for connect_timeout -> 504 "gateway timeout" after a change.
globalForDb.pg = client;

export const db = drizzle(client, { schema });
export type DB = typeof db;
export { schema };
