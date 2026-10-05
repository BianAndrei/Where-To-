import { db, HttpError, assert } from "./db.js";
import { assertAccountActive, diagnostic, milestone } from "./admin-domain.js";
import { checkIntegration, recordHealth } from "./integrations.js";
import { getQueue } from "./queue.js";
import { menuAllowance } from "./access.js";

export async function jobDependencies(
  type: string,
  ownerId: string,
  isFree: boolean,
) {
  await assertAccountActive(ownerId);
  await checkIntegration(type === "menu" ? "groq-tokens" : "geoapify");
  await checkIntegration("storage");
  if (type === "menu" && (await menuAllowance(ownerId, isFree)).remaining <= 0)
    throw new HttpError(
      402,
      "No menu allowance or bonus credits remain.",
      "CREDIT_EXHAUSTED",
    );
}
export async function claimJob(id: string) {
  const job = await db.job.findUniqueOrThrow({
    where: { id },
    include: { trip: true },
  });
  if (!["queued", "waiting"].includes(job.status)) return null;
  try {
    await assertAccountActive(job.trip.ownerId);
    if (job.type === "menu") {
      const sourceHash = (job.input as any)?.sourceHash;
      if (typeof sourceHash === "string") {
        const existing = await db.menu.findUnique({
          where: { tripId_sourceHash: { tripId: job.tripId, sourceHash } },
        });
        if (existing) {
          await db.job.updateMany({
            where: { id, status: { in: ["queued", "waiting", "failed"] } },
            data: {
              status: "completed",
              output: { menuId: existing.id },
              finishedAt: new Date(),
              error: null,
              errorCode: null,
            },
          });
          return null;
        }
      }
    }
    await jobDependencies(job.type, job.trip.ownerId, job.trip.isFree);
  } catch (error) {
    const code = error instanceof HttpError ? error.code : "NOT_CONFIGURED";
    await db.job.updateMany({
      where: { id, status: { in: ["queued", "waiting"] } },
      data: {
        status: code === "PROVIDER_PAUSED" ? "waiting" : "failed",
        errorCode: code,
        error: diagnostic(code),
      },
    });
    return null;
  }
  return db.$transaction(async (tx) => {
    const startedAt = new Date();
    const claimed = await tx.job.updateMany({
      where: { id, status: { in: ["queued", "waiting"] } },
      data: {
        status: "processing",
        startedAt,
        finishedAt: null,
        error: null,
        errorCode: null,
      },
    });
    if (!claimed.count) return null;
    const attempt = await tx.jobAttempt.create({
      data: { jobId: id, startedAt },
    });
    return { ...job, attemptId: attempt.id };
  });
}
export async function finishAttempt(id: string, attemptId: string) {
  const job = await db.job.findUniqueOrThrow({
    where: { id },
    select: {
      status: true,
      startedAt: true,
      errorCode: true,
      type: true,
      trip: { select: { ownerId: true } },
    },
  });
  const code =
    job.status === "completed"
      ? null
      : (job.errorCode ??
        (job.type === "menu" ? "MENU_FAILED" : "EXPORT_FAILED"));
  const attempt = await db.jobAttempt.findUniqueOrThrow({
    where: { id: attemptId },
  });
  const currentAttempt =
    job.startedAt?.getTime() === attempt.startedAt.getTime();
  await db.$transaction(async (tx) => {
    await tx.job.updateMany({
      where: { id, startedAt: attempt.startedAt },
      data: { finishedAt: new Date(), errorCode: code },
    });
    await tx.jobAttempt.update({
      where: { id: attemptId },
      data: {
        status: currentAttempt ? job.status : "failed",
        finishedAt: new Date(),
        errorCode: code,
      },
    });
    if (job.status === "completed" && job.type === "export")
      await milestone(tx, job.trip.ownerId, "first_export");
  });
}
export async function dispatchJob(id: string, type: string) {
  try {
    await (
      await getQueue()
    ).send(
      type === "menu" ? "menu-import" : "trip-export",
      { id },
      { retryLimit: 0 },
    );
  } catch {
    await db.job.updateMany({
      where: { id, status: "queued" },
      data: {
        status: "failed",
        errorCode: "DISPATCH_FAILED",
        error: diagnostic("DISPATCH_FAILED"),
      },
    });
    throw new HttpError(503, diagnostic("DISPATCH_FAILED")!, "DISPATCH_FAILED");
  }
}
// Queued rows are durable dispatch intents. A duplicate delivery cannot claim an active job.
export async function recoverDispatches() {
  const jobs = await db.job.findMany({
    where: {
      OR: [
        { status: "queued", updatedAt: { lt: new Date(Date.now() - 30000) } },
        { status: "waiting", errorCode: "PROVIDER_PAUSED" },
      ],
    },
    take: 20,
    orderBy: { createdAt: "asc" },
    include: { trip: { select: { ownerId: true, isFree: true } } },
  });
  for (const job of jobs) {
    try {
      await jobDependencies(job.type, job.trip.ownerId, job.trip.isFree);
      const updated = await db.job.updateMany({
        where: { id: job.id, status: job.status },
        data: { status: "queued", error: null, errorCode: null },
      });
      if (updated.count) await dispatchJob(job.id, job.type);
    } catch {
      /* Paused work stays recoverable; the dashboard reports its state. */
    }
  }
}
