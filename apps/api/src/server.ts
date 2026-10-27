import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { ZodError } from "zod";
import { auth } from "./auth.js";
import { config } from "./config.js";
import { api } from "./api.js";
import { stripeWebhook } from "./billing.js";
import { HttpError, db } from "./db.js";
import { admin } from "./admin.js";
import {
  ADMIN_ENROLL_MS,
  isAdminIdentity,
  requireAdmin,
} from "./admin-access.js";
import {
  CLIENT_IP_HEADER,
  recordSecurityEvent,
  requestMetadata,
} from "./security-events.js";
export const app = express();
app.disable("x-powered-by");
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "same-site" },
    contentSecurityPolicy: false,
  }),
);
// Express resolves req.ip from the configured proxy hops. Better Auth reads
// the same value from this header, so a forged X-Forwarded-For cannot give an
// attacker a fresh rate-limit bucket on every request.
app.set("trust proxy", config.trustProxy);
app.use((req, _res, next) => {
  if (req.ip) req.headers[CLIENT_IP_HEADER] = req.ip;
  else delete req.headers[CLIENT_IP_HEADER];
  next();
});
app.post(
  "/api/v1/billing/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
  stripeWebhook,
);
app.use("/api/auth/sign-out", async (req, res, next) => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  if (req.method === "POST" && session)
    res.once("finish", () => {
      if (res.statusCode >= 400) return;
      void recordSecurityEvent("logout", {
        userId: session.user.id,
        email: session.user.email.toLowerCase(),
        ...requestMetadata(fromNodeHeaders(req.headers)),
      });
    });
  next();
});
// Signed in, Better Auth checks authenticator codes without any attempt limit.
// That is only needed while setting up a new authenticator; once one is active,
// sign-in challenges and the admin verification (with its lockout) are the only
// places a code may be tried.
app.use(
  ["/api/auth/two-factor/verify-totp", "/api/auth/two-factor/verify-backup-code"],
  async (req, res, next) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (
      session &&
      (await db.twoFactor.count({
        where: { userId: session.user.id, verified: true },
      }))
    ) {
      res.status(403).json({
        error: "Your authenticator is already active.",
        code: "TWO_FACTOR_ALREADY_VERIFIED",
      });
      return;
    }
    next();
  },
);
// An administrator authenticator cannot be removed using only a password or OAuth session.
app.use(
  [
    "/api/auth/two-factor/disable",
    "/api/auth/two-factor/get-totp-uri",
    "/api/auth/two-factor/generate-backup-codes",
  ],
  async (req, res, next) => {
    const s = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (s && (await isAdminIdentity(s.user.id)))
      await requireAdmin(req, res, next);
    else next();
  },
);
// Admin enrollment needs a fresh sign-in, so an old or stolen session cannot
// attach its own authenticator to an administrator account.
app.use("/api/auth/two-factor/enable", async (req, res, next) => {
  const s = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  if (
    s &&
    (await isAdminIdentity(s.user.id)) &&
    Date.now() - new Date(s.session.createdAt).getTime() >= ADMIN_ENROLL_MS
  ) {
    res.status(403).json({
      error: "Sign out and sign in again before setting up your authenticator.",
      code: "FRESH_LOGIN_REQUIRED",
    });
    return;
  }
  next();
});
app.all("/api/auth/*splat", toNodeHandler(auth));
app.use(
  "/api/v1",
  rateLimit({
    windowMs: 60000,
    limit: 180,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use("/api/v1", (req, res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.origin;
    if (origin && origin !== new URL(config.APP_URL).origin) {
      res.status(403).json({ error: "Request origin is not allowed." });
      return;
    }
    if (!origin && config.production) {
      res.status(403).json({ error: "An Origin header is required." });
      return;
    }
  }
  next();
});
app.use("/api/v1/admin", admin);
app.use("/api/v1", api);
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: error.issues[0]?.message ?? "Invalid request",
        code: "VALIDATION",
        issues: error.issues,
      });
      return;
    }
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message, code: error.code });
      return;
    }
    if (
      error instanceof Error &&
      /outside|Choose|trip has started|Destinations|participant|Move or unschedule|Unknown operation|The day changed|share must/i.test(
        error.message,
      )
    ) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error(
      "Request failed:",
      _req.originalUrl.startsWith("/api/v1/admin")
        ? `admin diagnostic ${res.locals.diagnosticId ?? "unavailable"}`
        : error instanceof Error
          ? error.message
          : "unknown",
    );
    res.status(500).json({
      error: "We could not save this change. Your current plan is safe.",
    });
  },
);
if (process.env.WHERETO_NO_LISTEN !== "true") {
  const server = app.listen(config.PORT, process.env.HOST || "127.0.0.1", () =>
    console.log(`Whereto API ready at http://127.0.0.1:${config.PORT}`),
  );
  process.on("SIGTERM", () => server.close(() => void db.$disconnect()));
}
