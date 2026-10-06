import { expect, test, type Locator } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("returning from the demo renders the landing page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Try the planner first" }).click();
  await expect(page).toHaveURL("/demo");
  await page.goBack();
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("heading", { name: "A lovely trip. A clear budget." }),
  ).toBeVisible();
  await expect(page.locator(".planner")).toHaveCount(0);
});

test("the mobile planner CTA opens the interactive demo", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Try the planner first" }).click();
  await expect(page).toHaveURL("/demo");
  await expect(page.locator(".demo-banner")).toContainText(
    "You’re exploring an example trip",
  );
});

test("navigation compacts, keeps every view usable and remembers the preference", async ({
  page,
  isMobile,
}) => {
  await page.goto("/demo");
  const navigation = page.locator(
    isMobile ? ".mobile-app-nav" : ".planner-sidebar",
  );
  let expanded: Locator | undefined;
  if (!isMobile) {
    const before = await navigation.boundingBox();
    await navigation
      .getByRole("button", { name: "Compact navigation", exact: true })
      .click();
    await expect(page.locator(".planner")).toHaveClass(/nav-compact/);
    expanded = navigation.getByRole("button", {
      name: "Expand navigation",
      exact: true,
    });
    await expect(expanded).toHaveAttribute("aria-pressed", "true");
    const after = await navigation.boundingBox();
    expect(after!.width).toBeLessThan(before!.width);
  } else {
    const searchButton = navigation.getByRole("button", {
      name: "Search this trip",
    });
    const toolsButton = navigation.locator(".mobile-tools-dropdown > summary");
    await expect(searchButton).toBeVisible();
    await expect(toolsButton).toBeVisible();
    expect((await toolsButton.boundingBox())?.height).toBe(
      (await searchButton.boundingBox())?.height,
    );
    await expect(toolsButton).toHaveCSS("font-size", "10px");
    await expect(
      page.locator(".mobile-tools:not(.mobile-tools-dropdown)"),
    ).toHaveCount(0);
  }
  await navigation.getByRole("button", { name: "Budget", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "The numbers, together." }),
  ).toBeVisible();
  await expect(page.locator(".budget-stats strong").first()).toHaveCSS(
    "text-align",
    "center",
  );
  await navigation
    .getByRole("button", { name: "Itinerary", exact: true })
    .click();
  await expect(
    page.locator(".itinerary-controls .day-tabs button").first(),
  ).toBeVisible();
  await navigation.getByRole("button", { name: "Budget", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "The numbers, together." }),
  ).toBeVisible();
  await page.reload();

  if (isMobile) {
    await page.evaluate(() =>
      window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }),
    );
    await expect(navigation).toBeInViewport();
    const searchButton = navigation.getByRole("button", {
      name: "Search this trip",
    });
    await searchButton.click();
    const search = page.getByRole("searchbox", {
      name: "Find a stop in your trip",
    });
    await expect(search).toBeVisible();
    await search.fill("transport");
    await expect(page.locator(".trip-search-results > button")).toContainText(
      "Flights to Lisbon",
    );
    await page.getByRole("button", { name: "Close trip search" }).click();

    const toolsButton = navigation.locator(".mobile-tools-dropdown > summary");
    await toolsButton.click();
    await expect(navigation.locator(".mobile-tools-dropdown")).toHaveAttribute(
      "open",
      "",
    );
    await expect(
      page.locator(".mobile-tools").getByRole("button", { name: "History" }),
    ).toBeVisible();
    await expect(
      page
        .locator(".mobile-tools")
        .getByRole("button", { name: "Trip settings" }),
    ).toBeVisible();
    const toolsMenu = page.locator(".mobile-tools-grid");
    await expect(toolsMenu).toHaveCSS(
      "animation-name",
      "mobile-tools-paper-unroll",
    );
    await expect(toolsMenu).toHaveCSS("animation-duration", "0.76s");
    await expect(toolsMenu).toHaveCSS("border-radius", "16px");
    expect(
      await toolsMenu.evaluate(
        (element) => getComputedStyle(element, "::before").animationName,
      ),
    ).toBe("mobile-tools-paper-edge");
    await page
      .locator(".mobile-tools")
      .getByRole("button", { name: "Import a booking", exact: true })
      .click();
    await expect(
      navigation.locator(".mobile-tools-dropdown"),
    ).not.toHaveAttribute("open");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await toolsButton.click();
    await expect(navigation.locator(".mobile-tools-dropdown")).toHaveAttribute(
      "open",
      "",
    );
    await expect(toolsMenu).toBeVisible();
    await expect(toolsMenu).toHaveCSS(
      "animation-name",
      "mobile-tools-paper-unroll",
    );
    await expect(toolsMenu).toHaveCSS("animation-duration", "0.76s");
    expect(
      await toolsMenu.evaluate(
        (element) => getComputedStyle(element, "::before").animationName,
      ),
    ).toBe("mobile-tools-paper-edge");
    await toolsButton.click();
  } else {
    await expect(expanded).toBeVisible();
    expect(
      await page.evaluate(() => localStorage.getItem("whereto-nav-compact")),
    ).toBe("true");
    const people = navigation.getByRole("button", {
      name: "People & essentials",
      exact: true,
    });
    await people.focus();
    await people.press("ArrowRight");
    const menu = page.getByRole("menu", {
      name: "People & essentials",
      exact: true,
    });
    await expect(
      menu.getByRole("menuitem", { name: "Your people", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("End");
    await expect(
      menu.getByRole("menuitem", { name: "Trains", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Home");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await expect(people).toBeFocused();
    await people.hover();
    await expect(menu).toBeVisible();
    await people.click();
    await page.locator(".planner-header h1").hover();
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(people).toBeFocused();
  }
  if (!isMobile) {
    await expanded!.click();
    await expect(page.locator(".planner")).not.toHaveClass(/nav-compact/);
    await page.reload();
    await expect(
      navigation.getByRole("button", {
        name: "Compact navigation",
        exact: true,
      }),
    ).toBeVisible();
  }
});

test("Brand is unavailable and public navigation no longer links to it", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator('a[href="/brand"]')).toHaveCount(0);
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await expect(page.locator(".wave-menu-content")).toBeVisible();
  await expect(page.locator('a[href="/brand"]')).toHaveCount(0);
  await page.goto("/brand");
  await expect(
    page.getByRole("heading", { name: "Off the map." }),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
});

test("mobile pages, compact navigation and editing fit a 320px screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: { user: { id: "alex", name: "Alex" }, pro: true, entitlement: {} },
    }),
  );
  await page.route("**/api/v1/trips", (route) => route.fulfill({ json: [] }));
  for (const path of [
    "/",
    "/pricing",
    "/privacy",
    "/signup",
    "/app",
    "/app/new",
    "/demo",
    "/demo?view=budget",
  ]) {
    await page.goto(path);
    await expect(page.locator("h1:visible,h2:visible").first()).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      path,
    ).toBe(true);
  }
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    page.getByLabel("What was it for?", { exact: true }),
  ).toBeVisible();
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(740);
});
