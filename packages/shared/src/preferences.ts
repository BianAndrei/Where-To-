import { z } from "zod";

export const preferencesSchema = z
  .object({
    currency: z
      .enum([
        "EUR",
        "GBP",
        "USD",
        "RON",
        "CHF",
        "JPY",
        "AUD",
        "CAD",
        "SGD",
        "THB",
      ])
      .default("EUR"),
    departureCity: z.string().trim().max(120).default(""),
    defaultView: z.enum(["itinerary", "budget"]).default("itinerary"),
    compactNav: z.boolean().default(false),
    reducedMotion: z.boolean().default(false),
    showGuides: z.boolean().default(true),
  })
  .strict();
export type UserPreferences = z.infer<typeof preferencesSchema>;
export const defaultPreferences = preferencesSchema.parse({});
