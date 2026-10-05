import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db, assert } from "./db.js";

export type Tx = Prisma.TransactionClient;
export async function milestone(tx: Tx, userId: string, event: string) {
  // Legacy accounts may have earlier firsts that were never recorded.
  if (
    event.startsWith("first_") &&
    !(await tx.milestone.count({ where: { userId, event: "account_created" } }))
  )
    return;
  await tx.milestone.upsert({
    where: { userId_event: { userId, event } },
    create: { userId, event },
    update: {},
  });
}
export async function creditBalance(tx: Tx, userId: string, kind: string) {
  const totals = await tx.creditGrant.aggregate({
    where: { userId, kind },
    _sum: { quantity: true, consumed: true, revoked: true },
  });
  return (
    (totals._sum.quantity ?? 0) -
    (totals._sum.consumed ?? 0) -
    (totals._sum.revoked ?? 0)
  );
}
// Every grant, revocation and consumption holds this same per-account lock.
export async function accountLock(tx: Tx, userId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
}
export async function consumeCredit(
  tx: Tx,
  userId: string,
  kind: string,
  resourceKey: string,
) {
  await accountLock(tx, userId);
  const previous = await tx.creditUse.findUnique({ where: { resourceKey } });
  if (previous) return previous;
  const grants = await tx.creditGrant.findMany({
    where: { userId, kind },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const grant = grants.find((g) => g.quantity > g.consumed + g.revoked);
  assert(grant, 402, "No bonus credits remain.", "CREDIT_EXHAUSTED");
  await tx.creditGrant.update({
    where: { id: grant.id },
    data: { consumed: { increment: 1 } },
  });
  return tx.creditUse.create({ data: { grantId: grant.id, resourceKey } });
}
export async function assertAccountActive(userId: string, tx: Tx = db) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { suspendedAt: true },
  });
  assert(
    user && !user.suspendedAt,
    403,
    "This account is temporarily suspended. Its saved data is preserved.",
    "ACCOUNT_SUSPENDED",
  );
}
export function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function diagnostic(code: string | null) {
  const messages: Record<string, string> = {
    PROVIDER_PAUSED:
      "A required integration is paused. Resume it before retrying.",
    PROVIDER_QUOTA:
      "The application allowance was reached. Wait for its reset.",
    NOT_CONFIGURED: "A required integration is not configured on the server.",
    ACCOUNT_SUSPENDED: "The trip owner is suspended. Data has been preserved.",
    CREDIT_EXHAUSTED:
      "The account has no remaining menu allowance or bonus credits.",
    MENU_FAILED:
      "The menu could not be verified. The owner can try another source or enter an estimate.",
    EXPORT_FAILED:
      "The export could not finish. Check map and storage availability.",
    DISPATCH_FAILED:
      "The queue did not accept the operation. Check the worker and retry.",
    STRIPE_SYNC_FAILED:
      "Stripe state could not be refreshed. Check its configuration and retry.",
  };
  return code
    ? (messages[code] ??
        "The operation could not finish. Use its diagnostic ID for investigation.")
    : null;
}
