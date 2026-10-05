-- AlterTable
ALTER TABLE "Entitlement" ADD COLUMN     "billingInterval" TEXT,
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "lastPaymentStatus" TEXT,
ADD COLUMN     "stripeSyncedAt" TIMESTAMP(3),
ADD COLUMN     "unitAmount" INTEGER;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "errorCode" TEXT,
ADD COLUMN     "finishedAt" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StripeEvent" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "errorCode" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'processed',
ADD COLUMN     "subscriptionId" TEXT,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'legacy',
ALTER COLUMN "processedAt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "funding" TEXT NOT NULL DEFAULT 'subscription';

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "twoFactor" (
    "id" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "backupCodes" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT true,
    "failedVerificationCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "twoFactor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminProof" (
    "sessionId" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminProof_pkey" PRIMARY KEY ("sessionId")
);

-- CreateTable
CREATE TABLE "CreditGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "consumed" INTEGER NOT NULL DEFAULT 0,
    "revoked" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditUse" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "resourceKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditUse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAudit" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "change" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationControl" (
    "provider" TEXT NOT NULL,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "limit" INTEGER,
    "checkedAt" TIMESTAMP(3),
    "health" TEXT NOT NULL DEFAULT 'unknown',
    "errorCode" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationControl_pkey" PRIMARY KEY ("provider")
);

-- CreateTable
CREATE TABLE "JobAttempt" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'processing',
    "errorCode" TEXT,

    CONSTRAINT "JobAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerHeartbeat" (
    "id" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "twoFactor_userId_idx" ON "twoFactor"("userId");

-- CreateIndex
CREATE INDEX "CreditGrant_userId_kind_createdAt_idx" ON "CreditGrant"("userId", "kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditUse_resourceKey_key" ON "CreditUse"("resourceKey");

-- CreateIndex
CREATE INDEX "CreditUse_grantId_idx" ON "CreditUse"("grantId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminAudit_requestKey_key" ON "AdminAudit"("requestKey");

-- CreateIndex
CREATE INDEX "AdminAudit_targetId_createdAt_idx" ON "AdminAudit"("targetId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAudit_action_createdAt_idx" ON "AdminAudit"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAudit_createdAt_idx" ON "AdminAudit"("createdAt");

-- CreateIndex
CREATE INDEX "JobAttempt_jobId_startedAt_idx" ON "JobAttempt"("jobId", "startedAt");

-- CreateIndex
CREATE INDEX "Milestone_event_createdAt_idx" ON "Milestone"("event", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Milestone_userId_event_key" ON "Milestone"("userId", "event");

-- CreateIndex
CREATE INDEX "StripeEvent_status_createdAt_idx" ON "StripeEvent"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "twoFactor" ADD CONSTRAINT "twoFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminProof" ADD CONSTRAINT "AdminProof_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditGrant" ADD CONSTRAINT "CreditGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditUse" ADD CONSTRAINT "CreditUse_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "CreditGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAttempt" ADD CONSTRAINT "JobAttempt_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve the funding provenance of existing free trips.
UPDATE "Trip" SET "funding" = 'free' WHERE "isFree" = true;
ALTER TABLE "CreditGrant" ADD CONSTRAINT "CreditGrant_balance_check" CHECK ("quantity" > 0 AND "consumed" >= 0 AND "revoked" >= 0 AND "consumed" + "revoked" <= "quantity");
ALTER TABLE "CreditGrant" ADD CONSTRAINT "CreditGrant_kind_check" CHECK ("kind" IN ('trip', 'menu'));
ALTER TABLE "IntegrationControl" ADD CONSTRAINT "IntegrationControl_limit_check" CHECK ("limit" IS NULL OR "limit" >= 0);

