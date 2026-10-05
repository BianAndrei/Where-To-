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
export const config = {
  ...env,
  dataDir: resolve(env.DATA_DIR),
  production: env.NODE_ENV === "production",
};
export const featureConfig = () => ({
  googleAuth: !!process.env.GOOGLE_CLIENT_ID,
  googlePlaces: !!process.env.GOOGLE_MAPS_API_KEY,
  maps: !!process.env.GEOAPIFY_API_KEY,
  menus: !!process.env.GROQ_API_KEY,
  transit: !!process.env.GOOGLE_ROUTES_API_KEY,
  payments: !!(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_MONTHLY_PRICE_ID &&
    process.env.STRIPE_YEARLY_PRICE_ID
  ),
  localMailbox: !config.production && !process.env.RESEND_API_KEY,
  monthlyPrice: 5,
  annualPrice: 40,
  freeMenus: 10,
  proMenus: 30,
  freeOnly: true,
});
