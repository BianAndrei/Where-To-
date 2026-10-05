import { test, expect } from "@playwright/test";
import { defaultPreferences } from "../../packages/shared/src/preferences";

test.use({ serviceWorkers: "block" });
test("intro skips on request and is not replayed during the same visit", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".site-intro")).toBeVisible();
  await page.getByRole("button", { name: "Skip intro", exact: false }).click();
  await expect(page.locator(".site-intro")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "A lovely trip. A clear budget." }),
  ).toBeVisible();
  await expect(page.locator(".site-intro")).toHaveCount(0);
});

test("setup keeps clear progress, moves the atmosphere and preserves the draft", async ({
  page,
}) => {
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: {
        user: { id: "setup-user", name: "Alex" },
        preferences: {
          ...defaultPreferences,
          currency: "JPY",
          departureCity: "Bucharest",
        },
        entitlement: {},
        pro: true,
      },
    }),
  );
  await page.goto("/app/new");
  await expect(page.getByLabel("Your name", { exact: true })).toHaveValue(
    "Alex",
  );
  await expect(
    page.getByRole("button", { name: "Step 1: Your people", exact: true }),
  ).toHaveAttribute("aria-current", "step");
  await page.getByRole("button", { name: "A hand with this step?" }).click();
  await expect(page.getByRole("note")).toContainText("Count everyone");
  const firstPose = await page
    .locator(".journey-blob")
    .first()
    .evaluate((el) => getComputedStyle(el).transform);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Step 2: Where & when", exact: true }),
  ).toHaveAttribute("aria-current", "step");
  await expect(page.getByLabel("Starting from (optional)")).toHaveValue(
    "Bucharest",
  );
  await expect(page.locator(".setup-question")).toBeFocused();
  await expect
    .poll(() =>
      page
        .locator(".journey-blob")
        .first()
        .evaluate((el) => getComputedStyle(el).transform),
    )
    .not.toBe(firstPose);
  await page.reload();
  await expect(page.getByLabel("Starting from (optional)")).toHaveValue(
    "Bucharest",
  );
  await page
    .getByRole("button", {
      name: "Step 1: Your people, completed",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Your name", { exact: true })).toHaveValue(
    "Alex",
  );
});

test("planner guides open real tools and the sidebar stays in place while scrolling", async ({
  page,
  isMobile,
}) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Open help and tutorials" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "6 people", exact: true }).click();
  await expect(
    dialog.getByRole("heading", { name: "Bring your travel people together." }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Open your people", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your travel people.", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open help and tutorials" }),
  ).toBeFocused();
  if (!isMobile) {
    await page.evaluate(() => window.scrollTo(0, 1000));
    expect(
      (await page.locator(".planner-sidebar").boundingBox())!.y,
    ).toBeGreaterThanOrEqual(0);
    expect(
      await page
        .locator(".planner-sidebar")
        .evaluate((el) => getComputedStyle(el).position),
    ).toBe("sticky");
    await page
      .locator(".planner-sidebar")
      .getByRole("button", { name: "Compact navigation", exact: true })
      .click();
    const rail = await page.locator(".planner-sidebar").boundingBox();
    const body = await page.locator(".planner-body").boundingBox();
    expect(Math.abs(body!.x - rail!.width)).toBeLessThan(1);
  }
});

test("account preferences save, survive reload and errors never claim success", async ({
  page,
}) => {
  let preferences = { ...defaultPreferences };
  const me = {
    user: {
      id: "settings-user",
      name: "Alex",
      email: "alex@example.test",
      emailVerified: true,
    },
    entitlement: {},
    pro: false,
  };
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({ json: { ...me, preferences } }),
  );
  await page.route("**/api/v1/me/preferences", (route) => {
    preferences = route.request().postDataJSON();
    return route.fulfill({ json: preferences });
  });
  await page.route("**/api/v1/config", (route) =>
    route.fulfill({ json: { payments: false } }),
  );
  await page.goto("/app/settings?section=preferences");
  await page.getByLabel("Usual departure city").fill("Timișoara");
  await page
    .getByRole("switch", { name: "Reduce motion", exact: true })
    .check();
  await page
    .getByRole("switch", { name: "Use compact navigation", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("saved to your account");
  await expect(page.locator("html")).toHaveAttribute(
    "data-reduced-motion",
    "true",
  );
  await page.reload();
  await expect(page.getByLabel("Usual departure city")).toHaveValue(
    "Timișoara",
  );
  await expect(
    page.getByRole("switch", { name: "Use compact navigation", exact: true }),
  ).toBeChecked();
  await page.route("**/api/v1/me/preferences", (route) =>
    route.fulfill({
      status: 500,
      json: { error: "Could not save your preferences." },
    }),
  );
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Could not save");
  await expect(page.locator(".settings-success")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("extended guides reach trip settings, notes and the mobile map", async ({
  page,
  isMobile,
}) => {
  await page.goto("/demo");
  const help = page.getByRole("button", { name: "Open help and tutorials" });
  for (const [topic, action, title] of [
    ["25 settings", "Open trip settings", "Your trip settings."],
    ["23 notes", "Open shared notes", "A note for your people."],
    ["24 trash", "Open recently deleted", "Nothing lost just yet."],
  ]) {
    await help.click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: topic, exact: true })
      .click();
    await page.getByRole("button", { name: action, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(help).toBeFocused();
  }
  await help.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "19 map", exact: true })
    .click();
  await page.getByRole("button", { name: "Open the map", exact: true }).click();
  await expect(page.locator(".itinerary-side")).toBeVisible();
  if (isMobile) {
    await page
      .getByRole("button", { name: "Show the plan", exact: true })
      .click();
    await expect(page.locator(".day-plan")).toBeVisible();
  }
});

test("cancelling authenticator setup never submits the verification form", async ({
  page,
}) => {
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: {
        user: {
          id: "factor-user",
          name: "Alex",
          email: "alex@example.test",
          emailVerified: true,
          twoFactorEnabled: false,
        },
        preferences: defaultPreferences,
        entitlement: {},
        pro: false,
      },
    }),
  );
  await page.route("**/api/auth/list-accounts", (route) =>
    route.fulfill({
      json: [{ id: "password-account", providerId: "credential" }],
    }),
  );
  await page.route("**/api/auth/list-sessions", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({ json: null }),
  );
  await page.route("**/api/auth/two-factor/enable", (route) =>
    route.fulfill({
      json: {
        totpURI:
          "otpauth://totp/Whereto:fixture?secret=JBSWY3DPEHPK3PXP&issuer=Whereto",
        backupCodes: ["demo-code-one", "demo-code-two"],
      },
    }),
  );
  const verificationRequests: string[] = [];
  await page.route("**/api/auth/two-factor/verify-totp", (route) => {
    verificationRequests.push(route.request().url());
    return route.fulfill({ json: { status: true } });
  });
  await page.goto("/app/settings?section=security");
  await page
    .getByLabel("Confirm your password", { exact: true })
    .fill("Test-password-only");
  await page
    .getByRole("button", { name: "Set up authenticator", exact: true })
    .click();
  await page.getByLabel("I saved my recovery codes").check();
  await page.getByLabel("Six-digit authenticator code").fill("123456");
  await page.getByRole("button", { name: "Cancel setup", exact: true }).click();
  await expect(page.locator(".settings-factor-setup")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Set up authenticator", exact: true }),
  ).toBeVisible();
  expect(verificationRequests).toEqual([]);
});
