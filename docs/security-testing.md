# Trying to break in

This guide covers what protects accounts and the admin area, what each attack should run into, and where the evidence shows up. Test against your local app, never against real users.

## Before you start

1. Run the app with `npm run dev`.
2. Leave `LOCAL_MAILBOX` unset or `false`. With it on, `/api/v1/dev-mail` hands every email (including password-reset links) to anyone who asks. It is a convenience for development, so it would let you in through a door that production doesn't have. With it off, verification and reset links are printed in the terminal running the API, which only you can see.
3. Sign up with your own address, open the verification link from the terminal, and sign in once.
4. Keep Admin → **Sign-in & security** open in another browser profile. Search it by email to see every attempt against one address.

## What should happen

| Attack                                                                                                             | What you should see                                                                                                                                                                                                                                                       | Where it is recorded                                                               |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Guess the password** of one account                                                                              | After 3 tries in 10 seconds from one IP: "Too many requests" (429). After 10 wrong passwords in 15 minutes from **any** IPs, that address is locked: even the right password gets "Too many failed sign-in attempts…" until 15 minutes pass or a password reset completes | `login_failed`, then `login_locked`; overview alert "account lockouts in 24 hours" |
| **Fake your IP** to dodge the limit, for example `curl -H "X-Forwarded-For: 1.2.3.4" …` with a new value each time | No effect. The API only trusts the address its own proxy (Vite or nginx) adds. The log shows your real address, not the fake one                                                                                                                                          | `ipAddress` column                                                                 |
| **Find out who has an account**                                                                                    | Sign-up with a taken email answers exactly like a new one; the real owner gets an email instead. Reset requests and lockouts look the same for unknown addresses                                                                                                          | `password_reset_requested` with no user; `login_failed` with "No matching account" |
| **Abuse password reset**: reuse, guess or flood                                                                    | Tokens are random, single-use and expire after 1 hour. A completed reset signs out every device, removes admin verification and emails "Your Whereto password was changed". After 5 reset emails in an hour, more requests get the same answer but no email               | `password_reset_requested`, `password_reset_completed`                             |
| **Guess an authenticator code** at sign-in                                                                         | 5 wrong codes end that sign-in attempt; 10 across attempts lock 2FA for 15 minutes                                                                                                                                                                                        | `two_factor_required`, `two_factor_failed`                                         |
| **Skip 2FA with Google or Apple**: sign in to a 2FA account through "Continue with Google"                         | The authenticator prompt appears anyway; no session exists until the code is right                                                                                                                                                                                        | `two_factor_required` via Google, then `login_success` via Google                  |
| **Guess codes while already signed in** (`POST /api/auth/two-factor/verify-totp` with a session)                   | 403 "Your authenticator is already active." This used to be an unlimited guessing oracle                                                                                                                                                                                  | not logged, nothing happens                                                        |
| **Open admin** as a client, or as an admin without a code                                                          | 403 "This workspace is private" / "Your authenticator, please"                                                                                                                                                                                                            | —                                                                                  |
| **Steal an admin session cookie**                                                                                  | It does not carry admin verification to another session. Proof is tied to one session: 8 hours for reading, 10 minutes for changes. 5 wrong admin codes lock it for 10 minutes                                                                                            | `admin.verify` in Activity log                                                     |
| **Escalate as a second admin**: suspend the owner, promote yourself, grant yourself credits                        | Refused (`OWNER_PROTECTED`, `OWNER_REQUIRED`, `SELF_GRANT`). Only the owner manages administrators                                                                                                                                                                        | failed entries in Activity log                                                     |
| **Make yourself admin** from the browser (`role` in `update-user`)                                                 | Ignored; roles are server-side only                                                                                                                                                                                                                                       | —                                                                                  |
| **Cross-site request** (a form on another site posting to the API)                                                 | 403 "Request origin is not allowed"                                                                                                                                                                                                                                       | —                                                                                  |
| **Read someone else's data**: change a trip ID, a document ID or a `session_id` on `/billing/success`              | 404, the same as a non-existent ID                                                                                                                                                                                                                                        | —                                                                                  |
| **Fake a payment**: open `/billing/success?session_id=anything`, or post to the webhook                            | The page only displays Stripe's answer for your own checkout. Unsigned webhooks get 400. Access comes only from signed webhooks or Stripe's own subscription data                                                                                                         | `StripeEvent`                                                                      |
| **Frame the admin or sign-in page** (clickjacking)                                                                 | Blocked in production by `X-Frame-Options: DENY` and `frame-ancestors 'none'` (nginx)                                                                                                                                                                                     | —                                                                                  |

## Handy commands

Lock yourself out quickly (replace the email):

```sh
for i in $(seq 1 12); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:5173/api/auth/sign-in/email \
    -H "Origin: http://localhost:5173" -H "Content-Type: application/json" \
    -H "X-Forwarded-For: 10.0.0.$i" \
    -d '{"email":"you@example.com","password":"wrong-password"}'
  sleep 11
done
```

This takes about two minutes. You'll see `401` until the 10th failure, then `429`. The changing `X-Forwarded-For` doesn't help. The `sleep` keeps you under the per-IP limit (3 attempts, then quiet for 10 seconds); without it, that limit answers `429` after the third try.

Unlock yourself without waiting: complete a password reset, or remove your failures:

```sql
DELETE FROM "LoginEvent" WHERE email = 'you@example.com' AND event IN ('login_failed', 'login_locked');
```

## Known limits

- Per-IP rate limits live in the API's memory. They reset when the API restarts and are not shared if you run several API instances. Per-account lockouts are stored in PostgreSQL and survive both.
- Anyone can lock an address for 15 minutes by typing wrong passwords. That is the trade-off of account lockout. The real owner can still get in straight away with a password reset.
- The strict Content-Security-Policy covers the admin, sign-in and payment pages. The planner pages load maps and OCR workers and don't have one yet.
- Behind more than one proxy (for example Cloudflare in front of nginx), set `TRUST_PROXY=2`. Otherwise every visitor shares one rate-limit bucket.
