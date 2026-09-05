import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    // tests/e2e holds Playwright specs (run via `playwright test`, not
    // vitest) -- Playwright's test.afterEach/test() throw when collected by
    // vitest's own runner, so exclude that directory explicitly alongside
    // vitest's own defaults.
    exclude: ["**/node_modules/**", "**/dist/**", "tests/e2e/**"],
  },
});
