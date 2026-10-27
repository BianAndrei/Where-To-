import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db, HttpError } from "./db.js";
import { config, localMailbox } from "./config.js";
import { twoFactor } from "better-auth/plugins";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import {
  deleteSessionCookie,
  expireCookie,
  setSessionCookie,
} from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import { appleProvider } from "./apple-sign-in.js";
import { milestone, recordAudit } from "./admin-domain.js";
import { reserveProvider } from "./providers.js";
import { recordHealth } from "./integrations.js";
import {
  CLIENT_IP_HEADER,
  LOGIN_LOCKOUT_MS,
  loginLocked,
  normalizeEmail,
  recordSecurityEvent,
  requestMetadata,
  resetRequestsExhausted,
  userIdForEmail,
  type SignInMethod,
} from "./security-events.js";
async function sendMail(
  to: string,
  subject: string,
  url: string,
  note = "If you did not request this, ignore this email.",
) {
  await reserveProvider(
    "email",
    1,
    new Date().toISOString().slice(0, 7),
    Number(process.env.EMAIL_MONTHLY_MESSAGES || 3000),
  );
  if (process.env.RESEND_API_KEY) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to,
        subject,
        text: `${subject}\n\n${url}\n\n${note}`,
      }),
    }).catch(async () => {
      await recordHealth("email", false);
      throw new HttpError(
        503,
        "Email delivery is temporarily unavailable.",
        "PROVIDER_UNAVAILABLE",
      );
    });
    await recordHealth("email", response.ok);
    if (!response.ok)
      throw new HttpError(503, "Email delivery is temporarily unavailable.");
  } else if (localMailbox()) {
    await db.devMail.create({ data: { to, subject, url } });
    await recordHealth("email", true);
  } else if (!config.production) {
    // Development without a mail provider: links stay in the API terminal,
    // which only the person running the server can read.
    console.info(`[dev mail] To ${to}: ${subject}\n  ${url}`);
    await recordHealth("email", true);
  } else throw new HttpError(503, "Email delivery has not been configured.");
}
// With a real provider, answer before the email goes out so the response time
// does not reveal whether an address has an account.
async function deliver(task: () => Promise<void>) {
  if (!process.env.RESEND_API_KEY) return task();
  void task().catch(() => console.error("Background email delivery failed."));
}
async function notifyPasswordChanged(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (user)
    await deliver(() =>
      sendMail(
        user.email,
        "Your Whereto password was changed",
        `${config.APP_URL}/login?email=${encodeURIComponent(user.email)}`,
        "If this was not you, reset your password now from the sign-in page and contact support.",
      ),
    );
}
// A changed password must also invalidate any admin authenticator proof.
async function revokeAdminProofs(userId: string) {
  await db.adminProof.deleteMany({ where: { session: { userId } } });
}
const apple = appleProvider();
export const appleSignIn = !!apple;
// Routes that sign someone in without a password: the Google/Apple callback,
// a Google/Apple ID token, and the link in a verification email.
const passwordlessSignIn = (path?: string) =>
  !!path &&
  (path.startsWith("/callback/") ||
    path === "/sign-in/social" ||
    path === "/verify-email");
// The method behind the most recent authenticator challenge, so the sign-in
// it completes is recorded as Google, Apple or password.
async function challengedMethod(userId: string) {
  const challenge = await db.loginEvent.findFirst({
    where: {
      userId,
      event: "two_factor_required",
      createdAt: { gte: new Date(Date.now() - 15 * 60000) },
    },
    orderBy: { createdAt: "desc" },
    select: { method: true },
  });
  return (challenge?.method ?? null) as SignInMethod | null;
}

// Runs after the two-factor plugin, so a correct password that still needs an
// authenticator code is recorded as two_factor_required, not login_success.
const securityEvents = () =>
  ({
    id: "whereto-security-events",
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === "/sign-in/email",
          handler: createAuthMiddleware(async (ctx) => {
            const email = normalizeEmail(ctx.body?.email);
            if (!email || !(await loginLocked(email))) return;
            await recordSecurityEvent("login_locked", {
              email,
              userId: await userIdForEmail(email),
              method: "password",
              ...requestMetadata(ctx.headers),
            });
            throw new APIError("TOO_MANY_REQUESTS", {
              message: `Too many failed sign-in attempts for this account. Wait ${LOGIN_LOCKOUT_MS / 60000} minutes or reset your password.`,
              code: "ACCOUNT_LOCKED",
            });
          }),
        },
        {
          matcher: (ctx) => ctx.path === "/request-password-reset",
          handler: createAuthMiddleware(async (ctx) => {
            const email = normalizeEmail(ctx.body?.email);
            // Same answer as a real request, so the cap reveals nothing.
            if (email && (await resetRequestsExhausted(email)))
              return ctx.json({
                status: true,
                message:
                  "If this email exists in our system, check your email for the reset link",
              });
          }),
        },
      ],
      after: [
        {
          matcher: (ctx) => ctx.path === "/sign-in/email",
          handler: createAuthMiddleware(async (ctx) => {
            const email = normalizeEmail(ctx.body?.email);
            const returned = ctx.context.returned;
            const meta = {
              ...requestMetadata(ctx.headers),
              method: "password" as const,
            };
            if (isAPIError(returned)) {
              // The password matched; the account only needs its email verified.
              if (returned.body?.code === "EMAIL_NOT_VERIFIED") return;
              await recordSecurityEvent("login_failed", {
                email,
                userId: await userIdForEmail(email),
                ...meta,
              });
              return;
            }
            const session = ctx.context.newSession;
            if (session)
              await recordSecurityEvent("login_success", {
                email,
                userId: session.user.id,
                ...meta,
              });
            else if (
              returned &&
              typeof returned === "object" &&
              "twoFactorRedirect" in returned
            )
              await recordSecurityEvent("two_factor_required", {
                email,
                userId: await userIdForEmail(email),
                ...meta,
              });
          }),
        },
        {
          // Sign-in challenges only; signed-in calls are enrollment or admin checks.
          matcher: (ctx) =>
            ctx.path === "/two-factor/verify-totp" ||
            ctx.path === "/two-factor/verify-backup-code",
          handler: createAuthMiddleware(async (ctx) => {
            if (ctx.context.session) return;
            const meta = requestMetadata(ctx.headers);
            const session = ctx.context.newSession;
            if (!isAPIError(ctx.context.returned) && session) {
              await recordSecurityEvent("login_success", {
                email: session.user.email.toLowerCase(),
                userId: session.user.id,
                method: await challengedMethod(session.user.id),
                ...meta,
              });
              return;
            }
            const challenge = await ctx.getSignedCookie(
              ctx.context.createAuthCookie("two_factor").name,
              ctx.context.secret,
            );
            const pending = challenge
              ? await ctx.context.internalAdapter.findVerificationValue(
                  challenge,
                )
              : null;
            await recordSecurityEvent("two_factor_failed", {
              userId: pending?.value ?? null,
              ...meta,
            });
          }),
        },
        {
          // Better Auth asks for the authenticator only after a password. A
          // Google, Apple or email-link sign-in gets the same challenge here,
          // so it can't be used to skip someone's two-factor protection.
          matcher: (ctx) => passwordlessSignIn(ctx.path),
          handler: createAuthMiddleware(async (ctx) => {
            const session = ctx.context.newSession;
            if (!session) return;
            const provider = ctx.params?.id ?? ctx.body?.provider;
            const event = {
              userId: session.user.id,
              email: session.user.email.toLowerCase(),
              method: (ctx.path === "/verify-email"
                ? "email_link"
                : ["google", "apple"].includes(provider)
                  ? provider
                  : null) as SignInMethod | null,
              ...requestMetadata(ctx.headers),
            };
            // Google and Apple always keep people signed in, even if an earlier
            // password sign-in on this browser left "don't remember me" behind.
            const keepSignedIn =
              event.method === "google" || event.method === "apple";
            if (keepSignedIn)
              expireCookie(ctx, ctx.context.authCookies.dontRememberToken);
            if (!session.user.twoFactorEnabled) {
              if (keepSignedIn) await setSessionCookie(ctx, session, false);
              await recordSecurityEvent("login_success", event);
              return;
            }
            // Mirrors the two-factor plugin's own challenge (Better Auth 1.7):
            // the cookie and verification rows /two-factor/verify-* expect.
            deleteSessionCookie(ctx, true);
            await ctx.context.internalAdapter.deleteSession(
              session.session.token,
            );
            ctx.context.setNewSession(null);
            const maxAge = 600;
            const cookie = ctx.context.createAuthCookie("two_factor", {
              maxAge,
            });
            const identifier = `2fa-${generateRandomString(20)}`;
            const expiresAt = new Date(Date.now() + maxAge * 1000);
            await ctx.context.internalAdapter.createVerificationValue({
              value: session.user.id,
              identifier,
              expiresAt,
            });
            await ctx.context.internalAdapter.createVerificationValue({
              value: "0",
              identifier: `2fa-attempts-${identifier}`,
              expiresAt,
            });
            await ctx.setSignedCookie(
              cookie.name,
              identifier,
              ctx.context.secret,
              cookie.attributes,
            );
            await recordSecurityEvent("two_factor_required", event);
            const location = ctx.context.responseHeaders?.get("location");
            if (!location)
              return ctx.json({
                twoFactorRedirect: true,
                twoFactorMethods: ["totp"],
              });
            const target = new URL(location, config.APP_URL);
            const next =
              target.origin === new URL(config.APP_URL).origin
                ? target.pathname + target.search
                : "/app";
            throw ctx.redirect(
              `${config.APP_URL}/two-factor?next=${encodeURIComponent(next)}`,
            );
          }),
        },
        {
          matcher: (ctx) => ctx.path === "/request-password-reset",
          handler: createAuthMiddleware(async (ctx) => {
            if (isAPIError(ctx.context.returned)) return;
            const email = normalizeEmail(ctx.body?.email);
            await recordSecurityEvent("password_reset_requested", {
              email,
              userId: await userIdForEmail(email),
              ...requestMetadata(ctx.headers),
            });
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;

export const auth = betterAuth({
  appName: "Whereto",
  plugins: [
    twoFactor({ allowPasswordless: true, issuer: "Whereto" }),
    securityEvents(),
  ],
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await milestone(db, user.id, "account_created");
          if (user.emailVerified)
            await milestone(db, user.id, "email_verified");
          await recordAudit(
            db,
            user.id,
            "user",
            user.id,
            "account.created",
            undefined,
            { role: "client" },
          );
        },
      },
      update: {
        after: async (user, ctx) => {
          await recordAudit(
            db,
            user.id,
            "user",
            user.id,
            "account.updated",
            undefined,
            { updated: true },
          );
          // Better Auth only writes twoFactorEnabled on these two routes.
          const event =
            ctx?.path === "/two-factor/verify-totp" && user.twoFactorEnabled
              ? "two_factor_enabled"
              : ctx?.path === "/two-factor/disable"
                ? "two_factor_disabled"
                : null;
          if (event)
            await recordSecurityEvent(event, {
              userId: user.id,
              email: user.email.toLowerCase(),
              ...requestMetadata(ctx?.headers),
            });
        },
      },
    },
    account: {
      update: {
        after: async (account, ctx) => {
          if (account.providerId !== "credential") return;
          await recordSecurityEvent("password_changed", {
            userId: account.userId,
            email: (
              await db.user.findUnique({
                where: { id: account.userId },
                select: { email: true },
              })
            )?.email.toLowerCase(),
            ...requestMetadata(ctx?.headers),
          });
          await recordAudit(
            db,
            account.userId,
            "user",
            account.userId,
            "security.password_changed",
            undefined,
            { changed: true },
          );
          await revokeAdminProofs(account.userId);
          await notifyPasswordChanged(account.userId);
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const account = await db.user.findUnique({
            where: { id: session.userId },
            select: { suspendedAt: true },
          });
          if (!account || account.suspendedAt)
            throw new APIError("FORBIDDEN", {
              message:
                "This account is temporarily suspended. Saved data is preserved.",
            });
          return { data: session };
        },
      },
      delete: {
        after: async (session) => {
          if (session.expiresAt <= new Date())
            await recordSecurityEvent("session_expired", {
              userId: session.userId,
              ipAddress: session.ipAddress?.slice(0, 64),
              userAgent: session.userAgent?.slice(0, 512),
            });
        },
      },
    },
  },
  database: prismaAdapter(db, { provider: "postgresql" }),
  baseURL: config.APP_URL,
  basePath: "/api/auth",
  // "Keep me logged in" (and Google/Apple): 30 days, renewed daily while in
  // use. Without it, the cookie ends with the browser and the session after
  // at most a day.
  session: {
    expiresIn: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  secret: config.BETTER_AUTH_SECRET,
  // Apple returns from its sign-in page with a form POST from this origin.
  trustedOrigins: [
    config.APP_URL,
    ...(apple ? ["https://appleid.apple.com"] : []),
  ],
  account: {
    // Google/Apple tokens are kept only in encrypted form.
    encryptOAuthTokens: true,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "client",
        input: false,
      },
    },
    changeEmail: {
      enabled: true,
      sendChangeEmailConfirmation: async ({ user, url }) =>
        sendMail(user.email, "Confirm your Whereto email change", url),
    },
  },
  emailAndPassword: {
    enabled: true,
    revokeSessionsOnPasswordReset: true,
    requireEmailVerification: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    sendResetPassword: async ({ user, url }) =>
      deliver(() => sendMail(user.email, "Reset your Whereto password", url)),
    // Resets update the password through a bulk write that skips the account
    // hook above, so they are recorded here.
    onPasswordReset: async ({ user }, request) => {
      await recordSecurityEvent("password_reset_completed", {
        userId: user.id,
        email: user.email.toLowerCase(),
        ...requestMetadata(request?.headers),
      });
      await recordAudit(
        db,
        user.id,
        "user",
        user.id,
        "security.password_reset",
        undefined,
        { reset: true },
      );
      await revokeAdminProofs(user.id);
      await notifyPasswordChanged(user.id);
    },
    // Someone tried to sign up with an existing address. The response is the
    // same as a new signup; the real owner hears about it.
    onExistingUserSignUp: async ({ user }) =>
      deliver(() =>
        sendMail(
          user.email,
          "Someone tried to create a Whereto account with your email",
          `${config.APP_URL}/login?email=${encodeURIComponent(user.email)}`,
          "You already have an account. If this was you, sign in or reset your password. Otherwise you can ignore this email.",
        ),
      ),
  },
  emailVerification: {
    afterEmailVerification: async (user, request) => {
      await milestone(db, user.id, "email_verified");
      await recordSecurityEvent("email_verified", {
        userId: user.id,
        email: user.email.toLowerCase(),
        ...requestMetadata(request?.headers),
      });
    },
    sendOnSignUp: true,
    // Signing in with the right password before verifying sends a fresh link,
    // so an expired or lost one is never a dead end.
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) =>
      sendMail(user.email, "Verify your Whereto email", url),
  },
  // Callbacks: ${APP_URL}/api/auth/callback/google and /callback/apple.
  socialProviders: {
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
    ...(apple ? { apple } : {}),
  },
  advanced: {
    useSecureCookies: config.production,
    cookiePrefix: `whereto-${new URL(config.APP_URL).port || "web"}`,
    // Written by server.ts from Express's trusted proxy chain. Better Auth's
    // default X-Forwarded-For header can be set to anything by the browser.
    ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
  },
  rateLimit: { enabled: true, window: 60, max: 30 },
});
