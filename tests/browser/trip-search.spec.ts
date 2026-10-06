import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("trip search shows and filters by item category", async ({ page }) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Search this trip" }).click();

  const search = page.getByRole("searchbox", {
    name: "Find a stop in your trip",
  });
  await search.fill("transport");

  const results = page.locator(".trip-search-results > button");
  await expect(results).toHaveCount(1);
  await expect(results.first()).toContainText("Flights to Lisbon");
  await expect(
    results.first().locator(".trip-search-result-categories"),
  ).toHaveText("Transport");
});
