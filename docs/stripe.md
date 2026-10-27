# Stripe payments

Whereto sells one plan, **Whereto Plus**, billed €5 a month or €40 a year. Customers pay on Stripe's hosted Checkout page; Whereto never sees card numbers. Stripe tells the API what happened through signed webhooks, and the API mirrors that into PostgreSQL.

## How a payment flows

```
Pricing page ──POST /api/v1/billing/checkout──▶ API creates a Checkout Session
     │                                              (price checked: EUR 5.00/month or 40.00/year)
     ▼
Stripe Checkout (hosted by Stripe) ── customer pays
     │                                   │
     │ redirect                          │ webhook (signed)
     ▼                                   ▼
/billing/success?session_id=cs_…    POST /api/v1/billing/webhook
  shows the outcome; polls               ├─ Entitlement  (subscription status, paid-until date)
  GET /api/v1/billing/checkout/:id       ├─ Payment      (one row per invoice: paid, failed, refunded, disputed)
                                         └─ StripeEvent  (every event, for deduplication and retry)
Customer cancels on Stripe ──▶ /billing/canceled?plan=monthly ("No charge was made")
```

Access is granted by the webhook, never by visiting the success page. The success page only displays what Stripe reports. If the customer lands there before the webhook arrives, the page asks Stripe for the subscription itself and runs the same sync the webhook would. That means access shows up straight away, and nothing in the URL can be faked to unlock it. The page only answers for the signed-in account that started the checkout. Any other session ID looks like "not found".

| Outcome page state | When                                                       | What the customer sees                                     |
| ------------------ | ---------------------------------------------------------- | ---------------------------------------------------------- |
| `active`           | Paid and the plan is active                                | "You're all set", plan, amount, renewal date, receipt link |
| `confirming`       | Paid, waiting for the sync (normally a few seconds)        | Checks every 2 s for about 30 s                            |
| `processing`       | Paid with a delayed method (for example SEPA Direct Debit) | "Your payment is on its way"                               |
| `open` / `expired` | Checkout never finished                                    | "No payment was taken" and a link back to plans            |
| canceled page      | Customer clicked back on Stripe                            | "No charge was made" and a retry button                    |

Customers manage cards, invoices and cancellation in the **Stripe Customer Portal** (Settings → Plan & billing → Manage payments & invoices). Recent payments with receipt links are listed on that page too.

## Code map

| File                                    | What it does                                                                                                          |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/billing.ts`               | Checkout, portal, outcome lookup, payment history, webhook handling, subscription and invoice sync                    |
| `apps/api/src/api.ts`                   | Routes: `POST /billing/checkout`, `POST /billing/portal`, `GET /billing/checkout/:sessionId`, `GET /billing/payments` |
| `apps/api/src/server.ts`                | Mounts `POST /api/v1/billing/webhook` with the raw body that signature checks need                                    |
| `apps/web/src/pages/Pricing.tsx`        | Plan buttons                                                                                                          |
| `apps/web/src/pages/BillingOutcome.tsx` | `/billing/success` and `/billing/canceled`                                                                            |
| `apps/web/src/pages/Admin.tsx`          | Admin → Subscriptions and Admin → Payments                                                                            |

## Set up a test environment

1. **Create a Stripe sandbox.** In the Dashboard, use the account picker → _Sandboxes_ → _Create_. A sandbox keeps test data apart from your live account. Without an account, install the Stripe CLI (`npm i -g @stripe/cli`) and run `stripe sandbox create`, which creates one and prints test keys.
2. **Create the product.** One Product named _Whereto Plus_ with two Prices: €5.00 recurring monthly and €40.00 recurring yearly, both in EUR. The API refuses to open Checkout if a configured price differs from what the pricing page advertises.
3. **Create a restricted API key** (`rk_test_…`) instead of using the secret key. Give it only what the code calls:
   - Checkout Sessions: **Write**
   - Customer portal: **Write**
   - Prices, Subscriptions, Invoices: **Read**

   If a request fails with a permissions error, the error names the missing permission. Add only that one. `stripe logs tail` shows each call live.

4. **Configure the Customer Portal** (Settings → Billing → Customer portal): allow cancelling subscriptions, updating payment methods and viewing invoices.
5. **Fill in `.env`:**

   ```sh
   STRIPE_SECRET_KEY=rk_test_...          # the restricted key
   STRIPE_MONTHLY_PRICE_ID=price_...
   STRIPE_YEARLY_PRICE_ID=price_...
   STRIPE_WEBHOOK_SECRET=whsec_...        # from step 6
   STRIPE_TAX_ENABLED=false               # see "Tax" below
   ```

6. **Forward webhooks to your machine** with the Stripe CLI:

   ```sh
   stripe login
   stripe listen --forward-to localhost:3001/api/v1/billing/webhook
   ```

   It prints a `whsec_…` signing secret. Put it in `STRIPE_WEBHOOK_SECRET` and restart `npm run dev`. The CLI's secret is different from a Dashboard endpoint's secret; mixing them up gives "Invalid webhook signature".

7. **Pay.** Open `/pricing`, choose a plan and use a [test card](https://docs.stripe.com/testing):

   | Card                  | Result                                    |
   | --------------------- | ----------------------------------------- |
   | `4242 4242 4242 4242` | Succeeds                                  |
   | `4000 0025 0000 3155` | Asks for 3-D Secure, then succeeds        |
   | `4000 0000 0000 9995` | Declined at checkout (insufficient funds) |

   Any future expiry date, any CVC and any postcode work.

   To try the other events, refund or dispute the payment in the Dashboard. You can also run `stripe trigger invoice.payment_failed` or `stripe trigger charge.dispute.created`. To test a renewal that fails, attach the subscription to a [test clock](https://docs.stripe.com/billing/testing/test-clocks) and move time forward. Results appear in Admin → Payments, with alerts on Admin → Overview.

## Webhook events

Subscribe the endpoint to exactly these events (Dashboard → Developers → Webhooks → Add endpoint, URL `https://YOUR-DOMAIN/api/v1/billing/webhook`):

| Event                                                   | What Whereto does                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| `checkout.session.completed`                            | Links the customer and subscription to the account and syncs access |
| `checkout.session.async_payment_succeeded` / `…_failed` | Syncs access for delayed payment methods                            |
| `customer.subscription.created` / `updated` / `deleted` | Syncs status, paid-until date and scheduled cancellation            |
| `invoice.paid`                                          | Records the payment and extends access                              |
| `invoice.payment_failed`                                | Records the failed attempt. Stripe retries and emails the customer  |
| `charge.refunded`                                       | Records the refunded amount                                         |
| `charge.dispute.created`                                | Flags the payment as disputed and raises a critical admin alert     |
| `radar.early_fraud_warning.created`                     | Flags the payment and raises a critical admin alert                 |

Every event is checked against `STRIPE_WEBHOOK_SECRET` before anything is read, then stored in `StripeEvent` so a repeat delivery is ignored. Whereto re-reads the subscription and invoice from Stripe rather than trusting the event body, so events arriving out of order still give the right result. If a sync fails, the API answers 503 and Stripe retries for up to three days. An admin can also press **Retry synchronization** in Admin → Subscriptions.

## Tax

`STRIPE_TAX_ENABLED=true` turns on `automatic_tax` in Checkout. Stripe only charges tax for countries where you have an **active tax registration** in Stripe Tax. Without one it silently collects nothing. Selling to consumers from Romania means EU VAT. Add your registrations (Dashboard → Tax → Registrations), assign the product a tax code, and only then enable the flag. See [Collect taxes for recurring payments](https://docs.stripe.com/billing/taxes/collect-taxes).

## Going live

- [ ] Repeat the setup in live mode: product, prices, a live restricted key, a live webhook endpoint and its secret.
- [ ] Keep live keys in your host's secrets manager, never in a committed file. Use separate keys per environment.
- [ ] Turn on the Customer Portal in live mode.
- [ ] Tax registrations done and `STRIPE_TAX_ENABLED` decided.
- [ ] One real purchase and refund with your own card.
- [ ] Work through Stripe's [go-live checklist](https://docs.stripe.com/get-started/checklist/go-live).

If a key ever leaks: roll it immediately in the Dashboard (Developers → API keys), then check its request logs.

## Troubleshooting

| Message                                                           | Cause                                                                                                       |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| "Subscriptions are not connected yet"                             | `STRIPE_SECRET_KEY` is empty                                                                                |
| "This plan needs its advertised price configured before checkout" | A price ID is wrong, inactive, or not exactly EUR 5.00/month or 40.00/year                                  |
| Webhook returns 400 "Invalid webhook signature"                   | `STRIPE_WEBHOOK_SECRET` belongs to a different endpoint or to the CLI                                       |
| Webhook returns 503                                               | Stripe could not be reached during the sync. Stripe retries automatically                                   |
| Success page stays on "Unlocking your plan…"                      | The webhook is not reaching the API. Check `stripe listen` is running, or the endpoint URL in the Dashboard |
