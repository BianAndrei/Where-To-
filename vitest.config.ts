import { defineConfig } from "vitest/config";
process.loadEnvFile(".env");
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl)
  throw new Error(
    "Set TEST_DATABASE_URL to a dedicated test database before running Vitest.",
  );
const testDatabase = new URL(testDatabaseUrl);
const testName = /(?:^|[_-])test(?:$|[_-])/i;
if (
  process.env.NODE_ENV === "production" ||
  (!testName.test(decodeURIComponent(testDatabase.pathname.slice(1))) &&
    !testName.test(testDatabase.searchParams.get("schema") ?? ""))
)
  throw new Error(
    "Vitest requires a non-production database or schema whose name includes 'test'.",
  );
process.env.NODE_ENV = "test";
// Fixtures read verification links from the local inbox; no email leaves the machine.
delete process.env.RESEND_API_KEY;
process.env.LOCAL_MAILBOX = "true";
process.env.DATABASE_URL = testDatabaseUrl;
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 25000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
