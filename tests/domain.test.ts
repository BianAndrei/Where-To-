import { describe, it, expect } from "vitest";
import { makeDemo } from "../apps/web/src/lib/demo";
import {
  applyCommand,
  budgetSummary,
  newItem,
  itemTotal,
  costStatus,
  balances,
  suggestOrder,
  orderedItems,
  datesLocked,
  publicTrip,
  scheduleWarnings,
  type TripItem,
} from "@whereto/shared";
import { publicAddress, fetchPublic } from "../apps/api/src/safe-fetch";
import { quotaBucket, hasPro } from "../apps/api/src/access";
const fixture = () => {
  const s = makeDemo().state;
  s.items = [];
  s.settlements = [];
  return s;
};
describe("One trip, one financial ledger", () => {
  it("30 EUR per person for four people creates exactly 120 EUR", () => {
    const s = fixture();
    const item = newItem(s, s.startDate);
    item.title = "Museum";
    item.lines = [
      {
        id: "line",
        label: "Adults",
        unit: "person",
        price: "30",
        quantity: "4",
        multiplier: "1",
        currency: "EUR",
        rate: "1",
        rateDate: s.startDate,
        status: "estimated",
      },
    ];
    const next = applyCommand(s, { type: "item.save", item }, "Alex");
    expect(next.items).toHaveLength(1);
    expect(budgetSummary(next).total).toBe("120");
    expect(itemTotal(next.items[0]!).toString()).toBe("120");
  });
  it("600 EUR accommodation with 150 deposit leaves 450 without double counting", () => {
    const s = fixture();
    const item = newItem(s, s.startDate);
    item.title = "Stay";
    item.lines = [
      {
        id: "cost",
        label: "Stay",
        unit: "group",
        price: "600",
        quantity: "1",
        multiplier: "1",
        currency: "EUR",
        rate: "1",
        rateDate: s.startDate,
        status: "confirmed",
      },
    ];
    item.payments = [
      {
        id: "paid",
        payerId: s.participants[0]!.id,
        amount: "150",
        currency: "EUR",
        rate: "1",
        rateDate: s.startDate,
        kind: "payment",
        note: "Deposit",
      },
    ];
    s.items = [item];
    expect(budgetSummary(s)).toMatchObject({
      total: "600",
      paid: "150",
      remaining: "450",
      estimated: "0",
      confirmed: "600",
      payments: "150",
      refunds: "0",
    });
    expect(costStatus(item)).toBe("Confirmed cost");
    const before = balances(s);
    expect(Object.values(before)).toEqual(["75", "-75"]);
    s.settlements = [
      {
        id: "settle",
        from: s.participants[1]!.id,
        to: s.participants[0]!.id,
        amount: "75",
        date: s.startDate,
      },
    ];
    expect(Object.values(balances(s))).toEqual(["0", "0"]);
    expect(budgetSummary(s).total).toBe("600");
    item.state = "idea";
    expect(budgetSummary(s).total).toBe("0");
  });
  it("uses frozen FX and actual debited payment values, including refunds", () => {
    const s = makeDemo().state;
    const item = s.items[0]!;
    item.payments = [
      {
        id: "pay",
        payerId: s.participants[0]!.id,
        amount: "100",
        currency: "USD",
        rate: "0.9",
        actualBase: "92",
        rateDate: s.startDate,
        kind: "payment",
        note: "",
      },
      {
        id: "refund",
        payerId: s.participants[0]!.id,
        amount: "10",
        currency: "EUR",
        rate: "1",
        rateDate: s.startDate,
        kind: "refund",
        note: "",
      },
    ];
    s.items = [item];
    expect(budgetSummary(s).paid).toBe("82");
  });
  it("does not use an overpayment on one booking to hide another unpaid cost", () => {
    const s = fixture();
    const stay: TripItem = {
      ...newItem(s),
      title: "Stay",
      lines: [
        {
          id: "stay-cost",
          label: "Stay",
          price: "100",
          quantity: "1",
          multiplier: "1",
          unit: "group",
          currency: "EUR",
          rate: "1",
          rateDate: s.startDate,
          status: "confirmed",
        },
      ],
    };
    stay.payments = [
      {
        id: "deposit",
        amount: "150",
        payerId: s.participants[0]!.id,
        currency: "EUR",
        rate: "1",
        rateDate: s.startDate,
        kind: "payment",
        note: "",
      },
      {
        id: "refund",
        amount: "10",
        payerId: s.participants[0]!.id,
        currency: "EUR",
        rate: "1",
        rateDate: s.startDate,
        kind: "refund",
        note: "",
      },
    ];
    const meal = {
      ...newItem(s),
      title: "Meal",
      lines: [
        {
          ...stay.lines[0]!,
          id: "meal-cost",
          price: "50",
          status: "estimated" as const,
        },
      ],
    };
    s.items = [stay, meal];
    expect(budgetSummary(s)).toMatchObject({
      total: "150",
      confirmed: "100",
      estimated: "50",
      paid: "140",
      payments: "150",
      refunds: "10",
      remaining: "50",
      overpaid: "40",
    });
    stay.state = "booked";
    stay.lines.push({
      ...stay.lines[0]!,
      id: "extra",
      price: "10",
      status: "estimated",
    });
    expect(costStatus(stay)).toBe("Part confirmed, part estimated");
  });
});
describe("Trip boundaries, scheduling and sharing", () => {
  it("checks stored dates in the destination timezone before accepting a date move", () => {
    const s = fixture();
    s.destinations[0]!.timezone = "Asia/Tokyo";
    s.startDate = "2026-10-12";
    s.endDate = "2026-10-15";
    const now = new Date("2026-10-11T15:01:00Z");
    expect(datesLocked(s, now)).toBe(true);
    expect(() =>
      applyCommand(
        s,
        {
          type: "settings",
          patch: { startDate: "2027-01-01", endDate: "2027-01-05" },
        },
        "Alex",
        now,
      ),
    ).toThrow(/started/);
    expect(() =>
      applyCommand(
        s,
        { type: "settings", patch: { destinations: [] } as any },
        "Alex",
        now,
      ),
    ).toThrow(/locked/);
  });
  it("blocks distant activities but permits access transport", () => {
    const s = fixture();
    const item = newItem(s, s.startDate);
    item.title = "Far away";
    item.location = { ...s.destinations[0]!, lat: 48.8566, lon: 2.3522 };
    expect(() => applyCommand(s, { type: "item.save", item }, "Alex")).toThrow(
      /outside/,
    );
    item.kind = "flight";
    expect(
      applyCommand(s, { type: "item.save", item }, "Alex").items,
    ).toHaveLength(1);
  });
  it("keeps fixed anchors and restores exact original order using Undo", () => {
    const s = makeDemo().state;
    const items = orderedItems(s, s.startDate);
    items[1]!.fixed = true;
    const original = items.map((i) => i.id);
    const proposal = suggestOrder(items, s.destinations[0]);
    expect(proposal[1]).toBe(original[1]);
    const changed = applyCommand(
      s,
      { type: "item.order", day: s.startDate, ids: proposal },
      "Alex",
    );
    const restored = applyCommand(
      changed,
      { type: "item.order", day: s.startDate, ids: original },
      "Alex",
    );
    expect(orderedItems(restored, s.startDate).map((i) => i.id)).toEqual(
      original,
    );
  });
  it("only warns about transport time when real duration data exists", () => {
    const s = fixture();
    const a = newItem(s, s.startDate),
      b = newItem(s, s.startDate);
    a.title = "A";
    b.title = "B";
    a.time = "09:00";
    a.duration = 60;
    b.time = "10:15";
    expect(scheduleWarnings([a, b])).toEqual([]);
    expect(scheduleWarnings([a, b], { [`${a.id}:${b.id}`]: 30 })).toHaveLength(
      1,
    );
  });
  it("strips payments, participants, notes, accommodation and ideas from public output", () => {
    const s = makeDemo().state;
    const p = publicTrip(s, false, false);
    expect(p.participants).toEqual([]);
    expect(p.budget).toBeNull();
    expect(
      p.items.every(
        (i) =>
          !i.payments.length &&
          !i.lines.length &&
          !i.notes &&
          i.kind !== "accommodation" &&
          i.state !== "idea",
      ),
    ).toBe(true);
    expect(p.comments).toEqual([]);
  });
});
describe("Free provider and import boundaries", () => {
  it.each([
    "127.0.0.1",
    "10.1.1.1",
    "169.254.169.254",
    "192.168.2.2",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:c0a8:0101",
    "fc00::1",
    "2001:db8::1",
    "100.64.0.1",
    "not-an-ip",
  ])("rejects private/reserved address %s", (ip) =>
    expect(publicAddress(ip)).toBe(false),
  );
  it("accepts routable public addresses", () => {
    expect(publicAddress("8.8.8.8")).toBe(true);
    expect(publicAddress("2606:4700:4700::1111")).toBe(true);
  });
  it("rejects internal URL imports before requesting content", async () => {
    await expect(fetchPublic("http://127.0.0.1:80/private")).rejects.toThrow(
      /Private/,
    );
    await expect(fetchPublic("file:///etc/passwd")).rejects.toThrow(/public/);
  });
  it("annual plans renew menu quota monthly and clamp month-end dates", () => {
    const e = { subscriptionStart: new Date("2026-01-31T10:00:00Z") };
    expect(quotaBucket(e, new Date("2026-02-28T09:00Z"))).toBe(
      "pro:2026-01-31",
    );
    expect(quotaBucket(e, new Date("2026-02-28T10:00Z"))).toBe(
      "pro:2026-02-28",
    );
    expect(
      hasPro({
        paidUntil: new Date("2020-01-01"),
        subscriptionStatus: "active",
      }),
    ).toBe(false);
  });
});
