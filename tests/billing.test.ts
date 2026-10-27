import { it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
it("verifies signatures, deduplicates Stripe events and preserves the lifetime trip claim", async () => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fixture_not_live");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_fixture_local_only");
  const { stripe, stripeWebhook, resyncSubscription, resyncStripeEvent } =
    await import("../apps/api/src/billing");
  const { db } = await import("../apps/api/src/db");
  const userId = "billing-test-" + randomUUID(),
    eventId = "evt_" + randomUUID(),
    cancelId = "evt_" + randomUUID(),
    failedId = "evt_" + randomUUID();
  await db.user.create({
    data: {
      id: userId,
      name: "Billing fixture",
      email: userId + "@example.test",
    },
  });
  const claimed = new Date("2026-01-01T00:00:00Z");
  await db.entitlement.create({ data: { userId, freeTripClaimedAt: claimed } });
  const retrieve = vi
    .spyOn(stripe!.subscriptions, "retrieve")
    .mockResolvedValue({
      id: "sub_" + userId,
      metadata: { userId },
      customer: "cus_" + userId,
      status: "active",
      created: 1780000000,
      start_date: 1780000000,
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      items: { data: [] },
      latest_invoice: { status: "paid" },
      cancel_at_period_end: true,
    } as any);
  const response = () => ({
    code: 200,
    status(n: number) {
      this.code = n;
      return this;
    },
    json(value: any) {
      return value;
    },
  });
  async function deliver(id: string, signatureValid = true) {
    const body = JSON.stringify({
      id,
      type: "customer.subscription.updated",
      data: { object: { id: "sub_" + userId } },
    });
    const signature = signatureValid
      ? stripe!.webhooks.generateTestHeaderString({
          payload: body,
          secret: process.env.STRIPE_WEBHOOK_SECRET!,
        })
      : "invalid";
    const res = response();
    await stripeWebhook(
      {
        body: Buffer.from(body),
        headers: { "stripe-signature": signature },
      } as any,
      res as any,
    );
    return res.code;
  }
  try {
    expect(await deliver(eventId, false)).toBe(400);
    expect(retrieve).not.toHaveBeenCalled();
    expect(await deliver(eventId)).toBe(200);
    expect(await deliver(eventId)).toBe(200);
    expect(retrieve).toHaveBeenCalledTimes(1);
    const e = await db.entitlement.findUniqueOrThrow({ where: { userId } });
    expect(e.subscriptionStatus).toBe("active");
    expect(e.cancelAtPeriodEnd).toBe(true);
    expect(e.freeTripClaimedAt).toEqual(claimed);
    expect(await db.stripeEvent.count({ where: { id: eventId } })).toBe(1);
    retrieve.mockResolvedValue({
      ...retrieve.mock.results[0]!.value,
      id: "sub_" + userId,
      metadata: { userId },
      customer: "cus_" + userId,
      status: "canceled",
      start_date: 1780000000,
      items: { data: [] },
      latest_invoice: { status: "paid" },
      current_period_end: Math.floor(Date.now() / 1000) - 1,
      cancel_at_period_end: false,
    } as any);
    expect(await deliver(cancelId)).toBe(200);
    expect(
      (await db.entitlement.findUniqueOrThrow({ where: { userId } }))
        .subscriptionStatus,
    ).toBe("canceled");
    await Promise.all([resyncSubscription(userId), resyncSubscription(userId)]);
    expect(
      (await db.entitlement.findUniqueOrThrow({ where: { userId } }))
        .freeTripClaimedAt,
    ).toEqual(claimed);
    retrieve.mockRejectedValueOnce(
      new Error("PRIVATE_STRIPE_RESPONSE_NOT_FOR_ADMIN"),
    );
    expect(await deliver(failedId)).toBe(503);
    const failed = await db.stripeEvent.findUniqueOrThrow({
      where: { id: failedId },
    });
    expect(failed.status).toBe("failed");
    expect(JSON.stringify(failed)).not.toContain("PRIVATE_STRIPE_RESPONSE");
    await Promise.all([
      resyncStripeEvent(failedId),
      resyncStripeEvent(failedId),
    ]);
    expect(
      (await db.stripeEvent.findUniqueOrThrow({ where: { id: failedId } }))
        .status,
    ).toBe("processed");
    expect(await db.entitlement.count({ where: { userId } })).toBe(1);
  } finally {
    retrieve.mockRestore();
    await db.stripeEvent.deleteMany({
      where: { id: { in: [eventId, cancelId, failedId] } },
    });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
    vi.unstubAllEnvs();
  }
});
it("records invoices, refunds and disputes from webhooks and shows a checkout only to the account that paid", async () => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fixture_not_live");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_fixture_local_only");
  const { stripe, stripeWebhook, checkoutOutcome, paymentHistory } =
    await import("../apps/api/src/billing");
  const { db } = await import("../apps/api/src/db");
  const userId = "billing-test-" + randomUUID();
  const strangerId = "billing-test-" + randomUUID();
  const paid = "in_" + randomUUID(),
    failed = "in_" + randomUUID(),
    intent = "pi_" + randomUUID();
  const eventIds: string[] = [];
  for (const id of [userId, strangerId])
    await db.user.create({
      data: { id, name: "Billing fixture", email: id + "@example.test" },
    });
  await db.entitlement.create({
    data: {
      userId,
      stripeCustomerId: "cus_" + userId,
      stripeSubscriptionId: "sub_" + userId,
    },
  });
  const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86400;
  const subscription = {
    id: "sub_" + userId,
    metadata: { userId },
    customer: "cus_" + userId,
    status: "active",
    created: 1780000000,
    start_date: 1780000000,
    current_period_end: periodEnd,
    items: {
      data: [
        {
          quantity: 1,
          current_period_end: periodEnd,
          price: {
            unit_amount: 500,
            currency: "eur",
            recurring: { interval: "month" },
          },
        },
      ],
    },
    latest_invoice: { status: "paid" },
    cancel_at_period_end: false,
  };
  const invoice = (id: string, status: string) => ({
    id,
    status,
    attempted: true,
    customer: "cus_" + userId,
    parent: {
      subscription_details: {
        subscription: "sub_" + userId,
        metadata: { userId },
      },
    },
    payments: {
      data:
        status === "paid"
          ? [{ payment: { type: "payment_intent", payment_intent: intent } }]
          : [],
    },
    lines: {
      data: [{ period: { start: periodEnd - 30 * 86400, end: periodEnd } }],
    },
    billing_reason: "subscription_create",
    amount_due: 500,
    amount_paid: status === "paid" ? 500 : 0,
    currency: "eur",
    status_transitions: { paid_at: status === "paid" ? 1780000100 : null },
    hosted_invoice_url: "https://invoice.stripe.com/i/fixture",
    invoice_pdf: null,
  });
  const spies = [
    vi
      .spyOn(stripe!.subscriptions, "retrieve")
      .mockResolvedValue(subscription as any),
    vi
      .spyOn(stripe!.invoices, "retrieve")
      .mockImplementation(
        async (id: string) => invoice(id, id === paid ? "paid" : "open") as any,
      ),
    vi.spyOn(stripe!.checkout.sessions, "retrieve").mockResolvedValue({
      id: "cs_test_fixturefixturefixture",
      client_reference_id: userId,
      status: "complete",
      payment_status: "paid",
      subscription,
      invoice: {
        number: "WT-0001",
        hosted_invoice_url: "https://invoice.stripe.com/i/fixture",
        invoice_pdf: null,
      },
      amount_total: 500,
      currency: "eur",
      customer_details: { email: userId + "@example.test" },
    } as any),
  ];
  async function deliver(type: string, object: Record<string, unknown>) {
    const id = "evt_" + randomUUID();
    eventIds.push(id);
    const body = JSON.stringify({ id, type, data: { object } });
    let code = 200;
    await stripeWebhook(
      {
        body: Buffer.from(body),
        headers: {
          "stripe-signature": stripe!.webhooks.generateTestHeaderString({
            payload: body,
            secret: process.env.STRIPE_WEBHOOK_SECRET!,
          }),
        },
      } as any,
      {
        status(n: number) {
          code = n;
          return this;
        },
        json: (v: any) => v,
      } as any,
    );
    return code;
  }
  try {
    expect(
      await deliver("invoice.paid", {
        id: paid,
        parent: { subscription_details: { subscription: "sub_" + userId } },
      }),
    ).toBe(200);
    expect(
      await db.payment.findUniqueOrThrow({ where: { id: paid } }),
    ).toMatchObject({
      userId,
      status: "paid",
      amountPaid: 500,
      stripePaymentIntentId: intent,
    });
    expect(
      await deliver("charge.refunded", {
        payment_intent: intent,
        amount_refunded: 200,
      }),
    ).toBe(200);
    // An older, smaller refund event arriving late never lowers the total.
    expect(
      await deliver("charge.refunded", {
        payment_intent: intent,
        amount_refunded: 100,
      }),
    ).toBe(200);
    expect(
      await deliver("charge.dispute.created", { payment_intent: intent }),
    ).toBe(200);
    expect(
      await db.payment.findUniqueOrThrow({ where: { id: paid } }),
    ).toMatchObject({
      status: "partially_refunded",
      amountRefunded: 200,
      disputed: true,
    });
    expect(await deliver("invoice.payment_failed", { id: failed })).toBe(200);
    expect(
      (await db.payment.findUniqueOrThrow({ where: { id: failed } })).status,
    ).toBe("failed");
    expect((await paymentHistory(userId)).map((p) => p.id).sort()).toEqual(
      [failed, paid].sort(),
    );
    expect(await paymentHistory(strangerId)).toEqual([]);

    const sessionId = "cs_test_fixturefixturefixture";
    await expect(checkoutOutcome(strangerId, sessionId)).rejects.toMatchObject({
      status: 404,
      code: "CHECKOUT_NOT_FOUND",
    });
    const calls = spies[2]!.mock.calls.length;
    await expect(
      checkoutOutcome(userId, "../../v1/customers"),
    ).rejects.toMatchObject({ status: 404 });
    expect(spies[2]!.mock.calls.length).toBe(calls);
    expect(await checkoutOutcome(userId, sessionId)).toMatchObject({
      status: "active",
      plan: "month",
      amountTotal: 500,
      invoiceNumber: "WT-0001",
    });
  } finally {
    for (const spy of spies) spy.mockRestore();
    await db.payment.deleteMany({ where: { id: { in: [paid, failed] } } });
    await db.stripeEvent.deleteMany({ where: { id: { in: eventIds } } });
    await db.user.deleteMany({ where: { id: { in: [userId, strangerId] } } });
    await db.$disconnect();
    vi.unstubAllEnvs();
  }
});
