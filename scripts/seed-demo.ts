// Fills a local database with clearly fake accounts, trips, payments and
// security events so every admin page has something to show.
//   npm run db:seed            add the demo data (safe to run again)
//   npm run db:seed -- --clean remove it again
// Demo accounts use @demo.whereto.test addresses and have no password, so
// nobody can sign in as them.
import { randomUUID } from "node:crypto";
import { freeTripState } from "@whereto/shared";
import { db } from "../apps/api/src/db";
import { catalogue } from "../apps/api/src/catalogue";
import { deleteFile } from "../apps/api/src/storage";

const DOMAIN = "@demo.whereto.test";
if (process.env.NODE_ENV === "production")
  throw new Error("Demo data is for local databases only.");

async function clean() {
  const users = await db.user.findMany({
    where: { email: { endsWith: DOMAIN } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  // Uploaded confirmations live in storage, outside the database.
  const documents = await db.document.findMany({
    where: { trip: { ownerId: { in: ids } } },
    select: { storageKey: true },
  });
  for (const d of documents) await deleteFile(d.storageKey).catch(() => {});
  await db.adminAudit.deleteMany({
    where: { OR: [{ actorId: { in: ids } }, { targetId: { in: ids } }] },
  });
  await db.payment.deleteMany({ where: { id: { startsWith: "in_demo_" } } });
  await db.loginEvent.deleteMany({
    where: { OR: [{ userId: { in: ids } }, { email: { endsWith: DOMAIN } }] },
  });
  await db.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: ids } }, { targetId: { in: ids } }] },
  });
  await db.trip.deleteMany({ where: { ownerId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

const ago = (days: number, hours = 0) =>
  new Date(Date.now() - days * 86400000 - hours * 3600000);
const ahead = (days: number) => new Date(Date.now() + days * 86400000);
const city = (name: string) => catalogue.find((c) => c.name === name)!;
const browser =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 Safari/605.1.15";

type Demo = {
  name: string;
  slug: string;
  joined: number;
  verified?: boolean;
  suspended?: boolean;
  plan?: { interval: "month" | "year"; status: string; paidUntil: Date };
  trips: string[][];
};
const people: Demo[] = [
  {
    name: "Ana Popescu",
    slug: "ana",
    joined: 62,
    plan: { interval: "month", status: "active", paidUntil: ahead(12) },
    trips: [["Lisbon", "Porto"], ["Rome"], ["Vienna", "Prague"]],
  },
  {
    name: "Mihai Ionescu",
    slug: "mihai",
    joined: 45,
    plan: { interval: "year", status: "active", paidUntil: ahead(290) },
    trips: [["Barcelona"], ["Paris"]],
  },
  {
    name: "Elena Dumitru",
    slug: "elena",
    joined: 30,
    plan: { interval: "month", status: "past_due", paidUntil: ago(2) },
    trips: [["Brasov"]],
  },
  { name: "Andrei Stan", slug: "andrei", joined: 21, trips: [["Amsterdam"]] },
  {
    name: "Ioana Marin",
    slug: "ioana",
    joined: 9,
    trips: [["Cluj-Napoca", "Budapest"]],
  },
  {
    name: "Radu Georgescu",
    slug: "radu",
    joined: 6,
    suspended: true,
    trips: [["Athens"]],
  },
  {
    name: "Maria Enache",
    slug: "maria",
    joined: 2,
    verified: false,
    trips: [],
  },
];

async function seed() {
  for (const person of people) {
    const email = `${person.slug}${DOMAIN}`;
    if (await db.user.findUnique({ where: { email } })) continue;
    const id = randomUUID();
    const created = ago(person.joined);
    await db.user.create({
      data: {
        id,
        name: person.name,
        email,
        emailVerified: person.verified ?? true,
        suspendedAt: person.suspended ? ago(1) : null,
        createdAt: created,
        milestones: {
          create: [
            { event: "account_created", createdAt: created },
            ...(person.verified === false
              ? []
              : [{ event: "email_verified", createdAt: created }]),
            ...(person.trips.length
              ? [{ event: "first_trip", createdAt: ago(person.joined - 1) }]
              : []),
          ],
        },
        entitlement: {
          create: {
            freeTripClaimedAt: person.trips.length
              ? ago(person.joined - 1)
              : null,
            ...(person.plan
              ? {
                  stripeCustomerId: `cus_demo_${person.slug}`,
                  stripeSubscriptionId: `sub_demo_${person.slug}`,
                  subscriptionStatus: person.plan.status,
                  subscriptionStart: ago(person.joined - 2),
                  paidUntil: person.plan.paidUntil,
                  billingInterval: person.plan.interval,
                  unitAmount: person.plan.interval === "year" ? 4000 : 500,
                  currency: "eur",
                  stripeSyncedAt: ago(0, 3),
                  lastPaymentStatus:
                    person.plan.status === "past_due" ? "open" : "paid",
                }
              : {}),
          },
        },
      },
    });
    for (const [index, destinations] of person.trips.entries()) {
      const start = ahead(20 + index * 30);
      const end = new Date(start.getTime() + 4 * 86400000);
      const trip = await db.trip.create({
        data: {
          ownerId: id,
          isFree: index === 0,
          funding: index === 0 ? "free" : "subscription",
          createdAt: ago(person.joined - 1 - index * 5),
          state: freeTripState({
            organizer: person.name.split(" ")[0]!,
            destinations: destinations.map(city),
            startDate: start.toISOString().slice(0, 10),
            endDate: end.toISOString().slice(0, 10),
            currency: "EUR",
            budget: String(800 + index * 400),
            modules: "both",
            participants: [{ id: "person1", name: person.name.split(" ")[0]! }],
          }) as object,
        },
      });
      await db.auditLog.create({
        data: {
          actorId: id,
          targetType: "trip",
          targetId: trip.id,
          action: "trip.created",
          after: { destinations: destinations.length },
          createdAt: trip.createdAt,
        },
      });
    }
    if (person.plan) {
      const months =
        person.plan.interval === "year"
          ? 1
          : Math.max(1, Math.floor(person.joined / 30));
      for (let i = 0; i < months; i++) {
        const failed = person.plan.status === "past_due" && i === months - 1;
        const at = ago(person.joined - 2 - i * 30);
        const amount = person.plan.interval === "year" ? 4000 : 500;
        await db.payment.create({
          data: {
            id: `in_demo_${person.slug}_${i + 1}`,
            userId: id,
            stripeCustomerId: `cus_demo_${person.slug}`,
            stripeSubscriptionId: `sub_demo_${person.slug}`,
            status: failed ? "failed" : "paid",
            billingReason:
              i === 0 ? "subscription_create" : "subscription_cycle",
            amountDue: amount,
            amountPaid: failed ? 0 : amount,
            currency: "eur",
            periodStart: at,
            periodEnd: new Date(
              at.getTime() +
                (person.plan.interval === "year" ? 365 : 30) * 86400000,
            ),
            paidAt: failed ? null : at,
            createdAt: at,
          },
        });
      }
    }
    const meta = { email, userAgent: browser, ipAddress: "203.0.113.0" };
    await db.loginEvent.createMany({
      data: [
        { ...meta, userId: id, event: "email_verified", createdAt: created },
        {
          ...meta,
          userId: id,
          event: "login_success",
          createdAt: ago(person.joined - 1),
        },
        {
          ...meta,
          userId: id,
          event: "login_success",
          createdAt: ago(1, person.joined % 7),
        },
        { ...meta, userId: id, event: "logout", createdAt: ago(1, 1) },
      ],
    });
  }
  // A burst of guesses against one account, then a lockout and a reset.
  const target = `ana${DOMAIN}`;
  const ana = await db.user.findUniqueOrThrow({ where: { email: target } });
  if (
    !(await db.loginEvent.count({
      where: { email: target, event: "login_locked" },
    }))
  ) {
    await db.loginEvent.createMany({
      data: [
        ...Array.from({ length: 10 }, (_, i) => ({
          email: target,
          userId: ana.id,
          event: "login_failed",
          ipAddress: "198.51.100.0",
          userAgent: "python-requests/2.32",
          createdAt: ago(3, 2 - i * 0.01),
        })),
        {
          email: target,
          userId: ana.id,
          event: "login_locked",
          ipAddress: "198.51.100.0",
          userAgent: "python-requests/2.32",
          createdAt: ago(3, 1.9),
        },
        {
          email: target,
          userId: ana.id,
          event: "password_reset_requested",
          ipAddress: "203.0.113.0",
          userAgent: browser,
          createdAt: ago(3, 1),
        },
        {
          email: target,
          userId: ana.id,
          event: "password_reset_completed",
          ipAddress: "203.0.113.0",
          userAgent: browser,
          createdAt: ago(3, 0.8),
        },
        {
          email: `nobody${DOMAIN}`,
          event: "login_failed",
          ipAddress: "198.51.100.0",
          userAgent: "curl/8.7",
          createdAt: ago(2),
        },
      ],
    });
  }
}

if (process.argv.includes("--clean")) {
  console.log(
    `Removed ${await clean()} demo accounts and everything they owned.`,
  );
} else {
  await seed();
  console.log(
    `Demo data ready: ${people.length} accounts (${DOMAIN}), trips, payments and security events. Remove it with: npm run db:seed -- --clean`,
  );
}
await db.$disconnect();
