# FDs & OD Tracker (web)

A personal web app for SBI fixed deposits and the overdrafts taken against them. It tracks
every deposit (FDs, RDs, PPF: value, maturity, lien), every OD with a money ledger, and
each OD's lifecycle: opened → drawn → renewed (possibly many times) → closure requested →
closed → lien released.

Static React SPA on GitHub Pages, data in Supabase (Postgres + Auth), every table
fenced by row-level security.

## Stack

Vite + React 18 + TypeScript · Tailwind CSS 4 · supabase-js v2 · TanStack Query ·
React Hook Form + Zod · React Router (`HashRouter`) · date-fns · Recharts · Vitest.

## Setup

### 1. Create the Supabase project and run the migration

1. Create a project at [supabase.com](https://supabase.com) (or reuse one with no
   conflicting tables — the migration creates `od_accounts`, `od_transactions` and others in `public`).
2. **SQL Editor** → paste [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) → **Run**.
   It creates the enums, tables, RLS policies, integrity triggers, the
   `od_balances` / `od_alerts` / `od_summary` views and the workflow functions.
3. Then run [`supabase/migrations/0002_fd_tracker.sql`](supabase/migrations/0002_fd_tracker.sql),
   which adds the deposit columns (type, current value, maturity amount, lien amount…) the FDs page uses.

### 2. Sign up, then disable sign-ups

1. Run the app locally (step 4) or deploy it (step 5), and use **Create the account** on the login screen.
   If email confirmation is on, confirm via the email.
2. Supabase → **Authentication → Sign In / Providers** → turn off **Allow new users to sign up**.
   The site is public; from now on nobody else can create an account.
3. **Authentication → URL Configuration**: set the Site URL to your Pages URL
   (`https://<user>.github.io/od-tracker/`) and add `http://localhost:5173/od-tracker/` as a redirect URL.

### 3. Load your data

`supabase/seed.local.sql` is **gitignored** (it holds real account numbers). Open it,
replace `MY_EMAIL` with your login email, paste it into the SQL Editor and run it.
It refuses to run twice. On first login the dashboard offers **Set opening balances**:
enter what you owe on each active OD (from YONO) and it records `opening_balance` entries.

### 4. Run locally

```bash
cd web
cp .env.example .env.local      # fill in URL and publishable key (Project Settings → API Keys)
npm install
npm run dev                     # http://localhost:5173/od-tracker/
```

### 5. Deploy to GitHub Pages

1. Repo **Settings → Secrets and variables → Actions** → add
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the publishable `sb_publishable_…` key, or the legacy anon key).
2. Repo **Settings → Pages** → **Source: GitHub Actions**.
3. Push to `main`. [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) runs the tests,
   builds with `base: '/od-tracker/'` and publishes `web/dist`.

Never commit `.env*` files, and never use the `service_role` / secret key in the frontend.

## Scripts

| Script | |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | typecheck + production build |
| `npm test` | Vitest unit tests |
| `npm run typecheck` | types only |

## How the data fits together

| Table | Holds |
|---|---|
| `od_accounts` | one row per OD; `expiry_date`, `current_limit` and `interest_rate` always reflect the current term |
| `od_terms` | term #1 plus one row per renewal |
| `od_transactions` | the ledger: `opening_balance`, `draw`, `repayment`, `interest`, `charge`, `closure_debit`, `adjustment` (only adjustments are signed) |
| `od_events` | lifecycle timeline; workflows add rows, all editable |
| `fixed_deposits`, `od_fd_links` | FDs and which OD(s) they secure |
| `savings_accounts`, `branches`, `user_settings` | reference data; name and CIF for emails |

`outstanding = Σ(opening_balance, draw, interest, charge) − Σ(repayment, closure_debit) + Σ(adjustment)`.
Accrued interest estimate = outstanding × rate/100 × days since the last interest debit (or first draw) / 365.

### Rules enforced by the database (and previewed in the UI)

- A `draw` that would take outstanding above `current_limit` is rejected unless its notes contain "override".
- No transactions on a closed OD dated after `closed_on`.
- An OD can only be set to `closed` when its ledger nets to exactly 0.

### Workflows (atomic Postgres functions, `SECURITY INVOKER` so RLS applies)

| Function | Used by |
|---|---|
| `create_od` | **New OD**: OD + term #1 + FDs/links + `opened` event, then offers the first draw |
| `request_closure` | **Closure wizard** step 3, for one or several ODs of a branch |
| `mark_closed` | **Mark closed**: final interest + residual `closure_debit` (+ optional balancing adjustment), status `closed`, `closed` event |
| `mark_lien_released` | sets `lien_released_on`, FDs `lien_marked = false`, `lien_released` event |
| `record_renewal` | **Record auto-renewal**: new term, OD moves to the new expiry/limit/rate, `renewed` event; balance untouched |
| `change_limit` | **Change limit**: OD + current term + `limit_change` event |

### Alerts (`od_alerts`)

`expiring_soon`, `expiry_passed_unhandled` (also covers `unconfirmed` ODs), `closure_pending` (7+ days),
`lien_not_released`, `over_limit`, `missing_interest` (no interest debit for 40+ days while owing),
`reconcile` (bank-reported balance differs by more than ₹1).

## Not built yet

The optional phase-2 email digest (Edge Function + pg_cron + Resend) is not included.
