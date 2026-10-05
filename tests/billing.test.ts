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
