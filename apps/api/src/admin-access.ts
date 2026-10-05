import type { Request, Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.js";
import { db, assert } from "./db.js";
import { assertAccountActive } from "./admin-domain.js";
import { randomUUID } from "node:crypto";

export const ADMIN_READ_MS = 8 * 60 * 60 * 1000;
export const ADMIN_WRITE_MS = 10 * 60 * 1000;
export async function ownerSession(req: Request) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  assert(session, 401, "Sign in to your owner account.", "UNAUTHENTICATED");
  assert(
    process.env.ADMIN_OWNER_USER_ID &&
      session.user.id === process.env.ADMIN_OWNER_USER_ID,
    403,
    "This account does not have admin access.",
    "ADMIN_FORBIDDEN",
  );
  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { id: true, emailVerified: true, twoFactorEnabled: true },
  });
  assert(
    user.emailVerified,
    403,
    "Verify your email before opening admin.",
    "EMAIL_UNVERIFIED",
  );
  await assertAccountActive(user.id);
  return { ...session, user };
}
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const session = await ownerSession(req);
  const proof = await db.adminProof.findUnique({
    where: { sessionId: session.session.id },
  });
  const age = proof ? Date.now() - proof.verifiedAt.getTime() : Infinity;
  assert(
    session.user.twoFactorEnabled && age < ADMIN_READ_MS,
    403,
    "Verify an authenticator code to open admin.",
    "ADMIN_TOTP_REQUIRED",
  );
  if (!["GET", "HEAD"].includes(req.method))
    assert(
      age < ADMIN_WRITE_MS,
      403,
      "Verify a fresh authenticator code before making this change.",
      "ADMIN_STEP_UP",
    );
  res.locals.admin = session;
  next();
}

// Better Auth's normal login MFA does not prove that an OAuth session passed TOTP.
// This separate proof can only be issued after server-side TOTP verification.
export async function verifyAdminCode(req: Request, code: string) {
  const session = await ownerSession(req);
  assert(
    session.user.twoFactorEnabled,
    409,
    "Finish authenticator setup first.",
    "ADMIN_SETUP_REQUIRED",
  );
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`admin-totp:${session.user.id}`}))`;
    const factor = await tx.twoFactor.findFirst({
      where: { userId: session.user.id, verified: true },
    });
    assert(
      factor,
      403,
      "Set up an authenticator first.",
      "ADMIN_SETUP_REQUIRED",
    );
    assert(
      !factor.lockedUntil || factor.lockedUntil <= new Date(),
      429,
      "Too many incorrect codes. Try again in 10 minutes.",
      "ADMIN_TOTP_LOCKED",
    );
    try {
      await auth.api.verifyTOTP({
        headers: fromNodeHeaders(req.headers),
        body: { code },
      });
    } catch {
      const failures = factor.failedVerificationCount + 1;
      await tx.twoFactor.update({
        where: { id: factor.id },
        data: {
          failedVerificationCount: failures,
          lockedUntil: failures >= 5 ? new Date(Date.now() + 600000) : null,
        },
      });
      await tx.adminAudit.create({
        data: {
          actorId: session.user.id,
          targetId: session.user.id,
          action: "admin.verify",
          reason: "Admin session TOTP verification",
          outcome: "failed",
          requestKey: randomUUID(),
          fingerprint: "verification",
          change: { verified: false },
        },
      });
      return false;
    }
    await tx.twoFactor.update({
      where: { id: factor.id },
      data: { failedVerificationCount: 0, lockedUntil: null },
    });
    await tx.adminProof.upsert({
      where: { sessionId: session.session.id },
      create: { sessionId: session.session.id, verifiedAt: new Date() },
      update: { verifiedAt: new Date() },
    });
    await tx.adminAudit.create({
      data: {
        actorId: session.user.id,
        targetId: session.user.id,
        action: "admin.verify",
        reason: "Admin session TOTP verification",
        outcome: "success",
        requestKey: randomUUID(),
        fingerprint: "verification",
        change: { verified: true },
      },
    });
    return true;
  });
}
