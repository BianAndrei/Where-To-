import Stripe from "stripe";
import type { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import { db, assert } from "./db.js";
import { config } from "./config.js";
import { reserveProvider } from "./providers.js";
import { recordHealth } from "./integrations.js";
import { hasPro } from "./access.js";
import { HttpError } from "./db.js";
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;
// Groups these sessions in the Stripe Dashboard's Checkout analytics.
const CHECKOUT_INTEGRATION = "whereto-subscription-checkout-qvmtrbze";
export async function checkout(
  user: { id: string; email: string },
  plan: "monthly" | "annual",
) {
  assert(
    stripe,
    503,
    "Subscriptions are not connected yet. Your first trip is free.",
    "NOT_CONFIGURED",
  );
  await reserveStripe();
  const price =
    plan === "annual"
      ? process.env.STRIPE_YEARLY_PRICE_ID
      : process.env.STRIPE_MONTHLY_PRICE_ID;
  assert(price, 503, "This subscription is not available yet.");
  const configuredPrice = await stripe.prices.retrieve(price);
  assert(
    configuredPrice.active &&
      configuredPrice.currency === "eur" &&
      configuredPrice.unit_amount === (plan === "annual" ? 4000 : 500) &&
      configuredPrice.recurring?.interval ===
        (plan === "annual" ? "year" : "month") &&
      configuredPrice.recurring.interval_count === 1,
    503,
    "This plan needs its advertised price configured before checkout.",
  );
  const entitlement = await db.entitlement.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });
  assert(
    !entitlement.paidUntil || entitlement.paidUntil <= new Date(),
    409,
    "You already have an active subscription. Manage it in your billing portal.",
  );
  const checkout = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      client_reference_id: user.id,
      ...(entitlement.stripeCustomerId
        ? { customer: entitlement.stripeCustomerId }
        : { customer_email: user.email }),
      line_items: [{ price, quantity: 1 }],
      subscription_data: { metadata: { userId: user.id } },
      metadata: { userId: user.id },
      // Stripe replaces {CHECKOUT_SESSION_ID}; the outcome page only displays
      // state. Access is granted by the webhook, never by visiting this URL.
      success_url: `${config.APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.APP_URL}/billing/canceled?plan=${plan}`,
      integration_identifier: CHECKOUT_INTEGRATION,
      ...(process.env.STRIPE_TAX_ENABLED === "true"
        ? { automatic_tax: { enabled: true } }
        : {}),
    },
    {
      idempotencyKey: `whereto:${user.id}:${plan}:${Math.floor(Date.now() / 900000)}`,
    },
  );
  return { url: checkout.url };
}
export async function portal(userId: string) {
  assert(stripe, 503, "Billing is not configured.");
  await reserveStripe();
  const e = await db.entitlement.findUnique({ where: { userId } });
  assert(e?.stripeCustomerId, 404, "No billing account exists yet.");
  return stripe.billingPortal.sessions.create({
    customer: e.stripeCustomerId,
    return_url: `${config.APP_URL}/app`,
  });
}
const checkoutIdPattern = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;
export async function checkoutOutcome(userId: string, sessionId: string) {
  assert(stripe, 503, "Billing is not configured.", "NOT_CONFIGURED");
  const notFound = () =>
    new HttpError(
      404,
      "We could not find this checkout.",
      "CHECKOUT_NOT_FOUND",
    );
  if (!checkoutIdPattern.test(sessionId)) throw notFound();
  await reserveStripe();
  const session = await stripe.checkout.sessions
    .retrieve(sessionId, { expand: ["invoice", "subscription"] })
    .catch(() => {
      throw notFound();
    });
  // Only the account that started a checkout may read it; anything else looks
  // the same as an unknown ID.
  if (session.client_reference_id !== userId) throw notFound();
  const subscription =
    session.subscription && typeof session.subscription === "object"
      ? session.subscription
      : null;
  // Refreshes access straight away when the customer lands here before the
  // webhook. Both read the subscription from Stripe; neither trusts the URL.
  if (session.status === "complete" && subscription)
    await resyncFromStripe(subscription.id, userId).catch(() => {});
  const entitlement = await db.entitlement.findUnique({ where: { userId } });
  const invoice =
    session.invoice && typeof session.invoice === "object"
      ? session.invoice
      : null;
  const price = subscription?.items.data[0]?.price;
  const status =
    session.status === "expired"
      ? "expired"
      : session.status !== "complete"
        ? "open"
        : session.payment_status === "unpaid"
          ? "processing"
          : hasPro(entitlement)
            ? "active"
            : "confirming";
  return {
    status,
    plan: price?.recurring?.interval ?? null,
    amountTotal: session.amount_total,
    currency: session.currency,
    email: session.customer_details?.email ?? null,
    paidUntil: entitlement?.paidUntil ?? null,
    cancelAtPeriodEnd: entitlement?.cancelAtPeriodEnd ?? false,
    invoiceNumber: invoice?.number ?? null,
    invoiceUrl: invoice?.hosted_invoice_url ?? null,
    invoicePdf: invoice?.invoice_pdf ?? null,
  };
}
export async function paymentHistory(userId: string) {
  return db.payment.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 24,
    select: {
      id: true,
      status: true,
      amountPaid: true,
      amountRefunded: true,
      currency: true,
      periodStart: true,
      periodEnd: true,
      paidAt: true,
      createdAt: true,
      hostedInvoiceUrl: true,
    },
  });
}
async function reserveStripe() {
  await reserveProvider(
    "stripe",
    1,
    new Date().toISOString().slice(0, 7),
    Number(process.env.STRIPE_MONTHLY_OPERATIONS || 10000),
  );
}
async function readSubscription(
  subscriptionId: string,
  expectedUserId?: string,
) {
  assert(stripe, 503, "Stripe is not configured.", "NOT_CONFIGURED");
  await reserveStripe();
  const requestedAt = new Date();
  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["latest_invoice"],
    });
    const existing = await db.entitlement.findUnique({
      where: { stripeSubscriptionId: sub.id },
      select: { userId: true },
    });
    const userId = existing?.userId ?? sub.metadata.userId;
    assert(
      userId && (!expectedUserId || expectedUserId === userId),
      409,
      "Stripe returned an unrelated subscription.",
    );
    assert(
      await db.user.count({ where: { id: userId } }),
      404,
      "Subscription account not found.",
    );
    const invoice =
      typeof sub.latest_invoice === "object" ? sub.latest_invoice : null;
    const item = sub.items.data[0];
    const end =
      (sub as any).current_period_end ??
      Math.max(0, ...sub.items.data.map((i) => i.current_period_end ?? 0));
    const customer =
      typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    await recordHealth("stripe", true);
    return {
      userId,
      stripeCustomerId: customer,
      stripeSubscriptionId: sub.id,
      subscriptionStatus: sub.status,
      subscriptionStart: new Date((sub.start_date ?? sub.created) * 1000),
      paidUntil:
        (invoice?.status === "paid" || sub.status === "trialing") && end
          ? new Date(end * 1000)
          : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      billingInterval: item?.price.recurring?.interval ?? null,
      unitAmount:
        item?.price.unit_amount != null && item.quantity
          ? item.price.unit_amount * item.quantity
          : null,
      currency: item?.price.currency ?? null,
      stripeSyncedAt: requestedAt,
      lastPaymentStatus: invoice?.status ?? null,
    };
  } catch (error) {
    await recordHealth("stripe", false, "STRIPE_SYNC_FAILED");
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      503,
      "Stripe state could not be refreshed. Try again later.",
      "STRIPE_SYNC_FAILED",
    );
  }
}
async function applySubscription(
  tx: import("@prisma/client").Prisma.TransactionClient,
  update: Awaited<ReturnType<typeof readSubscription>>,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${update.userId}))`;
  const previous = await tx.entitlement.findUnique({
    where: { userId: update.userId },
  });
  if (
    previous?.stripeSyncedAt &&
    previous.stripeSyncedAt > update.stripeSyncedAt
  )
    return;
  const { userId, ...fields } = update;
  await tx.entitlement.upsert({
    where: { userId },
    create: { userId, ...fields },
    update: { ...fields, paidUntil: fields.paidUntil ?? previous?.paidUntil },
  });
}
async function resyncFromStripe(subscriptionId: string, userId: string) {
  const snapshot = await readSubscription(subscriptionId, userId);
  await db.$transaction((tx) => applySubscription(tx, snapshot));
}
export async function resyncSubscription(userId: string) {
  const e = await db.entitlement.findUnique({ where: { userId } });
  assert(
    e?.stripeSubscriptionId,
    404,
    "This account has no Stripe subscription.",
  );
  const snapshot = await readSubscription(e.stripeSubscriptionId, userId);
  await db.$transaction((tx) => applySubscription(tx, snapshot));
}
export async function resyncStripeEvent(eventId: string) {
  const event = await db.stripeEvent.findUnique({ where: { id: eventId } });
  assert(
    event?.subscriptionId,
    404,
    "This event has no subscription to synchronize.",
  );
  if (event.status === "processed") return;
  const snapshot = await readSubscription(event.subscriptionId);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${eventId}))`;
    const current = await tx.stripeEvent.findUniqueOrThrow({
      where: { id: eventId },
    });
    if (current.status === "processed") return;
    await applySubscription(tx, snapshot);
    await tx.stripeEvent.update({
      where: { id: eventId },
      data: {
        status: "processed",
        processedAt: new Date(),
        errorCode: null,
        attempts: { increment: 1 },
      },
    });
  });
}
const stripeId = (value: string | { id?: string } | null | undefined) =>
  typeof value === "string" ? value : (value?.id ?? null);
const unix = (seconds: number | null | undefined) =>
  seconds ? new Date(seconds * 1000) : null;
// Invoice state as Stripe reports it now, with the account resolved through
// the customer and subscription IDs this app already stored.
async function readInvoice(invoiceId: string) {
  assert(stripe, 503, "Stripe is not configured.", "NOT_CONFIGURED");
  await reserveStripe();
  const invoice = await stripe.invoices.retrieve(invoiceId, {
    expand: ["payments"],
  });
  if (!invoice.id || invoice.status === "draft" || !invoice.status) return null;
  const customerId = stripeId(invoice.customer);
  const details = invoice.parent?.subscription_details;
  const subscriptionId = stripeId(details?.subscription);
  const owner =
    (customerId &&
      (await db.entitlement.findUnique({
        where: { stripeCustomerId: customerId },
        select: { userId: true },
      }))) ||
    (subscriptionId &&
      (await db.entitlement.findUnique({
        where: { stripeSubscriptionId: subscriptionId },
        select: { userId: true },
      })));
  let userId = owner ? owner.userId : null;
  // Metadata only covers a first invoice that arrives before the subscription sync.
  const tagged = details?.metadata?.userId;
  if (!userId && tagged && (await db.user.count({ where: { id: tagged } })))
    userId = tagged;
  const period = invoice.lines.data[0]?.period;
  return {
    id: invoice.id,
    userId,
    invoiceStatus: invoice.status,
    attempted: invoice.attempted,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    stripePaymentIntentId:
      invoice.payments?.data
        .map((p) => stripeId(p.payment.payment_intent))
        .find(Boolean) ?? null,
    billingReason: invoice.billing_reason ?? null,
    amountDue: invoice.amount_due,
    amountPaid: invoice.amount_paid,
    currency: invoice.currency,
    periodStart: unix(period?.start),
    periodEnd: unix(period?.end),
    paidAt: unix(invoice.status_transitions.paid_at),
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    invoicePdfUrl: invoice.invoice_pdf ?? null,
  };
}
type InvoiceSnapshot = NonNullable<Awaited<ReturnType<typeof readInvoice>>>;
function paymentStatus(
  invoiceStatus: string,
  attempted: boolean,
  amountPaid: number,
  amountRefunded: number,
) {
  if (invoiceStatus === "paid")
    return amountRefunded <= 0
      ? "paid"
      : amountRefunded >= amountPaid
        ? "refunded"
        : "partially_refunded";
  if (invoiceStatus === "open") return attempted ? "failed" : "open";
  return invoiceStatus;
}
async function applyInvoice(
  tx: Prisma.TransactionClient,
  inv: InvoiceSnapshot,
) {
  const previous = await tx.payment.findUnique({ where: { id: inv.id } });
  const { invoiceStatus, attempted, ...fields } = inv;
  const data = {
    ...fields,
    userId: fields.userId ?? previous?.userId ?? null,
    stripePaymentIntentId:
      fields.stripePaymentIntentId ?? previous?.stripePaymentIntentId ?? null,
    status: paymentStatus(
      invoiceStatus,
      attempted,
      fields.amountPaid,
      previous?.amountRefunded ?? 0,
    ),
  };
  await tx.payment.upsert({
    where: { id: inv.id },
    create: data,
    update: data,
  });
}
const chargeEvents = [
  "charge.refunded",
  "charge.dispute.created",
  "radar.early_fraud_warning.created",
];
// Refunds, disputes and fraud warnings point at a PaymentIntent. A refund can
// be the first event seen for an invoice, so its invoice is loaded if missing.
async function readChargeEvent(event: Stripe.Event) {
  const object = event.data.object as {
    payment_intent?: string | { id: string } | null;
    amount_refunded?: number;
  };
  const paymentIntentId = stripeId(object.payment_intent);
  if (!paymentIntentId) return null;
  let invoice: InvoiceSnapshot | null = null;
  if (
    stripe &&
    !(await db.payment.count({
      where: { stripePaymentIntentId: paymentIntentId },
    }))
  ) {
    await reserveStripe();
    const link = await stripe.invoicePayments.list({
      payment: { type: "payment_intent", payment_intent: paymentIntentId },
      limit: 1,
    });
    const invoiceId = stripeId(link.data[0]?.invoice);
    if (invoiceId) invoice = await readInvoice(invoiceId);
  }
  return {
    paymentIntentId,
    invoice,
    amountRefunded:
      event.type === "charge.refunded" ? (object.amount_refunded ?? 0) : 0,
    disputed: event.type === "charge.dispute.created",
    fraudWarning: event.type === "radar.early_fraud_warning.created",
  };
}
async function applyChargeEvent(
  tx: Prisma.TransactionClient,
  change: NonNullable<Awaited<ReturnType<typeof readChargeEvent>>>,
) {
  if (change.invoice) await applyInvoice(tx, change.invoice);
  const payment = await tx.payment.findUnique({
    where: { stripePaymentIntentId: change.paymentIntentId },
  });
  // Charges outside a Whereto invoice (made by hand in Stripe) are not tracked.
  if (!payment) return;
  // Refund totals only grow; an older event never lowers a newer one.
  const amountRefunded = Math.max(
    payment.amountRefunded,
    change.amountRefunded,
  );
  const settled = ["paid", "refunded", "partially_refunded"].includes(
    payment.status,
  );
  await tx.payment.update({
    where: { id: payment.id },
    data: {
      amountRefunded,
      disputed: payment.disputed || change.disputed,
      fraudWarning: payment.fraudWarning || change.fraudWarning,
      status: settled
        ? paymentStatus("paid", true, payment.amountPaid, amountRefunded)
        : payment.status,
    },
  });
}
export async function stripeWebhook(req: Request, res: Response) {
  assert(
    stripe && process.env.STRIPE_WEBHOOK_SECRET,
    503,
    "Stripe is not configured.",
  );
  const signature = req.headers["stripe-signature"];
  assert(typeof signature === "string", 400, "Missing signature");
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    res.status(400).json({ error: "Invalid webhook signature" });
    return;
  }
  const existing = await db.stripeEvent.findUnique({ where: { id: event.id } });
  if (existing?.status === "processed") {
    res.json({ received: true });
    return;
  }
  const object = event.data.object as any;
  let subscriptionId: string | undefined;
  if (event.type.startsWith("customer.subscription."))
    subscriptionId = object.id;
  else if (event.type.startsWith("checkout.session."))
    subscriptionId =
      typeof object.subscription === "string"
        ? object.subscription
        : object.subscription?.id;
  else if (event.type.startsWith("invoice."))
    subscriptionId =
      object.subscription ?? object.parent?.subscription_details?.subscription;
  if (typeof subscriptionId !== "string") subscriptionId = undefined;
  await db.stripeEvent.upsert({
    where: { id: event.id },
    create: {
      id: event.id,
      type: event.type,
      status: "pending",
      processedAt: null,
      subscriptionId,
      attempts: 1,
    },
    update: { attempts: { increment: 1 } },
  });
  try {
    const snapshot = subscriptionId
      ? await readSubscription(subscriptionId)
      : null;
    const invoice =
      event.type.startsWith("invoice.") && typeof object.id === "string"
        ? await readInvoice(object.id)
        : null;
    const charge = chargeEvents.includes(event.type)
      ? await readChargeEvent(event)
      : null;
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${event.id}))`;
      const current = await tx.stripeEvent.findUniqueOrThrow({
        where: { id: event.id },
      });
      if (current.status === "processed") return;
      if (snapshot) await applySubscription(tx, snapshot);
      if (invoice) await applyInvoice(tx, invoice);
      if (charge) await applyChargeEvent(tx, charge);
      await tx.stripeEvent.update({
        where: { id: event.id },
        data: { status: "processed", processedAt: new Date(), errorCode: null },
      });
    });
    res.json({ received: true });
  } catch {
    await db.stripeEvent.updateMany({
      where: { id: event.id, status: { not: "processed" } },
      data: { status: "failed", errorCode: "STRIPE_SYNC_FAILED" },
    });
    res.status(503).json({
      error:
        "Subscription synchronization failed. Stripe may retry this event.",
    });
  }
}
