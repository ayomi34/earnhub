# Email Setup for EarnHub (Supabase Auth)

Supabase's **built-in email service is for testing only** — it sends from a
shared sender, is rate-limited to ~2 emails/hour, and Gmail frequently files
its messages into Spam/Promotions. For a real platform, connect a custom SMTP
provider. This takes ~10 minutes with [Resend](https://resend.com) (free tier:
100 emails/day, 3,000/month).

---

## Step 1 — Create a Resend account & get SMTP credentials

1. Sign up at <https://resend.com> (free, no credit card).
   **Tip: sign up with the same Gmail you test EarnHub with** (e.g. your
   personal Gmail) — without a domain, Resend can only deliver to the email
   address of the Resend account itself.
2. Go to **API Keys → Create API Key** → copy the key (`re_...`).
3. A domain is **not required** for testing — see the box below.

> ### No domain yet? You can still test everything
> Use the sender `onboarding@resend.dev` in Step 2. Resend will deliver emails
> **only to the email address you registered with Resend** — perfect for
> testing your own signup flow. Other people's signups won't receive mail
> until you verify a domain (Step 5).

## Step 2 — Configure Supabase SMTP

1. Supabase Dashboard → **Project Settings → Authentication → SMTP Settings**
2. Toggle **Enable Custom SMTP** ON and fill in:

   | Field | Value |
   |---|---|
   | Sender email | `onboarding@resend.dev` (testing) or `confirm@yourdomain.com` |
   | Sender name | `EarnHub` |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | your Resend API key (`re_...`) |
   | Minimum interval | `60` (seconds between emails per user) |

3. **Save**. Send yourself a test email with the button provided.

## Step 3 — Re-enable email confirmation

1. Dashboard → **Authentication → Sign In / Providers → Email**
2. Turn **ON "Confirm email"** → Save.

New signups now receive a real confirmation email. While testing with
`onboarding@resend.dev`, they arrive only at your Resend account's email.

## Step 4 — Set the redirect URL

Dashboard → **Authentication → URL Configuration**

- **Site URL**: `http://localhost:5173` for development, your production domain
  for launch.
- Add `http://localhost:5173/**` to **Redirect URLs**.

This makes the confirmation / password-reset links return users into the app.

## Step 5 — Add your domain (before launch)

When you're ready for real users:

1. Buy a domain (Namecheap, Cloudflare, or a `.com.ng` from a Nigerian
   registrar — roughly ₦5,000–15,000/year).
2. Resend → **Domains → Add domain** → add the DNS records it shows you
   (SPF, DKIM, DMARC) at your registrar. Wait for verification.
3. Update Supabase SMTP **Sender email** to e.g. `confirm@yourdomain.com`.
4. Now confirmation emails deliver to *any* address, from your own brand.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| No email at all | Check Supabase **Logs → Auth Logs** for send errors; verify SMTP credentials. |
| Email in Spam/Promotions | Normal for new domains — ask users to mark it "Not spam"; add SPF/DKIM/DMARC records from your Resend dashboard. |
| "Email rate limit exceeded" | You're on the built-in service (2/hour) — custom SMTP removes this. |
| Confirmation link opens a dead page | Site URL in URL Configuration doesn't match the running app (use `http://localhost:5173` in dev). |
| Old account stuck "unconfirmed" | Dashboard → **Authentication → Users** → ⋯ menu → **Confirm user**. |

## Current dev setup

While "Confirm email" is **OFF**, signups are auto-confirmed and skip the inbox
page entirely — fine for local testing, but **re-enable it before launch** so
real users verify their addresses.