// Playwright's own test-runner process does NOT auto-load .env the way
// Next.js's dev server does (confirmed: the webServer subprocess below gets
// .env for free via Next.js, but process.env.ADMIN_SEED_PASSWORD would be
// undefined in the test files themselves without this). Must be loaded
// before defineConfig/tests reference process.env.
import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
  use: {
    baseURL: "http://localhost:3000",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
