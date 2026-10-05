import { it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { makeDemo } from "../apps/web/src/lib/demo";
const mocks = vi.hoisted(() => ({ create: vi.fn(), send: vi.fn() }));
vi.mock("groq-sdk", () => ({
  default: class {
    chat = { completions: { create: mocks.create } };
  },
}));
vi.mock("../apps/api/src/safe-fetch", () => ({
  obeyRobots: vi.fn(),
  fetchPublic: vi.fn(async () => ({
    url: "https://fixture.example/menu",
    type: "text/html",
    body: Buffer.from(
      "<main>Menu: Soupe 114 EUR. Salade — ask your server.</main>",
    ),
  })),
}));
vi.mock("../apps/api/src/providers", () => ({
  reserveProvider: vi.fn(),
  dayPeriod: () => new Date().toISOString().slice(0, 10),
}));
vi.mock("../apps/api/src/queue", () => ({
  getQueue: async () => ({ send: mocks.send }),
}));
it("validates menu evidence, reuses imports, leaves missing prices unknown and retries Groq without charging failures", async () => {
  vi.stubEnv("GROQ_API_KEY", "fixture-key-not-live");
  const { db } = await import("../apps/api/src/db");
  const { processMenuJob } = await import("../apps/api/src/menu-worker");
  const ownerId = "menu-test-" + randomUUID();
  await db.user.create({
    data: {
      id: ownerId,
      name: "Menu fixture",
      email: ownerId + "@example.test",
      emailVerified: true,
    },
  });
  const state = makeDemo().state;
  const trip = await db.trip.create({
    data: { ownerId, isFree: true, state: state as any },
  });
  const sourceHash = randomUUID();
  const job = () =>
    db.job.create({
      data: {
        tripId: trip.id,
        type: "menu",
        input: {
          ownerId,
          itemId: "meal",
          source: "https://fixture.example/menu",
          sourceHash,
        },
      },
    });
  try {
    mocks.create.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              language: "French",
              warnings: [],
              dishes: [
                {
                  id: "1",
                  original: "Soupe",
                  english: "Soup",
                  description: "",
                  section: "",
                  variant: "",
                  price: "14",
                  currency: "EUR",
                  evidence: "Soupe 114 EUR",
                  needsReview: false,
                },
                {
                  id: "2",
                  original: "Salade",
                  english: "Salad",
                  description: "",
                  section: "",
                  variant: "",
                  price: null,
                  currency: null,
                  evidence: "Salade — ask your server.",
                  needsReview: true,
                },
              ],
            }),
          },
        },
      ],
    });
    const first = await job();
    await processMenuJob(first.id);
    expect(
      (await db.job.findUniqueOrThrow({ where: { id: first.id } })).status,
    ).toBe("completed");
    const menu = await db.menu.findFirstOrThrow({ where: { tripId: trip.id } });
    expect((menu.data as any).dishes[0].price).toBeNull();
    expect((menu.data as any).dishes[1].price).toBeNull();
    const reused = await job();
    await processMenuJob(reused.id);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(await db.menu.count({ where: { ownerId } })).toBe(1);
    const queued = await db.job.create({
      data: {
        tripId: trip.id,
        type: "menu",
        input: {
          ownerId,
          itemId: "meal",
          source: "https://fixture.example/menu",
          sourceHash: randomUUID(),
        },
      },
    });
    mocks.create.mockRejectedValue({
      status: 429,
      headers: { "retry-after": "120" },
    });
    const start = Date.now();
    await processMenuJob(queued.id);
    expect(
      (await db.job.findUniqueOrThrow({ where: { id: queued.id } })).status,
    ).toBe("waiting");
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(
      mocks.send.mock.calls[0]![2].startAfter.getTime() - start,
    ).toBeGreaterThanOrEqual(120000);
    expect(await db.menu.count({ where: { ownerId } })).toBe(1);
    const malformed = await db.job.create({
      data: {
        tripId: trip.id,
        type: "menu",
        input: {
          ownerId,
          itemId: "meal",
          source: "https://fixture.example/menu",
          sourceHash: randomUUID(),
        },
      },
    });
    mocks.create.mockResolvedValue({
      choices: [{ message: { content: "not JSON" } }],
    });
    await processMenuJob(malformed.id);
    expect(
      (await db.job.findUniqueOrThrow({ where: { id: malformed.id } })).status,
    ).toBe("failed");
    expect(await db.menu.count({ where: { ownerId } })).toBe(1);
    // Exhaust the ordinary quota, then race two deliveries of the same new menu.
    await db.menu.createMany({
      data: Array.from({ length: 9 }, (_, i) => ({
        tripId: trip.id,
        ownerId,
        itemId: "meal",
        source: "fixture",
        sourceHash: `ordinary-${i}`,
        quotaBucket: "free",
        data: {},
      })),
    });
    await db.creditGrant.create({
      data: {
        userId: ownerId,
        actorId: ownerId,
        kind: "menu",
        quantity: 1,
        reason: "Disposable concurrency fixture",
      },
    });
    mocks.create.mockResolvedValue(await mocks.create.mock.results[0]!.value);
    const hash = randomUUID();
    const jobs = await Promise.all(
      [1, 2].map(() =>
        db.job.create({
          data: {
            tripId: trip.id,
            type: "menu",
            input: {
              ownerId,
              itemId: "meal",
              source: "https://fixture.example/menu",
              sourceHash: hash,
            },
          },
        }),
      ),
    );
    await Promise.all(jobs.map((j) => processMenuJob(j.id)));
    expect(await db.menu.count({ where: { ownerId, sourceHash: hash } })).toBe(
      1,
    );
    expect(
      await db.creditUse.count({ where: { grant: { userId: ownerId } } }),
    ).toBe(1);
    expect(
      await db.job.count({
        where: { id: { in: jobs.map((j) => j.id) }, status: "completed" },
      }),
    ).toBe(2);
    // Reopening a saved menu also works after every ordinary and bonus credit is spent.
    const reopened = await job();
    await processMenuJob(reopened.id);
    expect(
      (await db.job.findUniqueOrThrow({ where: { id: reopened.id } })).status,
    ).toBe("completed");
  } finally {
    await db.trip.delete({ where: { id: trip.id } });
    await db.user.delete({ where: { id: ownerId } });
    await db.$disconnect();
    vi.unstubAllEnvs();
  }
});
