import { test, expect } from "@playwright/test";
import { freeTripState } from "../../packages/shared/src/index";

test.use({ serviceWorkers: "block" });
test("radial actions work with keyboard and a liquid switch saves the payment once", async ({
  page,
}) => {
  await page.goto("/demo");
  const add = page.getByRole("button", {
    name: "Add to your day",
    exact: true,
  });
  await add.click();
  const fan = page.getByRole("dialog", { name: "Choose what to add" });
  await expect(fan).toBeVisible();
  await expect(fan.getByRole("button", { name: /^Add / })).toHaveCount(5);
  const bounds = await fan.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await page.keyboard.press("Escape");
  await expect(fan).toHaveCount(0);
  await expect(add).toBeFocused();
  await add.press("Enter");
  await expect(
    page.getByRole("button", { name: "Add activity", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("button", { name: "Add expense", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await page
    .getByLabel("What was it for?", { exact: true })
    .fill("Train station coffee");
  await page.getByLabel("Group cost (EUR)", { exact: true }).fill("12");
  const paid = page.getByRole("switch", { name: "Already paid in full" });
  await paid.click();
  await paid.click();
  await paid.click();
  await expect(paid).toBeChecked();
  await paid.press("Space");
  await expect(paid).not.toBeChecked();
  await paid.press("Space");
  await page
    .getByRole("button", { name: "Save to my trip", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  const item = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("whereto-demo")!).state.items.find(
      (item: { title: string }) => item.title === "Train station coffee",
    ),
  );
  expect(item.lines).toHaveLength(1);
  expect(item.payments).toHaveLength(1);
  expect(item.payments[0].amount).toBe("12");
});

test("trip search finds another day and the traveller selection survives save and reload", async ({
  page,
}) => {
  await page.goto("/demo");
  const search = page.getByRole("button", {
    name: "Search this trip",
    exact: true,
  });
  await search.click();
  const input = page.getByRole("searchbox", {
    name: "Find a stop in your trip",
  });
  await expect(input).toBeFocused();
  await input.fill("zzzz-no-place");
  await expect(
    page.getByText("No plans found. Try a place or booking name."),
  ).toBeVisible();
  await input.fill("belem");
  await page.getByRole("button", { name: /^History at Belém/ }).click();
  await expect(page.locator(".trip-search-panel")).toHaveCount(0);
  await page.getByRole("button", { name: /^Costs / }).click();
  await page.getByRole("button", { name: "Choose travellers" }).click();
  const picker = page.getByRole("dialog", { name: "Who’s joining?" });
  await expect(
    picker.getByRole("checkbox", { name: "Alex", exact: true }),
  ).toBeChecked();
  await picker.getByRole("checkbox", { name: "Alex", exact: true }).uncheck();
  await expect(
    picker.getByRole("checkbox", { name: "Sam", exact: true }),
  ).toBeChecked();
  await expect(
    picker.getByRole("checkbox", { name: "Sam", exact: true }),
  ).toBeDisabled();
  await picker.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Choose travellers" }),
  ).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Choose travellers" }),
  ).toContainText("1 traveller");
  await page.getByRole("button", { name: "Save to my trip" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(search).toBeFocused();
  await page.reload();
  await search.click();
  await input.fill("History");
  await page.getByRole("button", { name: /^History at Belém/ }).click();
  await page.getByRole("button", { name: /^Costs / }).click();
  await expect(
    page.getByRole("button", { name: "Choose travellers" }),
  ).toContainText("1 traveller");
  await page.getByRole("button", { name: "Choose travellers" }).click();
  await picker.getByRole("button", { name: "Include everyone" }).click();
  await expect(
    picker.getByRole("checkbox", { name: "Alex", exact: true }),
  ).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(page.locator(".modal-content")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("dashboard search expands with focus, filters by destination and clears without motion", async ({
  page,
}) => {
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: {
        user: { id: "search-user", name: "Alex" },
        pro: true,
        entitlement: {},
      },
    }),
  );
  await page.route("**/api/v1/trips", (route) =>
    route.fulfill({
      json: [
        {
          id: "search-trip",
          archivedAt: null,
          role: "owner",
          isFree: true,
          state: freeTripState({
            organizer: "Alex",
            title: "Lisbon, together",
            startDate: "2026-10-12",
            endDate: "2026-10-15",
            participants: [{ id: "alex", name: "Alex" }],
            destinations: [
              {
                id: "lisbon",
                name: "Lisbon",
                lat: 38.72,
                lon: -9.13,
                country: "Portugal",
                source: "user",
                timezone: "Europe/Lisbon",
              },
            ],
          }),
        },
      ],
    }),
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/app");
  await expect(page.locator(".trip-card")).toHaveCount(1);
  const trigger = page.getByRole("button", {
    name: "Search trips",
    exact: true,
  });
  await trigger.click();
  const field = page.getByRole("searchbox", {
    name: "Search trips",
    exact: true,
  });
  await expect(field).toBeFocused();
  await field.fill("Lisbon");
  await expect(page.locator(".trip-card")).toHaveCount(1);
  await field.fill("Tokyo");
  await expect(page.locator(".trip-card")).toHaveCount(0);
  await expect(page.getByText("No trips match “Tokyo”.")).toBeVisible();
  await field.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(field).toBeHidden();
  await expect(page.locator(".trip-card")).toHaveCount(1);
  expect(
    await page
      .locator(".seek-search-surface")
      .evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0s");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
