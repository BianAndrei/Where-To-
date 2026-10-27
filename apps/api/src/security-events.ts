import { db } from "./db.js";

export type SecurityEvent =
  | "login_success"
  | "login_failed"
  | "login_locked"
  | "logout"
  | "session_expired"
  | "password_changed"
  | "password_reset_requested"
  | "password_reset_completed"
  | "two_factor_required"
  | "two_factor_failed"
  | "two_factor_enabled"
  | "two_factor_disabled"
  | "email_verified";
export const securityEventNames: SecurityEvent[] = [
  "login_success",
  "login_failed",
  "login_locked",
  "logout",
  "session_expired",
  "password_changed",
  "password_reset_requested",
  "password_reset_completed",
  "two_factor_required",
  "two_factor_failed",
  "two_factor_enabled",
  "two_factor_disabled",
  "email_verified",
];
export type SignInMethod = "password" | "google" | "apple" | "email_link";
export type RequestMetadata = {
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
};

// Failures counted per attempted address, whether or not an account exists, so
// the lockout reveals nothing about which emails are registered.
export const LOGIN_MAX_FAILURES = 10;
export const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
// Caps reset emails one address can receive, so nobody can mail-bomb a user.
export const RESET_MAX_REQUESTS = 5;
export const RESET_WINDOW_MS = 60 * 60 * 1000;

// Set by the API from Express's trusted client address; never by the browser.
export const CLIENT_IP_HEADER = "x-whereto-client-ip";
const uuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;

export function normalizeEmail(value: unknown) {
  return typeof value === "string" && value.includes("@")
    ? value.trim().toLowerCase().slice(0, 320)
    : null;
}
export function requestMetadata(headers?: Headers | null): RequestMetadata {
  const requestId = headers?.get("x-request-id");
  return {
    ipAddress: headers?.get(CLIENT_IP_HEADER)?.slice(0, 64) ?? null,
    userAgent: headers?.get("user-agent")?.slice(0, 512) ?? null,
    requestId: requestId && uuid.test(requestId) ? requestId : null,
  };
}
export async function userIdForEmail(email: string | null) {
  if (!email) return null;
  const user = await db.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  return user?.id ?? null;
}
// A lost security event must never break a sign-in, so failures are only logged.
export async function recordSecurityEvent(
  event: SecurityEvent,
  data: RequestMetadata & {
    userId?: string | null;
    email?: string | null;
    method?: SignInMethod | null;
  },
) {
  await db.loginEvent
    .create({
      data: {
        event,
        userId: data.userId ?? null,
        email: data.email ?? null,
        method: data.method ?? null,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
        requestId: data.requestId ?? null,
      },
    })
    .catch(() => console.error(`Failed to persist a ${event} event.`));
}
// Failures since the address last got past the password check or proved it
// owns the inbox with a completed reset.
export async function loginLocked(email: string, now = Date.now()) {
  const since = new Date(now - LOGIN_LOCKOUT_MS);
  const lastPass = await db.loginEvent.findFirst({
    where: {
      email,
      event: {
        in: [
          "login_success",
          "two_factor_required",
          "password_reset_completed",
        ],
      },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const failures = await db.loginEvent.count({
    where: {
      email,
      event: "login_failed",
      createdAt: { gt: lastPass?.createdAt ?? since },
    },
  });
  return failures >= LOGIN_MAX_FAILURES;
}
export async function resetRequestsExhausted(email: string) {
  const requests = await db.loginEvent.count({
    where: {
      email,
      event: "password_reset_requested",
      createdAt: { gte: new Date(Date.now() - RESET_WINDOW_MS) },
    },
  });
  return requests >= RESET_MAX_REQUESTS;
}
