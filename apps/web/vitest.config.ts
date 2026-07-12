import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    // .test.tsx files (component tests) run under jsdom; everything else (service/unit tests
    // against the PGlite dev DB) stays on the node environment.
    environmentMatchGlobs: [["test/**/*.test.tsx", "jsdom"]],
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    setupFiles: ["./test/setup.ts"],
    // Several suites spin up their own in-memory PGlite + run drizzle migrations in beforeAll;
    // with this many DB-backed suites now running concurrently (one PGlite/migration per suite),
    // the default 10s hook timeout is tight enough to flake under full monorepo `pnpm test` load.
    hookTimeout: 30_000
  }
});
