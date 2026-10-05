import {
  freeTripState,
  newItem,
  flightSchema,
  syncFlightItem,
  type TripRecord,
  type Place,
} from "@whereto/shared";
import exampleFlight from "./example-flight.json";

// Refresh only the copy shipped in older local demos. Personal edits and real
// trips never pass through this function.
export function refreshDemoCopy(record: TripRecord): TripRecord {
  if (record.id !== "demo") return record;
  const labels: Record<string, string> = {
    "A little Lisbon getaway": "Lisbon, together",
    "Our little Lisbon stay": "Our Lisbon stay",
    "A little history at Belém": "History at Belém",
  };
  return {
    ...record,
    state: {
      ...record.state,
      title: labels[record.state.title] ?? record.state.title,
      items: record.state.items.map((item) => ({
        ...item,
        title: labels[item.title] ?? item.title,
        location: item.location
          ? {
              ...item.location,
              name: labels[item.location.name] ?? item.location.name,
            }
          : item.location,
      })),
    },
  };
}
const lisbon: Place = {
  id: "city:lisbon",
  name: "Lisbon",
  country: "Portugal",
  lat: 38.7223,
  lon: -9.1393,
  timezone: "Europe/Lisbon",
  source: "catalogue",
};
export const demoPlaces: Place[] = [
  lisbon,
  {
    id: "demo:belem",
    name: "Belém Tower",
    country: "Portugal",
    lat: 38.6916,
    lon: -9.216,
    timezone: "Europe/Lisbon",
    source: "user",
  },
  {
    id: "demo:alfama",
    name: "A wander through Alfama",
    country: "Portugal",
    lat: 38.7111,
    lon: -9.1298,
    timezone: "Europe/Lisbon",
    source: "user",
  },
  {
    id: "demo:pastry",
    name: "Pastéis de Belém",
    country: "Portugal",
    lat: 38.6975,
    lon: -9.2032,
    timezone: "Europe/Lisbon",
    source: "user",
  },
  {
    id: "demo:hotel",
    name: "Our Lisbon stay",
    country: "Portugal",
    lat: 38.7138,
    lon: -9.1427,
    timezone: "Europe/Lisbon",
    source: "user",
  },
];
export function makeDemo(): TripRecord {
  const state = freeTripState({
    organizer: "Alex",
    title: "Lisbon, together",
    destinations: [lisbon],
    startDate: "2026-10-12",
    endDate: "2026-10-15",
    participants: [
      { id: "alex", name: "Alex" },
      { id: "sam", name: "Sam" },
    ],
    budget: "1200",
    checklist: [
      {
        id: "check1",
        text: "Check passports and travel insurance",
        done: true,
        group: "before",
      },
      {
        id: "check2",
        text: "Comfy shoes for the hills",
        done: false,
        group: "packing",
      },
      {
        id: "check3",
        text: "Download booking confirmations",
        done: false,
        group: "before",
      },
    ],
  });
  const add = (
    title: string,
    kind: any,
    day: string,
    time: string,
    price: string,
    location: Place | null,
    category: string,
    quantity = "1",
  ) => {
    const item = newItem(state, day);
    Object.assign(item, {
      title,
      kind,
      time,
      location,
      category,
      duration: kind === "accommodation" ? 0 : 60,
    });
    item.lines = [
      {
        id: `line-${state.items.length}`,
        label: title,
        unit: kind === "accommodation" ? "night" : "person",
        price,
        quantity,
        multiplier: "1",
        currency: "EUR",
        rate: "1",
        rateDate: "2026-09-08",
        status: kind === "accommodation" ? "confirmed" : "estimated",
      },
    ];
    state.items.push(item);
    return item;
  };
  const hotel = add(
    "Our Lisbon stay",
    "accommodation",
    "2026-10-12",
    "14:00",
    "120",
    demoPlaces[4]!,
    "Accommodation",
    "3",
  );
  hotel.endDay = "2026-10-15";
  hotel.state = "booked";
  hotel.payments = [
    {
      id: "deposit",
      payerId: "alex",
      amount: "100",
      currency: "EUR",
      rate: "1",
      rateDate: "2026-09-08",
      kind: "payment",
      note: "Booking deposit",
    },
  ];
  const flight = add(
    "Flights to Lisbon",
    "flight",
    "2026-10-12",
    "08:20",
    "145",
    null,
    "Transport",
    "2",
  );
  flight.fixed = true;
  flight.order = -1;
  flight.state = "booked";
  flight.flight = flightSchema.parse(exampleFlight);
  flight.notes =
    "Illustrative flight schedule for this demo. Confirm actual schedules with the airline.";
  Object.assign(flight, syncFlightItem(flight));
  add(
    "A wander through Alfama",
    "activity",
    "2026-10-12",
    "16:00",
    "0",
    demoPlaces[2]!,
    "Activities",
    "2",
  );
  add(
    "Dinner, with a view",
    "restaurant",
    "2026-10-12",
    "19:00",
    "24",
    demoPlaces[2]!,
    "Food & drinks",
    "2",
  );
  add(
    "Pastéis & a slow morning",
    "restaurant",
    "2026-10-13",
    "09:00",
    "8",
    demoPlaces[3]!,
    "Food & drinks",
    "2",
  );
  add(
    "History at Belém",
    "activity",
    "2026-10-13",
    "11:00",
    "15",
    demoPlaces[1]!,
    "Activities",
    "2",
  );
  const idea = add(
    "Sunset sailing on the Tagus",
    "activity",
    "2026-10-14",
    "18:00",
    "35",
    lisbon,
    "Activities",
    "2",
  );
  idea.state = "idea";
  const aquarium = add(
    "An afternoon at the aquarium",
    "activity",
    "2026-10-14",
    "14:00",
    "25",
    lisbon,
    "Activities",
    "2",
  );
  aquarium.state = "idea";
  return {
    id: "demo",
    ownerId: "demo",
    version: 1,
    state,
    createdAt: "2026-09-08T12:00:00Z",
    archivedAt: null,
    role: "owner",
    isFree: true,
  };
}
