import { db, assert } from "./db.js";
import { config } from "./config.js";

const maximum = (key: string, fallback: number) => {
  const n = Number(process.env[key] ?? fallback);
  return Number.isSafeInteger(n) && n >= 0 ? Math.min(n, 2147483647) : 0;
};
export function integrationSpecs() {
  const s3 = !!(
    process.env.S3_ACCESS_KEY &&
    process.env.S3_SECRET_KEY &&
    process.env.S3_BUCKET
  );
  return [
    {
      id: "geoapify",
      name: "Geoapify",
      configured: !!process.env.GEOAPIFY_API_KEY,
      unit: "reserved credits",
      monthly: false,
      max: maximum("GEOAPIFY_DAILY_CREDITS", 2500),
    },
    {
      id: "groq-tokens",
      name: "Groq",
      configured: !!process.env.GROQ_API_KEY,
      unit: "reserved tokens",
      monthly: false,
      max: maximum("GROQ_DAILY_TOKENS", 180000),
    },
    {
      id: "google-places",
      name: "Google Places",
      configured: !!process.env.GOOGLE_MAPS_API_KEY,
      unit: "discovery sessions",
      monthly: true,
      max: maximum("GOOGLE_PLACES_MONTHLY_REQUESTS", 5000),
    },
    {
      id: "google-routes",
      name: "Google Routes",
      configured: !!process.env.GOOGLE_ROUTES_API_KEY,
      unit: "requests",
      monthly: true,
      max: maximum("GOOGLE_ROUTES_MONTHLY_REQUESTS", 10000),
    },
    {
      id: "stripe",
      name: "Stripe",
      configured: !!process.env.STRIPE_SECRET_KEY,
      unit: "outbound operations",
      monthly: true,
      max: maximum("STRIPE_MONTHLY_OPERATIONS", 10000),
    },
    {
      id: "email",
      name: "Email",
      configured: !!process.env.RESEND_API_KEY || !config.production,
      unit: "messages",
      monthly: true,
      max: maximum("EMAIL_MONTHLY_MESSAGES", 3000),
      mode: process.env.RESEND_API_KEY ? "Resend" : "Local mailbox",
    },
    {
      id: "storage",
      name: "Storage",
      configured: !config.production || s3,
      unit: "written bytes",
      monthly: true,
      max: maximum("STORAGE_MONTHLY_WRITE_BYTES", 1000000000),
      mode: s3 ? "S3 compatible" : "Local files",
    },
  ];
}
export async function checkIntegration(
  provider: string,
  requireConfigured = true,
) {
  const spec = integrationSpecs().find((s) => s.id === provider);
  assert(spec, 400, "Unknown integration.");
  const control = await db.integrationControl.findUnique({
    where: { provider },
  });
  assert(
    !control?.paused,
    503,
    "This integration is temporarily paused. Manual planning remains available.",
    "PROVIDER_PAUSED",
  );
  assert(
    !requireConfigured || spec.configured,
    503,
    "This integration is not configured.",
    "NOT_CONFIGURED",
  );
  return { spec, control };
}
export async function recordHealth(
  provider: string,
  ok: boolean,
  code?: string,
) {
  await db.integrationControl.upsert({
    where: { provider },
    create: {
      provider,
      health: ok ? "available" : "unavailable",
      checkedAt: new Date(),
      errorCode: ok ? null : (code ?? "SERVICE_FAILED"),
    },
    update: {
      health: ok ? "available" : "unavailable",
      checkedAt: new Date(),
      errorCode: ok ? null : (code ?? "SERVICE_FAILED"),
    },
  });
}
export async function integrationSnapshot() {
  const now = new Date();
  const controls = await db.integrationControl.findMany();
  return Promise.all(
    integrationSpecs().map(async (spec) => {
      const control = controls.find((c) => c.provider === spec.id);
      const period = now.toISOString().slice(0, spec.monthly ? 7 : 10);
      const usage = await db.providerUsage.findUnique({
        where: { provider_period: { provider: spec.id, period } },
      });
      const limit = Math.min(spec.max, control?.limit ?? spec.max);
      const reset = spec.monthly
        ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
        : new Date(
            Date.UTC(
              now.getUTCFullYear(),
              now.getUTCMonth(),
              now.getUTCDate() + 1,
            ),
          );
      return {
        ...spec,
        paused: control?.paused ?? false,
        limit,
        used: usage?.used ?? 0,
        resetAt: reset,
        health: !spec.configured
          ? "unavailable"
          : (control?.health ?? "unknown"),
        checkedAt: control?.checkedAt ?? null,
        error: control?.errorCode
          ? "The last application request failed. See jobs for diagnostic IDs."
          : null,
      };
    }),
  );
}
