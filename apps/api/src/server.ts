import express from "express";
import { randomUUID } from "node:crypto";
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
  isAdminIdentity,
  ownerSession,
  requireAdmin,
} from "./admin-access.js";
export const app = express();
app.disable("x-powered-by");
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "same-site" },
    contentSecurityPolicy: false,
  }),
);
app.post(
  "/api/v1/billing/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
  stripeWebhook,
);
const authRequestMetadata = (req: express.Request) => {
  const suppliedId = req.get("x-request-id");
  return {
    ipAddress: req.ip?.slice(0, 64) ?? null,
    userAgent: req.get("user-agent")?.slice(0, 512) ?? null,
    requestId:
      suppliedId && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(suppliedId)
        ? suppliedId
        : randomUUID(),
  };
};
app.use("/api/auth/sign-in/email", (req, res, next) => {
  if (req.method === "POST")
    res.once("finish", () => {
      if (res.statusCode < 400) return;
      void db.loginEvent
        .create({
          data: {
            event: "login_failed",
            ...authRequestMetadata(req),
          },
        })
        .catch(() => console.error("Failed to persist a failed login event."));
    });
  next();
});
app.use("/api/auth/sign-out", async (req, res, next) => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  if (req.method === "POST" && session)
    res.once("finish", () => {
      if (res.statusCode >= 400) return;
      void db.loginEvent
        .create({
          data: {
            userId: session.user.id,
            event: "logout",
            ...authRequestMetadata(req),
          },
        })
        .catch(() => console.error("Failed to persist a logout event."));
    });
  next();
});
// An administrator authenticator cannot be removed using only a password or OAuth session.
app.use(
  [
    "/api/auth/two-factor/disable",
    "/api/auth/two-factor/get-totp-uri",
    "/api/auth/two-factor/generate-backup-codes",
  ],
  async (req, res, next) => {
    const s = await auth.api.getSession({
      headers: new Headers(
        Object.entries(req.headers).filter(
          ([, v]) => typeof v === "string",
        ) as [string, string][],
      ),
    });
    if (s && (await isAdminIdentity(s.user.id)))
      await requireAdmin(req, res, next);
    else next();
  },
);
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
