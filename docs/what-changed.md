# What changed (October 2026)

A short map of the security, payments, database and login work. Each section says what changed, where the code lives, and which guide has the details.

**Jump to:** [Security](#security) · [Payments](#payments-stripe) · [Database](#database) · [Google & Apple login](#google--apple-login) · [Keep me logged in](#keep-me-logged-in) · [Admin](#admin-panel) · [Demo data](#demo-data) · [Commands](#commands) · [Settings in .env](#settings-in-env) · [To do](#still-to-do)

---

## Security

| What was wrong                                                        | What it does now                                                                        |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| A fake IP address (`X-Forwarded-For`) gave unlimited password guesses | Only the IP added by our own proxy counts; fakes are ignored                            |
| No limit per account                                                  | 10 wrong passwords in 15 min locks that email. Unlocks after 15 min or a password reset |
| Signed-in users could guess 2FA codes without limit                   | Blocked once 2FA is active                                                              |
| Dev inbox showed everyone's reset links                               | Off unless `LOCAL_MAILBOX=true`; links print in the API terminal                        |
| Any admin could suspend the owner                                     | Only the owner manages admins; nobody can suspend the owner                             |
| "Continue with Google" skipped 2FA                                    | 2FA code is still required                                                              |
| Password resets weren't logged                                        | Logged; also signs out every device and emails the user                                 |
| Correct password + pending 2FA counted as "login success"             | Logged as `two_factor_required`                                                         |
| Anyone could flood someone's inbox with reset emails                  | Max 5 reset emails per hour per address                                                 |

**Limits at a glance**

| Thing                              | Limit                                        |
| ---------------------------------- | -------------------------------------------- |
| Login tries per IP                 | 3 per 10 seconds                             |
| Wrong passwords per email          | 10 per 15 minutes, then locked               |
| 2FA codes at sign-in               | 5 per attempt; 10 total locks 2FA for 15 min |
| Admin 2FA codes                    | 5 wrong locks admin for 10 min               |
| Admin access after entering a code | 8 hours to view, 10 minutes to make changes  |
| Reset link                         | Single use, expires after 1 hour             |

**Code:** `apps/api/src/security-events.ts`, `auth.ts`, `server.ts` · **Guide:** [security-testing.md](security-testing.md)

---

## Payments (Stripe)

- **New pages:** `/billing/success` (paid, plan, receipt) and `/billing/canceled` (no charge, retry).
- **New table `Payment`:** one row per invoice: paid, failed, refunded, disputed, fraud-flagged.
- **Where to see payments:** Admin → **Payments**, alerts on Admin → Overview, and the customer's own list in Settings → Plan & billing.
- **Safety:** visiting the success page never unlocks anything. Only Stripe's signed webhook does.
- **Not done yet:** Stripe keys aren't in `.env`, so no real payment has been tested.

**Code:** `apps/api/src/billing.ts`, `apps/web/src/pages/BillingOutcome.tsx` · **Guide:** [stripe.md](stripe.md)

---

## Database

- **New:** the `Payment` table; `email` and `method` columns on `LoginEvent`; a plain-English description on every table.
- **Easy-to-read views** (read-only):

  | View                      | Shows                                                                 |
  | ------------------------- | --------------------------------------------------------------------- |
  | `reporting.users`         | People, plan, trips, sign-in methods, last login, failed logins today |
  | `reporting.activity`      | Everything that happened, newest first                                |
  | `reporting.payments`      | Invoices with emails, amounts in euros                                |
  | `reporting.subscriptions` | Who is paying right now                                               |
  | `reporting.trips`         | Trips with counts (no private content)                                |

- **See them in a browser:** `npm run db:browse` opens these views at http://localhost:5556, with emails instead of ids.
- **Migrations added:** `20261027000000_security_payments_reporting`, `20261028000000_social_sign_in`, `20261029000000_reporting_browse`. All are applied to the dev and test databases.

**Guide:** [database.md](database.md)

---

## Google & Apple login

- **Buttons:** Google (left) and Apple (right) under "Log in" and on the sign-up page. They're faded until keys are added.
- **Saved in the database:**
  - the person → `user`
  - their Google/Apple link → `account` (tokens encrypted)
  - how each sign-in happened → `LoginEvent.method`
- **Same email = same account:** Google/Apple is linked to the existing account.
- **Apple** needs a paid developer account ($99/year) and a real HTTPS domain; it doesn't work on localhost.

**Code:** `apps/web/src/pages/Auth.tsx`, `apps/api/src/apple-sign-in.ts` · **Guide:** [social-login.md](social-login.md)

---

## Keep me logged in

| How they sign in             | Stays signed in for                          |
| ---------------------------- | -------------------------------------------- |
| Password, box **ticked**     | 30 days, extended each day they use the site |
| Password, box **not ticked** | Until they close the browser (at most 1 day) |
| Google or Apple              | Always 30 days, no box needed                |

- The box sits under the password field, on the sign-in page only.
- Two-factor still applies: the 30 days start after the code is entered.
- Signing out ends the session at once. A password reset signs out every device.

**Code:** `apps/web/src/pages/Auth.tsx`, `apps/api/src/auth.ts` (`session` settings and the Google/Apple hook)

---

## Admin panel

| Where                                             | What's new                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Payments (new page)                               | Every invoice, totals collected, refunds, disputes                                   |
| Activity log                                      | Shows emails instead of raw IDs, trips by owner, and one short line per change       |
| Sign-in & security (renamed from "Login history") | Searchable by email, shows the sign-in method, lockouts, resets, 2FA changes         |
| Users → Manage                                    | Sign-in methods, payments, **Make administrator / Remove admin access** (owner only) |
| Overview                                          | Alerts for failed payments, disputes, account lockouts                               |

Reservation and receipt imports now appear in the Activity log as `trip.reservation_imported` and `trip.receipt_imported`.

**Guide:** [admin.md](admin.md)

---

## Demo data

`npm run demo:activity` signs up 8 pretend people through the real site, so every log is filled the same way real use would fill it. The dev server (`npm run dev`) must be running.

| Person                | What they do                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| Sofia                 | Lisbon & Porto trip: 3 imported bookings, activities, a restaurant, a checklist, invites Tudor |
| Tudor                 | Joins Sofia's trip and comments; plans Barcelona with an imported tour                         |
| Bianca                | Turns on two-factor, plans Rome, signs in on her phone (one wrong code first)                  |
| Cristian              | Someone guesses his password 10 times from 5 addresses; he is locked, then resets it           |
| Daria                 | Changes her password and settings, archives a trip                                             |
| Victor                | Shares three public links (support later suspends him)                                         |
| Larisa                | Signs up but never verifies her email                                                          |
| Irina (support staff) | Admin: grants credits to Sofia and Bianca, signs Cristian out everywhere, suspends Victor      |

- All addresses end in `@demo.whereto.test`. Passwords are random and never shown, so nobody can sign in as them.
- Verification and reset emails for them print in the API terminal.
- **Remove everything:** `npm run db:seed -- --clean`. Run `npm run demo:activity` again for a fresh set.
- It refuses to run in production, against a non-local server, or when demo people already exist.

**Code:** `scripts/demo-activity.ts`

---

## Commands

| Command                      | What it does                                     |
| ---------------------------- | ------------------------------------------------ |
| `npm run dev`                | Start the site                                   |
| `npm run db:migrate`         | Apply database changes                           |
| `npm run db:browse`          | Readable tables with emails (read-only)          |
| `npm run db:studio`          | Open a browser editor to view and edit the data  |
| `npm run db:seed`            | Add fake demo data                               |
| `npm run db:seed -- --clean` | Remove the demo data                             |
| `npm run demo:activity`      | Create 8 demo people with trips and activity     |
| `npm test`                   | Run all tests (needs `TEST_DATABASE_URL`, below) |

To run the tests locally:

```sh
TEST_DATABASE_URL="postgresql://$(whoami)@localhost:5432/where_to_test?schema=public" npm test
```

---

## Settings in .env

| Variable                                                                | What it's for                                                                    | Default |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------- |
| `RESEND_API_KEY`, `MAIL_FROM`                                           | Real emails: verification and password resets ([email.md](email.md))             | empty   |
| `TRUST_PROXY`                                                           | How many proxies sit in front of the API (1 = nginx or Vite)                     | `1`     |
| `LOCAL_MAILBOX`                                                         | Show emails in the browser (development only; a backdoor, keep off when testing) | off     |
| `STRIPE_*`                                                              | Payments ([stripe.md](stripe.md))                                                | empty   |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                              | Google button                                                                    | empty   |
| `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | Apple button                                                                     | empty   |

---

## Still to do

- [ ] **Urgent:** move the owner password and backup codes out of the `TO DO` file into a password manager, change the password, and make new backup codes
- [ ] Connect Resend so verification emails reach your inbox ([email.md](email.md))
- [ ] Add Stripe test keys and do a test payment ([stripe.md](stripe.md))
- [ ] Add Google keys ([social-login.md](social-login.md))
- [ ] Apple: developer account and a real domain
- [ ] Before charging customers: set up EU VAT in Stripe Tax
- [ ] Fix: deleting a free trip fails (a database rule blocks the one-time replacement)
- [ ] Commit the changes to git
