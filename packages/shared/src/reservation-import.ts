import { newItem, makeId, type TripItem, type TripState } from "./index.js";

// Conservative extraction: only explicitly labelled values are proposed. Never execute imported content.
export function explicitDate(value: string) {
  const iso = value.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
  if (
    iso &&
    !isNaN(Date.parse(iso)) &&
    new Date(iso).toISOString().slice(0, 10) === iso
  )
    return iso;
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
  const m = value.match(
    /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(20\d{2})\b/i,
  );
  if (!m) return null;
  const date = `${m[3]}-${String(months.indexOf(m[2]!.slice(0, 3).toLowerCase()) + 1).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return !isNaN(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date
    ? date
    : null;
}
export function parseAmount(text: string): string | null {
  const clean = text.replace(/[^\d.,]/g, "");
  if (!clean || clean.length > 18) return null;
  if (/^\d+[,.]\d{1,2}$/.test(clean)) return clean.replace(",", ".");
  if (/^\d{1,3}(,\d{3})+\.\d{2}$/.test(clean)) return clean.replace(/,/g, "");
  if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(clean))
    return clean.replace(/\./g, "").replace(",", ".");
  return /^\d+$/.test(clean) ? clean : null;
}
export function currencyIn(text: string) {
  const codes = [
    ...new Set(
      text.match(
        /\b(?:EUR|USD|GBP|RON|JPY|CHF|CAD|AUD|SEK|NOK|DKK|PLN|CZK|HUF|TRY|THB)\b/g,
      ) ?? [],
    ),
  ];
  if (codes.length === 1) return codes[0]!;
  if (codes.length > 1) return null;
  if (text.includes("€")) return "EUR";
  if (text.includes("£")) return "GBP";
  return null; // A bare $ is ambiguous.
}
export function parseReservationText(
  text: string,
  kind: "accommodation" | "transport" | "activity",
  state: TripState,
) {
  if (text.length > 100000)
    throw new Error("Choose a confirmation shorter than 100,000 characters.");
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const value = (pattern: RegExp) =>
    lines.map((l) => l.match(pattern)?.[1]?.trim()).find(Boolean) ?? "";
  const draft = newItem(state);
  draft.kind = kind;
  draft.category =
    kind === "accommodation"
      ? "Accommodation"
      : kind === "transport"
        ? "Transport"
        : "Activities";
  draft.state = "booked";
  draft.fixed = true;
  draft.title = value(
    /^(?:hotel|property|accommodation|activity|tour|event|train|service|reservation name)\s*[:\-]\s*(.+)$/i,
  ).slice(0, 200);
  const start = value(
    kind === "accommodation"
      ? /^check[ -]?in\s*[:\-]\s*(.+)$/i
      : /^(?:departure|date|start|event date)\s*[:\-]\s*(.+)$/i,
  );
  const end = value(
    kind === "accommodation"
      ? /^check[ -]?out\s*[:\-]\s*(.+)$/i
      : /^(?:arrival|end)\s*[:\-]\s*(.+)$/i,
  );
  draft.day = explicitDate(start);
  draft.endDay = explicitDate(end);
  draft.time = start.match(/\b([01]\d|2[0-3]):([0-5]\d)\b/)?.[0] ?? null;
  draft.paymentDueDate = explicitDate(
    value(/^(?:payment due|pay by|balance due date)\s*[:\-]\s*(.+)$/i),
  );
  const reference = value(
    /^(?:booking reference|confirmation(?: number| code)?|reservation(?: number| code)?|reference|PNR)\s*[:#\-]\s*(.+)$/i,
  ).slice(0, 120);
  const cost = value(
    /^(?:grand total|total(?: price| cost)?)\s*[:\-]\s*(.+)$/i,
  );
  const currency = currencyIn(cost);
  const price = parseAmount(cost);
  // Unknown conversions stay unpriced until the user confirms a rate.
  if (price !== null && currency === state.currency)
    draft.lines = [
      {
        id: makeId(),
        label: "Reservation total",
        price,
        currency,
        quantity: "1",
        multiplier: "1",
        unit: "group",
        rate: "1",
        rateDate: new Date().toISOString().slice(0, 10),
        status: "confirmed",
      },
    ];
  const placeHint = value(
    /^(?:address|location|venue|from|departure station)\s*[:\-]\s*(.+)$/i,
  );
  const endHint = value(/^(?:to|arrival station)\s*[:\-]\s*(.+)$/i);
  return {
    draft,
    reference,
    placeHint,
    endHint,
    quotedCost: cost || null,
    warnings: [
      ...(!draft.title ? ["Confirm the reservation name."] : []),
      ...(!draft.day
        ? ["Choose the date; an unambiguous date was not found."]
        : []),
      ...(kind === "accommodation" && !draft.endDay
        ? ["Confirm your checkout date."]
        : []),
      ...(!draft.lines.length
        ? [
            cost
              ? `Confirm the price and currency (${cost.slice(0, 120)}).`
              : "No total found. You can add the cost manually.",
          ]
        : []),
      "Select the location on the map. Addresses are not automatically geocoded.",
    ],
  };
}
export function parseReceiptText(text: string) {
  if (text.length > 100000) throw new Error("This receipt is too long.");
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const currency = currencyIn(text);
  let total: string | null = null;
  const rows: {
    label: string;
    amount: string | null;
    kind: "purchase" | "discount";
  }[] = [];
  for (const line of lines) {
    if (/^(?:grand\s+)?total(?:\s+due)?\b/i.test(line)) {
      total = parseAmount(line);
      continue;
    }
    if (
      /\b(?:sub\s?total|change|cash|visa|mastercard|card|vat|tax included|paid|balance|tendered)\b/i.test(
        line,
      )
    )
      continue;
    const match = line.match(
      /^(.{2,100}?)\s+(?:(?:EUR|USD|GBP|RON)\s*|[€£$]\s*)?(-?[\d.,]+)\s*(?:EUR|USD|GBP|RON|[€£$])?$/i,
    );
    if (match)
      rows.push({
        label: match[1]!,
        amount: parseAmount(match[2]!),
        kind:
          match[2]!.startsWith("-") || /discount/i.test(match[1]!)
            ? "discount"
            : "purchase",
      });
  }
  return { currency, total, rows: rows.slice(0, 100) };
}
