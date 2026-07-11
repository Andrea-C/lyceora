import { defineConfig, devices } from "@playwright/test";
import { E2E_DB_PORT } from "./e2e/global-setup";

/**
 * Dedicated app port for the E2E run — deliberately NOT 3000 (the manual `pnpm dev` port used in
 * every prior task's live walkthroughs) so a Playwright run never collides with a developer's own
 * dev server left running alongside it.
 */
const PORT = 3100;

/**
 * Acceptance-gate E2E config (Task 17). `globalSetup` (./e2e/global-setup.ts) brings up a fresh,
 * migrated, in-memory PGlite database exposed over the wire protocol on E2E_DB_PORT *before* this
 * config's `webServer` is considered ready — see that file for why a fresh DB every run, and why
 * a dedicated port distinct from the shared manual-dev-workflow database.
 *
 * `webServer` starts the real Next dev server with `LYCEORA_FAKE_MODELS=1` (apps/web/src/server/
 * registry.ts is the only file that reads that switch) so the whole recovery-path flow —
 * diagnostic, session, teacher chat — runs deterministically with no provider API keys.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure"
  },
  webServer: {
    command: `pnpm exec next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/it`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      LYCEORA_FAKE_MODELS: "1",
      DATABASE_URL: `postgres://postgres:postgres@localhost:${E2E_DB_PORT}/postgres`,
      // better-auth validates the request origin against this — must match PORT above, not
      // apps/web/.env.local's 3000 (the manual-dev-workflow port).
      BETTER_AUTH_URL: `http://localhost:${PORT}`
    }
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } }
  ]
});
