import { test, expect, type Page } from "@playwright/test";
import { freeTripState } from "../../packages/shared/src/index";

test.use({ serviceWorkers: "block" });
const browserErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page), "No uncaught browser errors").toEqual([]);
});

async function openChecklist(page: Page, mobile: boolean) {
  if (mobile) {
    await page.locator(".mobile-tools > summary").click();
    await page
      .locator(".mobile-tools")
      .getByRole("button", { name: "Checklist", exact: true })
      .click();
  } else
    await page.getByRole("button", { name: "Checklist", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Before you head off." }),
  ).toBeVisible();
}

test("dashboard filtering, archive and restore keep cards usable after their exits", async ({
  page,
}) => {
  const entitlement = {
    freeTripClaimedAt: "2026-09-01T00:00:00.000Z",
    freeTripReplacementUsedAt: null as string | null,
  };
  let tripDeleted = false;
  const trip = {
    id: "motion-fixture",
    archivedAt: null as string | null,
    role: "owner",
    isFree: true,
    state: freeTripState({
      organizer: "Alex",
      title: "A Lisbon test trip",
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
  };
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: {
        user: { id: "motion-user", name: "Alex" },
        pro: true,
        entitlement,
      },
    }),
  );
  await page.route("**/api/v1/trips", (route) =>
    route.fulfill({ json: tripDeleted ? [] : [trip] }),
  );
  await page.route("**/api/v1/trips/motion-fixture/archive", (route) => {
    trip.archivedAt = route.request().postDataJSON().archived
      ? new Date().toISOString()
      : null;
    return route.fulfill({ json: trip });
  });
  await page.route("**/api/v1/trips/motion-fixture", (route) => {
    if (route.request().method() === "DELETE") {
      tripDeleted = true;
      return route.fulfill({
        json: { ok: true, freeTripReplacementRestored: true },
      });
    }
    return route.continue();
  });
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: trip.state.title }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(page.locator(".trip-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Archived", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: trip.state.title }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Restore trip", exact: true }).click();
  await expect(page.locator(".trip-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Your trips", exact: true }).click();
  await expect(
    page.getByRole("link", { name: `Open ${trip.state.title}`, exact: true }),
  ).toHaveAttribute("href", "/app/trips/motion-fixture");
  await page
    .getByRole("button", {
      name: `Delete ${trip.state.title} permanently`,
      exact: true,
    })
    .click();
  const deleteDialog = page.getByRole("dialog", {
    name: "Delete this trip permanently?",
  });
  await expect(deleteDialog).toContainText(
    "restores one replacement free trip",
  );
  const confirmation = page.getByLabel(
    `Type “${trip.state.title}” to confirm`,
    { exact: true },
  );
  await expect(
    deleteDialog.getByRole("button", { name: "Delete permanently" }),
  ).toBeDisabled();
  await confirmation.fill(trip.state.title);
  await deleteDialog
    .getByRole("button", { name: "Delete permanently" })
    .click();
  await expect(page.locator(".trip-card")).toHaveCount(0);
  await expect(
    page.getByText("Your one-time replacement free trip is available."),
  ).toBeVisible();

  tripDeleted = false;
  entitlement.freeTripReplacementUsedAt = new Date().toISOString();
  await page.reload();
  await expect(page.locator(".free-trip-warning")).toContainText(
    "this is your one replacement free trip",
  );
  await page
    .getByRole("button", {
      name: `Delete ${trip.state.title} permanently`,
      exact: true,
    })
    .click();
  await expect(deleteDialog).toContainText(
    "Deleting it will not restore another free trip",
  );
  await deleteDialog.getByRole("button", { name: "Keep trip" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("checklist stays editable and persists after animated dismissal", async ({
  page,
  isMobile,
}) => {
  await page.goto("/demo");
  await openChecklist(page, isMobile);
  await page
    .getByRole("checkbox", {
      name: "Download booking confirmations",
      exact: true,
    })
    .check();
  await page
    .getByRole("checkbox", { name: "Comfy shoes for the hills", exact: true })
    .check();
  await expect(page.locator(".checklist-progress")).toContainText(
    "of 3 ready to go",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await openChecklist(page, isMobile);
  await expect(
    page.getByRole("checkbox", {
      name: "Download booking confirmations",
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", {
      name: "Comfy shoes for the hills",
      exact: true,
    }),
  ).toBeChecked();
  await page.getByRole("combobox", { name: "Checklist group" }).click();
  await page.getByRole("option", { name: "In your bag", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Checklist group" }),
  ).toContainText("In your bag");
  expect(
    await page.getByRole("dialog").evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return (
        rect.left >= 0 &&
        rect.right <= innerWidth &&
        rect.top >= 0 &&
        rect.bottom <= innerHeight
      );
    }),
  ).toBe(true);
});

test("dialog handoff preserves the draft and Escape returns focus to the opener", async ({
  page,
}) => {
  await page.goto("/demo");
  await page
    .getByRole("button", { name: "Add to your day", exact: true })
    .click();
  await page.getByRole("button", { name: "Add activity", exact: true }).click();
  await page
    .getByLabel("What’s the plan?", { exact: true })
    .fill("A little motion check");
  await page.getByRole("button", { name: /More details: place/ }).click();
  await expect(page.locator(".modal-content")).toHaveCount(1);
  await expect(
    page.getByLabel("What’s the plan?", { exact: true }),
  ).toHaveValue("A little motion check");
  await page.getByRole("button", { name: "Costs 0", exact: true }).click();
  await page.getByRole("button", { name: "The plan", exact: true }).click();
  await expect(
    page.getByLabel("What’s the plan?", { exact: true }),
  ).toHaveValue("A little motion check");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Share trip" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Share trip" })).toBeFocused();
});

test("reduced motion keeps selection, disclosures and keyboard interaction immediate", async ({
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
  const filter = page.getByRole("combobox", {
    name: "Filter expenses by category",
  });
  await filter.press("Enter");
  await page
    .getByRole("option", { name: "Accommodation", exact: true })
    .click();
  await expect(filter).toContainText("Accommodation");
  await expect(page.locator(".expense-row")).toHaveCount(1);
  await page.locator(".missing-pieces > summary").click();
  await expect(page.locator(".missing-list")).toBeVisible();
  expect(
    await page
      .locator(".missing-pieces")
      .evaluate((el) => el.getAnimations().length),
  ).toBe(0);
  expect(
    await filter.evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0s");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("marketing controls keep the selected panel, totals and FAQ in sync", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("tab", { name: /Group decisions/ }).click();
  await expect(page.getByRole("tabpanel")).toContainText(
    "Less back-and-forth.",
  );
  await page.getByRole("tab", { name: /Your bookings/ }).click();
  await expect(page.getByRole("tabpanel")).toContainText(
    "Booked? Bring it along.",
  );
  await page.getByRole("button", { name: "Paid in full", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Accommodation costs" }),
  ).toContainText("Still to pay 0 euros");
  await page.getByRole("button", { name: "Add one tart", exact: true }).click();
  await expect(page.locator(".menu-estimate strong")).toContainText("€6.00");
  const faq = page.getByRole("button", {
    name: "Is my first trip really free?",
    exact: true,
  });
  await faq.click();
  await expect(faq).toHaveAttribute("aria-expanded", "true");
  await faq.click();
  await expect(faq).toHaveAttribute("aria-expanded", "false");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("reordering keeps the visual order and saved order together", async ({
  page,
}) => {
  await page.goto("/demo");
  const titles = page.locator(".timeline .item-details > strong");
  await page
    .getByRole("button", {
      name: "Move Dinner, with a view earlier",
      exact: true,
    })
    .click();
  await expect(titles.nth(2)).toHaveText("Dinner, with a view");
  const handle = page.getByRole("button", {
    name: "Reorder Dinner, with a view",
    exact: true,
  });
  await handle.press("Space");
  await expect(
    page.locator('.itinerary-item[data-dragging="true"]'),
  ).toHaveCount(1);
  const announcement = page.locator('[id^="DndLiveRegion"]');
  const pickedUp = await announcement.innerText();
  await page.keyboard.press("ArrowUp");
  await expect(announcement).not.toHaveText(pickedUp);
  await page.keyboard.press("Space");
  await expect(titles.nth(1)).toHaveText("Dinner, with a view");
  await page.reload();
  await expect(
    page.locator(".timeline .item-details > strong").nth(1),
  ).toHaveText("Dinner, with a view");
});
