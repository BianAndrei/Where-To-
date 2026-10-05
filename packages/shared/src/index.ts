import { z } from "zod";
import Decimal from "decimal.js";
import {
  planningDate,
  reservationSchema,
  receiptSchema,
  transferSchema,
  pollSchema,
  type PlanningCommand,
} from "./planning-types.js";
import {
  applyPlanningCommand,
  reservationDuplicate,
  receiptShares,
  validateTransferItem,
  insertByTime,
} from "./planning.js";
export * from "./planning-types.js";
export * from "./planning.js";
export * from "./reservation-import.js";
import {
  flightSchema,
  flightInstant,
  flightMinutes,
  flightTimeOptions,
  airportPlace,
  type Flight,
} from "./flights.js";
export * from "./flights.js";
export * from "./flight-import.js";

export const CATEGORIES = [
  "Transport",
  "Accommodation",
  "Food & drinks",
  "Activities",
  "Shopping",
  "Other",
] as const;
export const CATEGORY_COLORS: Record<string, string> = {
  Transport: "#c4d9ed",
  Accommodation: "#d8ccec",
  "Food & drinks": "#ffd69a",
  Activities: "#cde5d4",
  Shopping: "#e7aaa4",
  Other: "#dedbd2",
};
export const currencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .refine((v) => {
    try {
      new Intl.NumberFormat("en", { style: "currency", currency: v });
      return true;
    } catch {
      return false;
    }
  }, "Use a valid currency");
const decimal = z
  .string()
  .max(24)
  .regex(/^\d+(\.\d{1,8})?$/)
  .refine((v) => new Decimal(v).lte(1000000000), "Amount too large");
const id = z.string().min(1).max(100);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    "Invalid date",
  );
export const locationSchema = z.object({
  id,
  name: z.string().min(1).max(200),
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
    }),
  source: z.enum(["geoapify", "catalogue", "user"]),
  token: z.string().optional(),
});
export type Place = z.infer<typeof locationSchema>;
export const participantSchema = z.object({
  id,
  name: z.string().min(1).max(100),
});
export const lineSchema = z.object({
  id,
  label: z.string().max(120),
  unit: z.enum(["group", "person", "night", "room", "ticket", "item"]),
  price: decimal,
  quantity: decimal,
  multiplier: decimal.default("1"),
  currency: currencySchema,
  rate: decimal.refine((v) => new Decimal(v).gt(0)),
  rateDate: date,
  status: z.enum(["estimated", "confirmed"]),
});
export const paymentSchema = z.object({
  id,
  payerId: id,
  amount: decimal,
  currency: currencySchema,
  rate: decimal.refine((v) => new Decimal(v).gt(0)),
  rateDate: date,
  actualBase: decimal.optional(),
  kind: z.enum(["payment", "refund"]),
  note: z.string().max(500).default(""),
});
export const itemSchema = z.object({
  id,
  title: z.string().min(1).max(200),
  kind: z.enum([
    "activity",
    "restaurant",
    "accommodation",
    "transport",
    "flight",
    "shopping",
    "other",
  ]),
  category: z.string().min(1).max(80),
  state: z.enum(["idea", "planned", "booked"]),
  day: date.nullable(),
  endDay: date.nullable().default(null),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  duration: z.number().int().min(0).max(14400),
  fixed: z.boolean(),
  order: z.number().int(),
  location: locationSchema.nullable(),
  endLocation: locationSchema.nullable().default(null),
  notes: z.string().max(5000),
  bookingUrl: z
    .string()
    .max(2000)
    .refine((v) => !v || /^https?:\/\//i.test(v)),
  lines: z.array(lineSchema).max(100),
  payments: z.array(paymentSchema).max(200),
  participantIds: z.array(id).max(50),
  weights: z.record(decimal).default({}),
  deletedAt: z.string().nullable().default(null),
  menuId: id.nullable().default(null),
  flight: flightSchema.optional(),
  paymentDueDate: planningDate.nullable().optional(),
  reservation: reservationSchema.optional(),
  receipt: receiptSchema.optional(),
  transfer: transferSchema.optional(),
});
export type TripItem = z.infer<typeof itemSchema>;
export function syncFlightItem(item: TripItem): TripItem {
  if (item.kind !== "flight") return { ...item, flight: undefined };
  if (!item.flight) return item;
  const flight = flightSchema.parse(item.flight);
  const first = flight.segments[0]!,
    last = flight.segments.at(-1)!;
  const duration = flightMinutes(first.departure, last.arrival);
  return {
    ...item,
    flight,
    fixed: true,
    day: first.departure.localTime?.slice(0, 10) ?? item.day,
    time: first.departure.localTime?.slice(11, 16) ?? null,
    endDay: last.arrival.localTime?.slice(0, 10) ?? null,
    duration: duration ?? 0,
    location: first.departure.airport
      ? airportPlace(first.departure.airport)
      : null,
    endLocation: last.arrival.airport
      ? airportPlace(last.arrival.airport)
      : null,
  };
}
export function flightOnDay(flight: Flight, day: string) {
  return flight.segments.some((s, i) => {
    const a = s.departure.localTime?.slice(0, 10),
      b = s.arrival.localTime?.slice(0, 10);
    const previous = flight.segments[i - 1]?.arrival.localTime?.slice(0, 10);
    return (
      a === day ||
      b === day ||
      (a && b && a < day && day < b) ||
      (previous && a && previous < day && day < a)
    );
  });
}
// Map projections are never used for money calculations: the booking stays one item.
export function mapItems(items: TripItem[]) {
  return items
    .filter((i) => !i.deletedAt && i.state !== "idea")
    .flatMap<TripItem & { parentId: string }>((item) => {
      if (item.kind !== "flight" || !item.flight)
        return item.location ? [{ ...item, parentId: item.id }] : [];
      const stops = item.flight.segments
        .flatMap((s, i) => [
          ...(i === 0 ||
          s.departure.airport?.code !==
            item.flight!.segments[i - 1]!.arrival.airport?.code
            ? [s.departure]
            : []),
          s.arrival,
        ])
        .filter((s) => !!s.airport);
      return stops.map((stop, i) => ({
        ...item,
        parentId: item.id,
        id: `${item.id}:airport:${i}`,
        title: `${item.title} · ${stop.airport!.code} (${i === 0 ? "Departure" : i === stops.length - 1 ? "Arrival" : "Connection"})`,
        location: airportPlace(stop.airport!),
        day: stop.localTime?.slice(0, 10) ?? item.day,
        time: stop.localTime?.slice(11) ?? null,
        duration: i === 0 ? item.duration : 0,
        flight: i === 0 ? item.flight : undefined,
        lines: i === 0 ? item.lines : [],
        payments: [],
      }));
    });
}
export type CostLine = z.infer<typeof lineSchema>;
export type Payment = z.infer<typeof paymentSchema>;
export const tripStateSchema = z
  .object({
    title: z.string().min(1).max(150),
    polls: z.array(pollSchema).max(100).optional(),
    organizer: z.string().min(1).max(100),
    destinations: z.array(locationSchema).min(1).max(20),
    startDate: date,
    endDate: date,
    departureCity: z.string().max(200).default(""),
    currency: currencySchema,
    budget: decimal.nullable(),
    modules: z.enum(["both", "itinerary", "budget"]),
    participants: z.array(participantSchema).min(1).max(50),
    items: z.array(itemSchema).max(1000),
    categories: z.array(z.string().min(1).max(80)).max(30),
    saved: decimal.default("0"),
    reserve: decimal.default("0"),
    settlements: z
      .array(z.object({ id, from: id, to: id, amount: decimal, date }))
      .max(500),
    checklist: z
      .array(
        z.object({
          id,
          text: z.string().min(1).max(300),
          done: z.boolean(),
          group: z.enum(["packing", "before"]),
        }),
      )
      .max(200),
    comments: z
      .array(
        z.object({
          id,
          itemId: id,
          author: z.string().max(100),
          text: z.string().min(1).max(2000),
          createdAt: z.string(),
        }),
      )
      .max(1000),
  })
  .superRefine((v, ctx) => {
    if (v.endDate < v.startDate)
      ctx.addIssue({
        code: "custom",
        message: "The end date must follow the start date",
        path: ["endDate"],
      });
    if (daysBetween(v.startDate, v.endDate) > 365)
      ctx.addIssue({
        code: "custom",
        message: "A trip can span at most 365 days",
        path: ["endDate"],
      });
    if (new Set(v.participants.map((p) => p.id)).size !== v.participants.length)
      ctx.addIssue({ code: "custom", message: "Duplicate participants" });
    if (new Set(v.items.map((p) => p.id)).size !== v.items.length)
      ctx.addIssue({ code: "custom", message: "Duplicate items" });
  });
export type TripState = z.infer<typeof tripStateSchema>;
export interface TripRecord {
  id: string;
  ownerId: string;
  version: number;
  state: TripState;
  createdAt: string;
  archivedAt: string | null;
  role: "owner" | "editor" | "viewer";
  isFree: boolean;
}
export type Command =
  | PlanningCommand
  | { type: "item.save"; item: TripItem }
  | { type: "item.delete" | "item.restore"; id: string }
  | { type: "item.order"; day: string; ids: string[] }
  | {
      type: "settings";
      patch: Partial<
        Pick<
          TripState,
          | "title"
          | "startDate"
          | "endDate"
          | "budget"
          | "modules"
          | "saved"
          | "reserve"
          | "categories"
          | "departureCity"
        >
      >;
    }
  | {
      type: "participants";
      participants: TripState["participants"];
      recalculate: boolean;
    }
  | { type: "checklist"; checklist: TripState["checklist"] }
  | { type: "settlement"; settlement: TripState["settlements"][number] }
  | { type: "comment"; itemId: string; text: string };

export const makeId = () => globalThis.crypto.randomUUID();
export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}
export function tripDays(state: Pick<TripState, "startDate" | "endDate">) {
  return Array.from(
    { length: Math.max(0, daysBetween(state.startDate, state.endDate) + 1) },
    (_, i) =>
      new Date(Date.parse(state.startDate) + i * 86400000)
        .toISOString()
        .slice(0, 10),
  );
}
export function localDate(timezone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function datesLocked(state: TripState, now = new Date()) {
  return state.destinations.some(
    (d) => localDate(d.timezone, now) >= state.startDate,
  );
}
export function distanceKm(
  a: Pick<Place, "lat" | "lon">,
  b: Pick<Place, "lat" | "lon">,
) {
  const rad = Math.PI / 180;
  const x =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) *
      Math.cos(b.lat * rad) *
      Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)));
}
export function validateItemLocation(item: TripItem, state: TripState) {
  if (item.kind === "flight" || item.kind === "transport") return;
  if (
    [item.location, item.endLocation].some(
      (place) =>
        place && !state.destinations.some((d) => distanceKm(d, place) <= 100),
    )
  )
    throw new Error(
      "This place is outside your locked destinations (100 km day-trip radius). Create a new trip to plan another destination.",
    );
}
export function itemTotal(item: TripItem) {
  return item.lines
    .reduce(
      (sum, l) =>
        sum.plus(
          new Decimal(l.price)
            .times(l.quantity)
            .times(l.multiplier)
            .times(l.rate),
        ),
      new Decimal(0),
    )
    .toDecimalPlaces(8);
}
export function costStatus(item: TripItem) {
  if (!item.lines.length) return "Needs estimate";
  if (item.lines.every((line) => line.status === "confirmed"))
    return "Confirmed cost";
  if (item.lines.every((line) => line.status === "estimated"))
    return "Estimate";
  return "Part confirmed, part estimated";
}
export function itemPaid(item: TripItem) {
  return item.payments
    .reduce(
      (sum, p) =>
        sum.plus(
          new Decimal(
            p.actualBase ?? new Decimal(p.amount).times(p.rate),
          ).times(p.kind === "refund" ? -1 : 1),
        ),
      new Decimal(0),
    )
    .toDecimalPlaces(8);
}
export function money(value: Decimal.Value, currency = "EUR") {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).format(new Decimal(value).toNumber());
}
export function budgetSummary(state: TripState) {
  const active = state.items.filter((i) => !i.deletedAt && i.state !== "idea");
  let total = new Decimal(0),
    paid = new Decimal(0),
    estimated = new Decimal(0),
    confirmed = new Decimal(0),
    payments = new Decimal(0),
    refunds = new Decimal(0),
    outstanding = new Decimal(0),
    overpaid = new Decimal(0);
  const categories: Record<string, string> = {};
  for (const item of active) {
    const cost = itemTotal(item);
    total = total.plus(cost);
    paid = paid.plus(itemPaid(item));
    for (const line of item.lines) {
      const amount = new Decimal(line.price)
        .times(line.quantity)
        .times(line.multiplier)
        .times(line.rate);
      if (line.status === "confirmed") confirmed = confirmed.plus(amount);
      else estimated = estimated.plus(amount);
    }
    for (const payment of item.payments) {
      const amount = new Decimal(
        payment.actualBase ?? new Decimal(payment.amount).times(payment.rate),
      );
      if (payment.kind === "refund") refunds = refunds.plus(amount);
      else payments = payments.plus(amount);
    }
    const balance = cost.minus(itemPaid(item));
    outstanding = outstanding.plus(Decimal.max(0, balance));
    overpaid = overpaid.plus(Decimal.max(0, balance.negated()));
    categories[item.category] = new Decimal(categories[item.category] ?? 0)
      .plus(cost)
      .toString();
  }
  return {
    total: total.toString(),
    paid: paid.toString(),
    remaining: outstanding.toString(),
    overpaid: overpaid.toString(),
    estimated: estimated.toString(),
    confirmed: confirmed.toString(),
    payments: payments.toString(),
    refunds: refunds.toString(),
    margin:
      state.budget === null
        ? null
        : new Decimal(state.budget)
            .minus(total)
            .minus(state.reserve)
            .toString(),
    categories,
    unpriced: active.filter((i) => !i.lines.length).length,
    perPerson: state.participants.length
      ? total.div(state.participants.length).toString()
      : "0",
  };
}
export function balances(state: TripState) {
  const balance: Record<string, Decimal> = {};
  for (const p of state.participants) balance[p.id] = new Decimal(0);
  for (const item of state.items.filter(
    (i) => !i.deletedAt && i.state !== "idea",
  )) {
    for (const p of item.payments) {
      const amount = new Decimal(
        p.actualBase ?? new Decimal(p.amount).times(p.rate),
      ).times(p.kind === "refund" ? -1 : 1);
      balance[p.payerId] = (balance[p.payerId] ?? new Decimal(0)).plus(amount);
    }
    const ids = item.participantIds.length
      ? item.participantIds
      : state.participants.map((p) => p.id);
    const weights = ids.map((id) => new Decimal(item.weights[id] ?? 1));
    const weightTotal = weights.reduce((a, b) => a.plus(b), new Decimal(0));
    if (weightTotal.isZero()) continue;
    const amount = itemPaid(item);
    ids.forEach((id, i) => {
      balance[id] = (balance[id] ?? new Decimal(0)).minus(
        amount.times(weights[i]!).div(weightTotal),
      );
    });
  }
  for (const s of state.settlements) {
    balance[s.from] = (balance[s.from] ?? new Decimal(0)).plus(s.amount);
    balance[s.to] = (balance[s.to] ?? new Decimal(0)).minus(s.amount);
  }
  const decimals =
    new Intl.NumberFormat("en", {
      style: "currency",
      currency: state.currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  const rounded = Object.fromEntries(
    Object.entries(balance).map(([id, b]) => [id, b.toDecimalPlaces(decimals)]),
  );
  const remainder = Object.values(rounded).reduce(
    (sum, value) => sum.plus(value),
    new Decimal(0),
  );
  // Assign rounding residue deterministically, so the displayed ledger still sums to zero.
  const largest = Object.keys(balance).sort(
    (a, b) =>
      balance[b]!.abs().comparedTo(balance[a]!.abs()) || a.localeCompare(b),
  )[0];
  if (largest && !remainder.isZero())
    rounded[largest] = rounded[largest]!.minus(remainder);
  return Object.fromEntries(
    Object.entries(rounded).map(([id, value]) => [id, value.toString()]),
  );
}
export function suggestedSettlements(state: TripState) {
  const entries = Object.entries(balances(state));
  const creditors = entries
    .filter(([, v]) => new Decimal(v).gt(0))
    .map(([id, v]) => ({ id, amount: new Decimal(v) }));
  const debtors = entries
    .filter(([, v]) => new Decimal(v).lt(0))
    .map(([id, v]) => ({ id, amount: new Decimal(v).negated() }));
  const out: { from: string; to: string; amount: string }[] = [];
  for (const debtor of debtors) {
    for (const creditor of creditors) {
      const amount = Decimal.min(debtor.amount, creditor.amount);
      if (amount.lte(0)) continue;
      out.push({ from: debtor.id, to: creditor.id, amount: amount.toFixed(2) });
      debtor.amount = debtor.amount.minus(amount);
      creditor.amount = creditor.amount.minus(amount);
    }
  }
  return out;
}
export function orderedItems(state: TripState, day: string) {
  return state.items
    .filter(
      (i) =>
        !i.deletedAt &&
        i.state !== "idea" &&
        (i.day === day ||
          (i.kind === "flight" && i.flight && flightOnDay(i.flight, day))),
    )
    .sort((a, b) => a.order - b.order);
}
export function todayPlan(state: TripState, now = new Date()) {
  const firstZone = state.destinations[0]!.timezone;
  const day = localDate(firstZone, now);
  const toMinutes = (time: string) =>
    Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const entries = state.items
    .filter((item) => !item.deletedAt && item.state !== "idea" && item.day)
    .map((item) => {
      const timezone = item.location?.timezone ?? firstZone;
      const localDay = localDate(timezone, now);
      const time = new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(now);
      const flightStart = item.flight
        ? flightInstant(item.flight.segments[0]!.departure)
        : null;
      const elapsed =
        flightStart != null
          ? (now.getTime() - flightStart) / 60000
          : item.time === null
            ? null
            : daysBetween(item.day!, localDay) * 1440 +
              toMinutes(time) -
              toMinutes(item.time);
      const ongoing =
        item.kind !== "accommodation" &&
        elapsed !== null &&
        elapsed >= 0 &&
        item.duration > 0 &&
        elapsed < item.duration;
      return { item, timezone, localDay, elapsed, ongoing };
    });
  const todays = entries.filter(
    ({ item, localDay, ongoing }) => item.day === localDay || ongoing,
  );
  const stops = todays.filter(({ item }) => item.kind !== "accommodation");
  const ongoing = stops
    .filter((entry) => entry.ongoing)
    .sort((a, b) => a.elapsed! - b.elapsed!)[0];
  const upcoming = stops
    .filter((entry) => entry.elapsed !== null && entry.elapsed <= 0)
    .sort((a, b) => b.elapsed! - a.elapsed!)[0];
  const flexible = stops
    .filter((entry) => entry.item.time === null)
    .sort((a, b) => a.item.order - b.item.order)[0];
  const focus = ongoing ?? upcoming ?? flexible;
  const stay = entries
    .filter(
      ({ item, localDay }) =>
        item.kind === "accommodation" &&
        item.day! <= localDay &&
        (!item.endDay ? item.day === localDay : localDay < item.endDay),
    )
    .sort((a, b) => b.item.day!.localeCompare(a.item.day!))[0]?.item;
  const phase = state.destinations.every(
    (place) => localDate(place.timezone, now) < state.startDate,
  )
    ? "before"
    : state.destinations.every(
          (place) => localDate(place.timezone, now) > state.endDate,
        )
      ? "after"
      : "during";
  return {
    day,
    phase,
    stay,
    focus: focus?.item,
    timezone: focus?.timezone ?? firstZone,
    focusKind: ongoing
      ? "ongoing"
      : upcoming
        ? "upcoming"
        : flexible
          ? "flexible"
          : "none",
    items: todays.map(({ item }) => item).sort((a, b) => a.order - b.order),
  };
}
export function scheduleWarnings(
  items: TripItem[],
  travelMinutes: Record<string, number> = {},
) {
  const warnings: string[] = [];
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1]!,
      next = items[i]!;
    if (!prev.time || !next.time) continue;
    const toMinutes = (s: string) =>
      Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
    let gap = toMinutes(next.time) - toMinutes(prev.time) - prev.duration;
    if (prev.flight || next.flight) {
      const instant = (item: TripItem, zone: string | undefined) => {
        if (!item.day || !item.time || !zone) return null;
        const options = flightTimeOptions(`${item.day}T${item.time}`, zone);
        return options.length === 1 ? options[0]!.instant : null;
      };
      const previousEnd = prev.flight
        ? flightInstant(prev.flight.segments.at(-1)!.arrival)
        : instant(prev, prev.location?.timezone ?? next.location?.timezone);
      const nextStart = next.flight
        ? flightInstant(next.flight.segments[0]!.departure)
        : instant(next, next.location?.timezone ?? prev.endLocation?.timezone);
      if (previousEnd == null || nextStart == null) continue;
      gap =
        (nextStart - previousEnd) / 60000 - (prev.flight ? 0 : prev.duration);
    }
    const travel = travelMinutes[`${prev.id}:${next.id}`];
    if (gap < 0) warnings.push(`${prev.title} overlaps with ${next.title}.`);
    else if (travel !== undefined && gap < travel)
      warnings.push(
        `Only ${gap} minutes before ${next.title}; travel takes about ${Math.ceil(travel)} minutes.`,
      );
  }
  return warnings;
}
export function suggestOrder(items: TripItem[], start?: Place | null) {
  const out: TripItem[] = [];
  let segment: TripItem[] = [];
  let cursor = start;
  const flush = () => {
    while (segment.length) {
      let index = 0;
      if (cursor)
        index = segment.reduce(
          (best, item, i) =>
            item.location &&
            distanceKm(cursor!, item.location) <
              (segment[best]?.location
                ? distanceKm(cursor!, segment[best]!.location!)
                : Infinity)
              ? i
              : best,
          0,
        );
      const [item] = segment.splice(index, 1);
      out.push(item!);
      cursor = item!.location ?? cursor;
    }
  };
  for (const item of items) {
    if (item.fixed) {
      flush();
      out.push(item);
      cursor = item.endLocation ?? item.location ?? cursor;
    } else segment.push(item);
  }
  flush();
  return out.map((i) => i.id);
}
export function applyCommand(
  current: TripState,
  command: Command,
  actor: string,
  now = new Date(),
  context = { actorId: actor, owner: false },
): TripState {
  const state = structuredClone(current);
  switch (command.type) {
    case "poll.create":
    case "poll.vote":
    case "poll.resolve":
    case "poll.cancel":
    case "receipt.save":
      applyPlanningCommand(state, command, actor, context, now);
      break;
    case "item.save": {
      const item = syncFlightItem(itemSchema.parse(command.item));
      const poll = state.polls?.find(
        (p) => p.status === "open" && p.optionIds.includes(item.id),
      );
      if (poll && (item.state !== "idea" || item.deletedAt))
        throw new Error(
          "Confirm or close the group poll before adding this idea to the plan.",
        );
      if (item.reservation && reservationDuplicate(state.items, item))
        throw new Error(
          "This reservation is already in your trip. Open the existing item instead.",
        );
      if (item.receipt) {
        if (
          state.items.some(
            (i) =>
              i.id !== item.id &&
              i.receipt?.fingerprint === item.receipt!.fingerprint,
          )
        )
          throw new Error("This receipt is already linked to another meal.");
        if (item.kind !== "restaurant")
          throw new Error("A receipt belongs to a restaurant or meal.");
        const weights = receiptShares(item.receipt, state.participants);
        if (
          !itemTotal(item).eq(
            new Decimal(item.receipt.total).times(item.receipt.rate),
          ) ||
          Object.keys(weights).length !== item.participantIds.length ||
          Object.entries(weights).some(
            ([id, value]) =>
              !item.participantIds.includes(id) || item.weights[id] !== value,
          )
        )
          throw new Error(
            "Use the receipt editor to update its total and item assignments, or detach the receipt first.",
          );
      }
      validateItemLocation(item, state);
      validateTransferItem(item, state);
      if (item.day && (item.day < state.startDate || item.day > state.endDate))
        throw new Error("Choose a day within this trip.");
      if (
        item.endDay &&
        (!item.day ||
          (!item.flight && item.endDay < item.day) ||
          item.endDay < state.startDate ||
          item.endDay > state.endDate)
      )
        throw new Error(
          "Choose an end day within this trip, after the start day.",
        );
      if (
        item.flight &&
        item.flight.segments.some((s) =>
          [s.departure, s.arrival].some(
            (stop) =>
              stop.localTime &&
              (stop.localTime.slice(0, 10) < state.startDate ||
                stop.localTime.slice(0, 10) > state.endDate),
          ),
        )
      )
        throw new Error(
          "All flight dates must be within the trip. Update the trip period first if needed.",
        );
      for (const entries of [item.lines, item.payments]) {
        if (new Set(entries.map((e) => e.id)).size !== entries.length)
          throw new Error("Choose unique cost and payment entries.");
      }
      if (new Set(item.participantIds).size !== item.participantIds.length)
        throw new Error("Choose each participant only once.");
      const people = new Set(state.participants.map((p) => p.id));
      if (
        item.participantIds.some((id) => !people.has(id)) ||
        item.payments.some((p) => !people.has(p.payerId))
      )
        throw new Error("Choose participants from this trip.");
      if (
        Object.values(item.weights).length &&
        item.participantIds.every((id) =>
          new Decimal(item.weights[id] ?? 1).isZero(),
        )
      )
        throw new Error("At least one share must be greater than zero.");
      const index = state.items.findIndex((i) => i.id === item.id);
      if (index < 0) {
        if (item.reservation || item.transfer) insertByTime(state, item);
        state.items.push(item);
      } else state.items[index] = item;
      break;
    }
    case "item.delete":
    case "item.restore": {
      if (
        command.type === "item.delete" &&
        state.polls?.some(
          (p) => p.status === "open" && p.optionIds.includes(command.id),
        )
      )
        throw new Error(
          "Close the group poll before deleting one of its options.",
        );
      const item = state.items.find((i) => i.id === command.id);
      if (!item) throw new Error("Item not found");
      item.deletedAt =
        command.type === "item.delete" ? now.toISOString() : null;
      break;
    }
    case "item.order": {
      const items = orderedItems(state, command.day);
      if (
        command.ids.length !== items.length ||
        new Set(command.ids).size !== items.length ||
        items.some((i) => !command.ids.includes(i.id))
      )
        throw new Error("The day changed. Reload it before reordering.");
      command.ids.forEach((id, index) => {
        state.items.find((i) => i.id === id)!.order = index;
      });
      break;
    }
    case "settings": {
      const patch = command.patch;
      if (
        ((patch.startDate && patch.startDate !== state.startDate) ||
          (patch.endDate && patch.endDate !== state.endDate)) &&
        datesLocked(current, now)
      )
        throw new Error("The trip has started. Its dates are now fixed.");
      const allowed = [
        "title",
        "startDate",
        "endDate",
        "budget",
        "modules",
        "saved",
        "reserve",
        "categories",
        "departureCity",
      ];
      for (const key of Object.keys(patch))
        if (!allowed.includes(key))
          throw new Error("Destinations and the budget currency are locked.");
      Object.assign(state, patch);
      if (
        state.items.some(
          (i) =>
            !i.deletedAt &&
            i.day &&
            (i.day < state.startDate || i.day > state.endDate),
        )
      )
        throw new Error(
          "Move or unschedule items outside the new period first.",
        );
      break;
    }
    case "participants": {
      const people = z
        .array(participantSchema)
        .min(1)
        .max(50)
        .parse(command.participants);
      const ids = new Set(people.map((p) => p.id));
      if (
        state.items.some(
          (i) =>
            i.payments.some((p) => !ids.has(p.payerId)) ||
            i.participantIds.some((id) => !ids.has(id)),
        ) ||
        state.settlements.some((s) => !ids.has(s.from) || !ids.has(s.to))
      )
        throw new Error(
          "A participant with costs or payments cannot be removed.",
        );
      if (command.recalculate)
        for (const item of state.items)
          for (const line of item.lines)
            if (
              line.unit === "person" &&
              line.status === "estimated" &&
              item.state !== "booked" &&
              item.participantIds.length === 0
            )
              line.quantity = String(people.length);
      state.participants = people;
      break;
    }
    case "checklist":
      state.checklist = command.checklist;
      break;
    case "settlement": {
      const s = command.settlement;
      if (
        s.from === s.to ||
        ![s.from, s.to].every((id) =>
          state.participants.some((p) => p.id === id),
        )
      )
        throw new Error("Choose two different participants.");
      if (state.settlements.some((v) => v.id === s.id)) break;
      state.settlements.push(s);
      break;
    }
    case "comment": {
      if (!state.items.some((i) => i.id === command.itemId))
        throw new Error("Item not found");
      state.comments.push({
        id: makeId(),
        itemId: command.itemId,
        author: actor,
        text: command.text,
        createdAt: now.toISOString(),
      });
      break;
    }
    default:
      throw new Error("Unknown operation");
  }
  return tripStateSchema.parse(state);
}
export function newItem(state: TripState, day: string | null = null): TripItem {
  return {
    id: makeId(),
    title: "",
    kind: "activity",
    category: "Activities",
    state: "planned",
    day,
    endDay: null,
    time: null,
    duration: 0,
    fixed: false,
    order: state.items.length,
    location: null,
    endLocation: null,
    notes: "",
    bookingUrl: "",
    lines: [],
    payments: [],
    participantIds: [],
    weights: {},
    deletedAt: null,
    menuId: null,
  };
}
export function freeTripState(
  input: Partial<TripState> &
    Pick<
      TripState,
      "organizer" | "destinations" | "startDate" | "endDate" | "participants"
    >,
): TripState {
  return tripStateSchema.parse({
    title: input.destinations.map((d) => d.name).join(" & ") + " getaway",
    currency: "EUR",
    budget: null,
    modules: "both",
    items: [],
    categories: [...CATEGORIES],
    saved: "0",
    reserve: "0",
    settlements: [],
    checklist: [],
    comments: [],
    departureCity: "",
    ...input,
  });
}
export function publicTrip(
  state: TripState,
  showBudget = false,
  showAccommodation = false,
) {
  const copy = structuredClone(state);
  copy.organizer = "Trip organiser";
  copy.participants = [];
  copy.comments = [];
  copy.checklist = [];
  copy.settlements = [];
  copy.saved = "0";
  copy.reserve = "0";
  copy.departureCity = "";
  copy.polls = undefined;
  copy.items = copy.items
    .filter(
      (i) =>
        !i.deletedAt &&
        i.state !== "idea" &&
        (showAccommodation || i.kind !== "accommodation"),
    )
    .map((i) => ({
      ...i,
      notes: "",
      menuId: null,
      bookingUrl: "",
      reservation: undefined,
      receipt: undefined,
      transfer: undefined,
      paymentDueDate: undefined,
      flight: i.flight ? { ...i.flight, bookingReference: "" } : undefined,
      payments: [],
      participantIds: [],
      weights: {},
      lines: showBudget ? i.lines : [],
    }));
  if (!showBudget) copy.budget = null;
  return copy;
}
export function menuCost(
  choices: { price: string | null; quantity: number }[],
) {
  if (choices.some((c) => c.quantity > 0 && c.price === null))
    throw new Error("Confirm every selected price before adding this meal.");
  return choices
    .reduce(
      (sum, c) => sum.plus(new Decimal(c.price ?? 0).times(c.quantity)),
      new Decimal(0),
    )
    .toString();
}
export * from "./preferences.js";
