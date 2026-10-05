import Stripe from "stripe";
import type { Request, Response } from "express";
import { db, assert } from "./db.js";
import { config } from "./config.js";
import { reserveProvider } from "./providers.js";
import { recordHealth } from "./integrations.js";
import { HttpError } from "./db.js";
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;
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
      success_url: `${config.APP_URL}/app?checkout=success`,
      cancel_url: `${config.APP_URL}/pricing`,
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
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${event.id}))`;
      const current = await tx.stripeEvent.findUniqueOrThrow({
        where: { id: event.id },
      });
      if (current.status === "processed") return;
      if (snapshot) await applySubscription(tx, snapshot);
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
