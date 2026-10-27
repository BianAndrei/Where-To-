import { Router } from "express";
import { randomUUID } from "node:crypto";
import { fromNodeHeaders } from "better-auth/node";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db, assert, HttpError } from "./db.js";
import { auth } from "./auth.js";
import { config } from "./config.js";
import { hasPro, menuAllowance } from "./access.js";
import {
  accountLock,
  creditBalance,
  diagnostic,
  fingerprint,
  assertAccountActive,
  type Tx,
} from "./admin-domain.js";
import {
  ownerSession,
  requireAdmin,
  verifyAdminCode,
  isOwnerId,
  ADMIN_ENROLL_MS,
  ADMIN_READ_MS,
  ADMIN_WRITE_MS,
} from "./admin-access.js";
import { securityEventNames } from "./security-events.js";
import { integrationSnapshot, integrationSpecs } from "./integrations.js";
import { jobDependencies, dispatchJob } from "./job-runtime.js";
import { resyncSubscription, resyncStripeEvent } from "./billing.js";

export const admin = Router();
admin.use((_req, res, next) => {
  res.locals.diagnosticId = randomUUID();
  res.set({
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
    "X-Diagnostic-ID": res.locals.diagnosticId,
  });
  next();
});
admin.get("/access", async (req, res) => {
  const s = await ownerSession(req);
  const proof = await db.adminProof.findUnique({
    where: { sessionId: s.session.id },
  });
  const verified =
    !!s.user.twoFactorEnabled &&
    !!proof &&
    Date.now() - proof.verifiedAt.getTime() < ADMIN_READ_MS;
  const credential = await db.account.count({
    where: { userId: s.user.id, providerId: "credential" },
  });
  res.json({
    verified,
    owner: s.user.owner,
    enrolled: s.user.twoFactorEnabled,
    passwordRequired: credential > 0,
    freshUntil: verified
      ? new Date(proof!.verifiedAt.getTime() + ADMIN_WRITE_MS)
      : null,
    environment: config.production
      ? "production"
      : config.NODE_ENV === "test"
        ? "test"
        : "local",
  });
});
const mfaLimit = rateLimit({
  windowMs: 600000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many verification attempts. Wait 10 minutes." },
});
admin.post("/access/enroll", mfaLimit, async (req, res) => {
  const s = await ownerSession(req);
  assert(
    !s.user.twoFactorEnabled,
    409,
    "An authenticator is already enrolled.",
  );
  assert(
    Date.now() - s.session.createdAt.getTime() < ADMIN_ENROLL_MS,
    403,
    "Sign out and sign in again before setting up your authenticator.",
    "FRESH_LOGIN_REQUIRED",
  );
  const { password } = z
    .object({ password: z.string().max(200).optional() })
    .strict()
    .parse(req.body);
  try {
    // Enrollment is the only response carrying setup material; never logged or cached.
    res.json(
      await auth.api.enableTwoFactor({
        headers: fromNodeHeaders(req.headers),
        body: { password, issuer: "Whereto" },
      }),
    );
  } catch {
    throw new HttpError(
      400,
      "Authenticator setup failed. Check your password and try again.",
    );
  }
});
admin.post("/access/verify", mfaLimit, async (req, res) => {
  const { code } = z
    .object({ code: z.string().regex(/^\d{6}$/) })
    .strict()
    .parse(req.body);
  assert(
    await verifyAdminCode(req, code),
    400,
    "That code did not match. Try the current code in your authenticator.",
    "INVALID_CODE",
  );
  res.json({ ok: true });
});
admin.use(requireAdmin);
const querySchema = z.object({
  q: z.string().max(160).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  days: z.coerce
    .number()
    .refine((n) => [7, 30, 90].includes(n))
    .default(30),
  status: z.string().max(40).default(""),
  plan: z.enum(["", "month", "year"]).default(""),
  user: z.string().max(160).default(""),
  role: z.enum(["", "admin", "client"]).default(""),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
const pageSize = 20;
const pageResult = (rows: unknown[], total: number, page: number) => ({
  rows,
  total,
  page,
  pageSize,
});
function activityWindow(f: z.infer<typeof querySchema>) {
  const to = f.to ? new Date(`${f.to}T23:59:59.999Z`) : new Date();
  const from = f.from
    ? new Date(`${f.from}T00:00:00.000Z`)
    : new Date(to.getTime() - f.days * 86400000);
  assert(
    Number.isFinite(from.getTime()) &&
      Number.isFinite(to.getTime()) &&
      (!f.from || from.toISOString().slice(0, 10) === f.from) &&
      (!f.to || to.toISOString().slice(0, 10) === f.to) &&
      from <= to,
    400,
    "Choose a valid activity date range.",
  );
  return { from, to };
}
const userSelect = {
  id: true,
  email: true,
  role: true,
  emailVerified: true,
  twoFactorEnabled: true,
  createdAt: true,
  suspendedAt: true,
  entitlement: true,
  _count: { select: { trips: true } },
} satisfies Prisma.UserSelect;
const jobSelect = {
  id: true,
  tripId: true,
  type: true,
  status: true,
  errorCode: true,
  createdAt: true,
  updatedAt: true,
  startedAt: true,
  finishedAt: true,
  _count: { select: { attempts: true } },
} satisfies Prisma.JobSelect;
const jobDTO = (j: any) => ({
  id: j.id,
  tripId: j.tripId,
  type: j.type,
  status: j.status,
  createdAt: j.createdAt,
  updatedAt: j.updatedAt,
  startedAt: j.startedAt,
  finishedAt: j.finishedAt,
  durationMs:
    j.startedAt && j.finishedAt
      ? j.finishedAt.getTime() - j.startedAt.getTime()
      : null,
  attempts: j._count.attempts,
  error: diagnostic(j.errorCode),
  diagnosticId: j.id,
  stale:
    ["queued", "processing"].includes(j.status) &&
    Date.now() - j.updatedAt.getTime() > 15 * 60000,
});
const subscriptionDTO = (e: any) => ({
  userId: e.userId,
  stripeStatus: e.subscriptionStatus,
  appAccess: hasPro(e),
  interval: e.billingInterval,
  paidUntil: e.paidUntil,
  cancelAtPeriodEnd: e.cancelAtPeriodEnd,
  syncedAt: e.stripeSyncedAt,
  paymentStatus: e.lastPaymentStatus,
  customerUrl: e.stripeCustomerId
    ? `https://dashboard.stripe.com/${process.env.STRIPE_SECRET_KEY?.includes("_test_") ? "test/" : ""}customers/${encodeURIComponent(e.stripeCustomerId)}`
    : null,
  estimatedMrr:
    hasPro(e) &&
    e.currency === "eur" &&
    e.unitAmount != null &&
    ["month", "year"].includes(e.billingInterval)
      ? e.unitAmount / 100 / (e.billingInterval === "year" ? 12 : 1)
      : null,
});

admin.get("/users", async (req, res) => {
  const f = querySchema.parse(req.query);
  const filters: Prisma.UserWhereInput[] = [];
  if (f.q)
    filters.push({
      OR: [
        { email: { contains: f.q, mode: "insensitive" } },
        { id: { contains: f.q } },
      ],
    });
  if (f.status === "suspended") filters.push({ suspendedAt: { not: null } });
  if (f.role === "admin" && process.env.ADMIN_OWNER_USER_ID)
    filters.push({
      OR: [{ role: "admin" }, { id: process.env.ADMIN_OWNER_USER_ID }],
    });
  else if (f.role === "client" && process.env.ADMIN_OWNER_USER_ID)
    filters.push({
      role: "client",
      id: { not: process.env.ADMIN_OWNER_USER_ID },
    });
  else if (f.role) filters.push({ role: f.role });
  const where: Prisma.UserWhereInput = filters.length ? { AND: filters } : {};
  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      select: userSelect,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (f.page - 1) * pageSize,
      take: pageSize,
    }),
    db.user.count({ where }),
  ]);
  res.json(
    pageResult(
      await Promise.all(
        users.map(async (u) => ({
          id: u.id,
          email: u.email,
          role: isOwnerId(u.id) ? "admin" : u.role,
          owner: isOwnerId(u.id),
          verified: u.emailVerified,
          twoFactorEnabled: u.twoFactorEnabled,
          createdAt: u.createdAt,
          suspendedAt: u.suspendedAt,
          trips: u._count.trips,
          freeTripClaimedAt: u.entitlement?.freeTripClaimedAt ?? null,
          subscription: u.entitlement ? subscriptionDTO(u.entitlement) : null,
          menuAllowance: await menuAllowance(
            u.id,
            !!u.entitlement?.freeTripClaimedAt,
          ),
          tripCredits: await creditBalance(db, u.id, "trip"),
        })),
      ),
      total,
      f.page,
    ),
  );
});
admin.get("/users/:id", async (req, res) => {
  const id = String(req.params.id);
  const u = await db.user.findUnique({ where: { id }, select: userSelect });
  assert(u, 404, "Account not found.");
  const [grants, history, activity, loginEvents, payments, accounts] =
    await Promise.all([
      db.creditGrant.findMany({
        where: { userId: id },
        take: 100,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          kind: true,
          quantity: true,
          consumed: true,
          revoked: true,
          reason: true,
          createdAt: true,
        },
      }),
      db.adminAudit.findMany({
        where: { targetId: id },
        take: 20,
        orderBy: { createdAt: "desc" },
        select: auditSelect,
      }),
      db.auditLog.findMany({
        where: { OR: [{ actorId: id }, { targetId: id }] },
        take: 20,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          actorId: true,
          targetType: true,
          targetId: true,
          action: true,
          before: true,
          after: true,
          createdAt: true,
        },
      }),
      db.loginEvent.findMany({
        where: { OR: [{ userId: id }, { email: u.email.toLowerCase() }] },
        take: 20,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          event: true,
          email: true,
          method: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
        },
      }),
      db.payment.findMany({
        where: { userId: id },
        take: 20,
        orderBy: { createdAt: "desc" },
        select: paymentSelect,
      }),
      db.account.findMany({
        where: { userId: id },
        orderBy: { createdAt: "asc" },
        select: { providerId: true, createdAt: true },
      }),
    ]);
  res.json({
    id: u.id,
    email: u.email,
    role: isOwnerId(u.id) ? "admin" : u.role,
    owner: isOwnerId(u.id),
    verified: u.emailVerified,
    twoFactorEnabled: u.twoFactorEnabled,
    suspendedAt: u.suspendedAt,
    freeTripClaimedAt: u.entitlement?.freeTripClaimedAt ?? null,
    grants,
    history,
    activity,
    loginEvents: loginEvents.map((event) => ({
      ...event,
      ipAddress: maskedIp(event.ipAddress),
      userAgent: event.userAgent?.slice(0, 180) ?? null,
    })),
    payments,
    signInMethods: accounts.map((a) => ({
      method: a.providerId === "credential" ? "password" : a.providerId,
      linkedAt: a.createdAt,
    })),
  });
});
admin.get("/trips", async (req, res) => {
  const f = querySchema.parse(req.query);
  // JSON content is projected to counts/booleans in PostgreSQL, never serialized into an admin DTO.
  const pattern = `%${f.q.replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await db.$queryRaw<
    any[]
  >`SELECT t.id, t."ownerId", u.email AS "ownerEmail", t."createdAt", t."updatedAt", t.funding, t."archivedAt", true AS "destinationsLocked", (SELECT count(*)::int FROM jsonb_array_elements(t.state->'items') i WHERE i->>'deletedAt' IS NULL) AS "items", (SELECT count(*)::int FROM "TripMember" m WHERE m."tripId"=t.id) AS "collaborators", (SELECT count(*)::int FROM "Document" d WHERE d."tripId"=t.id) AS "documents", EXISTS(SELECT 1 FROM jsonb_array_elements(t.state->'destinations') d WHERE (CURRENT_TIMESTAMP AT TIME ZONE (d->>'timezone'))::date >= (t.state->>'startDate')::date) AS "datesLocked" FROM "Trip" t JOIN "user" u ON u.id=t."ownerId" WHERE (t.id ILIKE ${pattern} OR u.email ILIKE ${pattern}) AND (${f.user}='' OR t."ownerId"=${f.user}) ORDER BY t."createdAt" DESC, t.id LIMIT ${pageSize} OFFSET ${(f.page - 1) * pageSize}`;
  const total = await db.trip.count({
    where: {
      ...(f.user ? { ownerId: f.user } : {}),
      OR: [
        { id: { contains: f.q, mode: "insensitive" } },
        { owner: { email: { contains: f.q, mode: "insensitive" } } },
      ],
    },
  });
  res.json(pageResult(rows, total, f.page));
});
admin.get("/subscriptions", async (req, res) => {
  const f = querySchema.parse(req.query);
  const where: Prisma.EntitlementWhereInput = {
    stripeSubscriptionId: { not: null },
    ...(f.plan ? { billingInterval: f.plan } : {}),
    ...(f.status === "expired"
      ? { OR: [{ paidUntil: null }, { paidUntil: { lte: new Date() } }] }
      : f.status === "canceling"
        ? { cancelAtPeriodEnd: true }
        : f.status
          ? { subscriptionStatus: f.status }
          : {}),
    ...(f.q
      ? {
          AND: [
            {
              OR: [
                { userId: { contains: f.q } },
                { user: { email: { contains: f.q, mode: "insensitive" } } },
              ],
            },
          ],
        }
      : {}),
  };
  const [rows, total, events] = await Promise.all([
    db.entitlement.findMany({
      where,
      include: { user: { select: { email: true } } },
      orderBy: { userId: "asc" },
      take: pageSize,
      skip: (f.page - 1) * pageSize,
    }),
    db.entitlement.count({ where }),
    db.stripeEvent.findMany({
      where: { status: "failed" },
      take: 20,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        status: true,
        errorCode: true,
        attempts: true,
        createdAt: true,
      },
    }),
  ]);
  res.json({
    ...pageResult(
      rows.map((e) => ({ ...subscriptionDTO(e), email: e.user.email })),
      total,
      f.page,
    ),
    failedWebhooks: events.map((e) => ({
      ...e,
      errorCode: undefined,
      error: diagnostic(e.errorCode),
    })),
    receipts: {
      available: false,
      note: "Actual receipts and refunds are available in Stripe. Estimated MRR is not cash collected.",
    },
  });
});
const paymentSelect = {
  id: true,
  userId: true,
  status: true,
  billingReason: true,
  amountDue: true,
  amountPaid: true,
  amountRefunded: true,
  currency: true,
  periodStart: true,
  periodEnd: true,
  paidAt: true,
  hostedInvoiceUrl: true,
  disputed: true,
  fraudWarning: true,
  createdAt: true,
} satisfies Prisma.PaymentSelect;
const paymentStatuses = [
  "paid",
  "failed",
  "open",
  "void",
  "uncollectible",
  "refunded",
  "partially_refunded",
];
admin.get("/payments", async (req, res) => {
  const f = querySchema.parse(req.query);
  const { from, to } = activityWindow(f);
  assert(
    !f.status || [...paymentStatuses, "flagged"].includes(f.status),
    400,
    "Choose a known payment status.",
  );
  const where: Prisma.PaymentWhereInput = {
    createdAt: { gte: from, lte: to },
    ...(f.status === "flagged"
      ? { OR: [{ disputed: true }, { fraudWarning: true }] }
      : f.status
        ? { status: f.status }
        : {}),
    ...(f.user ? { userId: f.user } : {}),
    ...(f.q
      ? {
          AND: [
            {
              OR: [
                { id: { contains: f.q } },
                { user: { email: { contains: f.q, mode: "insensitive" } } },
              ],
            },
          ],
        }
      : {}),
  };
  const [rows, total, totals] = await Promise.all([
    db.payment.findMany({
      where,
      select: { ...paymentSelect, user: { select: { email: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: pageSize,
      skip: (f.page - 1) * pageSize,
    }),
    db.payment.count({ where }),
    db.payment.groupBy({
      by: ["currency"],
      where: { createdAt: { gte: from, lte: to } },
      _sum: { amountPaid: true, amountRefunded: true },
      _count: { _all: true },
    }),
  ]);
  res.json({
    ...pageResult(
      rows.map(({ user, ...p }) => ({ ...p, email: user?.email ?? null })),
      total,
      f.page,
    ),
    totals: totals.map((t) => ({
      currency: t.currency,
      payments: t._count._all,
      collected: (t._sum.amountPaid ?? 0) / 100,
      refunded: (t._sum.amountRefunded ?? 0) / 100,
    })),
    note: "Collected is what customers paid before Stripe fees. Refunds and disputes are settled in Stripe.",
  });
});
admin.get("/jobs", async (req, res) => {
  const f = querySchema.parse(req.query);
  const where: Prisma.JobWhereInput = {
    ...(f.status ? { status: f.status } : {}),
    ...(f.user ? { trip: { ownerId: f.user } } : {}),
    ...(f.q
      ? { OR: [{ id: { contains: f.q } }, { tripId: { contains: f.q } }] }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.job.findMany({
      where,
      select: jobSelect,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: pageSize,
      skip: (f.page - 1) * pageSize,
    }),
    db.job.count({ where }),
  ]);
  res.json(pageResult(rows.map(jobDTO), total, f.page));
});
admin.get("/integrations", async (_req, res) =>
  res.json({ rows: await integrationSnapshot() }),
);
const auditSelect = {
  id: true,
  actorId: true,
  targetId: true,
  action: true,
  reason: true,
  outcome: true,
  change: true,
  createdAt: true,
} satisfies Prisma.AdminAuditSelect;
function maskedIp(value: string | null) {
  if (!value) return null;
  const ipv4 = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (ipv4) return `${ipv4[1]}.${ipv4[2]}.${ipv4[3]}.0`;
  if (value.includes(":")) return `${value.split(":").slice(0, 3).join(":")}::`;
  return null;
}
admin.get("/activity", async (req, res) => {
  const f = querySchema.parse(req.query);
  const { from, to } = activityWindow(f);
  // Emails are looked up at read time so a row still shows who it was about
  // after the account changes its address. Trips show their owner, never
  // their contents.
  const events = Prisma.sql`
    WITH events AS (
      SELECT id, "actorId", "targetId", NULL::text AS "targetType", action,
             reason, outcome, change, "createdAt", 'admin'::text AS source
      FROM "AdminAudit"
      UNION ALL
      SELECT id, "actorId", "targetId", "targetType", action,
             'User activity'::text, 'success'::text,
             jsonb_build_object('before', "before", 'after', "after"),
             "createdAt", 'user'::text
      FROM "AuditLog"
    )
    SELECT e.*, actor.email AS "actorEmail", target.email AS "targetEmail",
           owner.email AS "tripOwnerEmail"
    FROM events e
    LEFT JOIN "user" actor ON actor.id = e."actorId"
    LEFT JOIN "user" target ON target.id = e."targetId"
    LEFT JOIN "Trip" trip ON trip.id = e."targetId"
    LEFT JOIN "user" owner ON owner.id = trip."ownerId"
    WHERE e."createdAt" >= ${from} AND e."createdAt" <= ${to}
      AND (${f.status} = '' OR e.action = ${f.status})
      AND (${f.user} = '' OR e."targetId" = ${f.user} OR e."actorId" = ${f.user})
      AND (${f.q} = '' OR e."targetId" ILIKE '%' || ${f.q} || '%'
                       OR e."actorId" ILIKE '%' || ${f.q} || '%'
                       OR actor.email ILIKE '%' || ${f.q} || '%'
                       OR target.email ILIKE '%' || ${f.q} || '%'
                       OR owner.email ILIKE '%' || ${f.q} || '%')
  `;
  const [rows, totalRows] = await Promise.all([
    db.$queryRaw<
      {
        id: string;
        actorId: string;
        targetId: string;
        targetType: string | null;
        action: string;
        reason: string;
        outcome: string;
        change: Prisma.JsonValue;
        createdAt: Date;
        source: string;
        actorEmail: string | null;
        targetEmail: string | null;
        tripOwnerEmail: string | null;
      }[]
    >`
      SELECT * FROM (${events}) rows
      ORDER BY "createdAt" DESC, id ASC
      LIMIT ${pageSize} OFFSET ${(f.page - 1) * pageSize}
    `,
    db.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) AS total FROM (${events}) rows
    `,
  ]);
  const total = Number(totalRows[0]?.total ?? 0n);
  res.json(pageResult(rows, total, f.page));
});
admin.get("/login-events", async (req, res) => {
  const f = querySchema.parse(req.query);
  const { from, to } = activityWindow(f);
  assert(
    !f.status || (securityEventNames as string[]).includes(f.status),
    400,
    "Choose a known security event.",
  );
  const where: Prisma.LoginEventWhereInput = {
    createdAt: { gte: from, lte: to },
    ...(f.status ? { event: f.status } : {}),
    ...(f.user ? { userId: f.user } : {}),
    ...(f.q
      ? {
          OR: [
            { userId: { contains: f.q } },
            { email: { contains: f.q.toLowerCase() } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.loginEvent.findMany({
      where,
      select: {
        id: true,
        userId: true,
        email: true,
        event: true,
        method: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: pageSize,
      skip: (f.page - 1) * pageSize,
    }),
    db.loginEvent.count({ where }),
  ]);
  // Older rows only kept the account id.
  const emails = new Map(
    (
      await db.user.findMany({
        where: {
          id: {
            in: rows.flatMap((e) => (e.userId && !e.email ? [e.userId] : [])),
          },
        },
        select: { id: true, email: true },
      })
    ).map((u) => [u.id, u.email.toLowerCase()]),
  );
  res.json(
    pageResult(
      rows.map((event) => ({
        ...event,
        email:
          event.email ?? (event.userId && emails.get(event.userId)) ?? null,
        ipAddress: maskedIp(event.ipAddress),
        userAgent: event.userAgent?.slice(0, 180) ?? null,
      })),
      total,
      f.page,
    ),
  );
});

admin.get("/overview", async (req, res) => {
  const { days } = querySchema.parse(req.query);
  const since = new Date(Date.now() - days * 86400000);
  const [
    verified,
    trips,
    entitlements,
    failed,
    services,
    worker,
    funnelRows,
    trend,
    firstEvent,
    failedEvents,
    failedPayments,
    flaggedPayments,
    lockouts,
  ] = await Promise.all([
    db.user.count({ where: { emailVerified: true } }),
    db.trip.count({ where: { createdAt: { gte: since } } }),
    db.entitlement.findMany({
      where: { subscriptionStatus: { in: ["active", "trialing"] } },
    }),
    db.job.count({ where: { status: "failed", createdAt: { gte: since } } }),
    integrationSnapshot(),
    db.workerHeartbeat.findUnique({ where: { id: "main" } }),
    db.$queryRaw<
      { event: string; count: number }[]
    >`SELECT m.event, count(*)::int AS count FROM "Milestone" m JOIN "Milestone" c ON c."userId"=m."userId" AND c.event='account_created' WHERE c."createdAt">=${since} GROUP BY m.event`,
    db.$queryRaw<
      { day: string; type: string; total: number; failed: number }[]
    >`SELECT to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, type, count(*)::int AS total, count(*) FILTER (WHERE status='failed')::int AS failed FROM "Job" WHERE "createdAt">=${since} GROUP BY day,type ORDER BY day`,
    db.milestone.findFirst({
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    db.stripeEvent.count({ where: { status: "failed" } }),
    db.payment.count({
      where: { status: "failed", createdAt: { gte: since } },
    }),
    db.payment.count({
      where: { OR: [{ disputed: true }, { fraudWarning: true }] },
    }),
    db.loginEvent.count({
      where: {
        event: "login_locked",
        createdAt: { gte: new Date(Date.now() - 86400000) },
      },
    }),
  ]);
  const active = entitlements.filter(hasPro),
    mrr = active.map(subscriptionDTO);
  const attention: {
    title: string;
    detail: string;
    href: string;
    severity: string;
  }[] = [];
  if (!worker || Date.now() - worker.seenAt.getTime() > 90000)
    attention.push({
      title: "Worker heartbeat missing",
      detail: worker
        ? "No heartbeat in 90 seconds. Active jobs are not assumed stopped."
        : "The worker has not reported a heartbeat yet.",
      href: "/admin/jobs",
      severity: "warning",
    });
  if (failed)
    attention.push({
      title: `${failed} failed operations`,
      detail: "Review the error and previous attempts before retrying.",
      href: "/admin/jobs?status=failed",
      severity: "warning",
    });
  if (failedEvents)
    attention.push({
      title: `${failedEvents} Stripe webhook failures`,
      detail: "Review subscription synchronization.",
      href: "/admin/subscriptions",
      severity: "warning",
    });
  if (flaggedPayments)
    attention.push({
      title: `${flaggedPayments} disputed or fraud-flagged payments`,
      detail: "Respond in Stripe before the dispute deadline.",
      href: "/admin/payments?status=flagged",
      severity: "critical",
    });
  if (failedPayments)
    attention.push({
      title: `${failedPayments} failed payments`,
      detail: "Stripe retries automatically and emails the customer.",
      href: "/admin/payments?status=failed",
      severity: "warning",
    });
  if (lockouts)
    attention.push({
      title: `${lockouts} account lockouts in 24 hours`,
      detail:
        "Repeated wrong passwords. Check whether one address is being targeted.",
      href: "/admin/login-events?status=login_locked&days=7",
      severity: "warning",
    });
  const unsynced = await db.entitlement.count({
    where: {
      stripeSubscriptionId: { not: null },
      OR: [
        { stripeSyncedAt: null },
        { stripeSyncedAt: { lt: new Date(Date.now() - 86400000) } },
      ],
    },
  });
  if (unsynced)
    attention.push({
      title: `${unsynced} subscriptions need a sync check`,
      detail:
        "No successful synchronization in 24 hours. Their current rights have not been changed.",
      href: "/admin/subscriptions",
      severity: "warning",
    });
  for (const s of services)
    if (s.configured && (s.limit === 0 || s.used >= s.limit * 0.8))
      attention.push({
        title: `${s.name}: ${s.limit === 0 ? "allowance is zero" : Math.round((s.used / s.limit) * 100) + "% of allowance"}`,
        detail: `Application-tracked usage. Resets ${s.resetAt.toISOString().slice(0, 10)}.`,
        href: "/admin/integrations",
        severity: s.used >= s.limit ? "critical" : "warning",
      });
  const names = [
    "account_created",
    "email_verified",
    "first_trip",
    "first_item",
    "first_cost",
    "first_export",
  ];
  res.json({
    days,
    metrics: {
      verifiedUsers: verified,
      tripsCreated: trips,
      activeSubscriptions: active.length,
      estimatedMrr: Number(
        mrr.reduce((n, e) => n + (e.estimatedMrr ?? 0), 0).toFixed(2),
      ),
      mrrMissingPlans: mrr.filter((e) => e.estimatedMrr === null).length,
      failedJobs: failed,
    },
    attention,
    funnel: names.map((event) => ({
      event,
      count: funnelRows.find((r) => r.event === event)?.count ?? 0,
    })),
    trend,
    trackingSince: firstEvent?.createdAt ?? null,
    worker: {
      available: !!worker && Date.now() - worker.seenAt.getTime() < 90000,
      seenAt: worker?.seenAt ?? null,
    },
    definitions: {
      verifiedUsers: "All currently verified accounts.",
      tripsCreated:
        "Trips created in the selected period, including archived trips.",
      activeSubscriptions:
        "Active/trialing Stripe status with a future paid-through date.",
      estimatedMrr:
        "EUR recurring plan amount, annual divided by 12; excludes unknown plans. Before tax, fees and refunds.",
      funnel:
        "Accounts first observed signing up in the selected period; milestones reached since signup. Historical missing events are not inferred.",
      trend:
        "Operations created per UTC day and their current failure state. An empty chart means no observed operations.",
    },
  });
});

const actionBody = z
  .object({
    requestKey: z.string().uuid(),
    reason: z.string().trim().min(5).max(500),
    quantity: z.number().int().min(1).max(1000).optional(),
    kind: z.enum(["trip", "menu"]).optional(),
    limit: z.number().int().min(0).optional(),
    paused: z.boolean().optional(),
    role: z.enum(["admin", "client"]).optional(),
  })
  .strict();
admin.post("/actions/:action/:target", async (req, res) => {
  const action = z
    .enum([
      "grant",
      "revoke-credit",
      "suspend",
      "reactivate",
      "revoke-sessions",
      "retry",
      "integration",
      "resync",
      "resync-event",
      "set-role",
    ])
    .parse(req.params.action);
  const target = z.string().min(1).max(160).parse(req.params.target),
    body = actionBody.parse(req.body),
    actor = res.locals.admin.user.id as string;
  const key = `${actor}:${body.requestKey}`,
    hash = fingerprint({ action, target, ...body });
  const prior = await db.adminAudit.findUnique({ where: { requestKey: key } });
  if (prior) {
    assert(
      prior.fingerprint === hash,
      409,
      "This request key was already used for another action.",
    );
    res.json({ outcome: prior.outcome, change: prior.change });
    return;
  }
  try {
    if (action === "retry") {
      const job = await db.job.findUnique({
        where: { id: target },
        include: { trip: { select: { ownerId: true, isFree: true } } },
      });
      assert(
        job && job.status === "failed",
        409,
        "Only failed jobs can be retried. Active or completed work cannot be relaunched.",
      );
      const hash = (job.input as any)?.sourceHash;
      const reusable =
        job.type === "menu" &&
        typeof hash === "string" &&
        (await db.menu.count({
          where: { tripId: job.tripId, sourceHash: hash },
        }));
      await assertAccountActive(job.trip.ownerId);
      if (!reusable)
        await jobDependencies(job.type, job.trip.ownerId, job.trip.isFree);
    }
    if (action === "resync") await resyncSubscription(target);
    if (action === "resync-event") await resyncStripeEvent(target);
    const result = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
      const previous = await tx.adminAudit.findUnique({
        where: { requestKey: key },
      });
      if (previous) {
        assert(previous.fingerprint === hash, 409, "Request key conflict.");
        return { outcome: previous.outcome, change: previous.change };
      }
      let change: Prisma.InputJsonObject = {};
      if (
        [
          "grant",
          "suspend",
          "reactivate",
          "revoke-sessions",
          "set-role",
        ].includes(action)
      ) {
        await accountLock(tx, target);
        const user = await tx.user.findUnique({
          where: { id: target },
          select: { suspendedAt: true, role: true, emailVerified: true },
        });
        assert(user, 404, "Account not found.");
        // The owner is configured on the server and cannot be locked out from
        // here; other administrators answer only to the owner.
        assert(
          action === "grant" || !isOwnerId(target),
          403,
          "The owner account can only be changed on the server.",
          "OWNER_PROTECTED",
        );
        assert(
          action === "grant" || user.role !== "admin" || isOwnerId(actor),
          403,
          "Only the owner can change another administrator's access.",
          "OWNER_REQUIRED",
        );
        assert(
          action !== "grant" || target !== actor || isOwnerId(actor),
          403,
          "Ask another administrator to grant credits to your own account.",
          "SELF_GRANT",
        );
        if (action === "set-role") {
          assert(
            isOwnerId(actor),
            403,
            "Only the owner can change administrator roles.",
            "OWNER_REQUIRED",
          );
          assert(body.role, 400, "Choose a role.");
          assert(
            user.role !== body.role,
            409,
            `This account is already ${body.role === "admin" ? "an administrator" : "a client"}.`,
          );
          assert(
            body.role === "client" || (user.emailVerified && !user.suspendedAt),
            409,
            "Only verified, active accounts can become administrators.",
          );
          await tx.user.update({
            where: { id: target },
            data: { role: body.role },
          });
          // A demoted account loses admin immediately, even mid-session.
          const proofs =
            body.role === "client"
              ? (
                  await tx.adminProof.deleteMany({
                    where: { session: { userId: target } },
                  })
                ).count
              : 0;
          change = {
            before: user.role,
            after: body.role,
            adminSessionsClosed: proofs,
          };
        } else if (action === "grant") {
          assert(
            body.kind && body.quantity,
            400,
            "Choose a credit type and quantity.",
          );
          const before = await creditBalance(tx, target, body.kind);
          const grant = await tx.creditGrant.create({
            data: {
              userId: target,
              actorId: actor,
              kind: body.kind,
              quantity: body.quantity,
              reason: body.reason,
            },
          });
          change = {
            grantId: grant.id,
            kind: body.kind,
            quantity: body.quantity,
            before,
            after: before + body.quantity,
          };
        } else {
          assert(
            target !== actor,
            400,
            "The owner account cannot be suspended or have its sessions revoked here.",
          );
          if (action !== "revoke-sessions")
            await tx.user.update({
              where: { id: target },
              data: { suspendedAt: action === "suspend" ? new Date() : null },
            });
          const sessions =
            action === "reactivate"
              ? 0
              : (await tx.session.deleteMany({ where: { userId: target } }))
                  .count;
          change = {
            wasSuspended: !!user.suspendedAt,
            suspended:
              action === "suspend" ||
              (action === "revoke-sessions" && !!user.suspendedAt),
            sessionsRevoked: sessions,
            subscriptionChanged: false,
          };
        }
      } else if (action === "revoke-credit") {
        const grant = await tx.creditGrant.findUnique({
          where: { id: target },
        });
        assert(grant, 404, "Grant not found.");
        await accountLock(tx, grant.userId);
        const fresh = await tx.creditGrant.findUniqueOrThrow({
          where: { id: target },
        });
        const available = fresh.quantity - fresh.consumed - fresh.revoked;
        assert(
          body.quantity && body.quantity <= available,
          409,
          "Only the unconsumed portion of this grant can be revoked.",
        );
        await tx.creditGrant.update({
          where: { id: target },
          data: { revoked: { increment: body.quantity } },
        });
        change = {
          userId: fresh.userId,
          kind: fresh.kind,
          quantity: body.quantity,
          before: available,
          after: available - body.quantity,
        };
      } else if (action === "retry") {
        const changed = await tx.job.updateMany({
          where: { id: target, status: "failed" },
          data: {
            status: "queued",
            error: null,
            errorCode: null,
            finishedAt: null,
          },
        });
        assert(
          changed.count === 1,
          409,
          "This job is no longer failed. No second attempt was queued.",
        );
        change = { before: "failed", after: "queued", jobId: target };
      } else if (action === "integration") {
        const spec = integrationSpecs().find((s) => s.id === target);
        assert(spec, 404, "Integration not found.");
        assert(
          body.limit == null || body.limit <= spec.max,
          400,
          "This allowance exceeds the maximum configured on the server.",
        );
        assert(
          body.limit != null || body.paused != null,
          400,
          "Choose a change.",
        );
        const before = await tx.integrationControl.findUnique({
          where: { provider: target },
        });
        const updated = await tx.integrationControl.upsert({
          where: { provider: target },
          create: { provider: target, paused: body.paused, limit: body.limit },
          update: { paused: body.paused, limit: body.limit },
        });
        change = {
          before: {
            paused: before?.paused ?? false,
            limit: before?.limit ?? spec.max,
          },
          after: { paused: updated.paused, limit: updated.limit ?? spec.max },
        };
      } else
        change = {
          refreshedFromStripe: true,
          ...(action === "resync-event"
            ? { eventId: target }
            : { userId: target }),
        };
      await tx.adminAudit.create({
        data: {
          actorId: actor,
          targetId: action === "revoke-credit" ? String(change.userId) : target,
          action,
          reason: body.reason,
          outcome: "success",
          requestKey: key,
          fingerprint: hash,
          change,
        },
      });
      return { outcome: "success", change };
    });
    // Durable queued rows are picked up by the worker even if this dispatch fails.
    if (action === "retry") {
      const job = await db.job.findUniqueOrThrow({
        where: { id: target },
        select: { type: true },
      });
      await dispatchJob(target, job.type).catch(() => {});
    }
    res.json(result);
  } catch (error) {
    const code = error instanceof HttpError ? error.code : "ACTION_FAILED";
    await db.adminAudit.upsert({
      where: { requestKey: key },
      create: {
        actorId: actor,
        targetId: target,
        action,
        reason: body.reason,
        outcome: "failed",
        requestKey: key,
        fingerprint: hash,
        change: { code },
      },
      update: {},
    });
    throw error;
  }
});
