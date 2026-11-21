# EarnHub

EarnHub is a React 19 + Vite single-page app backed by Supabase Auth, Postgres, and Edge Functions. Paystack handles membership payments; browser code only requests financial actions and never writes wallet ledger entries directly.

## Requirements

- Node.js 20.19+ or 22.12+ (Vite 7 requirement) and npm
- A Supabase project with Auth and Edge Functions enabled
- A Paystack account for live membership checkout (optional for local UI work)

## Local setup

```sh
npm ci
cp .env.example .env.local
# Set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and (optional) VITE_PAYSTACK_PUBLIC_KEY
npm run dev
```

For a frontend-only preview, the app renders with placeholder Supabase settings, but authentication, payments, and server features will not work until Supabase is configured.

## Database setup and upgrades

For a new Supabase project, run `supabase/schema.sql` in the SQL Editor, then run `supabase/migration.sql`. Both include the financial hardening SQL and are safe to re-run where documented. The standalone `supabase/financial-hardening.sql` is the compact upgrade for a project that already applied the earlier schema and migration; apply it after the previous migration. It creates the Zentra tables, fills request-id keys for any existing rows, enables read-only RLS policies, and installs the atomic financial RPCs.

After applying the SQL, review the admin role setup and seed data in `supabase/seed.sql`. Do not expose the Supabase service-role key in frontend environment variables or source control.

## Edge Functions and secrets

Deploy these functions after the SQL is applied:

```sh
supabase functions deploy admin-action
supabase functions deploy daily-spin
supabase functions deploy feud-game
supabase functions deploy gold-mine
supabase functions deploy paystack-verify
```

Set `PAYSTACK_SECRET_KEY` as an Edge Function secret. Supabase injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. The browser receives only the public anon key and Paystack public key. Daily-spin, Zentra, and Paystack verification use service-role-only RPCs to commit balances and rewards atomically. Zentra conversion requests reserve ZNTR and are credited only after an admin approves them through the admin-verified Edge Function. Do not create client write policies for financial tables.

For production, turn **Confirm email** on in Supabase Auth and configure SMTP. The app and daily-spin server require a confirmed email. See [`docs/email-setup.md`](docs/email-setup.md) and add the deployed app URL to Supabase Auth's Site URL and Redirect URLs.

## Validation

```sh
npm run typecheck
npm test
npm run build
```

`npm test` runs dependency-free regression checks for the security-critical client/SQL wiring. These static checks are not a substitute for exercising the migrations and concurrency behavior against a disposable Supabase/Postgres project. Before launch, test concurrent spin requests, concurrent Zentra conversions/joins, payment verification retries, and RLS with ordinary authenticated users and admins.

## Project layout

- `src/` — React UI, client cache, and Supabase service layer
- `supabase/schema.sql` — fresh-install database schema and policies
- `supabase/migration.sql` — application migrations, including financial hardening
- `supabase/financial-hardening.sql` — standalone hardening upgrade for existing databases
- `supabase/functions/` — authenticated server-side business operations
- `docs/email-setup.md` — SMTP / email confirmation setup
