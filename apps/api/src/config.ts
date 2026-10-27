import { resolve } from "node:path";
import { z } from "zod";
const env = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().default(3001),
    APP_URL: z.string().url(),
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    DATA_DIR: z.string().default("../../.data"),
  })
  .passthrough()
  .parse(process.env);
// How many reverse proxies sit in front of the API (nginx in Docker, Vite in
// development). Express then reads the client address from the right end of
// X-Forwarded-For, where a client cannot forge it. Use 2 behind an extra CDN or
// load balancer, or a comma-separated list of proxy addresses/CIDR ranges.
function trustProxy(value = "1") {
  if (/^\d+$/.test(value)) return Number(value);
  if (value === "false") return false;
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}
export const config = {
  ...env,
  dataDir: resolve(env.DATA_DIR),
  production: env.NODE_ENV === "production",
  trustProxy: trustProxy(process.env.TRUST_PROXY),
};
// Development-only inbox readable over HTTP. Anyone who can reach the API can
// read every reset link in it, so it must be switched on deliberately.
export const localMailbox = () =>
  !config.production &&
  !process.env.RESEND_API_KEY &&
  process.env.LOCAL_MAILBOX === "true";
export const featureConfig = () => ({
  googleAuth: !!(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  ),
  // Shows unconnected sign-in buttons as disabled, with setup hints, outside production.
  socialSetupHints: !config.production,
  googlePlaces: !!process.env.GOOGLE_MAPS_API_KEY,
  maps: !!process.env.GEOAPIFY_API_KEY,
  menus: !!process.env.GROQ_API_KEY,
  transit: !!process.env.GOOGLE_ROUTES_API_KEY,
  payments: !!(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_MONTHLY_PRICE_ID &&
    process.env.STRIPE_YEARLY_PRICE_ID
  ),
  localMailbox: localMailbox(),
  // Without a mail provider, development links only reach the API terminal.
  emailSetupHint:
    !config.production && !process.env.RESEND_API_KEY && !localMailbox(),
  monthlyPrice: 5,
  annualPrice: 40,
  freeMenus: 10,
  proMenus: 30,
  freeOnly: true,
});
