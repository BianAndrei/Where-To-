import { test, expect } from "@playwright/test";
test("landing reservation example updates the plan and budget", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A lovely trip. A clear budget." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Try the interactive Lisbon demo" })
    .click();
  await page.getByRole("button", { name: "Read sample confirmation" }).click();
  await page.getByRole("button", { name: "Confirm reservation" }).click();
  await expect(
    page.getByRole("img", {
      name: "Illustrative route between Lisbon airport and the stay",
    }),
  ).toBeVisible();
  await expect(page.locator(".booking-story-budget")).toContainText("€420");
  await page.getByRole("button", { name: /Add example transfer/ }).click();
  await expect(page.locator(".booking-story-budget")).toContainText("€438");
});
test("landing menu example translates its heading with its selected language", async ({
  page,
}) => {
  await page.goto("/");
  const language = page.getByRole("group", { name: "Example menu language" });
  await language.getByRole("button", { name: "PT", exact: true }).click();
  await expect(page.locator(".menu-sample-heading > span")).toHaveText(
    "À mesa",
  );
  await language.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.locator(".menu-sample-heading > span")).toHaveText(
    "At the table",
  );
});
test("unselected example tabs get a soft gray hover state", async ({
  page,
}) => {
  await page.goto("/");
  const tab = page.getByRole("tab", { name: /The way there/ });
  await tab.hover();
  await expect(tab).toHaveCSS("background-color", "rgb(230, 228, 223)");
  await expect(tab).toHaveCSS("box-shadow", /rgba\(75, 73, 63,/);
});
test("travel-tools planner CTA is boxed in red and right-aligned on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 736, height: 900 });
  await page.goto("/#travel-tools");
  const cta = page.locator(".wt-toolbox-bottom .wt-inline-link");
  await expect(cta).toBeVisible();
  await expect(cta).toHaveCSS("background-color", "rgb(173, 85, 76)");
  const alignment = await cta.evaluate((element) => {
    const button = element.getBoundingClientRect();
    const row = element.parentElement!.getBoundingClientRect();
    return Math.abs(row.right - button.right);
  });
  expect(alignment).toBeLessThan(2);
});
test("one cost appears in itinerary and budget and survives refresh", async ({
  page,
}) => {
  await page.goto("/demo");
  await page
    .getByRole("button", { name: "Add to your day", exact: true })
    .click();
  await page.getByRole("button", { name: "Add activity", exact: true }).click();
  await page
    .getByLabel("What’s the plan?", { exact: true })
    .fill("Four museum tickets");
  await page.getByRole("button", { name: /More details: place/ }).click();
  await page.getByRole("button", { name: "Costs 0", exact: true }).click();
  await page.getByRole("button", { name: "Add a cost line" }).click();
  await page.getByLabel("Price", { exact: true }).fill("30");
  await page.getByLabel("Quantity", { exact: true }).fill("4");
  await page
    .getByRole("combobox", { name: "Price is per", exact: true })
    .click();
  await page.getByRole("option", { name: "ticket", exact: true }).click();
  await page.getByRole("button", { name: "Save to my trip" }).click();
  await expect(
    page.getByRole("button", { name: /Four museum tickets.*€120/ }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Budget", exact: true })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Four museum tickets.*€120/ }),
  ).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Four museum tickets.*€120/ }),
  ).toHaveCount(1);
});
test("decorative motion respects reduced-motion and there is no horizontal page overflow", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A lovely trip. A clear budget." }),
  ).toBeVisible();
  expect(
    await page
      .locator(".paint-splat")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("quick cost and a linked deposit stay in one budget item", async ({
  page,
}) => {
  await page.goto("/demo");
  await page
    .getByRole("button", { name: "Add to your day", exact: true })
    .click();
  await page.getByRole("button", { name: "Add activity", exact: true }).click();
  await page
    .getByLabel("What’s the plan?", { exact: true })
    .fill("Quick museum stop");
  await page
    .getByLabel("Group cost (EUR) · optional", { exact: true })
    .fill("30");
  await page
    .getByRole("button", { name: "Save to my trip", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Budget", exact: true })
    .filter({ visible: true })
    .click();
  const before = await page.locator(".budget-stats").innerText();
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  await page
    .getByRole("combobox", { name: "What are you adding?", exact: true })
    .click();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("option", { name: /Quick museum stop/ }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("combobox", { name: "What are you adding?", exact: true }),
  ).toContainText("Quick museum stop");
  await page.getByLabel("Payment amount (EUR)", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Save payment", exact: true }).click();
  const row = page
    .locator(".expense-row")
    .filter({ hasText: "Quick museum stop" });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("€30.00");
  await expect(row).toContainText("€10.00");
  const after = await page.locator(".budget-stats").innerText();
  expect(after.split("Paid, after refunds")[0]).toBe(
    before.split("Paid, after refunds")[0],
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Budget", exact: true })
    .filter({ visible: true })
    .click();
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("€10.00");
});

test("an unpaid quick expense changes remaining cost, not paid total", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/demo");
  await page
    .getByRole("button", { name: "Budget", exact: true })
    .filter({ visible: true })
    .click();
  const stats = page.locator(".budget-stats > div");
  const paidBefore = await stats
    .nth(2)
    .locator(".rolling-value .sr-only")
    .innerText();
  const remainingBefore = await stats
    .nth(3)
    .locator(".rolling-value .sr-only")
    .innerText();
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  await page
    .getByLabel("What was it for?", { exact: true })
    .fill("Unpaid tram");
  await page.getByLabel("Group cost (EUR)", { exact: true }).fill("24");
  await expect(
    page.getByRole("switch", { name: "Already paid in full" }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Save to my trip", exact: true })
    .click();
  await expect(
    page.locator(".expense-row").filter({ hasText: "Unpaid tram" }),
  ).toContainText("€24.00");
  const paidAfter = await stats
    .nth(2)
    .locator(".rolling-value .sr-only")
    .innerText();
  const remainingAfter = await stats
    .nth(3)
    .locator(".rolling-value .sr-only")
    .innerText();
  const amount = (value: string) => Number(value.replace(/[^\d.-]/g, ""));
  expect(amount(paidAfter)).toBe(amount(paidBefore));
  expect(amount(remainingAfter) - amount(remainingBefore)).toBe(24);
});

test("expense rows are chronological and settlement needs confirmation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/demo");
  await page
    .getByRole("button", { name: "Budget", exact: true })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "The numbers, together." }),
  ).toBeVisible();
  const dates = await page
    .locator(".expense-row time")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("datetime")),
    );
  expect(dates).toEqual([...dates].sort());
  await page
    .locator(".settlement-row")
    .first()
    .getByRole("button", { name: "Mark settled", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Confirm this settlement" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("does not add a new expense");
  await dialog.getByRole("button", { name: "Confirm settlement" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".splits-section")).toContainText(
    "settlement recorded",
  );
});

test("receipt saves to its meal and is searchable under the receipt filter", async ({
  page,
  isMobile,
}) => {
  await page.goto("/demo");
  if (isMobile) await page.locator(".mobile-tools-dropdown > summary").click();
  await page
    .getByRole("button", { name: "Split a receipt", exact: true })
    .click();
  await page.getByRole("button", { name: "Use sample receipt" }).click();
  await page.getByRole("button", { name: "Review receipt" }).click();
  await page.getByRole("checkbox", { name: /I checked the receipt/ }).check();
  await page.getByRole("button", { name: "Update this meal" }).click();
  await expect(page.locator(".receipt-saved")).toContainText(
    "Receipt added to Dinner, with a view",
  );
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Search this trip" }).click();
  await page
    .getByRole("searchbox", { name: "Find a stop in your trip" })
    .fill("receipts");
  const receiptResult = page.locator(".trip-search-results > button");
  await expect(receiptResult).toHaveCount(1);
  await expect(receiptResult).toContainText("Dinner, with a view");
  await expect(
    receiptResult.locator(".trip-search-result-categories"),
  ).toContainText("Receipt");
  await page.getByRole("button", { name: "Close trip search" }).click();
  await page
    .getByRole("button", { name: "Budget", exact: true })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "The numbers, together." }),
  ).toBeVisible();
  const filter = page.getByRole("combobox", {
    name: "Filter expenses by category",
  });
  await filter.click();
  await page.getByRole("option", { name: "Receipts", exact: true }).click();
  await expect(page.locator(".expense-row")).toHaveCount(1);
  await expect(page.locator(".expense-row").first()).toContainText(
    "Dinner, with a view",
  );
  await page
    .getByRole("searchbox", { name: "Search expenses and receipts" })
    .fill("Pasta");
  await expect(page.locator(".expense-row")).toHaveCount(1);
  await expect(page.locator(".expense-row").first()).toContainText(
    "Dinner, with a view",
  );
  await page
    .getByRole("searchbox", { name: "Search expenses and receipts" })
    .fill("not on this receipt");
  await expect(page.getByText("No matching expenses.")).toBeVisible();
  await expect(page.locator(".expense-total")).toContainText("€0.00");
});
