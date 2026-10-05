import type { Request } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.js";
import { assert, db } from "./db.js";
import type { TripState } from "@whereto/shared";
import { assertAccountActive, creditBalance, type Tx } from "./admin-domain.js";
export async function sessionUser(req: Request) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  assert(session?.user, 401, "Sign in to continue.", "UNAUTHENTICATED");
  assert(
    session.user.emailVerified,
    403,
    "Verify your email before creating or editing trips.",
    "EMAIL_UNVERIFIED",
  );
  await assertAccountActive(session.user.id);
  return session.user;
}
export async function tripAccess(tripId: string, userId: string, edit = false) {
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    include: { members: true },
  });
  assert(trip, 404, "Trip not found.");
  await assertAccountActive(trip.ownerId);
  const role =
    trip.ownerId === userId
      ? "owner"
      : trip.members.find((m) => m.userId === userId)?.role;
  assert(role, 404, "Trip not found.");
  assert(
    !edit || role === "owner" || role === "editor",
    403,
    "This trip is shared for viewing only.",
  );
  return {
    ...trip,
    state: trip.state as unknown as TripState,
    role: role as "owner" | "editor" | "viewer",
  };
}
export function hasPro(
  e: { paidUntil: Date | null; subscriptionStatus: string } | null,
) {
  return (
    !!e?.paidUntil &&
    e.paidUntil > new Date() &&
    ["active", "trialing"].includes(e.subscriptionStatus)
  );
}
export function quotaBucket(
  e: { subscriptionStart: Date | null } | null,
  now = new Date(),
) {
  if (!e?.subscriptionStart) return "free";
  const start = e.subscriptionStart;
  let y = now.getUTCFullYear(),
    m = now.getUTCMonth();
  const clamped = (y: number, m: number) =>
    Math.min(start.getUTCDate(), new Date(Date.UTC(y, m + 1, 0)).getUTCDate());
  let boundary = new Date(
    Date.UTC(
      y,
      m,
      clamped(y, m),
      start.getUTCHours(),
      start.getUTCMinutes(),
      start.getUTCSeconds(),
    ),
  );
  if (boundary > now) {
    m--;
    boundary = new Date(
      Date.UTC(
        y,
        m,
        clamped(y, m),
        start.getUTCHours(),
        start.getUTCMinutes(),
        start.getUTCSeconds(),
      ),
    );
  }
  return `pro:${boundary.toISOString().slice(0, 10)}`;
}
export async function menuAllowance(
  ownerId: string,
  isFree: boolean,
  tx: Tx = db,
) {
  const entitlement = await tx.entitlement.findUnique({
    where: { userId: ownerId },
  });
  const pro = hasPro(entitlement);
  const bucket = pro ? quotaBucket(entitlement) : "free";
  const max = pro ? 30 : isFree ? 10 : 0;
  const used = await tx.menu.count({ where: { ownerId, quotaBucket: bucket } });
  const bonus = await creditBalance(tx, ownerId, "menu");
  const normalRemaining = Math.max(0, max - used);
  return {
    bucket,
    limit: max,
    used,
    bonus,
    normalRemaining,
    remaining: normalRemaining + bonus,
    pro,
  };
}
