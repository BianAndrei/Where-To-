import { it, expect } from "vitest";
import { newItem, balances } from "@whereto/shared";
import { makeDemo } from "../apps/web/src/lib/demo";
it("keeps a three-person split balanced down to the last cent", () => {
  const state = makeDemo().state;
  state.participants.push({ id: "third", name: "Third" });
  const item = newItem(state, state.startDate);
  item.title = "A shared euro";
  item.payments = [
    {
      id: "p",
      payerId: "alex",
      amount: "1",
      currency: "EUR",
      rate: "1",
      rateDate: state.startDate,
      kind: "payment",
      note: "",
    },
  ];
  state.items = [item];
  state.settlements = [];
  const b = balances(state);
  expect(
    Object.values(b).reduce(
      (sum, value) => sum + Math.round(Number(value) * 100),
      0,
    ),
  ).toBe(0);
  expect(b).toEqual({ alex: "0.66", sam: "-0.33", third: "-0.33" });
});
