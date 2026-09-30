# Putting Restaurant Manager online (Supabase + Vercel + your domain)

About 45 minutes the first time. You need: a GitHub account, a Supabase account, a Vercel account, and (optional) a domain.

## 1. Database — Supabase
1. https://supabase.com → **New project** → region **Mumbai (ap-south-1)** → choose a strong database password (save it; avoid `$` and `@`).
2. **Connect** (top of the project) → copy two URIs, putting your password in each:
   - **Transaction pooler** (port **6543**) → add `?pgbouncer=true` at the end → this is `DATABASE_URL`
   - **Session pooler** (port **5432**) → this is `DIRECT_URL`
3. Create the tables from your Mac (inside the app folder):
   ```bash
   DATABASE_URL="<transaction pooler URI>" DIRECT_URL="<session pooler URI>" npm run db:migrate
   ```
   It should end with `Database is up to date.`

## 2. Code — GitHub (private)
1. https://github.com/new → name `alooposto-app` → **Private** → Create.
2. In the app folder:
   ```bash
   git init && git add . && git commit -m "Restaurant Manager"
   git branch -M main
   git remote add origin https://github.com/<your-username>/alooposto-app.git
   git push -u origin main
   ```
   `.env` is never uploaded (it is in `.gitignore`).

## 3. App — Vercel
1. https://vercel.com → **Add New → Project** → import `alooposto-app`.
2. **Environment Variables** (add each):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | transaction pooler URI (6543, `?pgbouncer=true`) |
   | `DIRECT_URL` | session pooler URI (5432) |
   | `AUTH_SECRET` | new long random value: `openssl rand -base64 32` |
   | `NEXT_PUBLIC_APP_NAME` | e.g. `Restaurant Manager` |
   | `SUPERADMIN_EMAILS` | `garbagebid13@gmail.com` |
   | `SUPERADMIN_PASSWORD` | a strong password (10+ characters) |
   | `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `MAIL_FROM` | same as your working `.env` (Gmail App Password or Brevo) |
   | `ALERT_EMAIL` | where error alerts go, e.g. your Gmail |

3. **Deploy**. Then **Settings → Functions → Function Region → Mumbai (bom1)** (fast, next to the database) and redeploy.
4. Open `https://<project>.vercel.app/admin/login` → log in → **Restaurants → New** → create Alooposto (code `alooposto`), switch on **Features** it needs.
   Staff log in at `https://<project>.vercel.app/alooposto`.

## 4. Your domain (optional)
Vercel → project → **Settings → Domains** → add `app.yourdomain.com` (or the bare domain). Vercel shows the DNS record to add at your domain seller (GoDaddy, Hostinger…): usually a **CNAME** `app → cname.vercel-dns.com`, or for a bare domain an **A** record `@ → 76.76.21.21`. HTTPS is automatic.

## 5. Updating later
- Code change: `git add . && git commit -m "update" && git push` → Vercel redeploys by itself.
- If the update changes the database (the release note will say so): first run
  `DATABASE_URL="…" DIRECT_URL="…" npm run db:migrate` against Supabase, then push.

## 6. Backups — please set up
- From your Mac, weekly: `DIRECT_URL="<session pooler URI>" npm run backup` → saves `backups/<name>-<date>.sql.gz`. Copy it to Google Drive too.
  (pg_dump must be the same major version as Supabase's Postgres or newer; Postgres.app "latest" is fine.)
- Or Supabase **Pro** (≈ $25/month): automatic daily backups kept 7 days.

## Good to know
- **Plans:** Vercel's free *Hobby* plan is for non-commercial use; for a paid product use **Vercel Pro**. Supabase free projects pause after about a week with no activity (daily use keeps it awake; Pro never pauses).
- **Health check:** `https://<your-site>/api/health` returns OK when the app and database are up — use it with a free uptime monitor (e.g. UptimeRobot).
- **Error alerts:** with `ALERT_EMAIL` set, any server error is emailed to you (same error at most once per 30 minutes), and shown in Vercel → project → **Logs**.
- **Security built in:** login lockout (5 wrong passwords → 15 min), secure cookies over HTTPS, security headers, per-restaurant data separation.
