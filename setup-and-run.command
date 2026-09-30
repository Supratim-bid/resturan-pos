#!/bin/bash
# Double-click this file (or run ./setup-and-run.command in Terminal) to install and start the app.
cd "$(dirname "$0")"
echo "== Restaurant Manager v9 =="
echo "Folder: $(pwd)"
# Your settings (.env): reuse the one from your old folder if this folder has none
if [ ! -f .env ]; then
  for old in ~/alooposto-app-v8/.env ~/Desktop/alooposto-app-v8/.env ~/Desktop/alooposto-app-v7/.env ~/alooposto-app-v7/.env ~/Desktop/Desktop/alooposto-app/.env ~/Desktop/alooposto-app/.env ~/Downloads/alooposto-app/.env ~/alooposto/alooposto-app/.env ~/Desktop/Desktop/alooposto-app-broken/.env ~/Desktop/alooposto-app-broken/.env ~/Downloads/alooposto-app-old/.env; do
    if [ -f "$old" ]; then cp "$old" .env; echo "Copied your settings from $old"; break; fi
  done
fi
if [ ! -f .env ]; then
  cp .env.example .env
  echo "No old settings found - created .env from the example. Open it in TextEdit, set DATABASE_URL etc., then run again."
  open -e .env 2>/dev/null; exit 1
fi
for f in src/db/index.ts "src/app/(app)/layout.tsx" src/app/layout.tsx package.json .env; do
  if [ ! -f "$f" ]; then echo "MISSING: $f  -> unzip the v9 zip again into an EMPTY folder."; exit 1; fi
done
if ! head -1 "src/app/(app)/layout.tsx" | grep -q "next/link"; then echo "Wrong layout file - this is not a clean v9 folder."; exit 1; fi
echo "Files OK."
command -v node >/dev/null || { echo "Node.js is not installed. Install it from https://nodejs.org (LTS) and run again."; exit 1; }
echo "Installing packages (first time takes a few minutes)..."
npm install || exit 1
echo "Updating database tables..."
npm run db:push || { echo "Database not reachable. Open Postgres.app and make sure it says Running, then run again."; exit 1; }
echo ""
echo "Starting... open http://localhost:3000/alooposto  (super admin: http://localhost:3000/admin/login)"
echo "Stop with Ctrl + C."
npm run dev
