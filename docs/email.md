# Email (verification and password resets)

**Why nothing arrives:** no email service is connected yet. Until one is, the site sends nothing. During development the link is printed in the terminal running `npm run dev`, on a line starting with `[dev mail]`. The sign-up page says so too.

**Jump to:** [Get real emails](#get-real-emails-resend-free-about-5-minutes) · [Email everyone](#email-everyone-not-just-yourself) · [Without Resend](#without-resend) · [Problems](#if-emails-dont-arrive)

---

## Get real emails (Resend, free, about 5 minutes)

1. Sign up at [resend.com](https://resend.com) **with the email address you want to receive test emails at** (your Gmail, for example).
2. **API Keys → Create API key**, with _Sending access_. Copy it (it starts with `re_`).
3. In `.env`, paste it:

   ```sh
   RESEND_API_KEY=re_...
   MAIL_FROM=Whereto <onboarding@resend.dev>   # already set
   ```

4. Stop `npm run dev` (Ctrl+C) and start it again.
5. Sign up on the site with that same address. The email arrives in a few seconds; check spam the first time.

| What                         | Where to look                             |
| ---------------------------- | ----------------------------------------- |
| Every email sent, and status | Resend dashboard → Emails                 |
| Whether email works          | Admin → Integrations → Email              |
| Monthly cap set by the app   | `EMAIL_MONTHLY_MESSAGES` in `.env` (3000) |

---

## Email everyone, not just yourself

With `onboarding@resend.dev`, Resend only delivers to the address you signed up to Resend with. Other people get nothing. To email anyone:

1. Resend → **Domains → Add domain**, and enter a domain you own.
2. Add the DNS records Resend shows at the company where you bought the domain.
3. Wait until Resend shows **Verified**, usually minutes, sometimes a few hours.
4. In `.env`: `MAIL_FROM=Whereto <hello@your-domain.com>`, then restart.

---

## Without Resend

| Option                   | How                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Link in the terminal     | The default. Look for `[dev mail]` in the `npm run dev` output                                                      |
| Link on the sign-up page | `LOCAL_MAILBOX=true` in `.env`, then restart. **Turn it off when security testing**: anyone can read any reset link |

Tests never send real email, even with a key in `.env`.

---

## If emails don't arrive

| Symptom                                         | Fix                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| Still printed in the terminal                   | The key isn't loaded. Check the spelling in `.env`, then restart         |
| "Email delivery is temporarily unavailable"     | Resend refused it: wrong key, or a recipient other than your own address |
| Nothing in the inbox, but "Delivered" in Resend | Check spam                                                               |
| Link says it expired                            | Links last 1 hour. Sign in with your password and a new one is sent      |
