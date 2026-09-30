# Restaurant Manager (multi-restaurant SaaS)

A mobile-friendly web app for running restaurants: orders & bills, customers & dues, menu, recipe costing, stock, expenses, staff, cash closing and profit reports.
**One installation serves many restaurants.** Each restaurant has its own data, logins, logo, colours and bill numbers, fully separated from the others.

Works in any phone browser and can be added to the home screen like an app.

---

## Who logs in where

| Who | Where | How |
|---|---|---|
| **Super admin** (you, the SaaS owner) | `/admin/login` | Email → 6-digit code sent to that email (valid 10 min, 5 tries), or email + `SUPERADMIN_PASSWORD` |
| **Restaurant owner & staff** | `/<restaurant-code>` e.g. `your-app.com/alooposto` (or `/login`) | Username + password (restaurant is picked by the link) |

- **Super admin** creates restaurants and their first owner (name, username, password), pauses or reactivates accounts, resets passwords, adds more owners and adds other super admins.
- **Owner** creates staff logins inside the app (**Settings & Users**), sets their passwords, and **ticks exactly which tabs each person can open**, plus two extra powers: *see costs & profit* and *edit/cancel past orders*. Role (Manager / Cashier / Kitchen) only sets the starting ticks.
- The app shows the **name of the person logged in** (header, sidebar, More page).
- The restaurant code is remembered on each phone, so staff only type username + password after the first time.
- Pausing a restaurant signs everyone out immediately. Changing a person's password, role or turning them off signs them out on all devices.

## Per-restaurant settings (Settings & Users)
- **Logo:** login screen, header, bills and receipt images.
- **Brand colours:** main + accent (defaults: red & gold); the whole app and bills follow them.
- **Bill number format:** prefix (e.g. `AP-`), digits, starting number, optional financial year that restarts every April → `AP-26-27/0001`. The number is fixed on each bill when it is created; changing the format affects new bills only.
- GSTIN, FSSAI, UPI ID (QR code on bills), GST %, bill footer, default delivery/packing charges, price multiplier (suggested price = cost × 3), Swiggy/Zomato commission.
- Default thermal paper width: 2 inch (58mm) or 3 inch (80mm).

## Super admin login & .env
- Every time the app starts it reads `SUPERADMIN_EMAILS` and makes each email an active super admin. Change the email in `.env` and restart; no re-seeding is needed.
- The terminal shows a startup check:
  - `[admin] Super admins from .env: …`
  - whether the email server works. For Gmail, `SMTP_PASS` must be an **App Password**.
- With `SMTP_HOST` empty, OTP codes are printed in the terminal.
- Optional `SUPERADMIN_PASSWORD` (10+ characters) adds a **Password** tab on the login page, which works even when email doesn't. After 5 wrong tries, that email is blocked for 15 minutes.

## Features per restaurant (super admin)
Admin → a restaurant → **Features**. Extra features are off until you switch them on for that restaurant. Currently: **Pre-orders**.

## Cancelling bills: money & numbers
- **Money:** when a cancellation is approved (or an owner cancels directly), choose what happens to money already received.
  - **Refund:** a minus entry in the same mode (Cash / UPI / Card…), dated today. UPI, card or Razorpay money must actually be sent back from that app.
  - **Keep as the customer's advance:** used for their next bill.
- Reports and Cash Closing count money net of refunds.
- Bills cancelled before this update that still hold money are listed on the dashboard, with a **Record refund** button.
- **Numbers:** with *Reuse the number of a cancelled bill* on (the default), AP-0002 cancelled becomes **AP-0002-CAN** and the next new bill gets **AP-0002**. Untick this in Settings to never reuse numbers. If you are GST-registered, confirm with your CA which your invoices should follow.
- **Restore:** a restored bill keeps its old number if it's still free; otherwise it gets the next free number.

## Pre-orders (breakfast / lunch / dinner)
- Needs the **Pre-orders** feature switched on by the super admin.
- New Order → tap **🗓️ Pre-order (later)** at the top (or Orders → 🗓️ Pre-order), pick the **date** the food is served, the **meal** (Breakfast, Lunch, Evening Snacks, Dinner — edit in Settings → Dropdown lists → *Meal slots*) and a time.
- Any advance taken is recorded on the booking day. The bill prints `PRE-ORDER · date · meal · time`.
- **Pre-orders** tab: Today / Tomorrow / Next 7 days / any date, filter by meal, a **kitchen cook list** (total plates per dish per meal) and Pending → Ready → Delivered buttons. The dashboard shows how many are due today and tomorrow.
- Sales count on the serving date. Stock is deducted when the pre-order is saved.
- Cashier logins can book pre-orders for later dates, but normal orders stay today-only.

## Online payments
- **UPI QR (free):** Settings → UPI ID. Every bill shows a QR with the amount filled in.
- **Your own QR image:** Settings → *Payment QR on bills* → Upload QR image. Use a screenshot or photo of your PhonePe / Google Pay / Paytm / bank QR. It's printed on every bill instead of the generated one; the customer types the amount.
- **Fixed payment page:** any https link (Razorpay.me, PhonePe/Paytm business link). It's printed as a QR if there is no UPI ID, and added to WhatsApp bills.
- **Razorpay gateway:** Settings → Online payments → Key ID + Key secret (stored encrypted). Each order gets **Create payment link** → share on WhatsApp → **Check payment** records it automatically.
  - Optional webhook for instant updates: URL `https://<your-app>/api/pay/razorpay`, event `payment_link.paid`, plus the same webhook secret. This only works once the app is online.

## Bill design (Settings → Restaurant, bills & theme)
You can set:
- a line under the name;
- a social/website line;
- small print / terms;
- show or hide the logo;
- print "Billed by";
- the payment QR: shown when money is due / always / never, with your own text under it.

## Packaging (internal by default)
- On each order, tap the packaging used (photos if you've added them). The pieces come off packaging stock and their cost counts in the order's food cost and margin.
- By default, packaging is **not** on the customer's bill. Tick **Add packaging to the customer's bill** on an order to charge it, at each item's *Price if charged* (blank = your cost).
- **Packaging tab → Packaging stock:**
  - **Count** the shelf to start tracking.
  - **+ Add stock** when you buy, in packs or pieces. It can also record the expense.
  - Set a low-stock alert per item; the dashboard shows what to reorder.
  - A cancelled bill puts its packaging back in stock.
- **Barcode scanner (optional, off by default):** Settings → Barcode scanner.
  - Use a Bluetooth/USB scanner in keyboard (HID) mode, and give each packaging item a barcode on the Packaging tab.
  - Scanning adds one piece: either in the scan box on the order screen, or anywhere on that screen when no box is selected.

## Bills & thermal printing
Open an order → **Bill / Print**:
- **A4 / 3 inch / 2 inch** print layouts (Print or Save as PDF).
- **Thermal image (PNG)** for Bluetooth printers: 2 inch = 384 px, 3 inch = 576 px wide, pure black and white.
  - **Share to printer app**: on Android, sends the image straight to apps like *RawBT* or your printer's app.
  - **Download PNG**: then print it from the gallery.
- WhatsApp bill text and a UPI QR with the amount due.

## Menu: CSV upload & availability
- **Available switch:** every dish has an *Available / Not available* switch (Menu and Today's Menu). Unavailable dishes show greyed out on the order screen and can't be added. **Make all available** resets them in one tap.
- **"On menu" vs "Available":** *On menu* (active) hides a dish permanently. *Available* is for today (sold out, ingredient finished).
- **CSV:** Menu → *Update menu from CSV*:
  1. **Download current menu** (or the blank template), then edit it in Excel or Google Sheets.
  2. **Upload CSV.** You see a preview (new / updated dishes, new categories) before anything changes. If any line has a problem (missing price, duplicate name…), the line numbers are listed and nothing is saved.
  3. Columns: `Code, Name, Category, Veg/Non-Veg, Price, Est Cost, Available, Active`. Only Name and Price are required (Category for new dishes). Dishes are matched by name; new categories are created; nothing is deleted. There is an option to hide dishes missing from the file.
- Dish photos: Menu → Edit → Add photo (resized on the phone, stored in the database).

## Everything else (per restaurant)
New Order (tap-to-add POS) · Orders & Bills · Customers & Dues (payments settle oldest bills first) · Today's Menu (planned / sold / left) · Recipes & Costing (cost per plate, 3× suggested price, thali from other dishes) · Ingredient Rates · Packaging · Stock (auto-deducted by recipes) · Wastage · Expenses · Vendors & Dues · Staff & Attendance · Cash Closing · Swiggy/Zomato Payouts · Reports & P&L with charts and CSV exports · Reminders.

---

## Run it locally (Mac)
```bash
brew install node postgresql@16 && brew services start postgresql@16
createdb alooposto
cd alooposto-app
cp .env.example .env          # edit: DATABASE_URL/DIRECT_URL (postgresql://YOURNAME@localhost:5432/alooposto), AUTH_SECRET, SUPERADMIN_EMAILS
npm install
npm run db:push               # creates / updates all tables
npm run db:seed -- --demo     # super admin(s) + a demo restaurant "alooposto" with sample menu, recipes & logo
npm run dev
```
- Staff/owner app: http://localhost:3000/login?r=alooposto (owner = `OWNER_USERNAME` / `OWNER_PASSWORD` from `.env`).
- Super admin: http://localhost:3000/admin/login. With `SMTP_HOST` empty, the 6-digit code is **printed in the terminal** where `npm run dev` runs.
- Without `--demo`, only the super admin is created; make restaurants from `/admin`.

> **Upgrading from the single-restaurant version:** the database layout changed (every table now belongs to a restaurant). For test data, start fresh: `dropdb alooposto && createdb alooposto && npm run db:push && npm run db:seed -- --demo`.

## Put it online
**Full step-by-step guide: [DEPLOY.md](DEPLOY.md)** (Supabase + Vercel + your domain, migrations, backups, error alerts).

## Database commands
| Command | When |
|---|---|
| `npm run db:push` | Local development: make the database match the code (quick) |
| `npm run db:migrate` | Production (and any shared database): apply the versioned files in `drizzle/`. A database made earlier with `db:push` is recognised and marked up to date |
| `npm run db:generate` | Developer: after changing `src/db/schema.ts`, create the next migration file |
| `npm run backup` | Save a full copy of the database to `backups/` (needs `pg_dump`) |

## Security
- Login lockout: 5 wrong passwords for one login (or 30 from one network) lock it for 15 minutes; super admin password login: 5 per email / 20 per network. Stored in the database, so restarts don't reset it.
- Security headers on every page (no framing, nosniff, strict referrer, HSTS in production).
- Server errors are logged, and emailed to `ALERT_EMAIL` if set (at most once per 30 minutes per error).

## Put it online (Supabase + Vercel, free tiers) - short version
1. **Supabase** → new project (region Mumbai) → **Connect**: copy the *Transaction pooler* URI (port 6543, add `?pgbouncer=true`) as `DATABASE_URL`, and the *Session pooler* URI (port 5432) as `DIRECT_URL`.
2. From your computer, with those URLs in `.env`: `npm install && npm run db:push && npm run db:seed` (add `-- --demo` for the demo restaurant).
3. **Email for OTP:** set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`. Examples:
   - **Gmail:** `smtp.gmail.com`, port `465`, your Gmail + an *App Password* (Google Account → Security → 2-Step Verification → App passwords).
   - **Zoho Mail / Brevo / Resend / Amazon SES:** use their SMTP host, port and credentials.
4. **GitHub:** push this folder to a private repo (`.env` is git-ignored).
5. **Vercel** → import the repo → add environment variables: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_NAME`, `SUPERADMIN_EMAILS`, `SMTP_*`, `MAIL_FROM` → Deploy.
6. Open `https://<your-app>.vercel.app/admin/login`, log in with your email code, create restaurants, and send each owner their restaurant code, username and password.
7. Optional: your own domain (Vercel → Settings → Domains).

### Environment variables
| Name | What |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | Postgres connection (pooler / direct) |
| `AUTH_SECRET` | Long random string; signs login sessions (`openssl rand -base64 32`) |
| `NEXT_PUBLIC_APP_NAME` | Your product name (login pages, browser title) |
| `SUPERADMIN_EMAILS` | Comma-separated emails created as super admins by `db:seed` (more can be added in `/admin`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Email for OTP codes (empty host = print code to the server log, for local dev only) |
| `OWNER_NAME`, `OWNER_USERNAME`, `OWNER_PASSWORD` | Owner of the demo restaurant (`--demo`) |

## Security notes
- Every table carries `tenant_id`, and every query filters by the logged-in restaurant. IDs a form sends (category, vendor, dish, photo…) are checked to belong to the same restaurant. Other restaurants' orders, bills, images and exports return *not found*.
- Passwords are bcrypt-hashed. Sessions are signed cookies, invalidated when the password, role or active status changes.
- OTP codes are stored hashed, expire in 10 minutes, allow 5 attempts, and can be re-sent once a minute. The login screen doesn't reveal which emails are admins.
- Backups: Supabase keeps short daily backups on the free plan. Download CSVs from Reports monthly, or upgrade Supabase / run `pg_dump` on `DIRECT_URL`.

## How the numbers work
- **Cost per plate** = (ingredients at effective rate incl. wastage + misc % + gas) ÷ plates made + thali parts, plus packaging for non-dine-in orders.
- **Suggested price** = cost × multiplier (default 3), rounded up to ₹5.
- **Order total** = items − discounts + delivery + packing, then GST (CGST/SGST on the bill), rounded to the rupee.
- **Net profit** = net sales (before GST) − all expenses − actual Swiggy/Zomato commission.

## Tech & code map
Next.js 15 (App Router, server actions) · PostgreSQL + Drizzle ORM · Tailwind CSS 4 · Recharts · `next/og` for receipt images · nodemailer (SMTP) · bcrypt + signed JWT cookies.
- `src/db/schema.ts`: tables (`tenants`, `super_admins`, `admin_otps` + per-restaurant tables)
- `src/lib/`: `auth` (sessions), `permissions` (tabs & roles), `provision` (create restaurant), `orders`, `costing`, `reports`, `bill`
- `src/app/(app)/`: restaurant app pages · `src/app/admin/`: super admin portal · `src/app/bill/[id]/png`: thermal receipt image
- `assets/fonts/`: Carlito (SIL OFL) for receipt images, including the ₹ symbol
