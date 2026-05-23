import { defineConfig, devices } from "@playwright/test";

/**
 * Phase 7 — Regression suite for the V1 P0 user flows.
 *
 * Locally: `pnpm --filter @notes-app/e2e test`
 *   Requires `pnpm dev` running on http://localhost:3000.
 *
 * CI: see .github/workflows/e2e.yml (TODO when Vercel preview is wired).
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
