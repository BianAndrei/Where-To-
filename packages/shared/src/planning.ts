import Decimal from "decimal.js";
import {
  newItem,
  makeId,
  itemTotal,
  itemPaid,
  tripDays,
  distanceKm,
  localDate,
  daysBetween,
  flightInstant,
  flightTimeOptions,
  type TripItem,
  type TripState,
} from "./index.js";
import {
  receiptSchema,
  type Receipt,
  type PlanningCommand,
} from "./planning-types.js";

export function receiptShares(
  receipt: Receipt,
  people: TripState["participants"],
) {
  const r = receiptSchema.parse(receipt);
  if (new Set(r.rows.map((row) => row.id)).size !== r.rows.length)
    throw new Error("Receipt rows must be unique.");
  if (!new Decimal(r.rate).gt(0) || !new Decimal(r.rate).lte(1000000))
    throw new Error("Confirm the exchange rate.");
  const shares: Record<string, Decimal> = {};
  let sum = new Decimal(0);
  for (const row of r.rows) {
    if (
      new Set(row.participantIds).size !== row.participantIds.length ||
      row.participantIds.some((id) => !people.some((p) => p.id === id))
    )
      throw new Error("Assign each receipt row to people on this trip.");
    const value = new Decimal(row.amount).times(
      row.kind === "discount" ? -1 : 1,
    );
    sum = sum.plus(value);
    const each = value
      .div(row.participantIds.length)
      .toDecimalPlaces(8, Decimal.ROUND_DOWN);
    row.participantIds.forEach((id, i) => {
      const portion =
        i === row.participantIds.length - 1 ? value.minus(each.times(i)) : each;
      shares[id] = (shares[id] ?? new Decimal(0)).plus(portion);
    });
  }
  if (!sum.eq(r.total) || !sum.gt(0) || sum.gt(1000000000))
    throw new Error(
      "The receipt rows must add up to the confirmed receipt total.",
    );
  if (Object.values(shares).some((s) => s.lt(0)))
    throw new Error("A discount cannot exceed someone's purchases.");
  return Object.fromEntries(
    Object.entries(shares).map(([id, value]) => [id, value.toString()]),
  );
}

export function applyPlanningCommand(
  state: TripState,
  command: PlanningCommand,
  actor: string,
  context: { actorId: string; owner: boolean },
  now: Date,
) {
  if (command.type === "receipt.save") {
    const item = state.items.find(
      (i) => i.id === command.itemId && !i.deletedAt,
    );
    if (!item || item.kind !== "restaurant" || item.state === "idea")
      throw new Error("Choose a meal already included in the trip.");
    const receipt = receiptSchema.parse(command.receipt);
    if (
      state.items.some(
        (i) =>
          i.id !== item.id && i.receipt?.fingerprint === receipt.fingerprint,
      )
    )
      throw new Error("This receipt is already linked to another meal.");
    const shares = receiptShares(receipt, state.participants);
    if (receipt.currency === state.currency && receipt.rate !== "1")
      throw new Error("The exchange rate for the trip currency must be 1.");
    item.receipt = receipt;
    item.lines = [
      {
        id: `receipt-${receipt.fingerprint.slice(0, 20)}`,
        label: "Confirmed receipt total",
        unit: "group",
        price: receipt.total,
        quantity: "1",
        multiplier: "1",
        currency: receipt.currency,
        rate: receipt.rate,
        rateDate: receipt.rateDate,
        status: "confirmed",
      },
    ];
    item.participantIds = Object.keys(shares);
    item.weights = shares;
    return;
  }
  state.polls ??= [];
  if (command.type === "poll.create") {
    const previous = state.polls.find((p) => p.id === command.id);
    if (previous) {
      if (
        previous.question !== command.question ||
        JSON.stringify(previous.optionIds) !== JSON.stringify(command.optionIds)
      )
        throw new Error(
          "This poll was already created with different options.",
        );
      return;
    }
    if (new Set(command.optionIds).size !== command.optionIds.length)
      throw new Error("Choose different alternatives.");
    if (
      command.optionIds.some(
        (id) =>
          !state.items.some(
            (i) =>
              i.id === id &&
              !i.deletedAt &&
              i.state === "idea" &&
              ["activity", "restaurant"].includes(i.kind),
          ),
      )
    )
      throw new Error(
        "Poll options must be saved restaurant or activity ideas, not existing bookings.",
      );
    if (
      state.polls.some(
        (p) =>
          p.status === "open" &&
          p.optionIds.some((id) => command.optionIds.includes(id)),
      )
    )
      throw new Error("An idea can belong to only one open poll.");
    state.polls.push({
      id: command.id,
      question: command.question,
      optionIds: command.optionIds,
      status: "open",
      votes: [],
      createdAt: now.toISOString(),
    });
    return;
  }
  const poll = state.polls.find((p) => p.id === command.id);
  if (!poll || poll.status !== "open")
    throw new Error("This poll is no longer open. Reload the trip.");
  if (command.type === "poll.vote") {
    if (command.optionId && !poll.optionIds.includes(command.optionId))
      throw new Error("Choose an option in this poll.");
    poll.votes = poll.votes.filter((v) => v.userId !== context.actorId);
    if (command.optionId)
      poll.votes.push({
        userId: context.actorId,
        name: actor,
        optionId: command.optionId,
      });
    return;
  }
  if (!context.owner)
    throw new Error("Only the trip organiser can confirm or close a poll.");
  if (command.type === "poll.cancel") {
    poll.status = "cancelled";
    return;
  }
  if (
    !poll.optionIds.includes(command.selectedId) ||
    command.day < state.startDate ||
    command.day > state.endDate
  )
    throw new Error("Choose an option and a day within this trip.");
  const selected = state.items.find(
    (i) => i.id === command.selectedId && !i.deletedAt && i.state === "idea",
  );
  if (!selected)
    throw new Error("This idea has changed. Close the poll and start again.");
  if (selected.endDay && selected.day) {
    const end = new Date(
      Date.parse(command.day) +
        daysBetween(selected.day, selected.endDay) * 86400000,
    )
      .toISOString()
      .slice(0, 10);
    if (end > state.endDate)
      throw new Error(
        "This activity would finish outside the trip. Choose an earlier day.",
      );
    selected.endDay = end;
  }
  selected.state = "planned";
  selected.day = command.day;
  insertByTime(state, selected);
  poll.status = "resolved";
  poll.selectedId = selected.id;
}

export function reservationDuplicate(items: TripItem[], candidate: TripItem) {
  const normalize = (v: string) =>
    v.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  return items.find(
    (i) =>
      i.id !== candidate.id &&
      ((candidate.reservation &&
        i.reservation?.fingerprint === candidate.reservation.fingerprint) ||
        (candidate.reservation?.reference &&
          i.reservation?.reference &&
          i.kind === candidate.kind &&
          normalize(i.reservation.reference) ===
            normalize(candidate.reservation.reference) &&
          normalize(i.title) === normalize(candidate.title)) ||
        (!i.deletedAt &&
          candidate.day &&
          !(
            candidate.reservation?.reference &&
            i.reservation?.reference &&
            normalize(candidate.reservation.reference) !==
              normalize(i.reservation.reference)
          ) &&
          i.kind === candidate.kind &&
          i.day === candidate.day &&
          normalize(i.title) === normalize(candidate.title))),
  );
}

export function validateTransferItem(item: TripItem, state: TripState) {
  if (!item.transfer) return;
  const flight = state.items.find(
    (i) =>
      i.id === item.transfer!.flightId && !i.deletedAt && i.state !== "idea",
  );
  const stay = state.items.find(
    (i) =>
      i.id === item.transfer!.stayId &&
      !i.deletedAt &&
      i.state !== "idea" &&
      i.kind === "accommodation",
  );
  if (
    item.kind !== "transport" ||
    !flight?.flight ||
    !stay?.location ||
    !item.location ||
    !item.endLocation
  )
    throw new Error(
      "This airport transfer needs an active flight and a stay with locations.",
    );
  const arrival = item.transfer.direction === "arrival";
  const stop = arrival
    ? flight.flight.segments.at(-1)!.arrival
    : flight.flight.segments[0]!.departure;
  const airport = arrival ? flight.endLocation : flight.location;
  const from = arrival ? airport : stay.location,
    to = arrival ? stay.location : airport;
  if (
    !from ||
    !to ||
    distanceKm(item.location, from) > 2 ||
    distanceKm(item.endLocation, to) > 2
  )
    throw new Error(
      "This transfer must connect its flight airport and accommodation. Remove the airport link to plan a different journey.",
    );
  if (!item.day || !item.time) return;
  const choices = flightTimeOptions(
    `${item.day}T${item.time}`,
    item.location.timezone,
  );
  const departure = (
    choices.length === 1
      ? choices[0]
      : choices.find((c) => c.offset === item.transfer!.departureOffset)
  )?.instant;
  const flightAt = flightInstant(stop);
  if (departure == null)
    throw new Error("Confirm the local transfer time and its UTC offset.");
  if (
    flightAt != null &&
    (arrival
      ? departure < flightAt
      : departure + item.duration * 60000 > flightAt)
  )
    throw new Error(
      arrival
        ? "The transfer cannot leave before the flight arrives."
        : "The transfer reaches the airport after your flight departs.",
    );
}

export function insertByTime(state: TripState, item: TripItem) {
  if (!item.day || !item.time) return;
  const next = state.items
    .filter(
      (i) =>
        !i.deletedAt &&
        i.state !== "idea" &&
        i.day === item.day &&
        i.time &&
        i.time > item.time!,
    )
    .sort((a, b) => a.order - b.order)[0];
  if (!next) return;
  const order = next.order;
  for (const i of state.items)
    if (i.day === item.day && i.order >= order) i.order++;
  item.order = order;
}

export function transferNeeds(state: TripState) {
  const active = state.items.filter((i) => !i.deletedAt && i.state !== "idea");
  const needs: {
    id: string;
    flight: TripItem;
    stay: TripItem;
    direction: "arrival" | "departure";
    day: string;
    from: NonNullable<TripItem["location"]>;
    to: NonNullable<TripItem["location"]>;
    time: string | null;
  }[] = [];
  for (const flight of active.filter((i) => i.flight)) {
    const first = flight.flight!.segments[0]!.departure,
      last = flight.flight!.segments.at(-1)!.arrival;
    for (const direction of ["arrival", "departure"] as const) {
      const stop = direction === "arrival" ? last : first;
      const airport =
        direction === "arrival" ? flight.endLocation : flight.location;
      const day = stop.localTime?.slice(0, 10);
      if (!day || !airport) continue;
      const stay = active
        .filter(
          (i) =>
            i.kind === "accommodation" &&
            i.location &&
            i.day &&
            i.endDay &&
            (direction === "arrival"
              ? i.day <= day && i.endDay > day
              : i.day < day && i.endDay >= day) &&
            distanceKm(i.location, airport) < 150,
        )
        .sort(
          (a, b) =>
            distanceKm(a.location!, airport) - distanceKm(b.location!, airport),
        )[0];
      if (!stay?.location) continue;
      const from = direction === "arrival" ? airport : stay.location,
        to = direction === "arrival" ? stay.location : airport;
      if (
        active.some(
          (i) =>
            i.kind === "transport" &&
            ((i.transfer?.flightId === flight.id &&
              i.transfer.stayId === stay.id &&
              i.transfer.direction === direction) ||
              (i.day === day &&
                i.location &&
                i.endLocation &&
                distanceKm(i.location, from) < 2 &&
                distanceKm(i.endLocation, to) < 2)),
        )
      )
        continue;
      needs.push({
        id: `${flight.id}:${stay.id}:${direction}`,
        flight,
        stay,
        day,
        from,
        to,
        direction,
        time:
          direction === "arrival" ? (stop.localTime?.slice(11) ?? null) : null,
      });
    }
  }
  return needs;
}
export type TransferNeed = ReturnType<typeof transferNeeds>[number];
export type MissingPiece = {
  id: string;
  title: string;
  detail: string;
  action: "transfer" | "stay" | "cost" | "payment";
  day: string;
  itemId?: string;
  transfer?: TransferNeed;
};
export function missingPieces(
  state: TripState,
  now = new Date(),
): MissingPiece[] {
  const result: MissingPiece[] = transferNeeds(state).map((n) => ({
    id: n.id,
    title:
      n.direction === "arrival"
        ? "Plan your airport transfer"
        : "Plan your journey back to the airport",
    detail: `${n.from.name} → ${n.to.name}`,
    action: "transfer",
    day: n.day,
    transfer: n,
  }));
  const active = state.items.filter((i) => !i.deletedAt && i.state !== "idea");
  for (const day of tripDays(state).slice(0, -1)) {
    if (
      !active.some(
        (i) =>
          i.kind === "accommodation" &&
          i.day &&
          i.endDay &&
          i.day <= day &&
          i.endDay > day,
      )
    )
      result.push({
        id: `stay:${day}`,
        title: "A night without a stay",
        detail: `${day} · Add accommodation, or leave this as a reminder if you travel overnight.`,
        day,
        action: "stay",
      });
  }
  const today = localDate(state.destinations[0]!.timezone, now);
  for (const item of active) {
    if (!item.lines.length)
      result.push({
        id: `cost:${item.id}`,
        title: "Add a cost estimate",
        detail: item.title,
        action: "cost",
        day: item.day ?? state.startDate,
        itemId: item.id,
      });
    if (
      item.state === "booked" &&
      item.paymentDueDate &&
      item.paymentDueDate <=
        new Date(Date.parse(today) + 7 * 86400000).toISOString().slice(0, 10) &&
      itemTotal(item).minus(itemPaid(item)).gt(0)
    )
      result.unshift({
        id: `payment:${item.id}`,
        title:
          item.paymentDueDate < today
            ? "Payment deadline has passed"
            : "A payment is due soon",
        detail: `${item.title} · due ${item.paymentDueDate}`,
        day: item.day ?? state.startDate,
        action: "payment",
        itemId: item.id,
      });
  }
  return result;
}

export const PACKING_THEMES = [
  "beach",
  "hiking",
  "city",
  "swimming",
  "work",
] as const;
export function packingSuggestions(
  state: TripState,
  selected: readonly string[] = [],
) {
  const text = state.items
    .filter((i) => !i.deletedAt && i.state !== "idea")
    .map((i) => `${i.title} ${i.notes}`)
    .join(" ")
    .toLowerCase();
  const themes = new Set(selected);
  if (/beach|plaj|praia/.test(text)) themes.add("beach");
  if (/hik|trek|trail|drume/.test(text)) themes.add("hiking");
  if (/swim|pool|înot/.test(text)) themes.add("swimming");
  const nights = daysBetween(state.startDate, state.endDate);
  const list: { text: string; group: "packing" | "before"; reason: string }[] =
    [
      {
        text: "Check ID and travel documents",
        group: "before",
        reason: "Every trip",
      },
      {
        text: "Phone charger and travel adapter if needed",
        group: "packing",
        reason: "Every trip",
      },
      {
        text: `Underwear and socks for ${Math.min(nights + 1, 7)} days${nights > 6 ? "; plan a laundry stop" : ""}`,
        group: "packing",
        reason: `${nights + 1}-day trip`,
      },
    ];
  const add = (
    text: string,
    reason: string,
    group: "packing" | "before" = "packing",
  ) => list.push({ text, reason, group });
  if (
    state.items.some(
      (i) => !i.deletedAt && i.state !== "idea" && i.kind === "flight",
    )
  ) {
    add(
      "Check your airline's baggage allowance",
      "Flight in your plan",
      "before",
    );
    add("Download boarding passes", "Flight in your plan", "before");
  }
  if (themes.has("beach")) {
    add("Swimwear, beach towel and sunscreen", "Beach plans");
    add("Sun hat and sunglasses", "Beach plans");
  }
  if (themes.has("hiking")) {
    add("Walking boots and a refillable water bottle", "Hiking plans");
    add("Light rain layer and trail map", "Hiking plans");
  }
  if (themes.has("swimming")) add("Swimwear and goggles", "Swimming plans");
  if (themes.has("city"))
    add("Comfortable walking shoes and a day bag", "City exploring");
  if (themes.has("work"))
    add("Laptop, charger and work essentials", "Work plans");
  const existing = new Set(
    state.checklist.map((c) => c.text.toLowerCase().trim()),
  );
  return list.filter((c) => !existing.has(c.text.toLowerCase().trim()));
}
