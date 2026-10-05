import {
  type Airport,
  type Flight,
  type FlightSegment,
  newFlightSegment,
} from "./flights.js";

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function searchAirports(airports: Airport[], query: string) {
  const q = fold(query.trim());
  if (q.length < 2) return [];
  return airports
    .filter((a) => fold(`${a.code} ${a.name} ${a.city}`).includes(q))
    .sort(
      (a, b) =>
        Number(b.code.toLowerCase() === q) -
          Number(a.code.toLowerCase() === q) ||
        Number(b.city.toLowerCase().startsWith(q)) -
          Number(a.city.toLowerCase().startsWith(q)) ||
        a.code.localeCompare(b.code),
    )
    .slice(0, 12);
}
function normalizeDates(text: string) {
  const months = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  const iso = (d: string, m: string, y: string) =>
    `${y}-${String(months.indexOf(m.slice(0, 3).toLowerCase()) + 1).padStart(2, "0")}-${d.padStart(2, "0")}`;
  return text
    .replace(
      /\b(\d{1,2})\s+(Jan\w*|Feb\w*|Mar\w*|Apr\w*|May|Jun\w*|Jul\w*|Aug\w*|Sep\w*|Oct\w*|Nov\w*|Dec\w*)\s*,?\s*(\d{4})\b/gi,
      (_, d, m, y) => iso(d, m, y),
    )
    .replace(
      /\b(Jan\w*|Feb\w*|Mar\w*|Apr\w*|May|Jun\w*|Jul\w*|Aug\w*|Sep\w*|Oct\w*|Nov\w*|Dec\w*)\s+(\d{1,2}),?\s+(\d{4})\b/gi,
      (_, m, d, y) => iso(d, m, y),
    )
    .replace(
      /\b(\d{1,2}):(\d{2})\s*(AM|PM)\b/gi,
      (_, h, m, p) =>
        `${String((Number(h) % 12) + (p.toUpperCase() === "PM" ? 12 : 0)).padStart(2, "0")}:${m}`,
    );
}
// A conservative, local parser: only source airport codes and explicit dates/times.
// Unknown layouts remain editable rather than being filled from flight-number guesses.
export function parseFlightText(
  input: string,
  airports: Airport[],
): { flight: Flight; warnings: string[]; recognized: number } {
  const text = normalizeDates(input.slice(0, 50000)).replace(/\r/g, "");
  const byCode = new Map(airports.map((a) => [a.code, a]));
  const number =
    /^(?:Flight\s*(?:number\s*)?:?\s*)?([A-Z0-9]{2,3})\s?(\d{1,4}[A-Z]?)\b(?!-\d{2})/i;
  const blocks: string[] = [];
  let current: string[] = [];
  for (const line of text.split("\n")) {
    if (
      number.test(line.trim()) &&
      current.some((l) => /\b[A-Z]{3}\b/.test(l))
    ) {
      blocks.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }
  if (current.length) blocks.push(current.join("\n"));
  const segments: FlightSegment[] = [];
  let recognized = 0;
  for (const block of blocks) {
    const codes = [...block.matchAll(/\b[A-Z]{3}\b/g)].filter((m) =>
      byCode.has(m[0]),
    );
    // Repeated mentions of the same airport are not extra flights.
    const unique = codes.filter((m, i) => i === 0 || m[0] !== codes[i - 1]![0]);
    if (unique.length !== 2) continue;
    const segment = newFlightSegment();
    const flightNumber = block
      .split("\n")
      .map((l) => l.trim().match(number))
      .find(Boolean);
    segment.number = flightNumber ? flightNumber[1]! + flightNumber[2]! : "";
    for (const [i, key] of (["departure", "arrival"] as const).entries()) {
      const match = unique[i]!;
      segment[key].airport = byCode.get(match[0])!;
      const start = match.index!;
      const end = unique[i + 1]?.index ?? block.length;
      const zone = block.slice(start, end);
      const ownDate = zone.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
      const time = zone.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
      if (ownDate && time)
        segment[key].localTime =
          `${ownDate}T${time[1]!.padStart(2, "0")}:${time[2]}`;
      segment[key].terminal =
        zone.match(/\bTerminal\s*:?\s*([A-Z0-9-]{1,8})\b/i)?.[1] ?? "";
      segment[key].gate =
        zone.match(/\bGate\s*:?\s*([A-Z0-9-]{1,8})\b/i)?.[1] ?? "";
      recognized += 1;
    }
    segments.push(segment);
  }
  const warnings = [
    "Review every segment against your booking before saving. Times and gates are not live updates.",
  ];
  if (!segments.length)
    warnings.push(
      "This layout could not be read reliably. Enter the airports and times below, or use one flight block per segment as in the example.",
    );
  if (segments.some((s) => !s.departure.localTime || !s.arrival.localTime))
    warnings.push(
      "Some dates or times were missing. They stay unknown until you confirm them.",
    );
  return {
    flight: {
      segments: segments.length ? segments.slice(0, 12) : [newFlightSegment()],
      bookingReference:
        text.match(
          /(?:Booking reference|Confirmation code|PNR)\s*:?\s*([A-Z0-9]{5,8})\b/i,
        )?.[1] ?? "",
      source: "text",
    },
    warnings,
    recognized,
  };
}
