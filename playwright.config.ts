import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  // Desktop and mobile each exercise live animation frames. Bound concurrency
  // so WebKit does not lose positioning frames while other suites compile.
  workers: 2,
  use: { baseURL: "http://localhost:5173", trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
});
