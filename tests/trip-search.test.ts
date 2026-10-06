import { describe, expect, it } from "vitest";
import type { TripItem } from "@whereto/shared";
import {
  matchesTripSearch,
  tripSearchCategories,
} from "../apps/web/src/lib/trip-search";

const dinner: Pick<
  TripItem,
  "title" | "location" | "category" | "receipt" | "deletedAt"
> = {
  title: "Dinner, with a view",
  location: null,
  category: "Food",
  deletedAt: null,
  receipt: {
    fingerprint: "a".repeat(64),
    currency: "EUR",
    rate: "1",
    rateDate: "2026-10-06",
    total: "24",
    rows: [
      {
        id: "dinner-line",
        label: "Dinner",
        amount: "24",
        kind: "purchase",
        participantIds: ["traveller"],
      },
    ],
  },
};

describe("trip search categories", () => {
  it("shows an item's category and its attached receipt category", () => {
    expect(tripSearchCategories(dinner)).toEqual(["Food", "Receipt"]);
  });

  it("finds receipt-linked items with either receipt spelling", () => {
    expect(matchesTripSearch(dinner, "receipt")).toBe(true);
    expect(matchesTripSearch(dinner, "receipts")).toBe(true);
  });

  it("continues to find items by their regular category", () => {
    expect(matchesTripSearch(dinner, "food")).toBe(true);
  });

  it("does not show unrelated items when searching for receipts", () => {
    expect(
      matchesTripSearch({ ...dinner, receipt: undefined }, "receipts"),
    ).toBe(false);
  });
});
