import { createHmac, timingSafeEqual } from "node:crypto";
import { locationSchema, type Place } from "@whereto/shared";
import { db, assert, HttpError } from "./db.js";
import { config } from "./config.js";
import { catalogue } from "./catalogue.js";
import tzlookup from "tz-lookup";
import { suggestPlaceName } from "./place-suggest.js";
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
const nominatimCache = new Map<string, { at: number; places: Place[] }>();
let nominatimQueue: Promise<unknown> = Promise.resolve();
const regionTypes = new Set([
  "state",
  "region",
  "province",
  "county",
  "state_district",
  "territory",
  "island",
  "archipelago",
]);
const cityTypes = new Set([
  "city",
  "town",
  "village",
  "municipality",
  "hamlet",
  "suburb",
  "city_district",
  "borough",
  "district",
  "quarter",
]);
function placeKind(type: unknown): Place["kind"] | undefined {
  if (type === "country") return "country";
  if (typeof type !== "string") return undefined;
  if (regionTypes.has(type)) return "region";
  if (cityTypes.has(type)) return "city";
  return undefined;
}
const attractionCategories = new Set([
  "tourism",
  "historic",
  "natural",
  "man_made",
  "leisure",
]);
function osmKind(r: any): Place["kind"] | undefined {
  const direct = placeKind(r.addresstype ?? r.type);
  if (direct) return direct;
  if (r.category === "boundary" && r.type === "national_park") return "place";
  if (r.addresstype === "locality" || r.type === "locality") return "place";
  return attractionCategories.has(r.category) ? "place" : undefined;
}
async function nominatimSearch(q: string, cities: boolean) {
  const key = `${cities}:${q.trim().toLowerCase()}`;
  const hit = nominatimCache.get(key);
  if (hit && Date.now() - hit.at < 3_600_000) return hit.places;
  // Nominatim's public policy allows at most one request per second.
  const run = nominatimQueue.then(async () => {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "8");
    if (cities) url.searchParams.set("layer", "address,natural,poi");
    const response = await fetch(url, {
      headers: {
        "User-Agent": `Whereto/1.0 (${config.APP_URL})`,
        "Accept-Language": "en",
      },
      signal: AbortSignal.timeout(10000),
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (!response.ok) throw new Error(`Nominatim ${response.status}`);
    return (await response.json()) as any[];
  });
  nominatimQueue = run.catch(() => undefined);
  const rows = await run;
  const seen = new Set<string>();
  const places: Place[] = [];
  for (const r of rows) {
    const lat = Number(r.lat),
      lon = Number(r.lon);
    let timezone: string;
    try {
      timezone = tzlookup(lat, lon);
    } catch {
      continue;
    }
    const a = r.address ?? {};
    const kind = cities ? osmKind(r) : "place";
    if (cities && !kind) continue;
    const name = cities
      ? (r.name || a[r.addresstype] || String(r.display_name).split(",")[0])
      : (r.name || String(r.display_name).split(",")[0]);
    if (!name) continue;
    const country = a.country ?? "";
    const region =
      kind === "country"
        ? undefined
        : (a.state ?? a.region ?? a.province ?? a.county ?? undefined);
    const dedupe = `${name}|${region ?? ""}|${country}|${kind}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    places.push(
      signPlace({
        id: `osm-${r.osm_type}-${r.osm_id}`,
        name: String(name).slice(0, 200),
        country: String(country).slice(0, 100),
        lat,
        lon,
        timezone,
        source: "osm",
        kind: kind ?? "place",
        ...(region && region !== name
          ? { region: String(region).slice(0, 100) }
          : {}),
        ...(/^[a-z]{2}$/i.test(a.country_code ?? "")
          ? { countryCode: a.country_code.toUpperCase() }
          : {}),
      }),
    );
  }
  if (nominatimCache.size > 500) nominatimCache.clear();
  nominatimCache.set(key, { at: Date.now(), places });
  return places;
}
export async function searchPlaces(q: string, cities = false, bias?: string) {
  if (!process.env.GEOAPIFY_API_KEY) {
    const offline = catalogue
      .filter((p) =>
        `${p.name} ${p.country}`.toLowerCase().includes(q.toLowerCase()),
      )
      .slice(0, 10)
      .map(signPlace);
    try {
      const suggestion = suggestPlaceName(q);
      if (suggestion) {
        const corrected = await nominatimSearch(suggestion, cities);
        if (corrected.length)
          return {
            places: corrected,
            source: "osm",
            notice: `Showing results for “${suggestion}”.`,
          };
      }
      const places = await nominatimSearch(q, cities);
      if (places.length)
        return { places, source: "osm", notice: "Search by OpenStreetMap." };
    } catch {
      /* fall through to the offline directory */
    }
    return {
      places: offline,
      source: "catalogue",
      notice: cities
        ? "Offline city directory. Live search is temporarily unavailable."
        : "Live place search is temporarily unavailable. Use an address or place a pin manually.",
    };
  }
  const data = await geoRequest("geocode/search", {
    text: q,
    format: "json",
    limit: "8",
    ...(bias ? { bias: `proximity:${bias}` } : {}),
  });
  const geoKind = (type: string): Place["kind"] | undefined =>
    type === "country"
      ? "country"
      : ["state", "county", "region"].includes(type)
        ? "region"
        : ["city", "suburb", "district", "locality", "postcode"].includes(type)
          ? "city"
          : undefined;
  return {
    places: (data.results ?? [])
      .filter(
        (r: any) =>
          r.timezone?.name && (!cities || geoKind(r.result_type) !== undefined),
      )
      .map((r: any) => {
        const kind = cities ? geoKind(r.result_type) : "place";
        const name = cities
          ? kind === "country"
            ? r.country
            : kind === "region"
              ? (r.state ?? r.county ?? r.name)
              : (r.city ?? r.name ?? r.formatted)
          : (r.name ?? r.formatted);
        return signPlace({
          id: r.place_id,
          name,
          country: r.country ?? "",
          lat: r.lat,
          lon: r.lon,
          timezone: r.timezone.name,
          source: "geoapify",
          kind,
          ...(kind !== "country" && r.state && r.state !== name
            ? { region: r.state }
            : {}),
          ...(/^[a-z]{2}$/i.test(r.country_code ?? "")
            ? { countryCode: r.country_code.toUpperCase() }
            : {}),
        });
      }),
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
