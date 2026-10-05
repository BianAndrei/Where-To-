import { test, expect } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("rapid day changes settle on the last choice without remounting the map", async ({
  page,
  isMobile,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/demo");
  const map = await page.locator(".itinerary-side").elementHandle();
  for (const name of ["DAY 2 Tue 13", "DAY 4 Thu 15", "DAY 2 Tue 13"])
    await page.getByRole("button", { name, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Tuesday 13 October", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".day-plan > .motion-panel-viewport > .motion-panel-content"),
  ).toHaveCount(1);
  await expect(
    page.locator(".day-plan .motion-panel-content[inert]"),
  ).toHaveCount(0);
  expect(await map?.evaluate((node) => node.isConnected)).toBe(true);
  if (isMobile) {
    await page
      .getByRole("button", { name: "Show the map", exact: true })
      .click();
    await expect(page.locator(".itinerary-side")).toBeVisible();
    await page
      .getByRole("button", { name: "Show the plan", exact: true })
      .click();
    await expect(page.locator(".day-plan")).toBeVisible();
    expect(await map?.evaluate((node) => node.isConnected)).toBe(true);
  }
  await page.getByRole("button", { name: "Budget", exact: true }).click();
  await page.getByRole("button", { name: "Itinerary", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Tuesday 13 October", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("onboarding transitions preserve a long journey draft in both directions", async ({
  page,
}) => {
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: {
        user: { id: "transition-user", name: "Alex" },
        pro: true,
        entitlement: {},
      },
    }),
  );
  await page.goto("/app/new");
  await page.getByLabel("Your name", { exact: true }).fill("Alex Journey");
  await page
    .getByRole("button", { name: "One more traveller", exact: true })
    .click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const start = new Date(Date.now() + 365 * 86400000)
    .toISOString()
    .slice(0, 10);
  const end = new Date(Date.now() + 405 * 86400000).toISOString().slice(0, 10);
  await page.getByLabel("Heading out", { exact: true }).fill(start);
  await page.getByLabel("Coming back", { exact: true }).fill(end);
  await page
    .getByLabel("Starting from (optional)", { exact: true })
    .fill("Bucharest");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByLabel("Your name", { exact: true })).toHaveValue(
    "Alex Journey",
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Heading out", { exact: true })).toHaveValue(
    start,
  );
  await expect(page.getByLabel("Coming back", { exact: true })).toHaveValue(
    end,
  );
  await expect(
    page.getByLabel("Starting from (optional)", { exact: true }),
  ).toHaveValue("Bucharest");
  await expect(
    page.locator(".onboarding-card .motion-panel-content"),
  ).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("preview folds away, reopens, and menu language changes keep its controls usable", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Try the interactive Lisbon demo" })
    .click();
  await page.getByRole("button", { name: "Read sample confirmation" }).click();
  await page
    .getByRole("button", { name: "Close the preview", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Try the interactive Lisbon demo" }),
  ).toBeFocused();
  await expect(page.locator(".clip-reveal")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Try the interactive Lisbon demo" })
    .click();
  await expect(
    page.getByRole("button", { name: "Read sample confirmation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "PT", exact: true }).click();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Portuguese custard tart", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add one tart", exact: true }).click();
  await page.getByRole("button", { name: "Add one tart", exact: true }).click();
  await page
    .getByRole("button", { name: "Remove one tart", exact: true })
    .click();
  await expect(page.locator(".menu-estimate strong .sr-only")).toHaveText(
    "€6.00",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("route transitions resolve lazy pages and browser back without leaving a stale page", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("link", { name: "See the plans", exact: true }).click();
  await expect(page).toHaveURL(/\/pricing$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Start free.",
  );
  await page.getByRole("link", { name: "Privacy", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your plans are personal.",
  );
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Start free.",
  );
  await expect(
    page.locator(
      ".route-arrival > .motion-panel-viewport > .motion-panel-content",
    ),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: /Choose monthly/ }),
  ).toBeEnabled();
  expect(errors).toEqual([]);
});
