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
const client = globalForDb.pg ?? postgres(url, { prepare: false, max: 5, ...(pooled ? {} : { connection: { TimeZone: "UTC" } }) });
if (process.env.NODE_ENV !== "production") globalForDb.pg = client;

export const db = drizzle(client, { schema });
export type DB = typeof db;
export { schema };
