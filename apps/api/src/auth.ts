import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db, HttpError } from "./db.js";
import { config } from "./config.js";
import { twoFactor } from "better-auth/plugins";
import { APIError } from "better-auth/api";
import { milestone, assertAccountActive } from "./admin-domain.js";
import { reserveProvider } from "./providers.js";
import { recordHealth } from "./integrations.js";
async function sendMail(to: string, subject: string, url: string) {
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
        text: `${subject}\n\n${url}\n\nIf you did not request this, ignore this email.`,
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
  } else if (!config.production) {
    await db.devMail.create({ data: { to, subject, url } });
    await recordHealth("email", true);
  } else throw new HttpError(503, "Email delivery has not been configured.");
}
export const auth = betterAuth({
  appName: "Whereto",
  plugins: [twoFactor({ allowPasswordless: true, issuer: "Whereto" })],
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await milestone(db, user.id, "account_created");
          if (user.emailVerified)
            await milestone(db, user.id, "email_verified");
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
    },
  },
  database: prismaAdapter(db, { provider: "postgresql" }),
  baseURL: config.APP_URL,
  basePath: "/api/auth",
  secret: config.BETTER_AUTH_SECRET,
  trustedOrigins: [config.APP_URL],
  user: {
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
    sendResetPassword: async ({ user, url }) =>
      sendMail(user.email, "Reset your Whereto password", url),
  },
  emailVerification: {
    afterEmailVerification: async (user) => {
      await milestone(db, user.id, "email_verified");
    },
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) =>
      sendMail(user.email, "Verify your Whereto email", url),
  },
  socialProviders:
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {},
  advanced: {
    useSecureCookies: config.production,
    cookiePrefix: `whereto-${new URL(config.APP_URL).port || "web"}`,
  },
  rateLimit: { enabled: true, window: 60, max: 30 },
});
