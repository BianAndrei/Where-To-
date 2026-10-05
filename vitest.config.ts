import { defineConfig } from "vitest/config";
process.loadEnvFile(".env");
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 25000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
