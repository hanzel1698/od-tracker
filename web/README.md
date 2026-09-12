# OD Tracker — Web

The browser version of the [OD Tracker](../README.md) Android app: track overdrafts
taken against fixed deposits, log transfers, and generate the bank closure request
letter. Same data model and same arithmetic as the Android app, with the data in
Supabase instead of a local Room database, so the same account is available on
every device you sign in from.

## Stack

| Concern        | Choice                                                       |
| -------------- | ------------------------------------------------------------ |
| UI             | React 19 + TypeScript, hand-written CSS (Material 3 palette)  |
| Build          | Vite 7                                                        |
| Data & auth    | Supabase (Postgres + Auth + Realtime), guarded by row-level security |
| Server state   | TanStack Query, invalidated by Supabase realtime events       |
| Closure letter | pdf-lib, rendered in the browser and code-split out of the main bundle |
| Hosting        | Netlify (static SPA — no server or serverless function needed) |

There is no backend of our own. The browser talks to Supabase directly with the
anon key, and every table is fenced off by row-level security policies that
restrict each row to the user who owns it.

## Setup

### 1. Create the Supabase project

1. Start a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql),
   and run it. That creates the three tables, their grants and policies, the
   `updated_at` triggers, and the realtime publication. Every statement is
   idempotent, so re-running it against an already-provisioned project is a
   no-op rather than a second set of policies.
3. Under **Authentication → Providers**, keep **Email** enabled. If you would
   rather not round-trip a confirmation email for your own account, turn off
   "Confirm email" there.

### 2. Point the app at it

```bash
cd web
cp .env.example .env.local
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from
# Project Settings -> API Keys
```

`VITE_SUPABASE_ANON_KEY` takes either the current **publishable** key
(`sb_publishable_…`) or a legacy **anon** key — the variable name predates
Supabase's rename, and supabase-js accepts both. Prefer the publishable key on
a new project.

Both values are meant to ship in the browser bundle. Neither grants anything
beyond what the row-level security policies allow, and the anonymous role has
had its table privileges revoked outright. Never put a `service_role` or
`sb_secret_…` key in the app.

### 3. Run it

```bash
npm install
npm run dev       # http://localhost:5173
```

| Script              | What it does                          |
| ------------------- | ------------------------------------- |
| `npm run dev`       | Vite dev server with hot reload       |
| `npm run build`     | Typecheck, then build to `dist/`      |
| `npm run preview`   | Serve the production build locally    |
| `npm test`          | Run the unit tests once               |
| `npm run typecheck` | Types only, no build                  |

## Deploying

The build is a plain static bundle — no serverless functions, no server-side
rendering, nothing host-specific. Anything that can serve a directory and fall
back to `index.html` will do, so the host below is a default rather than a
dependency.

`public/_redirects` and `public/_headers` ship the SPA fallback and security
headers in the format Netlify and Cloudflare Pages both read, and Vite copies
them into `dist/` on every build.

Whichever host you use, the two Supabase variables must be set **at build
time** — Vite inlines them into the bundle, so changing them means a fresh
deploy, not just a restart.

### Netlify

[`netlify.toml`](netlify.toml) already sets the base directory, build command,
publish directory, SPA fallback redirect and cache headers.

1. **New site → Import an existing project**, and pick this repository.
2. Netlify reads `netlify.toml`, so the build settings need no edits. If you are
   configuring by hand: base `web`, build `npm run build`, publish `web/dist`.
3. Under **Site configuration → Environment variables**, add `VITE_SUPABASE_URL`
   and `VITE_SUPABASE_ANON_KEY`. Vite inlines these at build time, so a change
   needs a redeploy to take effect.
4. Deploy.

### Cloudflare Pages

A free alternative with no build-minute metering on the free plan, which is
useful if a Netlify billing cycle pauses production deploys.

1. **Workers & Pages → Create → Pages → Connect to Git**, and pick this repository.
2. Build settings:
   - Framework preset: **None** (or Vite)
   - Root directory: `web`
   - Build command: `npm run build`
   - Build output directory: `dist`
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under the project's
   environment variables, for the Production environment.
4. Deploy. `_redirects` handles the SPA fallback; there is nothing to configure
   for it.

### Afterwards, in Supabase

Whichever host you land on, add the deployed origin under **Authentication →
URL Configuration** (Site URL, and Redirect URLs) so email confirmation links
return to the right place. Add `http://localhost:5173` too, for local
development — the default Site URL is port 3000, which Vite does not use.

## How it maps to the Android app

| Android                                     | Web                                                |
| ------------------------------------------- | -------------------------------------------------- |
| Room `od_accounts` / `od_transactions`      | Postgres tables of the same names                   |
| `OdAccountWithTransactions` computed fields | [`src/lib/domain.ts`](src/lib/domain.ts), unit tested |
| `PdfGenerator.kt` (A4 Canvas)               | [`src/lib/closureLetter.ts`](src/lib/closureLetter.ts) (pdf-lib) |
| `SharedPreferences("pdf_settings")`         | `letter_settings` table, one row per user           |
| Epoch-millis dates                          | `date` columns and `YYYY-MM-DD` strings             |
| Share sheet                                 | Browser download                                    |

The arithmetic is unchanged: withdrawals and interest debits increase what is
outstanding, repayments reduce it, available limit is the approved limit less
outstanding floored at zero, and the portfolio card totals the active book only.

Two deliberate differences:

- **Dates are calendar dates, not instants.** An FD matures on a day, so
  `fd_maturity_date` is a `date` column and "days to maturity" compares
  midnight to midnight. The Android version divided a millisecond difference,
  which drifted with the time of day the screen was opened.
- **The letter paginates.** The Android version drew one page and ran off the
  bottom if enough overdrafts were selected; this one starts a new page.

## Tests

```bash
npm test
```

Covers the ported arithmetic (`domain.test.ts`), the display formatting
including Indian lakh grouping (`format.test.ts`), and the closure letter —
that it produces a real PDF, spills onto a second page for a long list, and
survives blank settings (`closureLetter.test.ts`).
