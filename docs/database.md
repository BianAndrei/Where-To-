# Database

Whereto stores everything in one PostgreSQL database (version 18). Locally it runs through Homebrew (`brew services list` shows `postgresql@18`). With Docker it is the `postgres` service in `compose.yaml`. The connection string is `DATABASE_URL` in `.env`.

The database has three schemas:

| Schema      | What is in it                                                     | Touch it?                  |
| ----------- | ----------------------------------------------------------------- | -------------------------- |
| `public`    | The app's tables, managed by Prisma migrations                    | Yes, carefully (see below) |
| `reporting` | Read-only views that join IDs to emails and turn cents into money | Read freely                |
| `pgboss`    | The background job queue's own bookkeeping                        | No                         |

## The tables, in plain words

Every table also carries this description in PostgreSQL, so GUI tools show it next to the table name.

**People and sign-in**

| Table          | Holds                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| `user`         | Everyone with an account. `role` is `client` or `admin`; the owner is the ID in `ADMIN_OWNER_USER_ID`          |
| `account`      | How someone signs in: `credential` (a hashed password), `google` or `apple`. Google/Apple tokens are encrypted |
| `session`      | Signed-in devices. Deleting a row signs that device out                                                        |
| `verification` | Short-lived tokens for email checks, password resets and 2FA prompts                                           |
| `twoFactor`    | Encrypted authenticator secrets and backup codes                                                               |
| `AdminProof`   | When a session last entered an authenticator code for admin                                                    |

**Money**

| Table                      | Holds                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `Entitlement`              | One row per user: free-trip claim, subscription status, paid-until date             |
| `Payment`                  | One row per Stripe invoice: amount, status, refunds, disputes. Amounts are in cents |
| `StripeEvent`              | Every Stripe webhook received                                                       |
| `CreditGrant`, `CreditUse` | Bonus credits an admin gave, and what used them                                     |

**Trips**

| Table                                  | Holds                                                               |
| -------------------------------------- | ------------------------------------------------------------------- |
| `Trip`                                 | One trip. `state` is the whole itinerary as JSON                    |
| `TripMember`                           | People invited to a trip (`editor` or `viewer`)                     |
| `TripHistory`                          | Version history                                                     |
| `ShareLink`                            | Share and invite links. Only a hash of the token is stored          |
| `Document`                             | Files attached to trips. The bytes are in storage, not the database |
| `Menu`                                 | Imported restaurant menus                                           |
| `Job`, `JobAttempt`, `WorkerHeartbeat` | Background menu imports and PDF exports                             |

**Logs ("everything that happens")**

| Table        | Holds                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `LoginEvent` | Security events: sign-ins (with `method`: password, google, apple, email_link), wrong passwords, lockouts, 2FA, password resets, sign-outs |
| `AuditLog`   | What users changed: account, trips, shares, documents                                                                                      |
| `AdminAudit` | What admins did, and the reason they typed. Append-only                                                                                    |
| `Milestone`  | First-time events per user, for the signup funnel                                                                                          |

**Operations**: `IntegrationControl` and `ProviderUsage` (service switches and usage counters), `DevMail` (the local development inbox).

## Seeing the data

**In the app.** Admin (`/admin`) shows users, trips, subscriptions, payments, jobs, the activity log and sign-in & security events, with search and filters.

**Easiest: the readable tables, with emails instead of ids:**

```sh
npm run db:browse
```

This opens http://localhost:5556 with five tables: `users`, `activity`, `trips`, `payments` and `subscriptions`. Every row names people by email. Click a column name to sort (for example `at` in `activity`, newest first). Times are in UTC. These are read-only views, so nothing you do here changes the data.

**The raw tables, where you can also edit rows:**

```sh
npm run db:studio
```

This opens Prisma Studio at http://localhost:5555. You can browse every table, follow relations, and add, edit or delete rows. Other tables point to a person by their id (for example `ownerId` on `Trip`), never by email: the id stays the same when someone changes their email. A trip's contents (destinations, bookings, costs) are one JSON document in `Trip.state`.

**With the ready-made views** (in `psql`, TablePlus, Postico, pgAdmin or DBeaver):

```sh
psql "$(grep ^DATABASE_URL= .env | cut -d= -f2-)"
```

```sql
SELECT * FROM reporting.users ORDER BY created_at DESC;            -- people, plan, trips, sign-in methods, last login, failed logins today
SELECT * FROM reporting.activity ORDER BY at DESC LIMIT 100;        -- everything that happened, newest first
SELECT * FROM reporting.payments ORDER BY created_at DESC;          -- invoices with emails and amounts in euros
SELECT * FROM reporting.subscriptions WHERE has_access;             -- who is paying right now
SELECT * FROM reporting.trips ORDER BY created_at DESC;             -- trips with counts (no private content)

-- Everything one person did or had done to them:
SELECT * FROM reporting.activity
WHERE actor_email = 'someone@example.com' OR target = 'someone@example.com'
ORDER BY at DESC;
```

To connect a GUI app, use the host, port, user, password and database name from `DATABASE_URL`.

**With demo data,** so every page has something in it:

```sh
npm run db:seed              # 7 fake accounts (@demo.whereto.test) with trips, payments and security events
npm run db:seed -- --clean   # removes all of it again
```

Demo accounts have no password, so nobody can sign in as them. The script refuses to run when `NODE_ENV=production`.

## Editing data by hand: what the database will stop

The database enforces a few rules itself, so a wrong edit fails instead of corrupting data:

- `user.role` must be `admin` or `client`. Promote staff from Admin → Users → Manage → _Make administrator_ (owner only), which also records it in the audit log.
- A trip's owner, its destinations and its currency can't change after creation, and its dates are fixed once the trip has started (trigger `Trip_guard`).
- A user's lifetime free-trip claim can't be reset (trigger `Entitlement_guard`), and each user has at most one free trip.
- Credit balances can't go negative. `Payment.status` and `LoginEvent.event` only accept known values.

Things the database allows but you shouldn't do by hand:

- Editing `Entitlement` subscription fields or `Payment` rows. Stripe is the source of truth and the next webhook overwrites them. Use Admin → Subscriptions → _Resync_ instead.
- Editing `AdminAudit`. It is the record of admin actions.
- Editing `account.password` or `twoFactor`. They are hashes and encrypted secrets; use the password-reset flow.

Take a backup before experimenting:

```sh
pg_dump "$(grep ^DATABASE_URL= .env | cut -d= -f2-)" > backup-$(date +%F).sql
```

## Changing the schema

1. Edit `apps/api/prisma/schema.prisma`.
2. Add a folder under `apps/api/prisma/migrations/` named `YYYYMMDDHHMMSS_what_changed` with a `migration.sql`. The existing migrations are hand-written SQL; follow them.
3. Apply it with `npm run db:migrate`, then `npm run db:generate`.
4. Apply it to the test database too (`DATABASE_URL=$TEST_DATABASE_URL npm run db:migrate`) and run `npm test`.

`prisma migrate dev` can draft the SQL for you, but it needs a role allowed to create databases (for its shadow database). The local `whereto` role is not, so either use your superuser connection for that command or write the SQL by hand.
