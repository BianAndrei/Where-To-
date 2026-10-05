import { createHmac, timingSafeEqual } from "node:crypto";
import { locationSchema, type Place } from "@whereto/shared";
import { db, assert, HttpError } from "./db.js";
import { config } from "./config.js";
import { catalogue } from "./catalogue.js";
import { checkIntegration, recordHealth } from "./integrations.js";
export function signPlace(place: Place): Place {
  const { token, ...value } = place;
  return {
    ...value,
    token: createHmac("sha256", config.BETTER_AUTH_SECRET)
      .update(JSON.stringify(value))
      .digest("hex"),
  };
}
export function trustedPlace(input: Place) {
  const place = locationSchema.parse(input);
  if (place.source === "catalogue") {
    const canonical = catalogue.find((p) => p.id === place.id);
    assert(canonical, 400, "Choose a destination from search results.");
    return canonical;
  }
  const expected = signPlace({ ...place, token: undefined }).token!;
  assert(
    place.token &&
      place.token.length === expected.length &&
      timingSafeEqual(Buffer.from(place.token), Buffer.from(expected)),
    400,
    "Search and select the destination again.",
  );
  return place;
}
export async function reserveProvider(
  provider: string,
  units: number,
  period: string,
  limit: number,
) {
  const { control, spec } = await checkIntegration(provider, false);
  limit = Math.min(limit, spec.max, control?.limit ?? spec.max);
  assert(
    Number.isSafeInteger(units) && units > 0,
    400,
    "Invalid usage reservation.",
  );
  assert(
    Number.isSafeInteger(limit) && limit > 0,
    503,
    "This service is paused until its free quota is configured.",
    "PROVIDER_PAUSED",
  );
  await db.providerUsage.createMany({
    data: [{ id: `${provider}:${period}`, provider, period, used: 0 }],
    skipDuplicates: true,
  });
  const result = await db.providerUsage.updateMany({
    where: { provider, period, used: { lte: limit - units } },
    data: { used: { increment: units } },
  });
  assert(
    result.count === 1,
    429,
    "The shared free allowance has been reached. Try again after the quota resets; manual planning is still available.",
    "PROVIDER_QUOTA",
  );
}
export const dayPeriod = () => new Date().toISOString().slice(0, 10);
export async function geoRequest(
  path: string,
  params: Record<string, string>,
  units = 1,
) {
  assert(
    process.env.GEOAPIFY_API_KEY,
    503,
    "Map services are not connected yet. You can still add places manually.",
    "NOT_CONFIGURED",
  );
  await reserveProvider(
    "geoapify",
    units,
    dayPeriod(),
    Number(process.env.GEOAPIFY_DAILY_CREDITS || 2500),
  );
  const url = new URL(`https://api.geoapify.com/v1/${path}`);
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  url.searchParams.set("apiKey", process.env.GEOAPIFY_API_KEY);
  const result = await fetch(url, { signal: AbortSignal.timeout(15000) }).catch(
    async () => {
      await recordHealth("geoapify", false);
      throw new HttpError(
        503,
        "Map service is temporarily unavailable.",
        "PROVIDER_UNAVAILABLE",
      );
    },
  );
  await recordHealth("geoapify", result.ok);
  if (result.status === 429)
    throw new HttpError(
      429,
      "Map service free allowance reached.",
      "PROVIDER_QUOTA",
    );
  assert(result.ok, 503, "Map service is temporarily unavailable.");
  return result.json();
}
export async function searchPlaces(q: string, cities = false, bias?: string) {
  if (!process.env.GEOAPIFY_API_KEY)
    return {
      places: catalogue
        .filter((p) =>
          `${p.name} ${p.country}`.toLowerCase().includes(q.toLowerCase()),
        )
        .slice(0, 10)
        .map(signPlace),
      source: "catalogue",
      notice: cities
        ? "Offline city directory. Connect Geoapify to search more destinations."
        : "Live place search is not connected. Use an address or place a pin manually.",
    };
  const data = await geoRequest("geocode/search", {
    text: q,
    format: "json",
    limit: "8",
    ...(cities ? { type: "city" } : {}),
    ...(bias ? { bias: `proximity:${bias}` } : {}),
  });
  return {
    places: (data.results ?? [])
      .filter((r: any) => r.timezone?.name)
      .map((r: any) =>
        signPlace({
          id: r.place_id,
          name: cities
            ? (r.city ?? r.name ?? r.formatted)
            : (r.name ?? r.formatted),
          country: r.country ?? "",
          lat: r.lat,
          lon: r.lon,
          timezone: r.timezone.name,
          source: "geoapify",
        }),
      ),
    source: "geoapify",
  };
}
export async function route(a: Place, b: Place, mode = "walk") {
  const data = await geoRequest("routing", {
    waypoints: `${a.lat},${a.lon}|${b.lat},${b.lon}`,
    mode: mode === "drive" ? "drive" : "walk",
  });
  const feature = data.features?.[0];
  assert(feature, 404, "No route found.");
  return {
    minutes: feature.properties.time / 60,
    distanceKm: feature.properties.distance / 1000,
    geometry: feature.geometry,
    attribution: "© Geoapify © OpenStreetMap contributors",
  };
}
export async function transit(
  a: Place,
  b: Place,
  departure: string,
  mode: "train" | "bus" = "train",
) {
  assert(
    process.env.GOOGLE_ROUTES_API_KEY,
    503,
    "Train search is not connected. Add your ticket details manually or check your operator.",
    "NOT_CONFIGURED",
  );
  await reserveProvider(
    "google-routes",
    1,
    new Date().toISOString().slice(0, 7),
    Number(process.env.GOOGLE_ROUTES_MONTHLY_REQUESTS || 10000),
  );
  const response = await fetch(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": process.env.GOOGLE_ROUTES_API_KEY,
        "X-Goog-FieldMask":
          "routes.duration,routes.legs.steps.transitDetails,routes.travelAdvisory.transitFare",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: a.lat, longitude: a.lon } } },
        destination: {
          location: { latLng: { latitude: b.lat, longitude: b.lon } },
        },
        travelMode: "TRANSIT",
        departureTime: departure,
        transitPreferences: {
          allowedTravelModes:
            mode === "bus" ? ["BUS"] : ["TRAIN", "SUBWAY", "LIGHT_RAIL"],
        },
        computeAlternativeRoutes: true,
      }),
      signal: AbortSignal.timeout(15000),
    },
  ).catch(async () => {
    await recordHealth("google-routes", false);
    throw new HttpError(
      503,
      "Train information is temporarily unavailable.",
      "PROVIDER_UNAVAILABLE",
    );
  });
  await recordHealth("google-routes", response.ok);
  assert(
    response.ok,
    503,
    "Train information is currently unavailable for this route or date.",
  );
  return response.json();
}
