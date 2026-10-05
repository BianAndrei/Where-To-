import { z } from "zod";

export const airportSchema = z.object({
  code: z.string().regex(/^[A-Z0-9]{3,4}$/),
  name: z.string().min(1).max(200),
  city: z.string().max(120),
  country: z.string().max(100),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  timezone: z
    .string()
    .max(80)
    .refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, "Choose a valid airport time zone."),
});
export type Airport = z.infer<typeof airportSchema>;
const localTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/)
  .refine((v) => {
    const d = new Date(`${v}:00Z`);
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 16) === v;
  }, "Enter a valid local date and time.")
  .nullable();
const endpoint = z.object({
  airport: airportSchema.nullable(),
  localTime,
  offset: z
    .string()
    .regex(/^[+-](0\d|1[0-4]):[0-5]\d$/)
    .nullable()
    .default(null),
  terminal: z.string().max(40).default(""),
  gate: z.string().max(40).default(""),
});
export const flightSegmentSchema = z.object({
  id: z.string().min(1).max(100),
  number: z.string().max(20),
  airline: z.string().max(120),
  departure: endpoint,
  arrival: endpoint,
  selfTransfer: z.boolean().default(false),
});
export type FlightSegment = z.infer<typeof flightSegmentSchema>;
export const flightSchema = z
  .object({
    segments: z.array(flightSegmentSchema).min(1).max(12),
    bookingReference: z.string().max(80).default(""),
    source: z.enum(["manual", "text", "pdf"]).default("manual"),
  })
  .superRefine((flight, ctx) => {
    const issue = (message: string, path: (string | number)[] = []) =>
      ctx.addIssue({ code: "custom", message, path });
    if (
      new Set(flight.segments.map((s) => s.id)).size !== flight.segments.length
    )
      issue("Each flight segment needs a unique ID.");
    flight.segments.forEach((s, i) => {
      for (const key of ["departure", "arrival"] as const) {
        const stop = s[key];
        if (!stop.airport)
          issue(`Segment ${i + 1}: choose the ${key} airport.`, [
            "segments",
            i,
            key,
            "airport",
          ]);
        if (stop.airport && stop.localTime) {
          const options = flightTimeOptions(
            stop.localTime,
            stop.airport.timezone,
          );
          if (!options.length)
            issue(
              `Segment ${i + 1}: the ${key} time does not exist in this airport's time zone (clock change).`,
              ["segments", i, key, "localTime"],
            );
          else if (
            (options.length > 1 && !stop.offset) ||
            (stop.offset && !options.some((o) => o.offset === stop.offset))
          )
            issue(
              `Segment ${i + 1}: confirm the UTC offset for the ${key} time.`,
              ["segments", i, key, "offset"],
            );
        }
      }
      if (
        s.departure.airport &&
        s.departure.airport.code === s.arrival.airport?.code
      )
        issue(
          `Segment ${i + 1}: departure and arrival must be different airports.`,
        );
      const start = flightInstant(s.departure),
        end = flightInstant(s.arrival);
      if (
        start != null &&
        end != null &&
        (end <= start || end - start > 48 * 3600000)
      )
        issue(
          `Segment ${i + 1}: check the arrival date and local times. A flight must last between 0 and 48 hours.`,
        );
      const previousEnd = i
        ? flightInstant(flight.segments[i - 1]!.arrival)
        : null;
      if (previousEnd != null && start != null && start < previousEnd)
        issue(`Segment ${i + 1} departs before the preceding flight lands.`);
    });
  });
export type Flight = z.infer<typeof flightSchema>;

const timeFormatters = new Map<string, Intl.DateTimeFormat>();
function localAt(ms: number, zone: string) {
  let formatter = timeFormatters.get(zone);
  if (!formatter) {
    if (timeFormatters.size >= 128) timeFormatters.clear();
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    timeFormatters.set(zone, formatter);
  }
  const parts = formatter.formatToParts(ms);
  const p = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
// Collect the zone offsets around the requested day, then round-trip candidates.
// Nonexistent times return no candidates; repeated times require an explicit choice.
export function flightTimeOptions(value: string, timezone: string) {
  const nominal = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(nominal)) return [];
  const offsets = new Set<number>();
  for (let h = -36; h <= 36; h += 6) {
    const sample = nominal + h * 3600000;
    offsets.add(
      (Date.parse(localAt(sample, timezone) + ":00Z") - sample) / 60000,
    );
  }
  return [...offsets]
    .flatMap((offset) => {
      const instant = nominal - offset * 60000;
      if (localAt(instant, timezone) !== value) return [];
      const abs = Math.abs(offset);
      return [
        {
          instant,
          offset: `${offset < 0 ? "-" : "+"}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`,
        },
      ];
    })
    .sort((a, b) => a.instant - b.instant);
}
export function flightInstant(stop: FlightSegment["departure"]) {
  if (!stop.airport || !stop.localTime) return null;
  const options = flightTimeOptions(stop.localTime, stop.airport.timezone);
  return (
    (stop.offset
      ? options.find((o) => o.offset === stop.offset)
      : options.length === 1
        ? options[0]
        : undefined
    )?.instant ?? null
  );
}
export function flightMinutes(
  from: FlightSegment["departure"],
  to: FlightSegment["arrival"],
) {
  const start = flightInstant(from),
    end = flightInstant(to);
  return start == null || end == null ? null : (end - start) / 60000;
}
export function durationLabel(minutes: number | null) {
  if (minutes == null) return "Time to be confirmed";
  const n = Math.round(minutes);
  return `${Math.floor(n / 60) ? `${Math.floor(n / 60)}h ` : ""}${n % 60 ? `${n % 60}m` : n === 0 ? "0m" : ""}`.trim();
}
export function airportPlace(a: Airport) {
  return {
    id: `airport:${a.code}`,
    name: `${a.code} · ${a.name}`,
    country: a.country,
    lat: a.lat,
    lon: a.lon,
    timezone: a.timezone,
    source: "user" as const,
  };
}
export function flightRoute(flight: Flight) {
  return flight.segments
    .map(
      (s, i) =>
        `${i === 0 ? (s.departure.airport?.code ?? "?") : ""}${i && s.departure.airport?.code !== flight.segments[i - 1]!.arrival.airport?.code ? ` / ${s.departure.airport?.code ?? "?"}` : ""} → ${s.arrival.airport?.code ?? "?"}`,
    )
    .join("");
}
export function flightConnections(flight: Flight) {
  return flight.segments.slice(1).map((next, i) => {
    const previous = flight.segments[i]!;
    return {
      airport: previous.arrival.airport,
      nextAirport: next.departure.airport,
      minutes: flightMinutes(previous.arrival, next.departure),
      airportChange:
        previous.arrival.airport?.code !== next.departure.airport?.code,
      selfTransfer: next.selfTransfer,
    };
  });
}
export function flightSummaryLines(flight: Flight) {
  const lines: string[] = [];
  flight.segments.forEach((s, i) => {
    if (i) {
      const c = flightConnections(flight)[i - 1]!;
      lines.push(
        `${c.airportChange ? "Airport transfer" : "Layover"}: ${c.airport?.code} ${c.airportChange ? `to ${c.nextAirport?.code} ` : ""}· ${durationLabel(c.minutes)}${c.selfTransfer ? " · Separate tickets / self-transfer" : ""}`,
      );
    }
    lines.push(
      `${s.airline} ${s.number} · ${s.departure.airport?.code} ${s.departure.airport?.name} ${s.departure.localTime?.replace("T", " ") ?? "Time unknown"} (${s.departure.airport?.timezone}) to ${s.arrival.airport?.code} ${s.arrival.airport?.name} ${s.arrival.localTime?.replace("T", " ") ?? "Time unknown"} (${s.arrival.airport?.timezone}) · ${durationLabel(flightMinutes(s.departure, s.arrival))}`.trim(),
    );
  });
  return lines;
}
export function newFlightSegment(
  date = "",
  origin: Airport | null = null,
): FlightSegment {
  const stop = () => ({
    airport: null,
    localTime: null,
    offset: null,
    terminal: "",
    gate: "",
  });
  return {
    id: crypto.randomUUID(),
    number: "",
    airline: "",
    departure: { ...stop(), airport: origin },
    arrival: stop(),
    selfTransfer: false,
  };
}

export function flightProgress(flight: Flight, now = new Date()) {
  for (let i = 0; i < flight.segments.length; i++) {
    const segment = flight.segments[i]!;
    const start = flightInstant(segment.departure),
      end = flightInstant(segment.arrival);
    const previousEnd = i
      ? flightInstant(flight.segments[i - 1]!.arrival)
      : null;
    if (start != null && now.getTime() < start)
      return {
        segment,
        index: i,
        phase:
          previousEnd != null && now.getTime() >= previousEnd
            ? "connection"
            : "before",
        airport: segment.departure.airport,
      };
    if (
      start != null &&
      end != null &&
      now.getTime() >= start &&
      now.getTime() < end
    )
      return {
        segment,
        index: i,
        phase: "in-flight",
        airport: segment.arrival.airport,
      };
  }
  const segment = flight.segments.at(-1)!;
  const end = flightInstant(segment.arrival);
  return {
    segment,
    index: flight.segments.length - 1,
    phase: end != null && now.getTime() >= end ? "arrived" : "unknown",
    airport: segment.arrival.airport,
  };
}
