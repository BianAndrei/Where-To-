-- Every activity row gets a stable id (appended, so existing queries keep
-- working), which table viewers such as Prisma Studio need to list a view.
-- Trip changes now name the trip's owner instead of a raw trip id.
CREATE OR REPLACE VIEW reporting.activity WITH (security_invoker = true) AS
SELECT
  l."createdAt" AS at,
  'security'::text AS source,
  l.event AS action,
  coalesce(u.email, l.email) AS actor_email,
  coalesce(u.email, l.email) AS target,
  NULL::text AS reason,
  jsonb_strip_nulls(jsonb_build_object(
    'method', l.method, 'ip', l."ipAddress", 'userAgent', l."userAgent")) AS details,
  'security:' || l.id AS id
FROM "LoginEvent" l
LEFT JOIN "user" u ON u.id = l."userId"
UNION ALL
SELECT
  a."createdAt",
  'user'::text,
  a.action,
  actor.email,
  coalesce(target.email, 'trip of ' || owner.email, a."targetType" || ':' || a."targetId"),
  NULL::text,
  jsonb_strip_nulls(jsonb_build_object('before', a."before", 'after', a."after")),
  'user:' || a.id
FROM "AuditLog" a
LEFT JOIN "user" actor ON actor.id = a."actorId"
LEFT JOIN "user" target ON a."targetType" = 'user' AND target.id = a."targetId"
LEFT JOIN "Trip" trip ON a."targetType" = 'trip' AND trip.id = a."targetId"
LEFT JOIN "user" owner ON owner.id = trip."ownerId"
UNION ALL
SELECT
  a."createdAt",
  'admin'::text,
  a.action || ' (' || a.outcome || ')',
  actor.email,
  coalesce(target.email, a."targetId"),
  a.reason,
  a.change,
  'admin:' || a.id
FROM "AdminAudit" a
LEFT JOIN "user" actor ON actor.id = a."actorId"
LEFT JOIN "user" target ON target.id = a."targetId";
