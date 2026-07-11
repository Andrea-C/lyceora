import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

/**
 * Dedicated port for the E2E run's throwaway Postgres-wire-protocol socket. Deliberately NOT
 * 5502 (the shared manual-dev-workflow port from packages/db/scripts/dev-server.ts, persisted to
 * .superpowers/devdb) so a Playwright run never collides with — or reuses stale state from — a
 * developer's own `pnpm --filter @lyceora/db db:dev` left running alongside it.
 */
export const E2E_DB_PORT = 5503;

// __dirname, not import.meta.url: Playwright loads config files (and whatever they import) as
// CommonJS unless apps/web's package.json sets "type": "module", which this repo's Next.js setup
// does not.
const migrationsFolder = join(__dirname, "../../../packages/db/drizzle");

/**
 * Runs once before Playwright starts the webServer/tests (see playwright.config.ts). Spins up a
 * fresh, in-memory PGlite instance — never the shared `.superpowers/devdb` dev database — and
 * migrates it in-process with the exact same drizzle migrator apps/web's own PGlite-backed unit
 * tests already use (test/services.test.ts, test/diagnostic.test.ts), then exposes it over the
 * real Postgres wire protocol (mirrors packages/db/scripts/dev-server.ts) so the Next dev server
 * spawned by `webServer` can connect via an ordinary DATABASE_URL.
 *
 * Chosen over spawning `db:dev` + `db:migrate` as child processes against a temp data directory:
 * in-memory needs no temp-directory bookkeeping/cleanup and *guarantees* every run starts from a
 * truly identical, empty database — this DB only needs to live for the duration of one
 * Playwright run, so there's no durability requirement in favor of a file-backed data dir.
 *
 * Returns a teardown function, which Playwright Test runs as globalTeardown.
 */
export default async function globalSetup() {
  const pglite = new PGlite();
  await pglite.waitReady;

  const db = drizzle(pglite);
  await migrate(db, { migrationsFolder });

  const server = new PGLiteSocketServer({ db: pglite, port: E2E_DB_PORT, host: "127.0.0.1", maxConnections: 10 });
  await server.start();

  return async () => {
    await server.stop();
    await pglite.close();
  };
}
