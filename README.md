Smartcar Webhook Receiver
=========================

Serverless Next.js (App Router) project for receiving Smartcar webhooks, verifying HMAC signatures, and storing raw and normalized data into Postgres using Drizzle ORM and Vercel Postgres.

Stack
-----
- Next.js 14 (App Router) + TypeScript + Tailwind
- Vercel Functions
- Database: Vercel Postgres (or any Postgres via `DATABASE_URL`)
- ORM: Drizzle

Environment
-----------
Set these env vars locally and on Vercel:

```
POSTGRES_URL=<vercel_postgres_url> # if using Vercel Postgres
DATABASE_URL=postgres://user:pass@host:5432/db # if using Supabase/other
SMARTCAR_WEBHOOK_SECRET=your_app_management_token
```

Getting Started
---------------
1. Install deps: `pnpm i` (or `npm i` / `yarn`)
2. Generate and push schema (optional if using Vercel Postgres with automatic creation):
   - `pnpm db:generate`
   - `pnpm db:push`
3. Run dev server: `pnpm dev`

API
---
- `POST /api/webhook` — verifies `SC-Signature`, stores event and flattened `data` as signals
- `GET /api/events?vehicleId=&eventName=&limit=` — recent webhook events
- `GET /api/signals?vehicleId=&signalPath=&limit=` — signal history

Notes
-----
- Signature verification follows Smartcar docs using HMAC SHA-256 of the raw body with `SMARTCAR_WEBHOOK_SECRET`.
- Signals are flattened with dot notation (e.g. `battery.percentRemaining`, `odometer.distance`, `location.latitude`).
