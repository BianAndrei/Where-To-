ALTER TABLE "user"
ADD COLUMN "role" TEXT NOT NULL DEFAULT 'client';

ALTER TABLE "user"
ADD CONSTRAINT "user_role_check" CHECK ("role" IN ('admin', 'client'));

CREATE TABLE "LoginEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "event" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LoginEvent_event_check" CHECK (
        "event" IN (
            'login_success',
            'login_failed',
            'logout',
            'session_expired',
            'password_changed'
        )
    )
);

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LoginEvent_userId_createdAt_idx"
ON "LoginEvent"("userId", "createdAt");
CREATE INDEX "LoginEvent_event_createdAt_idx"
ON "LoginEvent"("event", "createdAt");
CREATE INDEX "LoginEvent_createdAt_idx"
ON "LoginEvent"("createdAt");

CREATE INDEX "AuditLog_actorId_createdAt_idx"
ON "AuditLog"("actorId", "createdAt");
CREATE INDEX "AuditLog_targetType_targetId_createdAt_idx"
ON "AuditLog"("targetType", "targetId", "createdAt");
CREATE INDEX "AuditLog_action_createdAt_idx"
ON "AuditLog"("action", "createdAt");
CREATE INDEX "AuditLog_createdAt_idx"
ON "AuditLog"("createdAt");
