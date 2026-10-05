import { describe, expect, it } from "vitest";
import { newItem, todayPlan, type TripItem } from "@whereto/shared";
import { makeDemo } from "../apps/web/src/lib/demo";

function scenario() {
  const state = makeDemo().state;
  state.startDate = "2026-10-12";
  state.endDate = "2026-10-16";
  state.destinations[0]!.timezone = "Europe/Lisbon";
  state.items = [];
  const add = (
    title: string,
    time: string | null,
    extra: Partial<TripItem> = {},
  ) => {
    const item = {
      ...newItem(state, "2026-10-13"),
      title,
      time,
      duration: 0,
      ...extra,
    };
    state.items.push(item);
    return item;
  };
  return { state, add };
}
describe("Today follows the clock at each stop", () => {
  it("prioritizes a scheduled stop over an earlier untimed idea in the order", () => {
    const { state, add } = scenario();
    add("Coffee whenever", null);
    const museum = add("Museum", "11:00");
    add("Unchosen idea", "10:15", { state: "idea" });
    const today = todayPlan(state, new Date("2026-10-13T09:00:00Z"));
    expect(today.focus?.id).toBe(museum.id);
    expect(today.focusKind).toBe("upcoming");
    expect(today.items).toHaveLength(2);
  });
  it("keeps a known ongoing activity visible, then moves to the next stop", () => {
    const { state, add } = scenario();
    const museum = add("Museum", "10:00", { duration: 60 });
    const lunch = add("Lunch", "12:00");
    expect(todayPlan(state, new Date("2026-10-13T09:30:00Z")).focus?.id).toBe(
      museum.id,
    );
    expect(todayPlan(state, new Date("2026-10-13T10:00:00Z")).focus?.id).toBe(
      lunch.id,
    );
  });
  it("does not invent an end time for an activity with unknown duration", () => {
    const { state, add } = scenario();
    add("Museum", "10:00");
    expect(todayPlan(state, new Date("2026-10-13T09:30:00Z")).focusKind).toBe(
      "none",
    );
  });
  it("uses each stop's timezone, including a different local day and overnight journey", () => {
    const { state, add } = scenario();
    const tokyo = {
      ...state.destinations[0]!,
      id: "tokyo",
      name: "Tokyo",
      timezone: "Asia/Tokyo",
    };
    const train = add("Night train", "23:30", {
      kind: "transport",
      location: tokyo,
      day: "2026-10-13",
      duration: 120,
    });
    const today = todayPlan(state, new Date("2026-10-13T15:00:00Z"));
    expect(today.focus?.id).toBe(train.id);
    expect(today.focusKind).toBe("ongoing");
    expect(today.timezone).toBe("Asia/Tokyo");
  });
  it("explains before/after the trip and finds a stay on its middle night", () => {
    const { state, add } = scenario();
    const stay = add("Our stay", null, {
      kind: "accommodation",
      day: "2026-10-12",
      endDay: "2026-10-15",
    });
    expect(todayPlan(state, new Date("2026-10-13T09:00:00Z")).stay?.id).toBe(
      stay.id,
    );
    expect(
      todayPlan(state, new Date("2026-10-15T09:00:00Z")).stay,
    ).toBeUndefined();
    expect(todayPlan(state, new Date("2026-10-11T09:00:00Z")).phase).toBe(
      "before",
    );
    expect(todayPlan(state, new Date("2026-10-17T09:00:00Z")).phase).toBe(
      "after",
    );
  });
});
