-- Security events: remember which address a sign-in targeted so repeated
-- failures can be throttled per account and investigated in admin.
ALTER TABLE "LoginEvent" ADD COLUMN "email" TEXT;

ALTER TABLE "LoginEvent" DROP CONSTRAINT "LoginEvent_event_check";
ALTER TABLE "LoginEvent" ADD CONSTRAINT "LoginEvent_event_check" CHECK (
  "event" IN (
    'login_success',
    'login_failed',
    'login_locked',
    'logout',
    'session_expired',
    'password_changed',
    'password_reset_requested',
    'password_reset_completed',
    'two_factor_required',
    'two_factor_failed',
    'two_factor_enabled',
    'two_factor_disabled',
    'email_verified'
  )
);

CREATE INDEX "LoginEvent_email_createdAt_idx" ON "LoginEvent"("email", "createdAt");

-- One row per Stripe invoice, written only by verified webhooks.
CREATE TABLE "Payment" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "stripeCustomerId" TEXT,
  "stripeSubscriptionId" TEXT,
  "stripePaymentIntentId" TEXT,
  "status" TEXT NOT NULL,
  "billingReason" TEXT,
  "amountDue" INTEGER NOT NULL,
  "amountPaid" INTEGER NOT NULL,
  "amountRefunded" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3),
  "periodEnd" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "hostedInvoiceUrl" TEXT,
  "invoicePdfUrl" TEXT,
  "disputed" BOOLEAN NOT NULL DEFAULT false,
  "fraudWarning" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Payment_status_check" CHECK (
    "status" IN ('paid', 'failed', 'open', 'void', 'uncollectible', 'refunded', 'partially_refunded')
  ),
  CONSTRAINT "Payment_amounts_check" CHECK (
    "amountDue" >= 0 AND "amountPaid" >= 0 AND "amountRefunded" >= 0
  )
);

CREATE UNIQUE INDEX "Payment_stripePaymentIntentId_key" ON "Payment"("stripePaymentIntentId");
CREATE INDEX "Payment_userId_createdAt_idx" ON "Payment"("userId", "createdAt");
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Plain-language descriptions shown by psql (\dt+), TablePlus, pgAdmin and Postico.
COMMENT ON TABLE "user" IS 'People with a Whereto account. role is client or admin; the owner is ADMIN_OWNER_USER_ID in .env.';
COMMENT ON TABLE "session" IS 'Signed-in browser sessions (Better Auth). Deleting a row signs that device out.';
COMMENT ON TABLE "account" IS 'Sign-in methods per user: credential (hashed password) or an OAuth provider.';
COMMENT ON TABLE "verification" IS 'Short-lived tokens: email verification, password reset, 2FA challenges.';
COMMENT ON TABLE "twoFactor" IS 'Encrypted authenticator secrets and backup codes.';
COMMENT ON TABLE "AdminProof" IS 'When a session last proved an authenticator code for admin access.';
COMMENT ON TABLE "Entitlement" IS 'Per-user plan state: free-trip claim and the Stripe subscription mirror.';
COMMENT ON TABLE "Payment" IS 'One row per Stripe invoice, written by verified webhooks. Amounts are in cents.';
COMMENT ON TABLE "StripeEvent" IS 'Every Stripe webhook received, for deduplication and retry.';
COMMENT ON TABLE "Trip" IS 'A trip plan. state holds the full itinerary as JSON.';
COMMENT ON TABLE "TripMember" IS 'Collaborators invited to a trip (editor or viewer).';
COMMENT ON TABLE "TripHistory" IS 'Version history of trip changes.';
COMMENT ON TABLE "ShareLink" IS 'Public or invite links. Only a hash of the token is stored.';
COMMENT ON TABLE "Document" IS 'Files attached to trips; the bytes live in storage, not the database.';
COMMENT ON TABLE "Job" IS 'Background work (menu imports, PDF exports) run by the worker.';
COMMENT ON TABLE "JobAttempt" IS 'Each try at running a Job.';
COMMENT ON TABLE "Menu" IS 'Imported restaurant menus, counted against menu allowances.';
COMMENT ON TABLE "CreditGrant" IS 'Bonus trip/menu credits granted by an admin.';
COMMENT ON TABLE "CreditUse" IS 'Which resource consumed which bonus credit.';
COMMENT ON TABLE "LoginEvent" IS 'Security events: sign-ins, failures, lockouts, password resets, 2FA changes.';
COMMENT ON TABLE "AuditLog" IS 'What users changed (account, trips, documents, shares).';
COMMENT ON TABLE "AdminAudit" IS 'What admins did, with the reason they gave. Append-only.';
COMMENT ON TABLE "IntegrationControl" IS 'Admin pause switches and allowances for external services.';
COMMENT ON TABLE "ProviderUsage" IS 'Usage counters for external services per period.';
COMMENT ON TABLE "WorkerHeartbeat" IS 'Last time the background worker reported in.';
COMMENT ON TABLE "Milestone" IS 'First-time events per user (signup funnel).';
COMMENT ON TABLE "DevMail" IS 'Local development inbox. Only used when LOCAL_MAILBOX=true outside production.';

-- Read-only views for browsing in any Postgres GUI. They join ids to emails
-- and turn cents into currency amounts. Trip contents stay out on purpose.
CREATE SCHEMA IF NOT EXISTS reporting;
COMMENT ON SCHEMA reporting IS 'Read-only, human-friendly views over the app tables. Edit data in public, not here.';

CREATE VIEW reporting.users WITH (security_invoker = true) AS
SELECT
  u.id,
  u.email,
  u.name,
  u.role,
  u."emailVerified" AS email_verified,
  u."twoFactorEnabled" AS two_factor_enabled,
  u."suspendedAt" AS suspended_at,
  u."createdAt" AS created_at,
  (SELECT count(*) FROM "Trip" t WHERE t."ownerId" = u.id)::int AS trips_owned,
  e."subscriptionStatus" AS subscription_status,
  e."billingInterval" AS plan,
  e."paidUntil" AS paid_until,
  (SELECT max(l."createdAt") FROM "LoginEvent" l
     WHERE l."userId" = u.id AND l.event = 'login_success') AS last_login_at,
  (SELECT count(*) FROM "LoginEvent" l
     WHERE l.email = lower(u.email) AND l.event = 'login_failed'
       AND l."createdAt" > now() - interval '24 hours')::int AS failed_logins_24h
FROM "user" u
LEFT JOIN "Entitlement" e ON e."userId" = u.id;

CREATE VIEW reporting.payments WITH (security_invoker = true) AS
SELECT
  p.id AS invoice_id,
  p."createdAt" AS created_at,
  p."paidAt" AS paid_at,
  u.email,
  p.status,
  p."billingReason" AS billing_reason,
  round(p."amountPaid" / 100.0, 2) AS amount_paid,
  round(p."amountRefunded" / 100.0, 2) AS amount_refunded,
  upper(p.currency) AS currency,
  p."periodStart" AS period_start,
  p."periodEnd" AS period_end,
  p.disputed,
  p."fraudWarning" AS fraud_warning,
  p."hostedInvoiceUrl" AS invoice_url,
  p."userId" AS user_id
FROM "Payment" p
LEFT JOIN "user" u ON u.id = p."userId";

CREATE VIEW reporting.subscriptions WITH (security_invoker = true) AS
SELECT
  u.email,
  e."subscriptionStatus" AS status,
  e."billingInterval" AS plan,
  round(e."unitAmount" / 100.0, 2) AS price,
  upper(e.currency) AS currency,
  e."paidUntil" AS paid_until,
  e."cancelAtPeriodEnd" AS cancel_at_period_end,
  (e."paidUntil" > now() AND e."subscriptionStatus" IN ('active', 'trialing')) AS has_access,
  e."freeTripClaimedAt" AS free_trip_claimed_at,
  e."stripeSyncedAt" AS last_synced_at,
  e."stripeCustomerId" AS stripe_customer_id,
  e."userId" AS user_id
FROM "Entitlement" e
JOIN "user" u ON u.id = e."userId";

CREATE VIEW reporting.trips WITH (security_invoker = true) AS
SELECT
  t.id,
  u.email AS owner_email,
  t.funding,
  t."createdAt" AS created_at,
  t."updatedAt" AS updated_at,
  t."archivedAt" AS archived_at,
  jsonb_array_length(coalesce(t.state->'destinations', '[]'::jsonb)) AS destinations,
  (SELECT count(*) FROM jsonb_array_elements(coalesce(t.state->'items', '[]'::jsonb)) i
     WHERE i->>'deletedAt' IS NULL)::int AS items,
  (SELECT count(*) FROM "TripMember" m WHERE m."tripId" = t.id)::int AS collaborators,
  (SELECT count(*) FROM "Document" d WHERE d."tripId" = t.id)::int AS documents,
  t."ownerId" AS owner_id
FROM "Trip" t
JOIN "user" u ON u.id = t."ownerId";

-- Everything that happened, newest first: security events, user changes and admin actions.
CREATE VIEW reporting.activity WITH (security_invoker = true) AS
SELECT
  l."createdAt" AS at,
  'security'::text AS source,
  l.event AS action,
  coalesce(u.email, l.email) AS actor_email,
  coalesce(u.email, l.email) AS target,
  NULL::text AS reason,
  jsonb_strip_nulls(jsonb_build_object('ip', l."ipAddress", 'userAgent', l."userAgent")) AS details
FROM "LoginEvent" l
LEFT JOIN "user" u ON u.id = l."userId"
UNION ALL
SELECT
  a."createdAt",
  'user'::text,
  a.action,
  actor.email,
  a."targetType" || ':' || a."targetId",
  NULL::text,
  jsonb_strip_nulls(jsonb_build_object('before', a."before", 'after', a."after"))
FROM "AuditLog" a
LEFT JOIN "user" actor ON actor.id = a."actorId"
UNION ALL
SELECT
  a."createdAt",
  'admin'::text,
  a.action || ' (' || a.outcome || ')',
  actor.email,
  coalesce(target.email, a."targetId"),
  a.reason,
  a.change
FROM "AdminAudit" a
LEFT JOIN "user" actor ON actor.id = a."actorId"
LEFT JOIN "user" target ON target.id = a."targetId";
