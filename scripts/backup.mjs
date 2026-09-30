// npm run backup  -> saves a full copy of the database to backups/<name>-<date>.sql.gz
// Needs pg_dump (comes with Postgres.app; on a server: apt install postgresql-client).
// Restore into an EMPTY database:  gunzip -c backups/FILE.sql.gz | psql "DATABASE_URL_OF_EMPTY_DB"
import "dotenv/config";
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { createGzip } from "node:zlib";
import path from "node:path";

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL / DIRECT_URL is missing in .env"); process.exit(1); }
if (/pgbouncer=true|:6543\//.test(url)) console.warn("Tip: set DIRECT_URL (port 5432) for backups; the pooler (6543) can cut long dumps.");
const dir = path.join(process.cwd(), "backups");
mkdirSync(dir, { recursive: true });
const stamp = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 16).replace(/[:T]/g, "-");
const db = (url.split("/").pop() || "db").split("?")[0];
const file = path.join(dir, `${db}-${stamp}.sql.gz`);

const dump = spawn("pg_dump", ["--no-owner", "--no-privileges", url], { stdio: ["ignore", "pipe", "pipe"] });
dump.on("error", () => { console.error("pg_dump was not found. On a Mac, open Postgres.app (it adds pg_dump to Terminal) or install PostgreSQL tools."); process.exit(1); });
let err = "";
dump.stderr.on("data", (d) => (err += d));
dump.stdout.pipe(createGzip()).pipe(createWriteStream(file)).on("finish", () => {
  if (dump.exitCode && dump.exitCode !== 0) { console.error("Backup failed:", err.trim()); process.exit(1); }
});
dump.on("close", (code) => {
  if (code === 0) console.log(`Backup saved: ${path.relative(process.cwd(), file)}\nKeep a copy somewhere else too (Google Drive, a pen drive).`);
  else { console.error("Backup failed:", err.trim() || `pg_dump exit ${code}`); process.exit(1); }
});
