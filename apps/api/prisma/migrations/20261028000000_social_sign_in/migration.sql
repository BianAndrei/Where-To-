-- How each sign-in happened: password, Google, Apple or an email link.
ALTER TABLE "LoginEvent" ADD COLUMN "method" TEXT;
ALTER TABLE "LoginEvent" ADD CONSTRAINT "LoginEvent_method_check" CHECK (
  "method" IS NULL OR "method" IN ('password', 'google', 'apple', 'email_link')
);

COMMENT ON TABLE "account" IS 'Sign-in methods per user: credential (hashed password), google or apple. OAuth tokens are stored encrypted.';

-- New columns go at the end so existing queries keep working.
CREATE OR REPLACE VIEW reporting.users WITH (security_invoker = true) AS
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
       AND l."createdAt" > now() - interval '24 hours')::int AS failed_logins_24h,
  (SELECT string_agg(
       CASE a."providerId" WHEN 'credential' THEN 'password' ELSE a."providerId" END,
       ', ' ORDER BY a."createdAt")
     FROM "account" a WHERE a."userId" = u.id) AS sign_in_methods,
  (SELECT l.method FROM "LoginEvent" l
     WHERE l."userId" = u.id AND l.event = 'login_success'
     ORDER BY l."createdAt" DESC LIMIT 1) AS last_login_method
FROM "user" u
LEFT JOIN "Entitlement" e ON e."userId" = u.id;

CREATE OR REPLACE VIEW reporting.activity WITH (security_invoker = true) AS
SELECT
  l."createdAt" AS at,
  'security'::text AS source,
  l.event AS action,
  coalesce(u.email, l.email) AS actor_email,
  coalesce(u.email, l.email) AS target,
  NULL::text AS reason,
  jsonb_strip_nulls(jsonb_build_object(
    'method', l.method, 'ip', l."ipAddress", 'userAgent', l."userAgent")) AS details
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
